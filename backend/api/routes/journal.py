"""
api/routes/journal.py — Premium/VIP Trading Journal (V1)

MongoDB-only storage:
- Collection: db.journals
- Screenshots: inline base64 (single image max)
- Lightweight: no advanced analytics, no social/public features

Routes:
- POST   /api/journal/from-signal
- POST   /api/journal/manual
- GET    /api/journal/list
- GET    /api/journal/stats
"""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal, List, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from core.database import db
from core.dependencies import require_auth
from models.enums import UserRole
from models.schemas import User
from services.subscription import get_effective_subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


JournalType = Literal["signal", "manual"]
Direction = Literal["buy", "sell"]
JournalOutcome = Literal["win", "loss", "breakeven", "unknown"]


class JournalFromSignalCreate(BaseModel):
    source_signal_id: str = Field(..., description="Tapped Swift FX signal id")
    notes: Optional[str] = None
    emotions: Optional[str] = None
    confidence: Optional[float] = None


def _get_user_effective_tier(current_user: User) -> str:
    # Match the pattern used in backend/api/routes/signals.py
    effective = get_effective_subscription(
        {"user_id": current_user.user_id, "role": current_user.role}
    )
    return (effective or "free").lower()


def _require_premium_vip(current_user: User) -> str:
    tier = _get_user_effective_tier(current_user)
    if tier not in ("premium", "vip"):
        raise HTTPException(status_code=403, detail="Premium/VIP access required")
    return tier


def _derive_outcome_from_pips(pips: Optional[float]) -> JournalOutcome:
    if pips is None:
        return "unknown"
    try:
        if pips > 0:
            return "win"
        if pips < 0:
            return "loss"
        return "breakeven"
    except Exception:
        return "unknown"


def _get_pips_value(signal: dict) -> Optional[float]:
    # Prefer authoritative closure fields
    pips = signal.get("final_pips")
    if pips is None:
        pips = signal.get("result_pips")
    if pips is None:
        return None
    try:
        return float(pips)
    except Exception:
        return None


def _allowed_image_content_types() -> List[str]:
    # Mirrors backend/api/routes/community.py
    return ["image/jpeg", "image/jpg", "image/png"]


def _validate_and_read_image_base64(image: UploadFile, max_bytes: int) -> str:
    if not image:
        raise HTTPException(status_code=400, detail="Screenshot image missing")

    allowed_types = _allowed_image_content_types()
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPG/PNG images are allowed")

    image_data = image.file.read()
    if not image_data:
        raise HTTPException(status_code=400, detail="Empty screenshot image")
    if len(image_data) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Image size must be <= {max_bytes // (1024 * 1024)}MB")

    return base64.b64encode(image_data).decode()


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


class JournalManualCreate(BaseModel):
    # Used for documentation; actual handler uses Form(...) for multipart screenshot.
    symbol: str
    direction: Direction
    entry: float
    stop_loss: float
    tp1: float
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    notes: Optional[str] = None
    analysis: Optional[str] = None
    confidence: Optional[float] = None


@router.post("/journal/from-signal")
async def create_journal_from_signal(
    payload: JournalFromSignalCreate,
    current_user: User = Depends(require_auth),
):
    _require_premium_vip(current_user)

    source_signal_id = payload.source_signal_id.strip()
    if not source_signal_id:
        raise HTTPException(status_code=400, detail="source_signal_id is required")

    # Dedupe: prevent duplicate signal journal entries
    existing = await db.journals.find_one(
        {
            "user_id": current_user.user_id,
            "type": "signal",
            "source_signal_id": source_signal_id,
        }
    )
    if existing:
        return {
            "message": "Signal already added to journal",
            "journal_id": existing.get("journal_id"),
            "already_journaled": True,
        }

    signal = await db.signals.find_one({"signal_id": source_signal_id}, {"_id": 0})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")

    pips = _get_pips_value(signal)
    outcome = _derive_outcome_from_pips(pips)

    symbol = signal.get("pair")
    direction = signal.get("signal_type")
    if not symbol or not direction:
        raise HTTPException(status_code=400, detail="Signal is missing required fields")

    rr = signal.get("risk_reward")
    rr = _safe_float(rr)

    timestamp = signal.get("closed_at") or signal.get("created_at") or datetime.now(timezone.utc).isoformat()

    journal_id = f"jrn_{uuid.uuid4().hex[:12]}"

    doc = {
        "journal_id": journal_id,
        "user_id": current_user.user_id,
        "type": "signal",
        "source_signal_id": source_signal_id,
        "symbol": symbol,
        "direction": str(direction).lower(),
        "entry": signal.get("entry"),
        "stop_loss": signal.get("stop_loss"),
        "tp1": signal.get("tp1"),
        "tp2": signal.get("tp2"),
        "tp3": signal.get("tp3"),
        "notes": payload.notes,
        "emotions": payload.emotions,
        "confidence": payload.confidence,
        # Snapshot closure metrics (historically stable)
        "pips": pips,
        "rr": rr,
        "outcome": outcome,
        "timestamp": timestamp,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.journals.insert_one(doc)

    return {
        "message": "Added signal to journal",
        "journal_id": journal_id,
        "already_journaled": False,
        "snapshot": {
            "source_signal_id": source_signal_id,
            "symbol": symbol,
            "direction": doc["direction"],
            "entry": doc["entry"],
            "stop_loss": doc["stop_loss"],
            "tp1": doc["tp1"],
            "tp2": doc["tp2"],
            "tp3": doc["tp3"],
            "pips": doc["pips"],
            "rr": doc["rr"],
            "outcome": doc["outcome"],
            "timestamp": doc["timestamp"],
        },
    }


@router.post("/journal/manual")
async def create_journal_manual(
    # Multipart: use Form for scalar fields, UploadFile for screenshot
    symbol: str = Form(...),
    direction: Direction = Form(...),
    entry: float = Form(...),
    stop_loss: float = Form(...),
    tp1: float = Form(...),
    tp2: Optional[float] = Form(None),
    tp3: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    analysis: Optional[str] = Form(None),
    confidence: Optional[float] = Form(None),
    screenshot: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_auth),
):
    _require_premium_vip(current_user)

    symbol = symbol.strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    # Screenshot optional; single image only
    screenshot_base64 = None
    screenshot_content_type: Optional[str] = None
    if screenshot is not None:
        try:
            screenshot_content_type = screenshot.content_type
            screenshot_base64 = _validate_and_read_image_base64(
                screenshot,
                max_bytes=5 * 1024 * 1024,  # match community upload cap
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    journal_id = f"jrn_{uuid.uuid4().hex[:12]}"
    doc = {
        "journal_id": journal_id,
        "user_id": current_user.user_id,
        "type": "manual",
        "symbol": symbol,
        "direction": direction.lower(),
        "entry": entry,
        "stop_loss": stop_loss,
        "tp1": tp1,
        "tp2": tp2,
        "tp3": tp3,
        "notes": notes,
        "analysis": analysis,
        "emotions": None,
        "confidence": confidence,
        # Manual entries do not include computed pips/outcome in V1
        "pips": None,
        "rr": None,
        "outcome": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "screenshot_base64": screenshot_base64,
        "screenshot_content_type": screenshot_content_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.journals.insert_one(doc)
    return {"message": "Manual journal entry created", "journal_id": journal_id}


@router.get("/journal/list")
async def list_journal_entries(current_user: User = Depends(require_auth)):
    _require_premium_vip(current_user)

    entries = await db.journals.find(
        {"user_id": current_user.user_id}
    ).sort("created_at", -1).limit(100).to_list(100)

    # Keep response explicit; do not leak Mongo _id
    for e in entries:
        e.pop("_id", None)

    return {"entries": entries}


@router.get("/journal/stats")
async def get_journal_stats(current_user: User = Depends(require_auth)):
    _require_premium_vip(current_user)

    # Basic analytics only (V1):
    # total trades, wins, losses, win rate, total pips
    # Keep it simple: signal-linked entries only (manual entries have no pips/outcome in V1).
    cursor = db.journals.find(
        {
            "user_id": current_user.user_id,
            "type": "signal",
            "pips": {"$ne": None},
        },
        {"_id": 0, "pips": 1, "outcome": 1},
    )

    signal_entries = await cursor.to_list(None)

    total = len(signal_entries)
    wins = 0
    losses = 0
    total_pips = 0.0

    for item in signal_entries:
        pips = item.get("pips")
        if pips is None:
            continue
        try:
            pips_val = float(pips)
        except Exception:
            continue

        total_pips += pips_val
        if pips_val > 0:
            wins += 1
        elif pips_val < 0:
            losses += 1

    win_rate = round((wins / total * 100) if total > 0 else 0, 1)

    return {
        "total_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "total_pips": round(total_pips, 1),
    }

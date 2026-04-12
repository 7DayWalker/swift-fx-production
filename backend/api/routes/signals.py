"""
api/routes/signals.py — Signal CRUD and admin signal management routes.
"""
import logging
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Any

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from core.database import db
from core.dependencies import get_current_user, require_auth, require_admin
from core.config import get_instrument_info
from models.enums import (
    UserRole, SignalVisibility, SignalStatus, SignalState, SignalType,
    VALID_STATE_TRANSITIONS, is_valid_transition, is_signal_closed,
)
from services.subscription import get_effective_subscription, can_access_visibility, get_subscription_level
from services.signal_engine import calculate_signal_pips
from services.auth import has_permission
from services.admin import log_admin_action, create_admin_notification
from supabase_auth import fetch_profile, SUPABASE_URL, SUPABASE_SERVICE_KEY
from models.schemas import User, SignalCreate, Signal, SignalUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def calculate_risk_reward(entry: float, stop_loss: float, take_profit: float, signal_type: SignalType) -> float:
    if signal_type == SignalType.BUY:
        risk = abs(entry - stop_loss)
        reward = abs(take_profit - entry)
    else:
        risk = abs(stop_loss - entry)
        reward = abs(entry - take_profit)
    return round(reward / risk, 2) if risk > 0 else 0


def can_access_signal(user_role: UserRole, signal_visibility: SignalVisibility) -> bool:
    if user_role == UserRole.ADMIN:
        return True
    role_hierarchy = {UserRole.FREE: 0, UserRole.PREMIUM: 1, UserRole.VIP: 2}
    visibility_hierarchy = {SignalVisibility.FREE: 0, SignalVisibility.PREMIUM: 1, SignalVisibility.VIP: 2}
    return role_hierarchy.get(user_role, 0) >= visibility_hierarchy.get(signal_visibility, 0)


def get_tp_hit_from_state(state: str) -> int:
    state_to_tp = {"pending": 0, "active": 0, "tp1": 1, "tp2": 2, "tp3": 3, "closed": 3}
    return state_to_tp.get(state, 0)


def get_status_from_state(state: str) -> str:
    if state == "pending":
        return "pending"
    elif state in ["active", "tp1", "tp2", "tp3"]:
        return "active"
    else:
        return "closed"


def get_pips_value(pair: str) -> dict:
    return get_instrument_info(pair)


def calculate_pips(pair: str, entry_price: float, exit_price: float, signal_type: str) -> float:
    info = get_pips_value(pair)
    multiplier = info["pip_multiplier"]
    if signal_type.lower() == "buy":
        return round((exit_price - entry_price) * multiplier, 1)
    else:
        return round((entry_price - exit_price) * multiplier, 1)


@router.get("/signals")
async def get_signals(current_user: Optional[User] = Depends(get_current_user)):
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Resolve tier from subscriptions+plans (single source of truth)
    if current_user:
        user_subscription = await get_effective_subscription({
            "user_id": current_user.user_id,
            "role": current_user.role,
        })
    else:
        user_subscription = "free"
    
    result = []
    for signal in signals:
        signal_visibility = signal.get("visibility", "free")
        state = signal.get("state", signal.get("status", "pending"))
        is_active = state in ("pending", "active", "tp1", "tp2", "tp3")
        
        if can_access_visibility(user_subscription, signal_visibility):
            signal["state"] = state
            signal["is_active"] = is_active
            signal.pop("status", None)
            result.append(signal)
        else:
            result.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "state": state,
                "is_active": is_active,
                "visibility": signal["visibility"],
                "created_at": signal["created_at"],
                "locked": True,
                "required_plan": signal_visibility
            })
    
    return result

@router.get("/signals/{signal_id}")
async def get_signal(signal_id: str, current_user: Optional[User] = Depends(get_current_user)):
    signal = await db.signals.find_one({"signal_id": signal_id}, {"_id": 0})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    # Resolve tier from subscriptions+plans (single source of truth)
    if current_user:
        user_subscription = await get_effective_subscription({
            "user_id": current_user.user_id,
            "role": current_user.role,
        })
    else:
        user_subscription = "free"
    
    signal_visibility = signal.get("visibility", "free")
    
    if can_access_visibility(user_subscription, signal_visibility):
        state = signal.get("state", signal.get("status", "pending"))
        signal["state"] = state
        signal["is_active"] = state in ("pending", "active", "tp1", "tp2", "tp3")
        signal.pop("status", None)
        return signal
    
    state = signal.get("state", signal.get("status", "pending"))
    return {
        "signal_id": signal["signal_id"],
        "pair": signal["pair"],
        "signal_type": signal["signal_type"],
        "state": state,
        "is_active": state in ("pending", "active", "tp1", "tp2", "tp3"),
        "visibility": signal["visibility"],
        "created_at": signal["created_at"],
        "locked": True,
        "required_plan": signal_visibility
    }

@router.post("/admin/signals")
async def create_signal(signal_data: SignalCreate, background_tasks: BackgroundTasks, admin: User = Depends(require_admin)):
    # Check permission: only signal_admin and super_admin can create signals
    if not has_permission(admin, "signals", "create"):
        raise HTTPException(status_code=403, detail="You don't have permission to create signals")
    
    signal_id = f"sig_{uuid.uuid4().hex[:12]}"
    
    # Calculate risk/reward using tp1 as primary target
    risk_reward = calculate_risk_reward(
        signal_data.entry,
        signal_data.stop_loss,
        signal_data.tp1,
        signal_data.signal_type
    )
    
    # Determine initial state from request (default: pending)
    initial_state = signal_data.state if signal_data.state else SignalState.PENDING
    activated_at = None
    
    # If created as active, set activated_at and entry_price_actual
    if initial_state == SignalState.ACTIVE:
        activated_at = datetime.now(timezone.utc)
    
    signal_doc = {
        "signal_id": signal_id,
        "pair": signal_data.pair,
        "signal_type": signal_data.signal_type,
        "entry": signal_data.entry,
        "stop_loss": signal_data.stop_loss,
        "tp1": signal_data.tp1,
        "tp2": signal_data.tp2,
        "tp3": signal_data.tp3,
        # NEW: Single authoritative state field
        "state": initial_state.value,
        # Legacy fields for backward compatibility
        "status": get_status_from_state(initial_state.value),
        "tp_hit": get_tp_hit_from_state(initial_state.value),
        "risk_reward": risk_reward,
        "visibility": signal_data.visibility,
        "analysis": signal_data.analysis,
        # Price tracking
        "entry_price_actual": signal_data.entry if initial_state == SignalState.ACTIVE else None,
        "exit_price": None,
        "final_pips": None,
        # Timestamps
        "created_at": datetime.now(timezone.utc),
        "activated_at": activated_at,
        "closed_at": None
    }
    
    await db.signals.insert_one(signal_doc)
    
    # Queue push notification ONLY if signal starts as active (not pending).
    # Pending signals get their notification when the engine activates them,
    # preventing duplicate "New Signal Alert" notifications on Apple.
    if initial_state == SignalState.ACTIVE:
        background_tasks.add_task(send_signal_notification, signal_id, signal_data.pair, signal_data.signal_type, signal_data.visibility)
    
    return {"signal_id": signal_id, "message": f"Signal created with state: {initial_state.value}"}

def calculate_pips(entry: float, close: float, signal_type: str, pair: str) -> float:
    """
    Legacy wrapper for pip calculation.
    Delegates to the authoritative calculate_signal_pips function.
    """
    return calculate_signal_pips(entry, close, signal_type, pair)


# ===================== TRADE LIFECYCLE MANUAL OVERRIDES =====================
# These endpoints allow admins to manually control signal state transitions

class StateTransitionRequest(BaseModel):
    """Request model for manual state transitions"""
    new_state: SignalState
    close_price: Optional[float] = None  # Required when transitioning to closed
    reason: Optional[str] = None  # Audit trail


@router.post("/admin/signals/{signal_id}/transition")
async def manual_state_transition(
    signal_id: str,
    request: StateTransitionRequest,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin)
):
    """
    Admin endpoint for manual state transitions.
    Respects the valid transition map and hard lock rule.
    """
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    new_state = request.new_state.value
    
    # HARD LOCK RULE: Closed signals are immutable
    if is_signal_closed(current_state):
        raise HTTPException(
            status_code=400, 
            detail="Signal is closed and immutable. No further transitions allowed."
        )
    
    # Validate transition
    if not is_valid_transition(current_state, new_state):
        valid_next = [s.value for s in VALID_STATE_TRANSITIONS.get(SignalState(current_state), [])]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition: {current_state} → {new_state}. Valid transitions: {valid_next}"
        )
    
    # Build update document
    update_doc = {
        "state": new_state,
        "status": get_status_from_state(new_state),
        "tp_hit": get_tp_hit_from_state(new_state),
    }
    
    # Handle specific state transitions
    if new_state == SignalState.ACTIVE.value:
        update_doc["activated_at"] = datetime.now(timezone.utc)
        update_doc["entry_price_actual"] = signal.get("entry")
    
    elif new_state == SignalState.CLOSED.value:
        update_doc["closed_at"] = datetime.now(timezone.utc)
        
        # Calculate final pips
        close_price = request.close_price
        if close_price is None:
            # Use appropriate TP price based on previous state
            if current_state == "tp3":
                close_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
            elif current_state == "tp2":
                close_price = signal.get("tp2") or signal.get("tp1")
            elif current_state == "tp1":
                close_price = signal.get("tp1")
            else:
                # Default to stop loss for manual close from active
                close_price = signal.get("stop_loss")
        
        if close_price:
            update_doc["exit_price"] = close_price
            update_doc["final_pips"] = calculate_pips(
                signal["entry"],
                close_price,
                signal["signal_type"],
                signal["pair"]
            )
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            update_doc.get("final_pips", 0),
            visibility
        )
    
    # Atomic update with state check to prevent race conditions
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": current_state},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        # Check if state changed during our operation
        current_signal = await db.signals.find_one({"signal_id": signal_id})
        if current_signal and current_signal.get("state") != current_state:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: Signal state changed to {current_signal.get('state')} during operation"
            )
        raise HTTPException(status_code=404, detail="Signal not found or update failed")
    
    logger.info(f"[Manual] Admin {admin.user_id} transitioned signal {signal_id}: {current_state} → {new_state}")
    
    return {
        "message": f"Signal transitioned: {current_state} → {new_state}",
        "signal_id": signal_id,
        "old_state": current_state,
        "new_state": new_state,
        "final_pips": update_doc.get("final_pips")
    }


@router.post("/admin/signals/{signal_id}/activate")
async def activate_signal(signal_id: str, admin: User = Depends(require_admin)):
    """Quick action: Activate a pending signal (pending → active)"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    if current_state != "pending":
        raise HTTPException(status_code=400, detail=f"Can only activate pending signals. Current state: {current_state}")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": "pending"},
        {"$set": {
            "state": SignalState.ACTIVE.value,
            "status": "active",
            "tp_hit": 0,
            "activated_at": datetime.now(timezone.utc),
            "entry_price_actual": signal.get("entry")
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Signal state changed during operation")
    
    logger.info(f"[Manual] Admin {admin.user_id} activated signal {signal_id}")
    return {"message": "Signal activated", "signal_id": signal_id, "new_state": "active"}


@router.post("/admin/signals/{signal_id}/mark-tp")
async def mark_tp_hit_new(
    signal_id: str, 
    tp_level: int, 
    background_tasks: BackgroundTasks, 
    admin: User = Depends(require_admin)
):
    """
    Quick action: Mark a TP level as hit.
    - TP1: active → tp1
    - TP2: tp1 → tp2  
    - TP3: tp2 → tp3 → closed (auto-closes)
    """
    if tp_level not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="tp_level must be 1, 2, or 3")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    # Determine expected current state for this TP level
    expected_states = {
        1: ["active"],
        2: ["tp1"],
        3: ["tp2"]
    }
    
    if current_state not in expected_states[tp_level]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot mark TP{tp_level}. Current state: {current_state}. Expected: {expected_states[tp_level]}"
        )
    
    # Build update document
    target_states = {1: "tp1", 2: "tp2", 3: "tp3"}
    new_state = target_states[tp_level]
    
    update_doc = {
        "state": new_state,
        "status": "active",  # Still active until closed
        "tp_hit": tp_level,
    }
    
    # TP3 auto-closes the signal
    final_pips_value = None
    if tp_level == 3:
        tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
        final_pips_value = calculate_pips(
            signal["entry"],
            tp3_price,
            signal["signal_type"],
            signal["pair"]
        )
        
        # First update to tp3, then immediately to closed
        await db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": update_doc}
        )
        
        # Now close it
        update_doc = {
            "state": SignalState.CLOSED.value,
            "status": "closed",
            "tp_hit": 3,
            "closed_at": datetime.now(timezone.utc),
            "exit_price": tp3_price,
            "final_pips": final_pips_value
        }
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips_value,
            visibility
        )
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found or update failed")
    
    logger.info(f"[Manual] Admin {admin.user_id} marked TP{tp_level} for signal {signal_id}")
    
    return {
        "message": f"TP{tp_level} marked as hit",
        "signal_id": signal_id,
        "new_state": update_doc.get("state"),
        "auto_closed": tp_level == 3,
        "final_pips": final_pips_value
    }


@router.post("/admin/signals/{signal_id}/force-close")
async def force_close_signal(
    signal_id: str,
    close_price: Optional[float] = None,
    reason: str = "Manual close",
    background_tasks: BackgroundTasks = None,
    admin: User = Depends(require_admin)
):
    """
    Quick action: Force-close any non-closed signal.
    This is the only action that works on any state (except closed).
    """
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    # HARD LOCK: Cannot close already closed signal
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is already closed and immutable")
    
    # Determine close price if not provided
    if close_price is None:
        # Use appropriate price based on current state
        if current_state in ["tp1", "tp2", "tp3"]:
            # Use the last TP hit
            tp_level = get_tp_hit_from_state(current_state)
            if tp_level >= 3:
                close_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
            elif tp_level == 2:
                close_price = signal.get("tp2") or signal.get("tp1")
            elif tp_level == 1:
                close_price = signal.get("tp1")
            else:
                close_price = signal.get("entry")
        else:
            # Default to entry for pending, stop_loss for active
            close_price = signal.get("stop_loss") if current_state == "active" else signal.get("entry")
    
    final_pips = calculate_pips(
        signal["entry"],
        close_price,
        signal["signal_type"],
        signal["pair"]
    )
    
    update_doc = {
        "state": SignalState.CLOSED.value,
        "status": "closed",
        "tp_hit": get_tp_hit_from_state(current_state),  # Preserve current TP hit
        "closed_at": datetime.now(timezone.utc),
        "exit_price": close_price,
        "final_pips": final_pips
    }
    
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": current_state},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Signal state changed during operation")
    
    # Send close notification
    if background_tasks:
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips,
            visibility
        )
    
    logger.info(f"[Manual] Admin {admin.user_id} force-closed signal {signal_id}: {current_state} → closed. Reason: {reason}")
    
    return {
        "message": f"Signal force-closed",
        "signal_id": signal_id,
        "previous_state": current_state,
        "exit_price": close_price,
        "final_pips": final_pips,
        "reason": reason
    }


# Legacy admin update endpoint (kept for backward compatibility)
@router.put("/admin/signals/{signal_id}")
async def update_signal(
    signal_id: str, 
    status: Optional[SignalStatus] = None, 
    tp_hit: Optional[int] = None,
    final_pips: Optional[float] = None,
    close_price: Optional[float] = None,
    admin: User = Depends(require_admin)
):
    """Legacy admin endpoint - routes to new state system"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    # HARD LOCK
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    update_doc = {}
    
    # Map legacy status to new state
    if status is not None:
        if status == SignalStatus.ACTIVE and current_state == "pending":
            update_doc["state"] = SignalState.ACTIVE.value
            update_doc["status"] = "active"
            update_doc["activated_at"] = datetime.now(timezone.utc)
            update_doc["entry_price_actual"] = signal.get("entry")
        
        elif status == SignalStatus.CLOSED:
            update_doc["state"] = SignalState.CLOSED.value
            update_doc["status"] = "closed"
            update_doc["closed_at"] = datetime.now(timezone.utc)
            
            if close_price is not None:
                update_doc["exit_price"] = close_price
                update_doc["final_pips"] = calculate_pips(
                    signal["entry"], close_price, signal["signal_type"], signal["pair"]
                )
            elif final_pips is not None:
                update_doc["final_pips"] = final_pips
    
    # Update TP hit level (maps to state)
    if tp_hit is not None:
        if tp_hit < 0 or tp_hit > 3:
            raise HTTPException(status_code=400, detail="tp_hit must be 0, 1, 2, or 3")
        update_doc["tp_hit"] = tp_hit
        # Map tp_hit to state
        tp_to_state = {0: current_state, 1: "tp1", 2: "tp2", 3: "tp3"}
        if tp_hit > 0:
            update_doc["state"] = tp_to_state[tp_hit]
    
    # Direct final_pips update (for corrections)
    if final_pips is not None and status is None:
        update_doc["final_pips"] = final_pips
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No update parameters provided")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found or no changes made")
    
    return {"message": "Signal updated successfully", "updates": update_doc}

class SignalFullUpdate(BaseModel):
    """Full signal update model for admin editing"""
    pair: Optional[str] = None
    signal_type: Optional[SignalType] = None
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    tp_hit: Optional[int] = None
    state: Optional[SignalState] = None  # Use state, not status
    visibility: Optional[SignalVisibility] = None
    final_pips: Optional[float] = None

@router.put("/admin/signals/{signal_id}/full")
async def full_update_signal(
    signal_id: str,
    update_data: SignalFullUpdate,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to fully edit any signal field - ADMIN HAS FULL AUTHORITY"""
    # Check permission
    if not has_permission(admin, "signals", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update signals")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {}
    
    # Update all provided fields - Admin has full authority
    if update_data.pair is not None:
        update_doc["pair"] = update_data.pair
    if update_data.signal_type is not None:
        update_doc["signal_type"] = update_data.signal_type.value if hasattr(update_data.signal_type, 'value') else update_data.signal_type
    if update_data.entry is not None:
        update_doc["entry"] = update_data.entry
    if update_data.stop_loss is not None:
        update_doc["stop_loss"] = update_data.stop_loss
    if update_data.tp1 is not None:
        update_doc["tp1"] = update_data.tp1
    if update_data.tp2 is not None:
        update_doc["tp2"] = update_data.tp2
    if update_data.tp3 is not None:
        update_doc["tp3"] = update_data.tp3
    if update_data.tp_hit is not None:
        update_doc["tp_hit"] = update_data.tp_hit
    if update_data.visibility is not None:
        update_doc["visibility"] = update_data.visibility.value if hasattr(update_data.visibility, 'value') else update_data.visibility
    if update_data.final_pips is not None:
        update_doc["final_pips"] = update_data.final_pips
    
    # Handle state changes (use state, not status)
    if update_data.state is not None:
        new_state = update_data.state.value if hasattr(update_data.state, 'value') else update_data.state
        current_state = signal.get("state", signal.get("status", "pending"))
        
        update_doc["state"] = new_state
        update_doc["status"] = get_status_from_state(new_state)
        
        # Set timestamps based on state transitions
        if new_state == "active" and current_state == "pending":
            update_doc["activated_at"] = datetime.now(timezone.utc)
            update_doc["entry_price_actual"] = signal.get("entry")
        if new_state == "closed" and current_state != "closed":
            update_doc["closed_at"] = datetime.now(timezone.utc)
    
    # Recalculate risk/reward if entry, SL, or TP1 changed
    entry = update_data.entry if update_data.entry else signal.get("entry")
    sl = update_data.stop_loss if update_data.stop_loss else signal.get("stop_loss")
    tp1 = update_data.tp1 if update_data.tp1 else signal.get("tp1")
    sig_type = update_data.signal_type.value if update_data.signal_type and hasattr(update_data.signal_type, 'value') else (update_data.signal_type or signal.get("signal_type"))
    
    if entry and sl and tp1:
        update_doc["risk_reward"] = calculate_risk_reward(entry, sl, tp1, sig_type)
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No update fields provided")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} updated signal {signal_id}: {list(update_doc.keys())}")
    return {"message": "Signal updated successfully", "signal_id": signal_id, "updates": list(update_doc.keys())}


class SignalStateUpdate(BaseModel):
    """Model for state-only updates"""
    state: SignalState
    close_price: Optional[float] = None  # For calculating final_pips when closing


@router.patch("/admin/signals/{signal_id}/state")
async def update_signal_state(
    signal_id: str,
    update_data: SignalStateUpdate,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to update only the state field of a signal"""
    # Check permission
    if not has_permission(admin, "signals", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update signals")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    new_state = update_data.state.value if hasattr(update_data.state, 'value') else update_data.state
    
    update_doc = {
        "state": new_state,
        "status": get_status_from_state(new_state),
    }
    
    # Set timestamps and derived fields based on state transitions
    if new_state == "active" and current_state == "pending":
        update_doc["activated_at"] = datetime.now(timezone.utc)
        update_doc["entry_price_actual"] = signal.get("entry")
    
    if new_state in ["tp1", "tp2", "tp3"]:
        tp_level = int(new_state[-1])
        update_doc["tp_hit"] = tp_level
    
    if new_state == "closed":
        update_doc["closed_at"] = datetime.now(timezone.utc)
        
        # Calculate final_pips if close_price provided
        if update_data.close_price is not None:
            update_doc["exit_price"] = update_data.close_price
            update_doc["final_pips"] = calculate_pips(
                signal["entry"],
                update_data.close_price,
                signal["signal_type"],
                signal["pair"]
            )
        
        # Send close notification
        final_pips = update_doc.get("final_pips", 0)
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips,
            visibility
        )
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} changed signal {signal_id} state: {current_state} → {new_state}")
    return {
        "message": f"Signal state updated: {current_state} → {new_state}",
        "signal_id": signal_id,
        "old_state": current_state,
        "new_state": new_state,
        "final_pips": update_doc.get("final_pips")
    }

# NOTE: The following legacy endpoints have been replaced by state-based endpoints:
# - POST /admin/signals/{signal_id}/activate -> see line 804 (new state-based activate)
# - POST /admin/signals/{signal_id}/mark-tp -> see line 837 (new state-based mark-tp)
# - POST /admin/signals/{signal_id}/close -> use /admin/signals/{signal_id}/force-close (line 942)

@router.delete("/admin/signals/{signal_id}")
async def delete_signal(signal_id: str, admin: User = Depends(require_admin)):
    """Admin endpoint to delete a signal from MongoDB"""
    # Check permission
    if not has_permission(admin, "signals", "delete"):
        raise HTTPException(status_code=403, detail="You don't have permission to delete signals")
    
    result = await db.signals.delete_one({"signal_id": signal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} deleted signal {signal_id}")
    return {"message": "Signal deleted successfully", "signal_id": signal_id}

# ===================== SIGNAL HISTORY & ANALYTICS =====================
def get_pips_value(signal: dict) -> float:
    """Get pips value from signal - supports both old and new schema"""
    return signal.get("final_pips") or signal.get("result_pips", 0) or 0

@router.get("/signals/history/stats")
async def get_signal_history_stats(current_user: Optional[User] = Depends(get_current_user)):
    """Get signal history with performance statistics based on user's access level"""
    user_role = current_user.role if current_user else UserRole.FREE
    
    # Get all closed signals
    all_closed = await db.signals.find({"state": "closed"}, {"_id": 0}).sort("closed_at", -1).to_list(500)
    
    # Filter signals based on user's access level
    accessible_signals = []
    for signal in all_closed:
        signal_visibility = SignalVisibility(signal.get("visibility", "free"))
        if can_access_signal(user_role, signal_visibility):
            accessible_signals.append(signal)
    
    # Calculate basic stats (available to all users) - use final_pips or result_pips
    total_signals = len(accessible_signals)
    winning_signals = len([s for s in accessible_signals if get_pips_value(s) > 0])
    losing_signals = len([s for s in accessible_signals if get_pips_value(s) < 0])
    breakeven_signals = total_signals - winning_signals - losing_signals
    
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    total_pips = sum([get_pips_value(s) for s in accessible_signals])
    avg_pips = round(total_pips / total_signals, 1) if total_signals > 0 else 0
    
    # Calculate best/worst trades
    pips_list = [get_pips_value(s) for s in accessible_signals if get_pips_value(s) != 0]
    best_trade = max(pips_list) if pips_list else 0
    worst_trade = min(pips_list) if pips_list else 0
    
    # Basic stats for all users
    basic_stats = {
        "total_signals": total_signals,
        "winning_signals": winning_signals,
        "losing_signals": losing_signals,
        "breakeven_signals": breakeven_signals,
        "win_rate": win_rate,
        "total_pips": round(total_pips, 1),
        "avg_pips_per_trade": avg_pips,
        "best_trade_pips": round(best_trade, 1),
        "worst_trade_pips": round(worst_trade, 1),
    }

    # Calculate winning streak (consecutive wins from most recent)
    winning_streak = 0
    for s in accessible_signals:
        if get_pips_value(s) > 0:
            winning_streak += 1
        else:
            break

    # Calculate monthly pips for mini chart (last 6 months)
    from collections import defaultdict
    monthly_pips_map: dict[str, float] = defaultdict(float)
    monthly_wins_map: dict[str, int] = defaultdict(int)
    monthly_losses_map: dict[str, int] = defaultdict(int)
    for s in accessible_signals:
        closed_date = s.get("closed_at") or s.get("created_at")
        if closed_date:
            dt = closed_date if isinstance(closed_date, datetime) else datetime.fromisoformat(str(closed_date).replace("Z", "+00:00"))
            month_key = dt.strftime("%Y-%m")
            pips_val = get_pips_value(s)
            monthly_pips_map[month_key] += pips_val
            if pips_val > 0:
                monthly_wins_map[month_key] += 1
            elif pips_val < 0:
                monthly_losses_map[month_key] += 1

    # Sort by month and take last 6
    sorted_months = sorted(monthly_pips_map.keys())[-6:]
    monthly_performance = []
    for m in sorted_months:
        month_label = datetime.strptime(m, "%Y-%m").strftime("%b")
        monthly_performance.append({
            "month": month_label,
            "pips": round(monthly_pips_map[m], 1),
            "wins": monthly_wins_map.get(m, 0),
            "losses": monthly_losses_map.get(m, 0),
        })

    basic_stats["winning_streak"] = winning_streak
    basic_stats["monthly_performance"] = monthly_performance
    
    # For free users, return basic stats only with limited signal history
    if user_role == UserRole.FREE:
        # Free users see only last 5 signals (preview)
        limited_signals = accessible_signals[:5]
        return {
            "stats": basic_stats,
            "signals": limited_signals,
            "signals_count": len(limited_signals),
            "total_available": total_signals,
            "is_limited": True,
            "upgrade_message": "Upgrade to Premium or VIP to see full signal history"
        }
    
    # Premium/VIP users get full history
    return {
        "stats": basic_stats,
        "signals": accessible_signals,
        "signals_count": len(accessible_signals),
        "total_available": total_signals,
        "is_limited": False
    }

async def send_signal_notification(signal_id: str, pair: str, signal_type: SignalType, visibility: SignalVisibility):
    """Send push notification to ALL users about new signal — delegates to centralized service."""
    from services.push_notifications import notify_new_signal
    sig_type = signal_type.value if hasattr(signal_type, 'value') else str(signal_type)
    await notify_new_signal(signal_id, pair, sig_type)


async def send_signal_close_notification(signal_id: str, pair: str, signal_type: str, final_pips: float, visibility: SignalVisibility):
    """Send push notification when signal is closed — delegates to centralized service."""
    from services.push_notifications import notify_signal_closed
    await notify_signal_closed(signal_id, pair, signal_type, final_pips)



# ===================== AI CHART ANALYZER (LEGACY - File Upload) =====================

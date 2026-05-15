"""
api/routes/payments_flutterwave.py — Flutterwave hosted-checkout payments.

Used ONLY for non-Play Android distributions (APK / Xiaomi GetApps / Samsung Store).
Apple IAP and Google Play Billing flows are NOT touched here.

Flow:
    1. Client calls POST /api/payments/flutterwave/initialize with {plan_id, platform}.
    2. Backend creates a `pending` doc in `payment_transactions`, calls Flutterwave
       /v3/payments with bearer secret, returns hosted checkout URL + tx_ref.
    3. Webview displays Flutterwave hosted page IN-APP.
    4. Flutterwave fires webhook → we verify signature, re-verify via
       /v3/transactions/{id}/verify, and activate subscription (idempotent on tx_ref).
    5. Client polls GET /api/payments/flutterwave/status?tx_ref=... to learn the result.

Subscription activation reuses the SAME profile fields the IAP routes write to
(subscription, subscription_status, subscription_expiry, subscription_platform,
subscription_product_id) and the SAME downgrade-protection guard.
"""
import os
import uuid
import hmac
import base64
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from core.database import db
from core.dependencies import require_auth
from supabase_auth import fetch_profile, update_profile
from models.schemas import User
from api.routes.referral import on_user_subscription_change
from api.routes.subscriptions import should_update_subscription

logger = logging.getLogger(__name__)

# ── Env config ────────────────────────────────────────────────────────────────
FLW_SECRET_KEY = os.environ.get("FLW_SECRET_KEY", "")
FLW_SECRET_HASH = os.environ.get("FLW_SECRET_HASH", "")
FLW_BASE_URL = os.environ.get("FLW_BASE_URL", "https://api.flutterwave.com/v3")
FLW_REDIRECT_URL = os.environ.get(
    "FLW_REDIRECT_URL",
    "https://swift-fx-production-production.up.railway.app/api/payments/flutterwave/redirect",
)

# ── Plan catalog (server is source of truth — never trust client amounts) ─────
# Each entry mirrors the same product_id Apple/Google use, so reporting stays unified.
PLAN_CATALOG = {
    "premium_weekly":  {"tier": "premium", "duration_days": 7,   "amount": 9.99,   "product_id": "com.swiftfx.signals.premium.weekly"},
    "premium_monthly": {"tier": "premium", "duration_days": 30,  "amount": 29.99,  "product_id": "com.swiftfx.signals.premium.monthly"},
    "premium_yearly":  {"tier": "premium", "duration_days": 365, "amount": 199.99, "product_id": "com.swiftfx.signals.premium.yearly"},
    "vip_weekly":      {"tier": "vip",     "duration_days": 7,   "amount": 19.99,  "product_id": "com.swiftfx.signals.vip.weekly.v2"},
    "vip_monthly":     {"tier": "vip",     "duration_days": 30,  "amount": 59.99,  "product_id": "com.swiftfx.signals.vip.monthly.v2"},
    "vip_yearly":      {"tier": "vip",     "duration_days": 365, "amount": 399.99, "product_id": "com.swiftfx.signals.vip.yearly.v2"},
}

# Whitelist client-supplied distribution channel labels (security: never trust raw input).
ALLOWED_PLATFORMS = {"android_apk", "xiaomi", "samsung"}

router = APIRouter(prefix="/api/payments/flutterwave", tags=["payments-flutterwave"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class InitRequest(BaseModel):
    plan_id: str = Field(..., description="One of: premium_weekly, premium_monthly, premium_yearly, vip_weekly, vip_monthly, vip_yearly")
    platform: str = Field("android_apk", description="Distribution channel: android_apk | xiaomi | samsung")


class InitResponse(BaseModel):
    checkout_url: str
    tx_ref: str
    amount: float
    currency: str = "USD"


class StatusResponse(BaseModel):
    tx_ref: str
    status: str  # pending | successful | failed | cancelled
    plan_id: Optional[str] = None
    tier: Optional[str] = None
    subscription_expiry: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _create_flutterwave_payment(*, tx_ref: str, amount: float, customer: dict, meta: dict) -> dict:
    """Calls Flutterwave POST /v3/payments and returns parsed JSON."""
    if not FLW_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Flutterwave is not configured on the server.")

    headers = {
        "Authorization": f"Bearer {FLW_SECRET_KEY}",
        "Content-Type": "application/json",
        "X-Idempotency-Key": f"flw-{tx_ref}",
    }
    payload = {
        "tx_ref": tx_ref,
        "amount": amount,
        "currency": "USD",
        "redirect_url": FLW_REDIRECT_URL,
        "payment_options": "card",
        "customer": customer,
        "meta": meta,
        "customizations": {
            "title": "Swift FX Signals",
            "description": f"Subscription · {meta.get('plan_id')}",
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{FLW_BASE_URL}/payments", headers=headers, json=payload)
    if resp.status_code >= 400:
        logger.error(f"[Flutterwave] /payments returned {resp.status_code}: {resp.text[:500]}")
        raise HTTPException(status_code=502, detail="Failed to initialize payment with Flutterwave.")
    return resp.json()


async def _verify_flutterwave_transaction(flw_id: str | int) -> dict:
    """Calls Flutterwave GET /v3/transactions/{id}/verify and returns parsed JSON."""
    if not FLW_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Flutterwave is not configured on the server.")
    headers = {
        "Authorization": f"Bearer {FLW_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{FLW_BASE_URL}/transactions/{flw_id}/verify", headers=headers)
    if resp.status_code >= 400:
        logger.error(f"[Flutterwave] verify({flw_id}) returned {resp.status_code}: {resp.text[:500]}")
        return {}
    return resp.json()


def _signature_valid(raw_body: bytes, headers) -> bool:
    """
    Flutterwave webhook auth — supports both flavors:
      1. `verif-hash` header: direct equality with FLW_SECRET_HASH (older flow, still active).
      2. `flutterwave-signature` header: base64(HMAC-SHA256(body, FLW_SECRET_HASH)).
    """
    if not FLW_SECRET_HASH:
        logger.error("[Flutterwave] FLW_SECRET_HASH is not set — rejecting webhook.")
        return False

    verif_hash = headers.get("verif-hash") or headers.get("Verif-Hash")
    if verif_hash and hmac.compare_digest(verif_hash, FLW_SECRET_HASH):
        return True

    sig = headers.get("flutterwave-signature") or headers.get("Flutterwave-Signature")
    if sig:
        computed = base64.b64encode(
            hmac.new(FLW_SECRET_HASH.encode("utf-8"), raw_body, hashlib.sha256).digest()
        ).decode("utf-8")
        if hmac.compare_digest(computed, sig):
            return True

    return False


async def _activate_subscription_from_txn(txn: dict) -> Optional[str]:
    """
    Idempotently activate the user's subscription from a verified payment_transactions doc.
    Mirrors Apple/Google verify-endpoint behavior. Returns the ISO expiry on activation, else None.
    """
    user_id = txn["user_id"]
    plan_id = txn["plan_id"]
    plan = PLAN_CATALOG.get(plan_id)
    if not plan:
        logger.error(f"[Flutterwave] Unknown plan_id during activation: {plan_id}")
        return None

    tier = plan["tier"]
    now = datetime.now(timezone.utc)
    expiry_dt = now + timedelta(days=plan["duration_days"])
    expiry_iso = expiry_dt.isoformat()

    if not await should_update_subscription(user_id, tier, expiry_dt):
        logger.info(f"[Flutterwave] Skipping profile update — user {user_id} has higher active tier.")
        return None

    await update_profile(user_id, {
        "subscription": tier,
        "subscription_status": "active",
        "subscription_expiry": expiry_iso,
        "subscription_platform": "flutterwave",
        "subscription_product_id": plan["product_id"],
        "subscription_auto_renew": False,  # one-off charge
        "subscription_is_trial": False,
        "updated_at": now.isoformat(),
    })
    await on_user_subscription_change(user_id, tier)
    return expiry_iso


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/initialize", response_model=InitResponse)
async def initialize_payment(payload: InitRequest, current_user: User = Depends(require_auth)):
    plan = PLAN_CATALOG.get(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Unknown plan_id: {payload.plan_id}")

    platform = payload.platform if payload.platform in ALLOWED_PLATFORMS else "android_apk"

    user_id = current_user.user_id
    profile = await fetch_profile(user_id) or {}
    customer_email = profile.get("email") or f"{user_id}@swiftfx.app"
    customer_name = profile.get("full_name") or profile.get("name") or "Swift FX User"

    tx_ref = f"swfx-{platform}-{uuid.uuid4().hex[:16]}"

    # Insert pending transaction BEFORE calling Flutterwave (rollback-safe).
    now = datetime.now(timezone.utc)
    await db.payment_transactions.insert_one({
        "tx_ref": tx_ref,
        "user_id": user_id,
        "provider": "flutterwave",
        "plan_id": payload.plan_id,
        "tier": plan["tier"],
        "amount": plan["amount"],
        "currency": "USD",
        "status": "pending",
        "flutterwave_transaction_id": None,
        "platform": platform,
        "product_id": plan["product_id"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    })

    try:
        flw_resp = await _create_flutterwave_payment(
            tx_ref=tx_ref,
            amount=plan["amount"],
            customer={"email": customer_email, "name": customer_name},
            meta={"user_id": user_id, "plan_id": payload.plan_id, "platform": platform},
        )
    except HTTPException:
        await db.payment_transactions.update_one(
            {"tx_ref": tx_ref},
            {"$set": {"status": "failed", "failure_reason": "init_error", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        raise

    data = flw_resp.get("data") or {}
    checkout_url = data.get("link")
    if flw_resp.get("status") != "success" or not checkout_url:
        await db.payment_transactions.update_one(
            {"tx_ref": tx_ref},
            {"$set": {"status": "failed", "failure_reason": flw_resp.get("message", "init_error"), "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        raise HTTPException(status_code=502, detail=flw_resp.get("message") or "Flutterwave init failed.")

    return InitResponse(checkout_url=checkout_url, tx_ref=tx_ref, amount=plan["amount"])


@router.post("/webhook")
async def webhook(request: Request) -> Response:
    raw_body = await request.body()
    if not _signature_valid(raw_body, request.headers):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event") or payload.get("type")
    data = payload.get("data") or {}
    tx_ref = data.get("tx_ref")
    flw_id = data.get("id")
    logger.info(f"[Flutterwave] Webhook event={event} tx_ref={tx_ref} flw_id={flw_id}")

    if not tx_ref or not flw_id:
        # Acknowledge to stop retries — nothing we can act on.
        return Response(status_code=200)

    txn = await db.payment_transactions.find_one({"tx_ref": tx_ref})
    if not txn:
        logger.warning(f"[Flutterwave] Unknown tx_ref in webhook: {tx_ref}")
        return Response(status_code=200)

    # Re-verify with Flutterwave — webhook payload alone is never trusted.
    verify = await _verify_flutterwave_transaction(flw_id)
    vdata = verify.get("data") or {}
    vstatus = vdata.get("status")
    vamount = vdata.get("amount")
    vcurrency = vdata.get("currency")
    vtx_ref = vdata.get("tx_ref")

    matches = (
        vstatus == "successful"
        and vtx_ref == tx_ref
        and vcurrency == txn["currency"]
        and float(vamount or 0) >= float(txn["amount"])
    )

    if not matches:
        logger.warning(
            f"[Flutterwave] Verification mismatch tx_ref={tx_ref} status={vstatus} "
            f"amount={vamount}/{txn['amount']} currency={vcurrency}/{txn['currency']}"
        )
        await db.payment_transactions.update_one(
            {"tx_ref": tx_ref, "status": {"$ne": "successful"}},
            {"$set": {
                "status": "failed",
                "failure_reason": f"verify_mismatch:{vstatus}",
                "flutterwave_transaction_id": flw_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return Response(status_code=200)

    # Atomic flip pending → successful. If we don't modify a doc, it was already processed.
    update_result = await db.payment_transactions.update_one(
        {"tx_ref": tx_ref, "status": {"$ne": "successful"}},
        {"$set": {
            "status": "successful",
            "flutterwave_transaction_id": flw_id,
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if update_result.modified_count == 0:
        logger.info(f"[Flutterwave] Duplicate webhook for tx_ref={tx_ref} — already processed.")
        return Response(status_code=200)

    expiry_iso = await _activate_subscription_from_txn(txn)
    if expiry_iso:
        await db.payment_transactions.update_one(
            {"tx_ref": tx_ref},
            {"$set": {"subscription_expiry": expiry_iso, "activated_at": datetime.now(timezone.utc).isoformat()}},
        )
        logger.info(f"[Flutterwave] Activated {txn['tier']} for user={txn['user_id']} expires={expiry_iso}")

    return Response(status_code=200)


@router.get("/status", response_model=StatusResponse)
async def get_status(tx_ref: str, current_user: User = Depends(require_auth)):
    txn = await db.payment_transactions.find_one(
        {"tx_ref": tx_ref, "user_id": current_user.user_id},
        {"_id": 0},
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return StatusResponse(
        tx_ref=txn["tx_ref"],
        status=txn["status"],
        plan_id=txn.get("plan_id"),
        tier=txn.get("tier"),
        subscription_expiry=txn.get("subscription_expiry"),
    )


@router.get("/redirect")
async def redirect_landing(status: Optional[str] = None, tx_ref: Optional[str] = None, transaction_id: Optional[str] = None):
    """
    Minimal HTML landing for the in-app WebView to detect via onNavigationStateChange.
    The page itself does no business logic — webhook + status endpoint handle that.
    """
    from fastapi.responses import HTMLResponse
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Swift FX · Payment</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:-apple-system,Roboto,sans-serif;background:#0A0E17;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}}</style></head>
<body><div>
<h2 style="color:#00D4AA">{'Payment received' if status == 'successful' else 'Returning to app…'}</h2>
<p style="color:#8A8D98">You can safely close this window.</p>
<p style="color:#5A5F6E;font-size:12px">tx_ref: {tx_ref or ''}</p>
</div></body></html>"""
    return HTMLResponse(content=html)

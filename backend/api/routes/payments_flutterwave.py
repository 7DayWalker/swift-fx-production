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
import json
import traceback
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
    "vip_weekly":      {"tier": "vip",     "duration_days": 7,   "amount": 14.99,  "product_id": "com.swiftfx.signals.vip.weekly.v2"},
    "vip_monthly":     {"tier": "vip",     "duration_days": 30,  "amount": 49.99,  "product_id": "com.swiftfx.signals.vip.monthly.v2"},
    "vip_yearly":      {"tier": "vip",     "duration_days": 365, "amount": 299.99, "product_id": "com.swiftfx.signals.vip.yearly.v2"},
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


async def _verify_flutterwave_transaction_by_reference(tx_ref: str) -> dict:
    """Calls Flutterwave GET /v3/transactions/verify_by_reference."""
    if not FLW_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Flutterwave is not configured on the server.")
    headers = {
        "Authorization": f"Bearer {FLW_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{FLW_BASE_URL}/transactions/verify_by_reference",
            headers=headers,
            params={"tx_ref": tx_ref},
        )
    if resp.status_code >= 400:
        logger.error(f"[Flutterwave] verify_by_reference({tx_ref}) returned {resp.status_code}: {resp.text[:500]}")
        return {}
    return resp.json()


def _success_status(value: Optional[str]) -> bool:
    return str(value or "").lower() in {"successful", "succeeded", "success"}


def _failure_status(value: Optional[str]) -> bool:
    return str(value or "").lower() in {"failed", "cancelled", "canceled"}


def _verified_data(verify: dict) -> dict:
    data = verify.get("data")
    return data if isinstance(data, dict) else {}


def _verified_tx_ref(data: dict) -> Optional[str]:
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    return data.get("tx_ref") or data.get("reference") or data.get("txRef") or meta.get("tx_ref")


def _verified_flw_id(data: dict) -> Optional[str | int]:
    return data.get("id") or data.get("transaction_id") or data.get("flw_id")


def _billing_cycle_from_plan_id(plan_id: Optional[str]) -> Optional[str]:
    if not plan_id or "_" not in plan_id:
        return None
    return plan_id.rsplit("_", 1)[-1]


def _verification_matches_txn(verify: dict, txn: dict) -> bool:
    data = _verified_data(verify)
    amount = data.get("amount") if data.get("amount") is not None else data.get("charged_amount")
    return (
        _success_status(data.get("status"))
        and _verified_tx_ref(data) == txn["tx_ref"]
        and data.get("currency") == txn["currency"]
        and float(amount or 0) >= float(txn["amount"])
    )


def _extract_webhook_fields(payload: dict) -> tuple[Optional[str], Optional[str], Optional[str | int], Optional[str]]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    event = payload.get("event") or payload.get("type") or payload.get("event.type") or payload.get("event_type")
    tx_ref = (
        data.get("tx_ref")
        or data.get("reference")
        or data.get("txRef")
        or payload.get("tx_ref")
        or payload.get("reference")
        or payload.get("txRef")
    )
    flw_id = (
        data.get("id")
        or data.get("transaction_id")
        or data.get("flw_id")
        or payload.get("transaction_id")
        or payload.get("flw_id")
    )
    status = data.get("status") or payload.get("status")
    return event, tx_ref, flw_id, status


async def _verify_payment_for_txn(txn: dict, flw_id: Optional[str | int] = None) -> dict:
    logger.info(
        "[Flutterwave] Verify start tx_ref=%s user_id=%s email=%s plan_id=%s billing_cycle=%s "
        "txn_status=%s flw_id=%s",
        txn.get("tx_ref"),
        txn.get("user_id"),
        txn.get("email") or txn.get("customer_email"),
        txn.get("plan_id"),
        _billing_cycle_from_plan_id(txn.get("plan_id")),
        txn.get("status"),
        flw_id,
    )
    if flw_id:
        logger.info("[Flutterwave] Before verify transaction by id tx_ref=%s flw_id=%s", txn.get("tx_ref"), flw_id)
        verify = await _verify_flutterwave_transaction(flw_id)
        logger.info("[Flutterwave] After verify transaction by id tx_ref=%s response=%s", txn.get("tx_ref"), verify)
        if _verification_matches_txn(verify, txn):
            logger.info("[Flutterwave] Verify matched by id tx_ref=%s", txn.get("tx_ref"))
            return verify
        logger.warning(f"[Flutterwave] id verification did not match tx_ref={txn['tx_ref']}; trying verify_by_reference")
    logger.info("[Flutterwave] Before verify transaction by reference tx_ref=%s", txn.get("tx_ref"))
    verify = await _verify_flutterwave_transaction_by_reference(txn["tx_ref"])
    logger.info("[Flutterwave] After verify transaction by reference tx_ref=%s response=%s", txn.get("tx_ref"), verify)
    return verify


async def _mark_successful_and_activate(txn: dict, verify: dict, source: str) -> dict:
    data = _verified_data(verify)
    flw_id = _verified_flw_id(data) or txn.get("flutterwave_transaction_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    logger.info(
        "[Flutterwave] Success path start source=%s tx_ref=%s user_id=%s email=%s plan_id=%s "
        "billing_cycle=%s txn_status=%s verify_response=%s",
        source,
        txn.get("tx_ref"),
        txn.get("user_id"),
        txn.get("email") or txn.get("customer_email"),
        txn.get("plan_id"),
        _billing_cycle_from_plan_id(txn.get("plan_id")),
        txn.get("status"),
        verify,
    )

    claim_filter = {
        "tx_ref": txn["tx_ref"],
        "user_id": txn["user_id"],
        "status": {"$ne": "successful"},
        "activation_started_at": {"$exists": False},
    }
    if txn.get("email"):
        claim_filter["email"] = txn["email"]
    logger.info("[Flutterwave] Before activation claim Mongo update tx_ref=%s filter=%s", txn["tx_ref"], claim_filter)
    claim_result = await db.payment_transactions.update_one(
        claim_filter,
        {"$set": {
            "flutterwave_transaction_id": flw_id,
            "flutterwave_status": data.get("status"),
            "flutterwave_flw_ref": data.get("flw_ref"),
            "flutterwave_payment_type": data.get("payment_type"),
            "activation_started_at": now_iso,
            "verification_source": source,
            "updated_at": now_iso,
        }},
    )
    logger.info(
        "[Flutterwave] After activation claim Mongo update tx_ref=%s matched=%s modified=%s",
        txn["tx_ref"],
        claim_result.matched_count,
        claim_result.modified_count,
    )

    if claim_result.modified_count == 0:
        latest = await db.payment_transactions.find_one({"tx_ref": txn["tx_ref"]}, {"_id": 0})
        logger.info("[Flutterwave] Duplicate/in-progress success processing tx_ref=%s latest=%s", txn["tx_ref"], latest)
        return latest or txn

    updated_txn = await db.payment_transactions.find_one({"tx_ref": txn["tx_ref"]}, {"_id": 0}) or txn
    try:
        logger.info("[Flutterwave] Before activate subscription tx_ref=%s user_id=%s", txn["tx_ref"], txn.get("user_id"))
        expiry_iso = await _activate_subscription_from_txn(updated_txn, verify)
        logger.info("[Flutterwave] After activate subscription tx_ref=%s expiry_iso=%s", txn["tx_ref"], expiry_iso)

        if not expiry_iso:
            raise RuntimeError("Activation did not return a subscription expiry.")

        activated_at = datetime.now(timezone.utc).isoformat()
        final_filter = {"tx_ref": txn["tx_ref"], "user_id": txn["user_id"], "status": {"$ne": "successful"}}
        if txn.get("email"):
            final_filter["email"] = txn["email"]
        logger.info("[Flutterwave] Before write subscription_expiry/activated_at tx_ref=%s filter=%s", txn["tx_ref"], final_filter)
        final_result = await db.payment_transactions.update_one(
            final_filter,
            {"$set": {
                "status": "successful",
                "subscription_expiry": expiry_iso,
                "activated_at": activated_at,
                "verified_at": now_iso,
                "updated_at": activated_at,
            }},
        )
        logger.info(
            "[Flutterwave] After write subscription_expiry/activated_at tx_ref=%s matched=%s modified=%s",
            txn["tx_ref"],
            final_result.matched_count,
            final_result.modified_count,
        )
        updated_txn["subscription_expiry"] = expiry_iso
        updated_txn["activated_at"] = activated_at
        updated_txn["status"] = "successful"
    except Exception as e:
        print("[Flutterwave Activation Error]", str(e), traceback.format_exc())
        logger.error(
            "[Flutterwave Activation Error] tx_ref=%s user_id=%s email=%s error=%s traceback=%s",
            txn.get("tx_ref"),
            txn.get("user_id"),
            txn.get("email") or txn.get("customer_email"),
            str(e),
            traceback.format_exc(),
        )
        await db.payment_transactions.update_one(
            {"tx_ref": txn["tx_ref"], "status": {"$ne": "successful"}},
            {
                "$set": {
                    "activation_error": str(e),
                    "activation_failed_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "$unset": {"activation_started_at": ""},
            },
        )
        raise

    latest = await db.payment_transactions.find_one({"tx_ref": txn["tx_ref"]}, {"_id": 0})
    logger.info("[Flutterwave] Subscription activated successfully for user %s tx_ref=%s latest=%s", txn["user_id"], txn["tx_ref"], latest)
    return latest or updated_txn

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


async def _activate_subscription_from_txn(txn: dict, verify: Optional[dict] = None) -> Optional[str]:
    """
    Idempotently activate the user's subscription from a verified payment_transactions doc.
    Mirrors Apple/Google verify-endpoint behavior. Returns the ISO expiry on activation, else None.
    """
    try:
        user_id = txn["user_id"]
        plan_id = txn["plan_id"]
        billing_cycle = _billing_cycle_from_plan_id(plan_id)
        plan = PLAN_CATALOG.get(plan_id)
        if not plan:
            logger.error(f"[Flutterwave] Unknown plan_id during activation: {plan_id}")
            return None

        tier = plan["tier"]
        now = datetime.now(timezone.utc)
        expiry_dt = now + timedelta(days=plan["duration_days"])
        expiry_iso = expiry_dt.isoformat()
        vdata = _verified_data(verify or {})
        flw_id = _verified_flw_id(vdata) or txn.get("flutterwave_transaction_id")
        email = txn.get("email") or txn.get("customer_email")

        logger.info(
            "[Flutterwave] Activation start tx_ref=%s user_id=%s email=%s plan_id=%s billing_cycle=%s "
            "txn_status=%s tier=%s expiry=%s verify_response=%s",
            txn.get("tx_ref"),
            user_id,
            email,
            plan_id,
            billing_cycle,
            txn.get("status"),
            tier,
            expiry_iso,
            verify,
        )

        profile_before = await fetch_profile(user_id) or {}
        email = email or profile_before.get("email")
        logger.info(
            "[Flutterwave] Profile before activation tx_ref=%s user_id=%s email=%s subscription=%s "
            "subscription_tier=%s subscription_expiry=%s role=%s",
            txn.get("tx_ref"),
            user_id,
            email,
            profile_before.get("subscription"),
            profile_before.get("subscription_tier"),
            profile_before.get("subscription_expiry"),
            profile_before.get("role"),
        )

        should_update = await should_update_subscription(user_id, tier, expiry_dt)
        logger.info("[Flutterwave] should_update_subscription tx_ref=%s user_id=%s result=%s", txn.get("tx_ref"), user_id, should_update)
        if not should_update:
            logger.info(f"[Flutterwave] Skipping profile update - user {user_id} has higher active tier.")
            return profile_before.get("subscription_expiry") or expiry_iso

        profile_update = {
            "subscription": tier,
            "subscription_tier": tier,
            "subscription_status": "active",
            "subscription_expiry": expiry_iso,
            "subscription_platform": "flutterwave",
            "subscription_product_id": plan["product_id"],
            "subscription_auto_renew": False,
            "subscription_is_trial": False,
            "activated_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        logger.info("[Flutterwave] Before update_profile tx_ref=%s user_id=%s payload=%s", txn.get("tx_ref"), user_id, profile_update)
        profile_ok = await update_profile(user_id, profile_update)
        logger.info("[Flutterwave] After update_profile tx_ref=%s user_id=%s result=%s", txn.get("tx_ref"), user_id, profile_ok)
        if not profile_ok:
            raise RuntimeError("update_profile returned False")

        iap_doc = {
            "user_id": user_id,
            "transaction_id": str(flw_id or txn["tx_ref"]),
            "original_transaction_id": txn["tx_ref"],
            "product_id": plan["product_id"],
            "platform": "flutterwave",
            "status": "active",
            "plan": tier,
            "billing_cycle": billing_cycle,
            "expiry_date": expiry_dt,
            "auto_renew": False,
            "is_trial": False,
            "provider": "flutterwave",
            "tx_ref": txn["tx_ref"],
            "amount": txn.get("amount"),
            "currency": txn.get("currency"),
            "updated_at": now,
            "webhook_event": "flutterwave_success",
        }
        logger.info("[Flutterwave] Before iap_transactions upsert tx_ref=%s user_id=%s doc=%s", txn.get("tx_ref"), user_id, iap_doc)
        iap_result = await db.iap_transactions.update_one(
            {"original_transaction_id": txn["tx_ref"], "platform": "flutterwave"},
            {
                "$set": iap_doc,
                "$setOnInsert": {
                    "purchase_date": now,
                    "created_at": now,
                },
            },
            upsert=True,
        )
        logger.info(
            "[Flutterwave] After iap_transactions upsert tx_ref=%s matched=%s modified=%s upserted_id=%s",
            txn.get("tx_ref"),
            iap_result.matched_count,
            iap_result.modified_count,
            iap_result.upserted_id,
        )

        logger.info("[Flutterwave] Before on_user_subscription_change tx_ref=%s user_id=%s tier=%s", txn.get("tx_ref"), user_id, tier)
        referral_result = await on_user_subscription_change(user_id, tier)
        logger.info("[Flutterwave] After on_user_subscription_change tx_ref=%s user_id=%s result=%s", txn.get("tx_ref"), user_id, referral_result)

        profile_after = await fetch_profile(user_id) or {}
        logger.info(
            "[Flutterwave] Profile after activation tx_ref=%s user_id=%s subscription=%s subscription_tier=%s "
            "subscription_expiry=%s activated_at=%s platform=%s product_id=%s",
            txn.get("tx_ref"),
            user_id,
            profile_after.get("subscription"),
            profile_after.get("subscription_tier"),
            profile_after.get("subscription_expiry"),
            profile_after.get("activated_at"),
            profile_after.get("subscription_platform"),
            profile_after.get("subscription_product_id"),
        )
        logger.info("[Flutterwave] Subscription activated successfully for user %s", user_id)
        return expiry_iso
    except Exception as e:
        print("[Flutterwave Activation Error]", str(e), traceback.format_exc())
        logger.error(
            "[Flutterwave Activation Error] tx_ref=%s user_id=%s error=%s traceback=%s",
            txn.get("tx_ref"),
            txn.get("user_id"),
            str(e),
            traceback.format_exc(),
        )
        raise

@router.get("/catalog")
async def get_catalog():
    """
    Server-authoritative plan catalog for Flutterwave (Android sideloaded distributions).
    Frontend must render Flutterwave prices from this endpoint — never compute them locally.
    Apple IAP / Google Play continue using their native store pricing APIs.
    """
    return {
        "currency": "USD",
        "plans": [
            {
                "plan_id": plan_id,
                "tier": meta["tier"],
                "duration_days": meta["duration_days"],
                "amount": meta["amount"],
                "product_id": meta["product_id"],
            }
            for plan_id, meta in PLAN_CATALOG.items()
        ],
    }


@router.post("/initialize", response_model=InitResponse)
async def initialize_payment(payload: InitRequest, current_user: User = Depends(require_auth)):
    plan = PLAN_CATALOG.get(payload.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Unknown plan_id: {payload.plan_id}")

    platform = payload.platform if payload.platform in ALLOWED_PLATFORMS else "android_apk"

    user_id = current_user.user_id
    profile = await fetch_profile(user_id) or {}
    customer_email = profile.get("email") or current_user.email or f"{user_id}@swiftfx.app"
    customer_name = profile.get("full_name") or profile.get("name") or "Swift FX User"

    tx_ref = f"swfx-{platform}-{uuid.uuid4().hex[:16]}"

    # Insert pending transaction BEFORE calling Flutterwave (rollback-safe).
    now = datetime.now(timezone.utc)
    await db.payment_transactions.insert_one({
        "tx_ref": tx_ref,
        "user_id": user_id,
        "email": customer_email,
        "provider": "flutterwave",
        "plan_id": payload.plan_id,
        "billing_cycle": _billing_cycle_from_plan_id(payload.plan_id),
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
        print(raw_body.decode("utf-8", errors="replace"))
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event, tx_ref, flw_id, payload_status = _extract_webhook_fields(payload)
    logger.info(f"[Flutterwave] Webhook event={event} tx_ref={tx_ref} flw_id={flw_id} status={payload_status}")

    if not tx_ref:
        return Response(status_code=200)

    txn = await db.payment_transactions.find_one({"tx_ref": tx_ref})
    if not txn:
        logger.warning(f"[Flutterwave] Unknown tx_ref in webhook: {tx_ref}")
        return Response(status_code=200)

    verify = await _verify_payment_for_txn(txn, flw_id)
    vdata = _verified_data(verify)
    vstatus = vdata.get("status")
    vamount = vdata.get("amount")
    vcurrency = vdata.get("currency")
    vtx_ref = _verified_tx_ref(vdata)

    if _verification_matches_txn(verify, txn):
        await _mark_successful_and_activate(txn, verify, "webhook")
        return Response(status_code=200)

    if _failure_status(vstatus) and vtx_ref == tx_ref:
        logger.warning(
            f"[Flutterwave] Verified failed payment tx_ref={tx_ref} status={vstatus} "
            f"amount={vamount}/{txn['amount']} currency={vcurrency}/{txn['currency']}"
        )
        failed_filter = {"tx_ref": tx_ref, "user_id": txn["user_id"], "status": {"$ne": "successful"}}
        if txn.get("email"):
            failed_filter["email"] = txn["email"]
        logger.info("[Flutterwave] Before failed Mongo update tx_ref=%s filter=%s", tx_ref, failed_filter)
        await db.payment_transactions.update_one(
            failed_filter,
            {"$set": {
                "status": "failed",
                "failure_reason": f"verify_mismatch:{vstatus}",
                "flutterwave_transaction_id": _verified_flw_id(vdata) or flw_id,
                "flutterwave_status": vstatus,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return Response(status_code=200)

    logger.warning(
        f"[Flutterwave] Verification mismatch tx_ref={tx_ref} status={vstatus} "
        f"amount={vamount}/{txn['amount']} currency={vcurrency}/{txn['currency']} verified_ref={vtx_ref}"
    )
    return Response(status_code=200)


@router.get("/status", response_model=StatusResponse)
async def get_status(tx_ref: str, current_user: User = Depends(require_auth)):
    txn = await db.payment_transactions.find_one(
        {"tx_ref": tx_ref, "user_id": current_user.user_id},
        {"_id": 0},
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    logger.info(
        "[Flutterwave] Status poll tx_ref=%s user_id=%s email=%s plan_id=%s billing_cycle=%s "
        "txn_status=%s subscription_expiry=%s activated_at=%s",
        tx_ref,
        current_user.user_id,
        txn.get("email") or txn.get("customer_email") or current_user.email,
        txn.get("plan_id"),
        txn.get("billing_cycle") or _billing_cycle_from_plan_id(txn.get("plan_id")),
        txn.get("status"),
        txn.get("subscription_expiry"),
        txn.get("activated_at"),
    )

    if txn.get("status") == "pending":
        logger.info("[Flutterwave] Status fallback before verify_by_reference tx_ref=%s", tx_ref)
        verify = await _verify_flutterwave_transaction_by_reference(tx_ref)
        logger.info("[Flutterwave] Status fallback after verify_by_reference tx_ref=%s response=%s", tx_ref, verify)
        vdata = _verified_data(verify)
        vstatus = vdata.get("status")
        vtx_ref = _verified_tx_ref(vdata)

        if _verification_matches_txn(verify, txn):
            logger.info("[Flutterwave] Status fallback matched successful verify tx_ref=%s", tx_ref)
            txn = await _mark_successful_and_activate(txn, verify, "status_poll")
        elif _failure_status(vstatus) and vtx_ref == tx_ref:
            failed_filter = {"tx_ref": tx_ref, "user_id": current_user.user_id, "status": {"$ne": "successful"}}
            if txn.get("email"):
                failed_filter["email"] = txn["email"]
            logger.info("[Flutterwave] Status fallback before failed Mongo update tx_ref=%s status=%s filter=%s", tx_ref, vstatus, failed_filter)
            await db.payment_transactions.update_one(
                failed_filter,
                {"$set": {
                    "status": "failed",
                    "failure_reason": f"verify_by_reference:{vstatus}",
                    "flutterwave_transaction_id": _verified_flw_id(vdata),
                    "flutterwave_status": vstatus,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            txn = await db.payment_transactions.find_one(
                {"tx_ref": tx_ref, "user_id": current_user.user_id},
                {"_id": 0},
            ) or txn
            logger.info("[Flutterwave] Status fallback after failed Mongo update tx_ref=%s txn=%s", tx_ref, txn)

    if txn.get("status") == "successful" and (not txn.get("subscription_expiry") or not txn.get("activated_at")):
        logger.warning("[Flutterwave] Successful tx missing activation fields; attempting repair tx_ref=%s txn=%s", tx_ref, txn)
        verify = await _verify_flutterwave_transaction_by_reference(tx_ref)
        logger.info("[Flutterwave] Repair verify response tx_ref=%s response=%s", tx_ref, verify)
        if _verification_matches_txn(verify, txn):
            expiry_iso = await _activate_subscription_from_txn(txn, verify)
            if not expiry_iso:
                raise RuntimeError("Repair activation did not return a subscription expiry.")
            activated_at = datetime.now(timezone.utc).isoformat()
            repair_filter = {"tx_ref": tx_ref, "user_id": current_user.user_id, "status": "successful"}
            if txn.get("email"):
                repair_filter["email"] = txn["email"]
            logger.info("[Flutterwave] Repair before subscription_expiry/activated_at write tx_ref=%s filter=%s", tx_ref, repair_filter)
            repair_result = await db.payment_transactions.update_one(
                repair_filter,
                {"$set": {
                    "subscription_expiry": expiry_iso,
                    "activated_at": activated_at,
                    "updated_at": activated_at,
                }},
            )
            logger.info(
                "[Flutterwave] Repair activation write result tx_ref=%s matched=%s modified=%s expiry=%s activated_at=%s",
                tx_ref,
                repair_result.matched_count,
                repair_result.modified_count,
                expiry_iso,
                activated_at,
            )
            txn = await db.payment_transactions.find_one(
                {"tx_ref": tx_ref, "user_id": current_user.user_id},
                {"_id": 0},
            ) or txn

    response_status = txn["status"]
    if response_status == "successful" and (not txn.get("subscription_expiry") or not txn.get("activated_at")):
        logger.warning("[Flutterwave] Holding success response until activation completes tx_ref=%s txn=%s", tx_ref, txn)
        response_status = "pending"

    return StatusResponse(
        tx_ref=txn["tx_ref"],
        status=response_status,
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

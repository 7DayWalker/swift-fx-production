"""
api/routes/subscriptions.py — Subscription plans, status, IAP verification, webhooks.
"""
import os
import json
import time
import base64
import logging
import uuid
import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any, Dict

import httpx
import jwt
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature as CryptoInvalidSignature

from core.database import db
from core.dependencies import get_current_user, require_auth, require_admin, require_super_admin
from core.config import (
    APPLE_SHARED_SECRET, APPLE_BUNDLE_ID, APPLE_ENVIRONMENT,
    APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY, APPLE_WEBHOOK_SECRET,
    GOOGLE_PACKAGE_NAME, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_WEBHOOK_TOKEN,
    get_plan_from_product_id, IAP_PRODUCT_IDS, IAP_PRODUCTS_BY_TIER,
)
from services.subscription import (
    get_effective_subscription,
    get_active_override,
    get_ai_weekly_limit,
    parse_utc_datetime,
    resolve_subscription_details,
    sync_profile_subscription,
)
from supabase_auth import fetch_profile, update_profile, count_profiles
from models.schemas import User, DeviceTokenRegister
from api.routes.referral import on_user_subscription_change

logger = logging.getLogger(__name__)

# Official Apple Root CA SHA-256 DER fingerprints (https://www.apple.com/certificateauthority/)
TRUSTED_APPLE_ROOT_CA_SHA256 = {
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",  # Apple Root CA - G3
    "c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050",  # Apple Root CA - G2
    "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",  # Apple Inc. Root Certificate
    "0d83b611b648a1a75eb8558400795375cad92e264ed8e9d7a757c1f5ee2bb22d",  # Apple Computer Root Certificate
}
APPLE_LEAF_CERT_OID = "1.2.840.113635.100.6.11.1"
APPLE_WWDR_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1"

# ── Tier priority for downgrade protection ────────────────────────────────────
TIER_PRIORITY = {"free": 0, "premium": 1, "vip": 2}

async def should_update_subscription(user_id: str, new_plan: str, new_expiry: datetime) -> bool:
    """
    Determine whether a verified purchase should update the user's profile.
    Prevents a lower-tier subscription from overwriting an active higher-tier one.

    Returns True if the update should proceed:
      - Upgrade (premium → vip): always
      - Same tier (renewal): always
      - Downgrade (vip → premium): only if the higher-tier subscription is expired
    """
    profile = await fetch_profile(user_id)
    if not profile:
        return True  # No profile yet — first subscription

    current_plan = (profile.get("subscription") or "free").lower()
    current_priority = TIER_PRIORITY.get(current_plan, 0)
    new_priority = TIER_PRIORITY.get(new_plan.lower(), 0)

    # Upgrade or same tier — always allow
    if new_priority >= current_priority:
        return True

    # Downgrade — only allow if existing subscription is confirmed expired
    current_expiry_str = profile.get("subscription_expiry")
    if not current_expiry_str:
        # No expiry recorded — treat as active (do not allow downgrade)
        logger.info(
            f"[IAP] Downgrade blocked for user {user_id}: "
            f"current={current_plan} (no expiry — treated as active), attempted={new_plan}"
        )
        return False

    try:
        current_expiry = datetime.fromisoformat(str(current_expiry_str).replace("Z", "+00:00"))
        if current_expiry <= datetime.now(timezone.utc):
            return True  # Higher tier expired — allow downgrade
    except (ValueError, TypeError):
        # Unparseable expiry — treat as active (do not allow downgrade)
        logger.info(
            f"[IAP] Downgrade blocked for user {user_id}: "
            f"current={current_plan} (unparseable expiry: {current_expiry_str}), attempted={new_plan}"
        )
        return False

    logger.info(
        f"[IAP] Downgrade blocked for user {user_id}: "
        f"current={current_plan} (expires {current_expiry_str}), attempted={new_plan}"
    )
    return False


router = APIRouter(prefix="/api")

@router.get("/subscription/plans")
async def get_plans():
    """
    Returns plan metadata (features, descriptions) only.
    Pricing is NOT served by backend — the store (Apple/Google) is the pricing authority.
    Client must fetch pricing via react-native-iap getSubscriptions().
    """
    return {
        "plans": [
            {
                "id": "premium",
                "name": "Premium",
                "description": "Best for active traders",
                "features": [
                    "Everything in Free",
                    "Full access to Premium signals",
                    "Personal Trading Journal",
                    "10 AI Chart Analyses per week",
                    "Ads removed"
                ],
                "ai_limit_note": "Includes 10 AI chart analyses per week."
            },
            {
                "id": "vip",
                "name": "VIP",
                "description": "For professional traders",
                "features": [
                    "Everything in Premium",
                    "Personal Trading Journal",
                    "Unlimited AI chart analyses",
                    "Academy access",
                    "Fund Management access",
                    "Priority support"
                ]
            }
        ]
    }


# ===================== WEB PAYMENTS DISABLED =====================
# Stripe/web payments removed in v1.
# Only Apple IAP and Google IAP are active for subscription upgrades.
# See /api/iap/apple/verify and /api/iap/google/verify for active payment flows.
# ================================================================


# ===================== NOTIFICATIONS ENDPOINTS =====================

@router.post("/notifications/register-token")
async def register_device_token(token_data: DeviceTokenRegister, current_user: User = Depends(require_auth)):
    # Check if this exact token+user already exists
    existing = await db.device_tokens.find_one({
        "token": token_data.token,
        "user_id": current_user.user_id
    })

    if existing:
        # Update last_seen timestamp only
        await db.device_tokens.update_one(
            {"token": token_data.token, "user_id": current_user.user_id},
            {"$set": {"is_active": True, "last_seen": datetime.now(timezone.utc)}}
        )
        # CRITICAL: Deactivate this token under ALL OTHER user accounts.
        # A physical device token can only belong to one user at a time.
        await db.device_tokens.update_many(
            {"token": token_data.token, "user_id": {"$ne": current_user.user_id}},
            {"$set": {"is_active": False}}
        )
        return {"status": "already_registered"}

    # CRITICAL: Deactivate this token under ALL other users first.
    # When a user logs into a new account on the same device, the device token
    # must be claimed exclusively by the new user. Otherwise, push notifications
    # for the same signal are sent N times (once per user_id sharing the token).
    deactivated = await db.device_tokens.update_many(
        {"token": token_data.token, "user_id": {"$ne": current_user.user_id}},
        {"$set": {"is_active": False}}
    )
    if deactivated.modified_count > 0:
        logger.warning(
            f"[Notifications] Deactivated {deactivated.modified_count} stale registrations "
            f"for token={token_data.token[:30]}... (now belongs to user={current_user.user_id[:12]}...)"
        )

    # Deactivate any OLD tokens for this user+platform (replace, don't duplicate)
    await db.device_tokens.update_many(
        {"user_id": current_user.user_id, "platform": token_data.platform},
        {"$set": {"is_active": False}}
    )

    # Insert the new token
    await db.device_tokens.insert_one({
        "user_id": current_user.user_id,
        "token": token_data.token,
        "platform": token_data.platform,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_seen": datetime.now(timezone.utc),
    })

    logger.info(f"[Notifications] Token registered: user={current_user.user_id[:12]}... platform={token_data.platform} token={token_data.token[:30]}...")
    return {"message": "Token registered successfully"}


@router.post("/debug/cleanup-device-tokens")
async def cleanup_device_tokens(super_admin: User = Depends(require_super_admin)):
    """One-time cleanup: remove duplicate device tokens and ensure unique index.
    Restricted to Super Admins only.
    Safe to run multiple times — idempotent.
    
    Phase 1: Remove same-token+same-user duplicates (keep newest).
    Phase 2: Deactivate same-token cross-user duplicates (keep newest active registration).
    """
    logger.info("[Cleanup] Starting device_tokens duplicate cleanup on PRODUCTION DB...")

    # Fetch all documents
    all_tokens = await db.device_tokens.find({}).to_list(100000)
    total = len(all_tokens)
    logger.info(f"[Cleanup] Scanned {total} documents")

    # ── Phase 1: Remove exact (token, user_id) duplicates ──
    seen = set()
    duplicate_ids = []
    for doc in all_tokens:
        key = f"{doc.get('token', '')}::{doc.get('user_id', '')}"
        if key in seen:
            duplicate_ids.append(doc["_id"])
        else:
            seen.add(key)

    duplicates_found = len(duplicate_ids)
    logger.info(f"[Cleanup] Phase 1: Found {duplicates_found} exact duplicates out of {total} total")

    deleted = 0
    if duplicate_ids:
        result = await db.device_tokens.delete_many({"_id": {"$in": duplicate_ids}})
        deleted = result.deleted_count
        logger.info(f"[Cleanup] Phase 1: Deleted {deleted} duplicate documents")

    # ── Phase 2: Deactivate cross-user token sharing ──
    # A physical device token should only be active for ONE user at a time.
    # For each token that appears under multiple user_ids, keep only the
    # most recently registered one active and deactivate the rest.
    from collections import defaultdict
    remaining_docs = await db.device_tokens.find({"is_active": True}).to_list(100000)
    
    token_groups = defaultdict(list)
    for doc in remaining_docs:
        token = doc.get("token", "")
        if token:
            token_groups[token].append(doc)
    
    cross_user_deactivated = 0
    for token, docs in token_groups.items():
        if len(docs) <= 1:
            continue
        # Sort by registration date, newest first
        docs.sort(key=lambda d: d.get("last_seen") or d.get("created_at") or d.get("registered_at") or datetime.min, reverse=True)
        # Keep the first (newest), deactivate the rest
        stale_ids = [d["_id"] for d in docs[1:]]
        if stale_ids:
            result = await db.device_tokens.update_many(
                {"_id": {"$in": stale_ids}},
                {"$set": {"is_active": False}}
            )
            cross_user_deactivated += result.modified_count
            owner = docs[0].get("user_id", "?")[:12]
            logger.warning(
                f"[Cleanup] Phase 2: Token {token[:35]}... → kept active for user={owner}..., "
                f"deactivated {len(stale_ids)} stale cross-user registrations"
            )
    
    logger.info(f"[Cleanup] Phase 2: Deactivated {cross_user_deactivated} cross-user duplicate tokens")

    # Ensure unique index exists
    try:
        await db.device_tokens.create_index(
            [("token", 1), ("user_id", 1)],
            unique=True,
            name="token_user_unique"
        )
        index_status = "created"
        logger.info("[Cleanup] Unique index (token, user_id) ensured")
    except Exception as e:
        index_status = f"already_exists_or_error: {str(e)[:100]}"
        logger.info(f"[Cleanup] Index status: {index_status}")

    remaining = await db.device_tokens.count_documents({})
    remaining_active = await db.device_tokens.count_documents({"is_active": True})
    logger.info(f"[Cleanup] Complete. Remaining: {remaining} total, {remaining_active} active")

    return {
        "database": "PRODUCTION (from MONGO_URL)",
        "scanned": total,
        "phase1_exact_duplicates_deleted": deleted,
        "phase2_cross_user_deactivated": cross_user_deactivated,
        "remaining_total": remaining,
        "remaining_active": remaining_active,
        "unique_index": index_status,
    }


@router.post("/notifications/test")
async def send_test_notification(current_user: User = Depends(require_auth)):
    """Send a test notification to the current user's registered device(s).
    Returns diagnostic info about tokens and delivery status."""
    import httpx as httpx_lib
    
    # Find this user's active tokens
    user_tokens = await db.device_tokens.find(
        {"user_id": current_user.user_id, "is_active": True},
        {"_id": 0}
    ).to_list(10)
    
    if not user_tokens:
        return {"status": "no_tokens", "message": "No active push tokens found for your account. Open the app and allow notifications."}
    
    results = []
    for token_doc in user_tokens:
        token = token_doc.get("token", "")
        platform = token_doc.get("platform", "unknown")
        
        if not token.startswith("ExponentPushToken"):
            results.append({"platform": platform, "status": "invalid_token", "token_prefix": token[:20]})
            continue
        
        message = {
            "to": token,
            "title": "Test Notification",
            "body": f"This is a test from Swift FX ({platform})",
            "data": {"type": "test", "title": "Test Notification", "body": f"This is a test from Swift FX ({platform})"},
            "sound": "default",
            "priority": "high",
            "channelId": "default",
        }
        if platform == "ios":
            message["_contentAvailable"] = True
        
        try:
            async with httpx_lib.AsyncClient() as client:
                response = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=[message],
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                    timeout=10.0,
                )
                resp_data = response.json()
                ticket = resp_data.get("data", [{}])[0] if resp_data.get("data") else {}
                results.append({
                    "platform": platform,
                    "token_prefix": token[:35],
                    "expo_status": ticket.get("status", "unknown"),
                    "expo_id": ticket.get("id", ""),
                    "error": ticket.get("message", "") or ticket.get("details", {}).get("error", ""),
                    "http_status": response.status_code,
                })
        except Exception as e:
            results.append({"platform": platform, "status": "send_error", "error": str(e)})
    
    logger.info(f"[Test Notification] user={current_user.user_id[:12]}... results={results}")
    return {
        "status": "sent",
        "tokens_found": len(user_tokens),
        "results": results,
        "message": "Check your device. If no notification arrives within 10 seconds, check the 'error' field in results."
    }



@router.post("/debug/android-push-trace")
async def android_push_trace(super_admin: User = Depends(require_super_admin)):
    """
    SUPER_ADMIN DIAGNOSTIC: Send to one active Android token and return Expo receipt trace.
    """
    import httpx as httpx_lib

    # PHASE 1: Pick the freshest Android token (most recent last_seen)
    android_tokens = await db.device_tokens.find(
        {"is_active": True, "platform": "android"},
        {"_id": 0}
    ).sort("last_seen", -1).to_list(50)

    if not android_tokens:
        return {"error": "No active Android tokens found"}

    # Use the first (freshest) token
    target = android_tokens[0]
    token = target.get("token", "")

    # PHASE 2: Log full token context
    token_context = {
        "user_id": target.get("user_id"),
        "platform": target.get("platform"),
        "token": token,
        "created_at": str(target.get("created_at", "MISSING")),
        "last_seen": str(target.get("last_seen", "MISSING")),
        "is_active": target.get("is_active"),
        "registered_at": str(target.get("registered_at", "MISSING")),
    }
    logger.warning(f"ANDROID_TRACE_TOKEN_CONTEXT → {token_context}")

    # PHASE 1: Build message — identical structure to signal path
    message = {
        "to": token,
        "title": "Android Trace Test",
        "body": "Single device trace — if you see this, push works",
        "data": {"type": "android_trace", "title": "Android Trace Test", "body": "Single device trace"},
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    }
    logger.warning(f"ANDROID_TRACE_PAYLOAD → {message}")

    # Send to Expo — log FULL response
    try:
        async with httpx_lib.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=[message],
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
            resp_json = response.json()
            logger.warning(f"ANDROID_TRACE_EXPO_RESPONSE → status={response.status_code} body={resp_json}")

            ticket = resp_json.get("data", [{}])[0] if resp_json.get("data") else {}
            ticket_id = ticket.get("id", "")

            # If we got a ticket, check receipt immediately after short delay
            receipt_result = None
            if ticket_id:
                import asyncio
                await asyncio.sleep(3)
                try:
                    receipt_resp = await client.post(
                        "https://exp.host/--/api/v2/push/getReceipts",
                        json={"ids": [ticket_id]},
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                        },
                    )
                    receipt_result = receipt_resp.json()
                    logger.warning(f"ANDROID_TRACE_RECEIPT → {receipt_result}")
                except Exception as e:
                    receipt_result = {"error": str(e)}

            return {
                "phase": "ANDROID_PUSH_TRACE",
                "token_context": token_context,
                "payload_sent": message,
                "expo_http_status": response.status_code,
                "expo_ticket": ticket,
                "expo_receipt": receipt_result,
                "total_android_tokens": len(android_tokens),
                "sent_to": "1 device only (first active Android, sorted by last_seen desc)",
            }
    except Exception as e:
        logger.error(f"ANDROID_TRACE_ERROR → {e}")
        return {"error": str(e)}

@router.put("/notifications/preferences")
async def update_notification_preferences(preferences: Dict[str, bool], current_user: User = Depends(require_auth)):
    await update_profile(current_user.user_id, {"notification_preferences": preferences})
    return {"message": "Preferences updated"}

# ===================== USER PROFILE ENDPOINTS =====================
@router.put("/profile")
async def update_user_profile(name: Optional[str] = None, current_user: User = Depends(require_auth)):
    update_doc = {}
    if name:
        update_doc["name"] = name
    
    if update_doc:
        await update_profile(current_user.user_id, update_doc)
    
    return {"message": "Profile updated"}

@router.put("/profile/password")
async def change_user_password(current_password: str, new_password: str, current_user: User = Depends(require_auth)):
    """Password changes are handled via Supabase Auth. This endpoint is deprecated."""
    # Supabase manages passwords - use supabase.auth.updateUser() on frontend
    raise HTTPException(status_code=400, detail="Password changes should be done via the app settings using Supabase Auth")

# ===================== DASHBOARD ENDPOINTS =====================

@router.get("/subscription/status")
async def get_subscription_status(current_user: User = Depends(require_auth)):
    """
    Backend-authoritative subscription status using unified resolve_subscription_details().
    Supports Apple IAP, Google Play, Flutterwave, Referral Rewards, Overrides, and Admin elevation.
    """
    user_id = current_user.user_id
    now = datetime.now(timezone.utc)

    profile = await fetch_profile(user_id)
    profile_role = str((profile or {}).get("role") or "free").lower()
    is_admin = profile_role in ("admin", "super_admin") or bool(
        (profile or {}).get("admin_role") and (profile or {}).get("admin_enabled", True)
    )

    override = await get_active_override(user_id)
    override_info = None
    if override:
        override_info = {
            "tier": override.get("tier"),
            "expires_at": override.get("expires_at"),
            "is_active": True,
        }

    # Resolve pure non-admin entitlement (includes override if active)
    non_admin_profile = dict(profile or {"id": user_id})
    non_admin_profile["role"] = "free"
    non_admin_profile["admin_role"] = None
    non_admin_details = await resolve_subscription_details(
        non_admin_profile,
        user_role="free",
        is_admin=False,
    )

    # Resolve pure store/payment tier (excluding temporary admin override)
    if override:
        # Compute underlying billing tier from verified transactions / profile without override
        best_billing_tier = "free"
        candidate_txns = await db.iap_transactions.find(
            {"user_id": user_id, "status": {"$in": ["active", "billing_issue"]}}
        ).sort("expiry_date", -1).to_list(20)
        for txn in candidate_txns:
            exp_dt = parse_utc_datetime(txn.get("expiry_date"))
            if exp_dt is not None and exp_dt <= now:
                continue
            raw_plan = str(txn.get("plan") or txn.get("tier") or get_plan_from_product_id(str(txn.get("product_id") or "")) or "free").lower()
            if TIER_PRIORITY.get(raw_plan, 0) > TIER_PRIORITY.get(best_billing_tier, 0):
                best_billing_tier = raw_plan
        billing_tier = best_billing_tier
    else:
        billing_tier = non_admin_details["tier"]

    effective = non_admin_details["tier"]
    if is_admin:
        capability_tier = "vip"
        capability_source = "admin_privilege"
    else:
        capability_tier = effective
        capability_source = "subscription"

    # Compute AI weekly usage (accounting for expired reset timestamp)
    ai_weekly_used = int((profile or {}).get("ai_weekly_used") or 0)
    reset_dt = parse_utc_datetime((profile or {}).get("ai_weekly_reset"))
    if reset_dt is not None and reset_dt < now:
        ai_weekly_used = 0
    ai_limit = get_ai_weekly_limit(capability_tier)

    return {
        "user_id": user_id,
        "subscription": capability_tier,
        "entitlement": effective,
        "billing_tier": billing_tier,
        "capability_tier": capability_tier,
        "capability_source": capability_source,
        "subscription_active": bool(non_admin_details["is_active"] or override is not None or is_admin),
        "subscription_expiry": non_admin_details["expiry_date"],
        "subscription_platform": non_admin_details["platform"],
        "subscription_product_id": non_admin_details["product_id"],
        "auto_renew": bool(non_admin_details["auto_renew"]),
        "renewal_provider": non_admin_details.get("renewal_provider"),
        "next_billing_date": non_admin_details.get("next_billing_date"),
        "is_admin": is_admin,
        "override": override_info,
        "features": {
            "signals_access": capability_tier,
            "ai_analyzer": True,
            "ai_limit": ai_limit if ai_limit < 100000 else "unlimited",
            "ai_used": ai_weekly_used,
            "ai_remaining": max(0, ai_limit - ai_weekly_used) if ai_limit < 100000 else "unlimited",
            "ai_limit_reached": ai_weekly_used >= ai_limit if ai_limit < 100000 else False,
            "fund_management": capability_tier == "vip",
            "academy": capability_tier == "vip",
            "image_uploads": capability_tier != "free",
        },
    }

# ===================== SETUP ADMIN =====================

class AppleReceiptValidationRequest(BaseModel):
    receipt_data: str = Field(..., description="Base64 encoded receipt data from iOS")
    exclude_old_transactions: bool = Field(default=True)

class GooglePurchaseValidationRequest(BaseModel):
    purchase_token: str = Field(..., description="Purchase token from Google Play")
    product_id: str = Field(..., description="Product ID of the subscription")
    package_name: Optional[str] = Field(default=None, description="Package name (optional, uses default)")

class IAPValidationResponse(BaseModel):
    success: bool
    plan: Optional[str] = None
    expiry_date: Optional[str] = None
    is_trial: bool = False
    auto_renew: bool = False
    message: str = ""

class AppleNotificationPayload(BaseModel):
    signedPayload: str

class GoogleNotificationPayload(BaseModel):
    message: dict
    subscription: Optional[str] = None

# IAP Transaction record
class IAPTransaction(BaseModel):
    transaction_id: str
    user_id: str
    platform: str  # 'ios' or 'android'
    product_id: str
    plan: str
    original_transaction_id: Optional[str] = None
    purchase_date: str
    expiry_date: Optional[str] = None
    is_trial: bool = False
    auto_renew: bool = True
    status: str = "active"  # active, expired, cancelled, refunded
    raw_receipt: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== APPLE IAP VALIDATION ====================

async def validate_apple_receipt(receipt_data: str, exclude_old: bool = True) -> dict:
    """
    Validate Apple App Store receipt
    
    Endpoints:
    - Sandbox: https://sandbox.itunes.apple.com/verifyReceipt
    - Production: https://buy.itunes.apple.com/verifyReceipt
    
    Returns validation result with subscription info
    """
    if not APPLE_ENVIRONMENT:
        raise HTTPException(status_code=503, detail="Apple IAP not configured: APPLE_ENVIRONMENT not set")
    if not APPLE_SHARED_SECRET:
        raise HTTPException(status_code=503, detail="Apple IAP not configured: APPLE_SHARED_SECRET not set")
    
    # Determine endpoint based on environment
    if APPLE_ENVIRONMENT == 'production':
        url = "https://buy.itunes.apple.com/verifyReceipt"
    else:
        url = "https://sandbox.itunes.apple.com/verifyReceipt"
    
    payload = {
        "receipt-data": receipt_data,
        "password": APPLE_SHARED_SECRET,
        "exclude-old-transactions": exclude_old
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, timeout=30.0)
            result = response.json()
            
            # Status 21007 means sandbox receipt sent to production
            # Retry with sandbox endpoint
            if result.get('status') == 21007:
                logger.info("[Apple IAP] Sandbox receipt, retrying with sandbox endpoint")
                url = "https://sandbox.itunes.apple.com/verifyReceipt"
                response = await client.post(url, json=payload, timeout=30.0)
                result = response.json()
            
            return result
        except Exception as e:
            logger.error(f"[Apple IAP] Validation error: {e}")
            return {"status": -1, "error": str(e)}


def parse_apple_receipt(validation_result: dict) -> dict:
    """Parse Apple receipt validation result to extract subscription info"""
    if validation_result.get('status') != 0:
        status_codes = {
            21000: "App Store could not read JSON",
            21002: "Receipt data malformed",
            21003: "Receipt not authenticated",
            21004: "Shared secret mismatch",
            21005: "Receipt server unavailable",
            21006: "Receipt valid but subscription expired",
            21007: "Sandbox receipt sent to production",
            21008: "Production receipt sent to sandbox",
            21010: "Account not found",
        }
        error_msg = status_codes.get(validation_result.get('status'), "Unknown error")
        return {"valid": False, "error": error_msg, "status": validation_result.get('status')}
    
    receipt = validation_result.get('receipt', {})
    latest_receipt_info = validation_result.get('latest_receipt_info', [])
    pending_renewal_info = validation_result.get('pending_renewal_info', [])
    
    # Get the most recent active subscription
    active_subscription = None
    latest_expiry = None
    
    for txn in latest_receipt_info:
        expires_date_ms = txn.get('expires_date_ms')
        if expires_date_ms:
            expires_date = datetime.fromtimestamp(int(expires_date_ms) / 1000, tz=timezone.utc)
            if expires_date > datetime.now(timezone.utc):
                if latest_expiry is None or expires_date > latest_expiry:
                    latest_expiry = expires_date
                    active_subscription = txn
    
    if not active_subscription:
        # Check if expired
        if latest_receipt_info:
            latest = sorted(latest_receipt_info, key=lambda x: int(x.get('expires_date_ms', 0)), reverse=True)[0]
            return {
                "valid": True,
                "active": False,
                "product_id": latest.get('product_id'),
                "expired": True,
                "expiry_date": datetime.fromtimestamp(int(latest.get('expires_date_ms', 0)) / 1000, tz=timezone.utc).isoformat()
            }
        return {"valid": True, "active": False, "error": "No active subscription found"}
    
    # Check auto-renewal status
    auto_renew = True
    is_trial = active_subscription.get('is_trial_period', 'false') == 'true'
    
    for renewal in pending_renewal_info:
        if renewal.get('product_id') == active_subscription.get('product_id'):
            auto_renew = renewal.get('auto_renew_status') == '1'
            break
    
    return {
        "valid": True,
        "active": True,
        "product_id": active_subscription.get('product_id'),
        "original_transaction_id": active_subscription.get('original_transaction_id'),
        "transaction_id": active_subscription.get('transaction_id'),
        "purchase_date": datetime.fromtimestamp(int(active_subscription.get('purchase_date_ms', 0)) / 1000, tz=timezone.utc).isoformat(),
        "expiry_date": latest_expiry.isoformat() if latest_expiry else None,
        "is_trial": is_trial,
        "auto_renew": auto_renew,
        "bundle_id": receipt.get('bundle_id'),
    }


@router.post("/iap/apple/verify", response_model=IAPValidationResponse)
async def verify_apple_purchase(
    request: AppleReceiptValidationRequest,
    current_user: User = Depends(require_auth)
):
    """
    Verify Apple App Store purchase receipt and update user subscription.
    Enforces bundle ID validation, cross-account hijacking protection, and unified entitlement storage.
    """
    user_id = current_user.user_id

    try:
        validation_result = await validate_apple_receipt(
            request.receipt_data,
            request.exclude_old_transactions
        )
        parsed = parse_apple_receipt(validation_result)

        if not parsed.get('valid'):
            logger.warning(f"[Apple IAP] Invalid receipt for user {user_id}: {parsed.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid receipt: {parsed.get('error')}"
            )

        receipt_bundle_id = parsed.get('bundle_id')
        if receipt_bundle_id and APPLE_BUNDLE_ID and receipt_bundle_id != APPLE_BUNDLE_ID:
            logger.error(f"[Apple IAP] Bundle ID mismatch for user {user_id}: got {receipt_bundle_id}, expected {APPLE_BUNDLE_ID}")
            return IAPValidationResponse(
                success=False,
                message="Invalid receipt bundle identifier"
            )

        if not parsed.get('active'):
            logger.info(f"[Apple IAP] No active subscription for user {user_id}")
            return IAPValidationResponse(
                success=False,
                message="No active subscription found"
            )

        product_id = parsed.get('product_id')
        plan = get_plan_from_product_id(product_id or '')
        if not plan:
            logger.error(f"[Apple IAP] Unknown product ID: {product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {product_id}"
            )

        orig_txn_id = parsed.get('original_transaction_id') or parsed.get('transaction_id')
        txn_id = parsed.get('transaction_id') or orig_txn_id

        # Cross-user receipt hijacking check
        if orig_txn_id:
            existing_owner = await db.iap_transactions.find_one({
                "$or": [
                    {"original_transaction_id": orig_txn_id},
                    {"transaction_id": txn_id},
                ],
                "platform": {"$in": ["apple", "ios"]},
            })
            if existing_owner and existing_owner.get("user_id") and existing_owner["user_id"] != user_id:
                logger.warning(
                    "[Apple IAP] Cross-account receipt hijack blocked: orig_txn=%s owner=%s attacker=%s",
                    orig_txn_id,
                    existing_owner["user_id"],
                    user_id,
                )
                raise HTTPException(
                    status_code=409,
                    detail="This Apple subscription is already linked to another Swift FX account."
                )

        now = datetime.now(timezone.utc)
        expiry_date_str = parsed.get('expiry_date')
        expiry_dt = parse_utc_datetime(expiry_date_str) or now
        purchase_dt = parse_utc_datetime(parsed.get('purchase_date')) or now

        # Always store verified transaction in MongoDB first (unified 'apple' platform + datetime expiry)
        transaction = {
            "transaction_id": txn_id,
            "original_transaction_id": orig_txn_id,
            "user_id": user_id,
            "platform": "apple",
            "product_id": product_id,
            "plan": plan,
            "purchase_date": purchase_dt,
            "expiry_date": expiry_dt,
            "is_trial": bool(parsed.get('is_trial', False)),
            "auto_renew": bool(parsed.get('auto_renew', True)),
            "status": "active",
            "raw_receipt": request.receipt_data[:500],
            "updated_at": now,
        }

        await db.iap_transactions.update_one(
            {
                "original_transaction_id": orig_txn_id,
                "platform": {"$in": ["apple", "ios"]},
            },
            {
                "$set": transaction,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

        if await should_update_subscription(user_id, plan, expiry_dt):
            await sync_profile_subscription(
                user_id,
                tier=plan,
                status="active",
                expiry=expiry_dt,
                platform="apple",
                product_id=product_id,
                auto_renew=bool(parsed.get('auto_renew', True)),
                is_trial=bool(parsed.get('is_trial', False)),
                activated_at=now,
            )
            await on_user_subscription_change(user_id, plan)
        else:
            logger.info(f"[Apple IAP] Skipping profile update — user {user_id} has active higher-tier subscription")

        logger.info(f"[Apple IAP] Successfully validated and updated subscription for user {user_id}: {plan}")

        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_dt.isoformat(),
            is_trial=bool(parsed.get('is_trial', False)),
            auto_renew=bool(parsed.get('auto_renew', True)),
            message=f"Successfully subscribed to {plan.upper()}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Apple IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process Apple purchase")


@router.post("/iap/apple/restore")
async def restore_apple_purchases(
    request: AppleReceiptValidationRequest,
    current_user: User = Depends(require_auth)
):
    """Restore Apple purchases - used when user reinstalls app or changes device."""
    return await verify_apple_purchase(request, current_user)


# ==================== GOOGLE PLAY IAP VALIDATION ====================

async def validate_google_purchase(purchase_token: str, product_id: str, package_name: str = None) -> dict:
    """
    Validate Google Play purchase token using Google Play Developer API
    
    Note: Requires service account JSON credentials
    Returns validation result with subscription info
    """
    package = package_name or GOOGLE_PACKAGE_NAME
    
    # SECURITY: Credentials MUST be configured in production
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        logger.error("[Google IAP] SECURITY: Service account not configured - rejecting validation")
        return {"valid": False, "error": "Google IAP not configured. Contact support."}
    
    try:
        # Import Google API client
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        import json
        
        # Load credentials
        if GOOGLE_SERVICE_ACCOUNT_JSON.startswith('{'):
            creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        else:
            # Assume it's base64 encoded
            creds_dict = json.loads(base64.b64decode(GOOGLE_SERVICE_ACCOUNT_JSON))
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=['https://www.googleapis.com/auth/androidpublisher']
        )
        
        # Build the service
        service = build('androidpublisher', 'v3', credentials=credentials)
        
        # Get subscription purchase details
        result = service.purchases().subscriptions().get(
            packageName=package,
            subscriptionId=product_id,
            token=purchase_token
        ).execute()
        
        return {
            "valid": True,
            **result
        }
        
    except ImportError:
        logger.error("[Google IAP] SECURITY: Google API client not installed - rejecting validation")
        return {"valid": False, "error": "Google IAP not configured. Contact support."}
    except Exception as e:
        logger.error(f"[Google IAP] Validation error: {e}")
        return {"valid": False, "error": str(e)}


async def acknowledge_google_purchase(purchase_token: str, product_id: str, package_name: str = None):
    """Acknowledge Google Play purchase (required within 3 days)"""
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        logger.warning("[Google IAP] Service account not configured, skipping acknowledgement")
        return True
    
    package = package_name or GOOGLE_PACKAGE_NAME
    
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        import json
        
        if GOOGLE_SERVICE_ACCOUNT_JSON.startswith('{'):
            creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        else:
            creds_dict = json.loads(base64.b64decode(GOOGLE_SERVICE_ACCOUNT_JSON))
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=['https://www.googleapis.com/auth/androidpublisher']
        )
        
        service = build('androidpublisher', 'v3', credentials=credentials)
        
        service.purchases().subscriptions().acknowledge(
            packageName=package,
            subscriptionId=product_id,
            token=purchase_token
        ).execute()
        
        return True
    except Exception as e:
        logger.error(f"[Google IAP] Acknowledgement error: {e}")
        return False


@router.post("/iap/google/verify", response_model=IAPValidationResponse)
async def verify_google_purchase(
    request: GooglePurchaseValidationRequest,
    current_user: User = Depends(require_auth)
):
    """
    Verify Google Play purchase token and update user subscription.
    Enforces package validation, cross-account hijacking protection, and RTDN token indexing.
    """
    user_id = current_user.user_id

    if request.package_name and GOOGLE_PACKAGE_NAME and request.package_name != GOOGLE_PACKAGE_NAME:
        return IAPValidationResponse(
            success=False,
            message="Invalid Android package identifier"
        )

    try:
        validation_result = await validate_google_purchase(
            request.purchase_token,
            request.product_id,
            GOOGLE_PACKAGE_NAME
        )

        if not validation_result.get('valid'):
            logger.warning(f"[Google IAP] Invalid purchase for user {user_id}: {validation_result.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid purchase: {validation_result.get('error')}"
            )

        expiry_ms = validation_result.get('expiryTimeMillis') or validation_result.get('expiry_time_millis')
        if expiry_ms:
            expiry_date = datetime.fromtimestamp(int(expiry_ms) / 1000, tz=timezone.utc)
            if expiry_date <= datetime.now(timezone.utc):
                return IAPValidationResponse(
                    success=False,
                    message="Subscription has expired"
                )
        else:
            logger.error(f"[Google IAP] REJECTED: No expiryTimeMillis in validation response for user {user_id}")
            return IAPValidationResponse(
                success=False,
                message="Invalid subscription: missing expiry data"
            )

        plan = get_plan_from_product_id(request.product_id)
        if not plan:
            logger.error(f"[Google IAP] Unknown product ID: {request.product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {request.product_id}"
            )

        token_hash = hashlib.sha256(request.purchase_token.encode("utf-8")).hexdigest()
        raw_order_id = validation_result.get('orderId') or f"google_{token_hash[:16]}"
        # Strip Google renewal suffix '..0', '..1' to obtain base subscription order ID
        base_order_id = raw_order_id.split("..")[0] if ".." in raw_order_id else raw_order_id

        # Cross-account purchase-token hijacking check
        existing_owner = await db.iap_transactions.find_one({
            "platform": "android",
            "$or": [
                {"purchase_token_hash": token_hash},
                {"purchase_token": request.purchase_token},
                {"original_transaction_id": base_order_id},
                {"transaction_id": raw_order_id},
            ],
        })
        if existing_owner and existing_owner.get("user_id") and existing_owner["user_id"] != user_id:
            logger.warning(
                "[Google IAP] Cross-account token hijack blocked: order=%s owner=%s attacker=%s",
                base_order_id,
                existing_owner["user_id"],
                user_id,
            )
            raise HTTPException(
                status_code=409,
                detail="This Google Play subscription is already linked to another Swift FX account."
            )

        ack_state = validation_result.get('acknowledgementState') or validation_result.get('acknowledgement_state', 0)
        if ack_state != 1:
            await acknowledge_google_purchase(
                request.purchase_token,
                request.product_id,
                GOOGLE_PACKAGE_NAME
            )

        now = datetime.now(timezone.utc)
        auto_renewing = bool(validation_result.get('autoRenewing', validation_result.get('auto_renewing', True)))
        payment_state = validation_result.get('paymentState')
        is_trial = payment_state == 2

        transaction = {
            "transaction_id": raw_order_id,
            "original_transaction_id": base_order_id,
            "user_id": user_id,
            "platform": "android",
            "product_id": request.product_id,
            "plan": plan,
            "purchase_token": request.purchase_token,
            "purchase_token_hash": token_hash,
            "purchase_date": now,
            "expiry_date": expiry_date,
            "is_trial": is_trial,
            "auto_renew": auto_renewing,
            "status": "active",
            "updated_at": now,
        }

        await db.iap_transactions.update_one(
            {"purchase_token_hash": token_hash, "platform": "android"},
            {
                "$set": transaction,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

        if await should_update_subscription(user_id, plan, expiry_date):
            await sync_profile_subscription(
                user_id,
                tier=plan,
                status="active",
                expiry=expiry_date,
                platform="android",
                product_id=request.product_id,
                auto_renew=auto_renewing,
                is_trial=is_trial,
                activated_at=now,
            )
            await on_user_subscription_change(user_id, plan)
        else:
            logger.info(f"[Google IAP] Skipping profile update — user {user_id} has active higher-tier subscription")

        logger.info(f"[Google IAP] Successfully validated and updated subscription for user {user_id}: {plan}")

        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_date.isoformat(),
            is_trial=is_trial,
            auto_renew=auto_renewing,
            message=f"Successfully subscribed to {plan.upper()}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Google IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process Google Play purchase")


@router.post("/iap/google/restore")
async def restore_google_purchases(
    request: GooglePurchaseValidationRequest,
    current_user: User = Depends(require_auth)
):
    """Restore Google Play purchases."""
    return await verify_google_purchase(request, current_user)


# ==================== IAP PRODUCTS & MANAGEMENT ====================
# NOTE: Legacy /api/iap/status and /webhooks/* endpoints removed in production hardening.
# Use /api/subscription/status for subscription queries.
# Apple Server Notifications V2 webhook with proper JWS signature verification.

# ==================== APPLE SERVER NOTIFICATIONS V2 ====================

def _b64url_decode(b64_str: str) -> bytes:
    """Decode base64url with automatic padding."""
    padding = 4 - len(b64_str) % 4
    if padding != 4:
        b64_str += '=' * padding
    return base64.urlsafe_b64decode(b64_str)


def _cert_not_before_utc(cert: x509.Certificate) -> datetime:
    dt = getattr(cert, "not_valid_before_utc", None)
    if dt is not None:
        return dt
    return cert.not_valid_before.replace(tzinfo=timezone.utc)


def _cert_not_after_utc(cert: x509.Certificate) -> datetime:
    dt = getattr(cert, "not_valid_after_utc", None)
    if dt is not None:
        return dt
    return cert.not_valid_after.replace(tzinfo=timezone.utc)


def _verify_cert_issued_by(child: x509.Certificate, issuer: x509.Certificate) -> None:
    if hasattr(child, "verify_directly_issued_by"):
        child.verify_directly_issued_by(issuer)
        return
    if child.issuer != issuer.subject:
        raise ValueError("Certificate issuer DN mismatch")
    pub = issuer.public_key()
    pub.verify(child.signature, child.tbs_certificate_bytes, ec.ECDSA(child.signature_hash_algorithm))


def verify_and_decode_apple_jws(
    signed_jws: str,
    expected_bundle_id: Optional[str] = APPLE_BUNDLE_ID,
) -> Optional[dict]:
    """
    Cryptographically verify and decode an Apple JWS token (App Store Server Notification V2).

    Security guarantees:
      1. Requires ES256 and a 3-certificate x5c chain [leaf, intermediate, root].
      2. Pins the root certificate's SHA-256 DER digest to official Apple Root CAs (G3/G2/Inc/Computer).
      3. Verifies full X.509 issuer signatures (root -> intermediate -> leaf) and BasicConstraints CA flags.
      4. Enforces Apple's App Store JWS Leaf OID (1.2.840.113635.100.6.11.1) and WWDR Intermediate OID (1.2.840.113635.100.6.2.1).
      5. Verifies certificate validity windows and the ES256 JWS signature.
      6. Enforces bundleId == APPLE_BUNDLE_ID whenever bundleId is present in the signed payload.
    """
    try:
        parts = signed_jws.split('.')
        if len(parts) != 3:
            logger.error("[Apple JWS] Invalid format — expected 3 dot-separated parts")
            return None

        header = json.loads(_b64url_decode(parts[0]))
        alg = header.get('alg', '')
        if alg != 'ES256':
            logger.error(f"[Apple JWS] Unexpected algorithm '{alg}', expected ES256")
            return None

        x5c_chain = header.get('x5c', [])
        if len(x5c_chain) != 3:
            logger.error(f"[Apple JWS] Invalid x5c chain length {len(x5c_chain)}, expected 3 [leaf, intermediate, root]")
            return None

        certs = [x509.load_der_x509_certificate(base64.b64decode(c_b64)) for c_b64 in x5c_chain]
        leaf_cert, intermediate_cert, root_cert = certs[0], certs[1], certs[2]

        # 1. Pin root certificate SHA-256 fingerprint against official Apple Root CAs
        root_fp = root_cert.fingerprint(hashes.SHA256()).hex().lower()
        if root_fp not in TRUSTED_APPLE_ROOT_CA_SHA256:
            logger.error(f"[Apple JWS] Untrusted root certificate fingerprint: {root_fp}")
            return None

        # 2. Verify cryptographic chain (root -> intermediate -> leaf) and CA constraints
        _verify_cert_issued_by(root_cert, root_cert)
        _verify_cert_issued_by(intermediate_cert, root_cert)
        _verify_cert_issued_by(leaf_cert, intermediate_cert)

        inter_bc = intermediate_cert.extensions.get_extension_for_class(x509.BasicConstraints).value
        if not inter_bc.ca:
            logger.error("[Apple JWS] Intermediate certificate does not have CA=True")
            return None

        # 3. Verify Apple-specific certificate extension OIDs
        try:
            leaf_cert.extensions.get_extension_for_oid(x509.ObjectIdentifier(APPLE_LEAF_CERT_OID))
            intermediate_cert.extensions.get_extension_for_oid(x509.ObjectIdentifier(APPLE_WWDR_INTERMEDIATE_OID))
        except x509.ExtensionNotFound as oid_err:
            logger.error(f"[Apple JWS] Missing required Apple certificate OID: {oid_err}")
            return None

        # 4. Verify ES256 JWS signature
        signing_input = f"{parts[0]}.{parts[1]}".encode('ascii')
        raw_signature = _b64url_decode(parts[2])
        if len(raw_signature) != 64:
            logger.error(f"[Apple JWS] Unexpected signature length {len(raw_signature)}, expected 64 bytes")
            return None

        r = int.from_bytes(raw_signature[:32], 'big')
        s = int.from_bytes(raw_signature[32:], 'big')
        der_signature = encode_dss_signature(r, s)

        leaf_pub_key = leaf_cert.public_key()
        leaf_pub_key.verify(der_signature, signing_input, ec.ECDSA(hashes.SHA256()))

        # 5. Decode verified payload and validate certificate validity window + bundleId
        payload = json.loads(_b64url_decode(parts[1]))

        signed_date_ms = payload.get("signedDate") or (payload.get("data") or {}).get("signedDate")
        effective_dt = parse_utc_datetime(signed_date_ms) or datetime.now(timezone.utc)
        for idx, cert in enumerate(certs):
            if effective_dt < _cert_not_before_utc(cert) or effective_dt > _cert_not_after_utc(cert):
                logger.error(f"[Apple JWS] Certificate at index {idx} outside validity window at {effective_dt.isoformat()}")
                return None

        payload_bundle_id = payload.get("bundleId") or (payload.get("data") or {}).get("bundleId")
        if expected_bundle_id and payload_bundle_id and payload_bundle_id != expected_bundle_id:
            logger.error(f"[Apple JWS] Bundle ID mismatch: got '{payload_bundle_id}', expected '{expected_bundle_id}'")
            return None

        logger.info("[Apple JWS] Signature, Apple Root CA pin, OIDs, and bundleId verified successfully")
        return payload

    except CryptoInvalidSignature:
        logger.error("[Apple JWS] Signature verification FAILED — notification may be forged")
        return None
    except Exception as e:
        logger.error(f"[Apple JWS] Verification failed: {e}")
        return None


def decode_apple_signed_payload(signed_payload: str) -> Optional[dict]:
    """
    Verify and decode an Apple signedPayload JWS.
    Delegates to verify_and_decode_apple_jws for full cryptographic verification.
    """
    return verify_and_decode_apple_jws(signed_payload)


def decode_apple_transaction_info(signed_transaction: str) -> Optional[dict]:
    """Decode (and verify) Apple's signedTransactionInfo JWS."""
    return verify_and_decode_apple_jws(signed_transaction)


def decode_apple_renewal_info(signed_renewal: str) -> Optional[dict]:
    """Decode (and verify) Apple's signedRenewalInfo JWS."""
    return verify_and_decode_apple_jws(signed_renewal)


@router.post("/webhooks/apple")
async def apple_server_notification_v2(request: Request):
    """
    Apple App Store Server Notifications V2 Webhook
    
    Handles all subscription lifecycle events from Apple:
    - SUBSCRIBED: New subscription
    - DID_RENEW: Successful renewal
    - DID_CHANGE_RENEWAL_STATUS: Auto-renew status changed
    - DID_CHANGE_RENEWAL_PREF: Subscription plan changed
    - DID_FAIL_TO_RENEW: Renewal failed (billing issue)
    - EXPIRED: Subscription expired
    - GRACE_PERIOD_EXPIRED: Grace period ended
    - REFUND: User refunded
    - REVOKE: Family sharing revoked
    - CONSUMPTION_REQUEST: Apple requesting consumption data
    
    Endpoint: POST /api/webhooks/apple
    
    Apple sends a JSON body with signedPayload containing:
    - notificationType
    - subtype (optional)
    - data.signedTransactionInfo
    - data.signedRenewalInfo
    """
    try:
        # Read raw body
        body = await request.body()
        logger.info("[Apple Webhook] Received V2 notification (%d bytes)", len(body))

        # Parse outer JSON envelope
        try:
            envelope = json.loads(body)
        except json.JSONDecodeError:
            logger.error("[Apple Webhook] Invalid JSON envelope")
            return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

        # V2 format: { "signedPayload": "<JWS>" }
        signed_payload = envelope.get("signedPayload")
        if not signed_payload:
            logger.error("[Apple Webhook] Missing signedPayload field")
            return JSONResponse(status_code=400, content={"error": "Missing signedPayload"})

        # Verify JWS signature AND decode in one step.
        # Returns None if signature is invalid / cert chain verification fails.
        notification_data = verify_and_decode_apple_jws(signed_payload)
        if not notification_data:
            logger.error("[Apple Webhook] JWS signature verification failed — rejecting notification")
            return JSONResponse(status_code=401, content={"error": "Invalid JWS signature"})
        
        # Extract notification details
        notification_type = notification_data.get("notificationType", "UNKNOWN")
        subtype = notification_data.get("subtype", "")
        notification_uuid = notification_data.get("notificationUUID", "")
        
        logger.info(f"[Apple Webhook] Type: {notification_type}, Subtype: {subtype}, UUID: {notification_uuid}")
        
        # Extract transaction data
        data = notification_data.get("data", {})
        signed_transaction_info = data.get("signedTransactionInfo")
        signed_renewal_info = data.get("signedRenewalInfo")
        
        transaction_info = None
        renewal_info = None
        
        if signed_transaction_info:
            transaction_info = decode_apple_transaction_info(signed_transaction_info)
            if transaction_info:
                logger.info(f"[Apple Webhook] Transaction: {transaction_info.get('transactionId')}, Product: {transaction_info.get('productId')}")
        
        if signed_renewal_info:
            renewal_info = decode_apple_renewal_info(signed_renewal_info)
            if renewal_info:
                logger.info(f"[Apple Webhook] Renewal auto-renew: {renewal_info.get('autoRenewStatus')}")
        
        # Process based on notification type
        if notification_type in ["SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED"]:
            # New subscription or successful renewal
            await handle_apple_subscription_active(transaction_info, renewal_info, notification_type)
        
        elif notification_type == "DID_CHANGE_RENEWAL_STATUS":
            # Auto-renew status changed (user turned off auto-renew)
            await handle_apple_renewal_status_change(transaction_info, renewal_info, subtype)
        
        elif notification_type in ["EXPIRED", "GRACE_PERIOD_EXPIRED"]:
            # Subscription expired
            await handle_apple_subscription_expired(transaction_info, renewal_info, notification_type)
        
        elif notification_type == "DID_FAIL_TO_RENEW":
            # Billing issue - subscription may enter grace period
            await handle_apple_billing_issue(transaction_info, renewal_info, subtype)
        
        elif notification_type == "REFUND":
            # User refunded - revoke access
            await handle_apple_refund(transaction_info)
        
        elif notification_type == "REVOKE":
            # Family sharing revoked
            await handle_apple_revoke(transaction_info)
        
        elif notification_type == "DID_CHANGE_RENEWAL_PREF":
            # User changed their subscription plan
            await handle_apple_plan_change(transaction_info, renewal_info)
        
        elif notification_type == "CONSUMPTION_REQUEST":
            # Apple requesting consumption data (for refund decisions)
            logger.info("[Apple Webhook] Consumption request received - no action needed")
        
        else:
            logger.warning(f"[Apple Webhook] Unhandled notification type: {notification_type}")
        
        # Store webhook event for audit
        await db.audit_logs.insert_one({
            "type": "apple_webhook",
            "notification_type": notification_type,
            "subtype": subtype,
            "notification_uuid": notification_uuid,
            "transaction_id": transaction_info.get("transactionId") if transaction_info else None,
            "product_id": transaction_info.get("productId") if transaction_info else None,
            "original_transaction_id": transaction_info.get("originalTransactionId") if transaction_info else None,
            "timestamp": datetime.now(timezone.utc),
            "raw_payload_hash": hashlib.sha256(body).hexdigest()[:16]  # Store hash for debugging
        })
        
        # Return 200 OK to Apple
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"[Apple Webhook] Error processing notification: {e}")
        import traceback
        traceback.print_exc()
        # Still return 200 to prevent Apple from retrying indefinitely
        return {"status": "error", "message": str(e)}


async def _reconcile_user_profile_after_webhook(user_id: str, fallback_status: str = "expired") -> None:
    """Recompute effective non-admin subscription after a webhook state change and sync public.profiles safely."""
    if not user_id:
        return
    profile = await fetch_profile(user_id)
    if not profile:
        return

    non_admin_copy = dict(profile)
    non_admin_copy["role"] = "free"
    non_admin_copy["admin_role"] = None
    details = await resolve_subscription_details(non_admin_copy, user_role="free", is_admin=False)

    if details["is_active"] and details["tier"] in ("premium", "vip"):
        await sync_profile_subscription(
            user_id,
            tier=details["tier"],
            status=details["status"],
            expiry=details["expiry_date"],
            platform=details["platform"],
            product_id=details["product_id"],
            auto_renew=bool(details["auto_renew"]),
            is_trial=bool(details["is_trial"]),
            profile=profile,
        )
    else:
        await sync_profile_subscription(
            user_id,
            tier="free",
            status=fallback_status,
            expiry=None,
            auto_renew=False,
            is_trial=False,
            profile=profile,
        )


async def handle_apple_subscription_active(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle new subscription or successful renewal."""
    if not transaction_info:
        logger.error("[Apple Webhook] No transaction info for subscription active event")
        return

    original_transaction_id = transaction_info.get("originalTransactionId")
    transaction_id = transaction_info.get("transactionId")
    product_id = transaction_info.get("productId") or ""
    app_account_token = transaction_info.get("appAccountToken")
    expires_date_ms = transaction_info.get("expiresDate")

    user_id = app_account_token
    if not user_id and original_transaction_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": {"$in": ["apple", "ios"]},
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")

    if not user_id:
        logger.error(f"[Apple Webhook] Cannot identify user for transaction {transaction_id}")
        return

    expiry_date = parse_utc_datetime(expires_date_ms)
    tier = get_plan_from_product_id(product_id) or ("vip" if "vip" in product_id.lower() else "premium")
    auto_renew = renewal_info.get("autoRenewStatus", 1) == 1 if renewal_info else True
    now = datetime.now(timezone.utc)

    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
        {
            "$set": {
                "user_id": user_id,
                "transaction_id": transaction_id,
                "original_transaction_id": original_transaction_id,
                "product_id": product_id,
                "platform": "apple",
                "status": "active",
                "plan": tier,
                "expiry_date": expiry_date,
                "auto_renew": auto_renew,
                "updated_at": now,
                "webhook_event": notification_type,
            },
            "$setOnInsert": {
                "purchase_date": now,
                "created_at": now,
            },
        },
        upsert=True,
    )

    try:
        await _reconcile_user_profile_after_webhook(user_id, fallback_status="active")
        await on_user_subscription_change(user_id, tier)
        logger.info(f"[Apple Webhook] Reconciled user {user_id} to {tier} (expires: {expiry_date})")
    except Exception as e:
        logger.error(f"[Apple Webhook] Failed to reconcile Supabase profile: {e}")


async def handle_apple_renewal_status_change(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle auto-renew status change."""
    if not renewal_info:
        return

    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    auto_renew_status = renewal_info.get("autoRenewStatus", 0) == 1

    if original_transaction_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": {"$in": ["apple", "ios"]},
        })
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
            {
                "$set": {
                    "auto_renew": auto_renew_status,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": f"DID_CHANGE_RENEWAL_STATUS_{subtype}",
                }
            },
        )
        if existing_txn and existing_txn.get("user_id"):
            await update_profile(existing_txn["user_id"], {"subscription_auto_renew": auto_renew_status})
        logger.info(f"[Apple Webhook] Auto-renew status changed to {auto_renew_status} for {original_transaction_id}")


async def handle_apple_subscription_expired(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle subscription expiration."""
    if not transaction_info:
        return

    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")

    user_id = app_account_token
    if not user_id and original_transaction_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": {"$in": ["apple", "ios"]},
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")

    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
        {
            "$set": {
                "status": "expired",
                "auto_renew": False,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": notification_type,
            }
        },
    )

    if user_id:
        try:
            await _reconcile_user_profile_after_webhook(user_id, fallback_status="expired")
            logger.info(f"[Apple Webhook] Processed expiration for user {user_id}")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to reconcile expired user {user_id}: {e}")


async def handle_apple_billing_issue(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle billing failure (grace period vs billing retry)."""
    if not transaction_info:
        return

    original_transaction_id = transaction_info.get("originalTransactionId")
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
        {
            "$set": {
                "status": "billing_issue",
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": f"DID_FAIL_TO_RENEW_{subtype}",
            }
        },
    )
    logger.info(f"[Apple Webhook] Billing issue for {original_transaction_id}, subtype: {subtype}")


async def handle_apple_refund(transaction_info: dict):
    """Handle refund - revoke access safely without demoting admin roles."""
    if not transaction_info:
        return

    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")

    user_id = app_account_token
    if not user_id and original_transaction_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": {"$in": ["apple", "ios"]},
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")

    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
        {
            "$set": {
                "status": "refunded",
                "auto_renew": False,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": "REFUND",
            }
        },
    )

    if user_id:
        try:
            await _reconcile_user_profile_after_webhook(user_id, fallback_status="refunded")
            logger.info(f"[Apple Webhook] Refund processed and profile reconciled for user {user_id}")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to reconcile refund for user {user_id}: {e}")


async def handle_apple_revoke(transaction_info: dict):
    """Handle family sharing revoke."""
    await handle_apple_refund(transaction_info)
    logger.info("[Apple Webhook] Family sharing access revoked")


async def handle_apple_plan_change(transaction_info: dict, renewal_info: dict):
    """Handle subscription plan change (upgrade/downgrade)."""
    if not renewal_info:
        return

    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    new_product_id = renewal_info.get("autoRenewProductId")

    if original_transaction_id and new_product_id:
        new_tier = get_plan_from_product_id(new_product_id) or ("vip" if "vip" in new_product_id.lower() else "premium")
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": {"$in": ["apple", "ios"]}},
            {
                "$set": {
                    "pending_plan_change": new_product_id,
                    "pending_tier": new_tier,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": "DID_CHANGE_RENEWAL_PREF",
                }
            },
        )
        logger.info(f"[Apple Webhook] Plan change pending to {new_product_id} for {original_transaction_id}")


# ==================== GOOGLE PLAY RTDN WEBHOOK ====================
# Google Play Real-Time Developer Notification types:
#  1 = SUBSCRIPTION_RECOVERED
#  2 = SUBSCRIPTION_RENEWED
#  3 = SUBSCRIPTION_CANCELED
#  4 = SUBSCRIPTION_PURCHASED
#  5 = SUBSCRIPTION_ON_HOLD
#  6 = SUBSCRIPTION_IN_GRACE_PERIOD
#  7 = SUBSCRIPTION_RESTARTED
#  8 = SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
#  9 = SUBSCRIPTION_DEFERRED
# 10 = SUBSCRIPTION_PAUSED
# 11 = SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
# 12 = SUBSCRIPTION_REVOKED
# 13 = SUBSCRIPTION_EXPIRED

@router.post("/webhooks/google")
async def google_play_rtdn_webhook(request: Request):
    """
    Google Play Real-Time Developer Notifications (RTDN) via Cloud Pub/Sub push.
    Verifies GOOGLE_WEBHOOK_TOKEN (required when set), decodes Pub/Sub message.data,
    re-validates live subscription state with Google Play Developer API, and updates
    MongoDB iap_transactions + Supabase profiles atomically.
    """
    if GOOGLE_WEBHOOK_TOKEN:
        query_token = request.query_params.get("token", "")
        auth_header = request.headers.get("Authorization", "")
        bearer_token = auth_header.replace("Bearer ", "", 1) if auth_header.startswith("Bearer ") else ""
        provided = query_token or bearer_token
        if not provided or not hmac.compare_digest(provided, GOOGLE_WEBHOOK_TOKEN):
            logger.warning("[Google Webhook] Rejected RTDN request due to invalid verification token")
            return JSONResponse(status_code=401, content={"error": "Unauthorized webhook token"})

    try:
        raw_body = await request.body()
        envelope = json.loads(raw_body)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid Pub/Sub JSON payload"})

    message = envelope.get("message") or {}
    data_b64 = message.get("data")
    if not data_b64:
        return JSONResponse(status_code=400, content={"error": "Missing Pub/Sub message.data"})

    try:
        decoded_event = json.loads(base64.b64decode(data_b64).decode("utf-8"))
    except Exception as e:
        logger.error(f"[Google Webhook] Failed to decode base64 Pub/Sub message.data: {e}")
        return JSONResponse(status_code=400, content={"error": "Malformed base64 message.data"})

    package_name = decoded_event.get("packageName")
    if package_name and GOOGLE_PACKAGE_NAME and package_name != GOOGLE_PACKAGE_NAME:
        logger.warning(f"[Google Webhook] Ignoring RTDN for unexpected package '{package_name}'")
        return {"status": "ignored_package"}

    if "testNotification" in decoded_event:
        logger.info("[Google Webhook] Received Google Play RTDN testNotification")
        return {"status": "ok", "type": "test"}

    sub_notif = decoded_event.get("subscriptionNotification")
    if not sub_notif:
        return {"status": "ignored"}

    notification_type = int(sub_notif.get("notificationType", 0))
    purchase_token = sub_notif.get("purchaseToken") or ""
    subscription_id = sub_notif.get("subscriptionId") or ""

    if not purchase_token or not subscription_id:
        return JSONResponse(status_code=400, content={"error": "Missing purchaseToken or subscriptionId"})

    token_hash = hashlib.sha256(purchase_token.encode("utf-8")).hexdigest()
    existing_txn = await db.iap_transactions.find_one({
        "platform": "android",
        "$or": [
            {"purchase_token_hash": token_hash},
            {"purchase_token": purchase_token},
            {"purchase_token": purchase_token[:100]},
        ],
    })
    user_id = existing_txn.get("user_id") if existing_txn else None
    plan = get_plan_from_product_id(subscription_id) or (existing_txn.get("plan") if existing_txn else "premium")
    now = datetime.now(timezone.utc)

    # Re-verify live state against Google Play Developer API whenever configured
    live_info = None
    if GOOGLE_SERVICE_ACCOUNT_JSON:
        live_res = await validate_google_purchase(purchase_token, subscription_id, GOOGLE_PACKAGE_NAME)
        if live_res.get("valid"):
            live_info = live_res
            if not user_id:
                user_id = live_res.get("obfuscatedExternalAccountId")

    expiry_dt = None
    auto_renew = existing_txn.get("auto_renew", False) if existing_txn else False
    if live_info:
        exp_ms = live_info.get("expiryTimeMillis") or live_info.get("expiry_time_millis")
        expiry_dt = parse_utc_datetime(int(exp_ms)) if exp_ms else None
        auto_renew = bool(live_info.get("autoRenewing", live_info.get("auto_renewing", False)))

    # Map notificationType -> transaction status
    if notification_type in (1, 2, 4, 7, 8, 9):
        new_status = "active" if (expiry_dt is None or expiry_dt > now) else "expired"
    elif notification_type == 3:
        # Canceled auto-renew; remains active until expiry_date
        auto_renew = False
        existing_exp = expiry_dt or (parse_utc_datetime(existing_txn.get("expiry_date")) if existing_txn else None)
        new_status = "active" if (existing_exp and existing_exp > now) else "cancelled"
        expiry_dt = existing_exp
    elif notification_type == 6:
        new_status = "billing_issue"
    elif notification_type in (5, 10, 13):
        new_status = "expired"
        auto_renew = False
    elif notification_type == 12:
        new_status = "revoked"
        auto_renew = False
    else:
        new_status = existing_txn.get("status", "active") if existing_txn else "active"

    update_fields: Dict[str, Any] = {
        "platform": "android",
        "product_id": subscription_id,
        "plan": plan,
        "purchase_token": purchase_token,
        "purchase_token_hash": token_hash,
        "status": new_status,
        "auto_renew": auto_renew,
        "updated_at": now,
        "webhook_event": f"GOOGLE_RTDN_{notification_type}",
    }
    if expiry_dt is not None:
        update_fields["expiry_date"] = expiry_dt
    if user_id:
        update_fields["user_id"] = user_id

    if existing_txn:
        await db.iap_transactions.update_one({"_id": existing_txn["_id"]}, {"$set": update_fields})
    elif user_id:
        await db.iap_transactions.insert_one({
            "transaction_id": (live_info or {}).get("orderId") or f"google_{token_hash[:16]}",
            "original_transaction_id": ((live_info or {}).get("orderId") or f"google_{token_hash[:16]}").split("..")[0],
            "created_at": now,
            "purchase_date": now,
            **update_fields,
        })

    if user_id:
        fallback = "refunded" if notification_type == 12 else "expired"
        await _reconcile_user_profile_after_webhook(user_id, fallback_status=fallback)
        if new_status == "active" and plan in ("premium", "vip"):
            await on_user_subscription_change(user_id, plan)

    await db.audit_logs.insert_one({
        "type": "google_webhook",
        "notification_type": notification_type,
        "product_id": subscription_id,
        "user_id": user_id,
        "status_applied": new_status,
        "timestamp": now,
        "message_id": message.get("messageId"),
    })

    return {"status": "ok"}

@router.get("/iap/products")
async def get_iap_products():
    """
    Get official IAP product IDs for the client.
    Product IDs are identical across iOS and Android.
    Client uses these to request products from Apple/Google store.
    """
    return {
        "products": IAP_PRODUCT_IDS,
        "by_tier": IAP_PRODUCTS_BY_TIER,
    }


@router.get("/iap/transactions")
async def get_iap_transactions(
    current_user: User = Depends(require_auth),
    limit: int = 10
):
    """Get user's IAP transaction history."""
    user_id = current_user.user_id
    capped = min(max(1, limit), 50)

    transactions = await db.iap_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(capped).to_list(capped)

    return {
        "transactions": [
            {
                "transaction_id": t.get("transaction_id"),
                "platform": t.get("platform"),
                "product_id": t.get("product_id"),
                "plan": t.get("plan"),
                "purchase_date": t.get("purchase_date").isoformat() if isinstance(t.get("purchase_date"), datetime) else t.get("purchase_date"),
                "expiry_date": t.get("expiry_date").isoformat() if isinstance(t.get("expiry_date"), datetime) else t.get("expiry_date"),
                "status": t.get("status"),
                "auto_renew": t.get("auto_renew"),
            }
            for t in transactions
        ]
    }


# ==================== ADMIN IAP ENDPOINTS ====================

@router.get("/admin/iap/transactions")
async def admin_get_iap_transactions(
    admin: User = Depends(require_admin),
    user_id: Optional[str] = None,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """Admin: View IAP transactions"""
    query = {}
    if user_id:
        query["user_id"] = user_id
    if platform:
        query["platform"] = platform
    if status:
        query["status"] = status
    
    transactions = await db.iap_transactions.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.iap_transactions.count_documents(query)
    
    return {
        "transactions": [
            {
                **{k: v for k, v in t.items() if k != '_id' and k != 'raw_receipt'},
            }
            for t in transactions
        ],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/admin/iap/stats")
async def admin_get_iap_stats(admin: User = Depends(require_admin)):
    """Admin: Get IAP & payment statistics across all platforms."""
    ios_count = await db.iap_transactions.count_documents({"platform": {"$in": ["ios", "apple"]}})
    android_count = await db.iap_transactions.count_documents({"platform": "android"})
    flw_count = await db.iap_transactions.count_documents({"platform": "flutterwave"})
    referral_count = await db.iap_transactions.count_documents({"platform": "referral"})

    active_count = await db.iap_transactions.count_documents({"status": "active"})
    expired_count = await db.iap_transactions.count_documents({"status": "expired"})
    cancelled_count = await db.iap_transactions.count_documents({"status": {"$in": ["cancelled", "refunded", "revoked"]}})

    now = datetime.now(timezone.utc)
    active_txns = await db.iap_transactions.find(
        {"status": {"$in": ["active", "billing_issue"]}},
        {"user_id": 1, "plan": 1, "tier": 1, "expiry_date": 1},
    ).to_list(5000)

    user_best_tier: Dict[str, str] = {}
    for txn in active_txns:
        uid = txn.get("user_id")
        if not uid:
            continue
        exp = parse_utc_datetime(txn.get("expiry_date"))
        if exp is not None and exp <= now:
            continue
        plan_tier = str(txn.get("plan") or txn.get("tier") or "free").lower()
        if TIER_PRIORITY.get(plan_tier, 0) > TIER_PRIORITY.get(user_best_tier.get(uid, "free"), 0):
            user_best_tier[uid] = plan_tier

    premium_users = sum(1 for t in user_best_tier.values() if t == "premium")
    vip_users = sum(1 for t in user_best_tier.values() if t == "vip")

    return {
        "by_platform": {
            "ios": ios_count,
            "android": android_count,
            "flutterwave": flw_count,
            "referral": referral_count,
        },
        "by_status": {
            "active": active_count,
            "expired": expired_count,
            "cancelled": cancelled_count,
        },
        "active_subscribers": {
            "premium": premium_users,
            "vip": vip_users,
            "total": premium_users + vip_users,
        },
    }


# ===================== AI CHART ANALYZER =====================

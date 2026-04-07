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
from core.dependencies import get_current_user, require_auth, require_admin
from core.config import (
    APPLE_SHARED_SECRET, APPLE_BUNDLE_ID, APPLE_ENVIRONMENT,
    APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY, APPLE_WEBHOOK_SECRET,
    GOOGLE_PACKAGE_NAME, GOOGLE_SERVICE_ACCOUNT_JSON, get_plan_from_product_id,
    IAP_PRODUCT_IDS, IAP_PRODUCTS_BY_TIER,
)
from services.subscription import get_effective_subscription, get_active_override, get_ai_weekly_limit
from supabase_auth import fetch_profile, update_profile, count_profiles
from models.schemas import User, DeviceTokenRegister
from api.routes.referral import on_user_subscription_change

logger = logging.getLogger(__name__)

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
    await db.device_tokens.update_one(
        {"user_id": current_user.user_id, "platform": token_data.platform},
        {"$set": {
            "user_id": current_user.user_id,
            "token": token_data.token,
            "platform": token_data.platform,
            "is_active": True,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    logger.info(f"[Notifications] Token registered: user={current_user.user_id[:12]}... platform={token_data.platform} token={token_data.token[:30]}...")
    return {"message": "Token registered successfully"}

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
    Backend-authoritative subscription status.
    Entitlement is derived STRICTLY from verified IAP transactions in MongoDB.
    No Supabase profile.role fallback for subscription tier.
    Admin flag is separate from subscription entitlement.
    """
    user_id = current_user.user_id
    now = datetime.now(timezone.utc)

    # ── 1. Resolve admin status from Supabase profile (admin panel access only) ──
    profile = await fetch_profile(user_id)
    profile_role = (profile or {}).get("role", "user")
    is_admin = profile_role in ("admin", "super_admin")

    # ── 2. Check for active subscription override first ──
    override = await get_active_override(user_id)
    override_info = None

    # ── 3. Resolve subscription tier from verified IAP transactions (MongoDB) ──
    # Only transactions created by /iap/apple/verify or /iap/google/verify are stored here.
    tier_priority = {"vip": 2, "premium": 1}
    best_tier = "free"
    best_priority = 0
    subscription_expiry = None
    subscription_active = False
    subscription_platform = None
    subscription_product_id = None
    auto_renew = False

    active_txns = await db.iap_transactions.find({
        "user_id": user_id,
        "status": "active",
    }).sort("expiry_date", -1).to_list(20)

    for txn in active_txns:
        expiry = txn.get("expiry_date")
        if expiry:
            if isinstance(expiry, str):
                try:
                    expiry_dt = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                except ValueError:
                    continue
            else:
                expiry_dt = expiry
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            if expiry_dt <= now:
                continue  # expired
        # else: NULL expiry = lifetime (never expires)

        txn_plan = txn.get("plan", "").lower()
        priority = tier_priority.get(txn_plan, 0)
        if priority > best_priority:
            best_priority = priority
            best_tier = txn_plan
            subscription_expiry = txn.get("expiry_date")
            subscription_active = True
            subscription_platform = txn.get("platform")
            subscription_product_id = txn.get("product_id")
            auto_renew = txn.get("auto_renew", False)

    # ── 4. Apply override if active (takes priority over store subscriptions) ──
    effective = best_tier
    if override:
        effective = override.get("tier", best_tier)
        override_info = {
            "tier": override.get("tier"),
            "expires_at": override.get("expires_at"),
            "is_active": True,
        }

    # ── 5. Resolve capability tier (admin privilege override) ──
    # billing_tier  = pure store/IAP tier (no override, no admin elevation)
    # capability_tier = effective tier for feature gating (admin/super_admin → vip)
    # capability_source = "admin_privilege" | "subscription"
    billing_tier = best_tier
    if is_admin:
        capability_tier = "vip"
        capability_source = "admin_privilege"
    else:
        capability_tier = effective
        capability_source = "subscription"

    # ── 6. Build feature flags from capability tier ──
    ai_weekly_used = (profile or {}).get("ai_weekly_used", 0) or (profile or {}).get("ai_usage_count", 0)
    ai_limit = get_ai_weekly_limit(capability_tier)

    return {
        "user_id": user_id,
        "entitlement": effective,              # Legacy: IAP + override tier
        "billing_tier": billing_tier,          # Pure store tier (no override/admin)
        "capability_tier": capability_tier,    # Effective tier for feature gating
        "capability_source": capability_source,  # "admin_privilege" | "subscription"
        "subscription_active": subscription_active or (override is not None) or is_admin,
        "subscription_expiry": override.get("expires_at") if override else subscription_expiry,
        "subscription_platform": "override" if override else subscription_platform,
        "subscription_product_id": subscription_product_id,
        "auto_renew": auto_renew,
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
    current_user: dict = Depends(get_current_user)
):
    """
    Verify Apple App Store purchase receipt and update user subscription
    
    Flow:
    1. Client sends receipt data after purchase
    2. Server validates with Apple
    3. Server updates user subscription
    4. Returns success/failure
    """
    user_id = current_user.user_id
    
    try:
        # Validate receipt with Apple
        validation_result = await validate_apple_receipt(
            request.receipt_data, 
            request.exclude_old_transactions
        )
        
        # Parse the validation result
        parsed = parse_apple_receipt(validation_result)
        
        if not parsed.get('valid'):
            logger.warning(f"[Apple IAP] Invalid receipt for user {user_id}: {parsed.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid receipt: {parsed.get('error')}"
            )
        
        if not parsed.get('active'):
            logger.info(f"[Apple IAP] No active subscription for user {user_id}")
            return IAPValidationResponse(
                success=False,
                message="No active subscription found"
            )
        
        # Get plan from product ID
        product_id = parsed.get('product_id')
        plan = get_plan_from_product_id(product_id)
        
        if not plan:
            logger.error(f"[Apple IAP] Unknown product ID: {product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {product_id}"
            )
        
        # Update user subscription
        expiry_date = parsed.get('expiry_date')
        
        await update_profile(user_id, {
                "subscription": plan,
                "subscription_status": "active",
                "subscription_expiry": expiry_date,
                "subscription_platform": "ios",
                "subscription_product_id": product_id,
                "subscription_auto_renew": parsed.get('auto_renew', True),
                "subscription_is_trial": parsed.get('is_trial', False),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Store transaction record
        transaction = {
            "transaction_id": parsed.get('transaction_id'),
            "original_transaction_id": parsed.get('original_transaction_id'),
            "user_id": user_id,
            "platform": "ios",
            "product_id": product_id,
            "plan": plan,
            "purchase_date": parsed.get('purchase_date'),
            "expiry_date": expiry_date,
            "is_trial": parsed.get('is_trial', False),
            "auto_renew": parsed.get('auto_renew', True),
            "status": "active",
            "raw_receipt": request.receipt_data[:500],  # Store partial for debugging
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.iap_transactions.update_one(
            {"transaction_id": parsed.get('transaction_id')},
            {"$set": transaction},
            upsert=True
        )
        
        # Trigger subscription change event (for referrals, etc.)
        await on_user_subscription_change(user_id, plan)
        
        logger.info(f"[Apple IAP] Successfully validated and updated subscription for user {user_id}: {plan}")
        
        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_date,
            is_trial=parsed.get('is_trial', False),
            auto_renew=parsed.get('auto_renew', True),
            message=f"Successfully subscribed to {plan.upper()}"
        )
        
    except Exception as e:
        logger.error(f"[Apple IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process purchase: {str(e)}")


@router.post("/iap/apple/restore")
async def restore_apple_purchases(
    request: AppleReceiptValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Restore Apple purchases - used when user reinstalls app or changes device
    Same as verify but specifically for restore flow
    """
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
    current_user: dict = Depends(get_current_user)
):
    """
    Verify Google Play purchase token and update user subscription
    
    Flow:
    1. Client sends purchase token after purchase
    2. Server validates with Google Play Developer API
    3. Server acknowledges the purchase
    4. Server updates user subscription
    5. Returns success/failure
    """
    user_id = current_user.user_id
    
    try:
        # Validate with Google
        validation_result = await validate_google_purchase(
            request.purchase_token,
            request.product_id,
            request.package_name
        )
        
        if not validation_result.get('valid'):
            logger.warning(f"[Google IAP] Invalid purchase for user {user_id}: {validation_result.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid purchase: {validation_result.get('error')}"
            )
        
        # Parse expiry time
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
        
        # Get plan from product ID
        plan = get_plan_from_product_id(request.product_id)
        
        if not plan:
            logger.error(f"[Google IAP] Unknown product ID: {request.product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {request.product_id}"
            )
        
        # Acknowledge the purchase (required by Google)
        ack_state = validation_result.get('acknowledgementState') or validation_result.get('acknowledgement_state', 0)
        if ack_state != 1:
            await acknowledge_google_purchase(
                request.purchase_token,
                request.product_id,
                request.package_name
            )
        
        # Update user subscription
        auto_renewing = validation_result.get('autoRenewing', validation_result.get('auto_renewing', True))
        
        await update_profile(user_id, {
                "subscription": plan,
                "subscription_status": "active",
                "subscription_expiry": expiry_date.isoformat(),
                "subscription_platform": "android",
                "subscription_product_id": request.product_id,
                "subscription_auto_renew": auto_renewing,
                "subscription_is_trial": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Store transaction record
        order_id = validation_result.get('orderId', f"google_{uuid.uuid4().hex[:12]}")
        transaction = {
            "transaction_id": order_id,
            "user_id": user_id,
            "platform": "android",
            "product_id": request.product_id,
            "plan": plan,
            "purchase_token": request.purchase_token[:100],  # Store partial
            "purchase_date": datetime.now(timezone.utc).isoformat(),
            "expiry_date": expiry_date.isoformat(),
            "is_trial": False,
            "auto_renew": auto_renewing,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.iap_transactions.update_one(
            {"transaction_id": order_id},
            {"$set": transaction},
            upsert=True
        )
        
        # Trigger subscription change event
        await on_user_subscription_change(user_id, plan)
        
        logger.info(f"[Google IAP] Successfully validated and updated subscription for user {user_id}: {plan}")
        
        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_date.isoformat(),
            is_trial=False,
            auto_renew=auto_renewing,
            message=f"Successfully subscribed to {plan.upper()}"
        )
        
    except Exception as e:
        logger.error(f"[Google IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process purchase: {str(e)}")


@router.post("/iap/google/restore")
async def restore_google_purchases(
    request: GooglePurchaseValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """Restore Google Play purchases"""
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


def verify_and_decode_apple_jws(signed_jws: str) -> Optional[dict]:
    """
    Verify and decode an Apple JWS token (App Store Server Notification V2).

    Apple V2 notifications use JWS compact serialization:
      header.payload.signature  (all base64url encoded)

    The JWS header contains:
      - alg: "ES256"  (ECDSA with P-256 and SHA-256)
      - x5c: [ <leaf_cert_b64der>, <intermediate_cert_b64der>, ... ]

    Verification steps:
      1. Confirm algorithm is ES256.
      2. Load the x5c certificate chain.
      3. Verify each cert is signed by the next in the chain.
      4. Verify the JWS signature over "header.payload" using the leaf cert's public key.
      5. Confirm the root cert's issuer contains "Apple" (basic chain pinning).

    No HMAC / shared secret is used for V2 — security is fully cryptographic.
    Returns the decoded payload dict on success, or None on any failure.
    """
    try:
        parts = signed_jws.split('.')
        if len(parts) != 3:
            logger.error("[Apple JWS] Invalid format — expected 3 dot-separated parts")
            return None

        # --- 1. Parse header ---
        header = json.loads(_b64url_decode(parts[0]))
        alg = header.get('alg', '')
        if alg != 'ES256':
            logger.error(f"[Apple JWS] Unexpected algorithm '{alg}', expected ES256")
            return None

        x5c_chain = header.get('x5c', [])
        if not x5c_chain:
            logger.error("[Apple JWS] Missing x5c certificate chain in JWS header")
            return None

        # --- 2. Load certificate chain ---
        certs = []
        for cert_b64 in x5c_chain:
            cert_der = base64.b64decode(cert_b64)
            cert = x509.load_der_x509_certificate(cert_der)
            certs.append(cert)

        # --- 3. Verify certificate chain (each cert signed by the next) ---
        for i in range(len(certs) - 1):
            child = certs[i]
            parent = certs[i + 1]
            try:
                parent_pub_key = parent.public_key()
                sig_hash = child.signature_hash_algorithm
                parent_pub_key.verify(
                    child.signature,
                    child.tbs_certificate_bytes,
                    ec.ECDSA(sig_hash)
                )
            except Exception as chain_err:
                logger.error(f"[Apple JWS] Chain verification failed at index {i}: {chain_err}")
                return None

        # --- 4. Basic root certificate pinning (Apple issuer check) ---
        root_cert = certs[-1]
        try:
            root_cn_attrs = root_cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
            root_cn = root_cn_attrs[0].value if root_cn_attrs else ""
            if "Apple" not in root_cn:
                logger.warning(f"[Apple JWS] Root cert CN '{root_cn}' does not appear to be Apple's CA")
                return None
        except Exception:
            logger.warning("[Apple JWS] Could not inspect root cert CN")

        # --- 5. Verify JWS signature ---
        signing_input = f"{parts[0]}.{parts[1]}".encode('ascii')
        raw_signature = _b64url_decode(parts[2])

        if len(raw_signature) != 64:
            logger.error(f"[Apple JWS] Unexpected signature length {len(raw_signature)}, expected 64 bytes")
            return None

        # JWS ES256: raw r||s (32 bytes each) → DER for cryptography library
        r = int.from_bytes(raw_signature[:32], 'big')
        s = int.from_bytes(raw_signature[32:], 'big')
        der_signature = encode_dss_signature(r, s)

        leaf_pub_key = certs[0].public_key()
        leaf_pub_key.verify(der_signature, signing_input, ec.ECDSA(hashes.SHA256()))

        # Signature valid — decode payload
        payload = json.loads(_b64url_decode(parts[1]))
        logger.info("[Apple JWS] Signature verified successfully")
        return payload

    except CryptoInvalidSignature:
        logger.error("[Apple JWS] Signature verification FAILED — notification may be forged")
        return None
    except Exception as e:
        logger.error(f"[Apple JWS] Unexpected verification error: {e}")
        import traceback
        traceback.print_exc()
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


async def handle_apple_subscription_active(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle new subscription or successful renewal"""
    if not transaction_info:
        logger.error("[Apple Webhook] No transaction info for subscription active event")
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    transaction_id = transaction_info.get("transactionId")
    product_id = transaction_info.get("productId")
    app_account_token = transaction_info.get("appAccountToken")  # This should be our user_id
    expires_date_ms = transaction_info.get("expiresDate")
    
    # Find user by appAccountToken (user_id) or by existing transaction
    user_id = app_account_token
    if not user_id:
        # Try to find by original_transaction_id
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    if not user_id:
        logger.error(f"[Apple Webhook] Cannot identify user for transaction {transaction_id}")
        return
    
    # Calculate expiry date
    expiry_date = None
    if expires_date_ms:
        expiry_date = datetime.fromtimestamp(expires_date_ms / 1000, tz=timezone.utc)
    
    # Determine tier from product_id
    tier = "premium"
    if "vip" in product_id.lower():
        tier = "vip"
    
    # Update or create IAP transaction
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
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
                "auto_renew": renewal_info.get("autoRenewStatus", 1) == 1 if renewal_info else True,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": notification_type
            },
            "$setOnInsert": {
                "purchase_date": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    
    # Sync role to Supabase profile (MongoDB iap_transactions is the entitlement authority)
    try:
        ok = await update_profile(user_id, {"role": tier})
        if ok:
            logger.info(f"[Apple Webhook] Updated user {user_id} to {tier} (expires: {expiry_date})")
        else:
            logger.error(f"[Apple Webhook] update_profile returned False for user {user_id}")
    except Exception as e:
        logger.error(f"[Apple Webhook] Failed to update Supabase profile: {e}")


async def handle_apple_renewal_status_change(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle auto-renew status change"""
    if not renewal_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    auto_renew_status = renewal_info.get("autoRenewStatus", 0) == 1
    
    if original_transaction_id:
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": "apple"},
            {
                "$set": {
                    "auto_renew": auto_renew_status,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": f"DID_CHANGE_RENEWAL_STATUS_{subtype}"
                }
            }
        )
        
        logger.info(f"[Apple Webhook] Auto-renew status changed to {auto_renew_status} for {original_transaction_id}")


async def handle_apple_subscription_expired(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle subscription expiration"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")
    
    # Find user
    user_id = app_account_token
    if not user_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    # Update transaction status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "expired",
                "auto_renew": False,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": notification_type
            }
        }
    )
    
    # Downgrade user to free tier
    if user_id:
        try:
            # Check if user has any other active subscriptions
            active_sub = await db.iap_transactions.find_one({
                "user_id": user_id,
                "status": "active",
                "expiry_date": {"$gt": datetime.now(timezone.utc)}
            })
            
            if not active_sub:
                await update_profile(user_id, {"role": "free"})
                logger.info(f"[Apple Webhook] Downgraded user {user_id} to free tier")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to downgrade user: {e}")


async def handle_apple_billing_issue(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle billing failure (grace period)"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    
    # Update transaction to billing_issue status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "billing_issue",
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": f"DID_FAIL_TO_RENEW_{subtype}"
            }
        }
    )
    
    logger.info(f"[Apple Webhook] Billing issue for {original_transaction_id}, subtype: {subtype}")


async def handle_apple_refund(transaction_info: dict):
    """Handle refund - revoke access"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")
    
    # Find user
    user_id = app_account_token
    if not user_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    # Update transaction status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "refunded",
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": "REFUND"
            }
        }
    )
    
    # Downgrade user
    if user_id:
        try:
            await update_profile(user_id, {"role": "free"})
            logger.info(f"[Apple Webhook] Refund processed, downgraded user {user_id}")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to process refund for user: {e}")


async def handle_apple_revoke(transaction_info: dict):
    """Handle family sharing revoke"""
    # Similar to refund handling
    await handle_apple_refund(transaction_info)
    logger.info("[Apple Webhook] Family sharing access revoked")


async def handle_apple_plan_change(transaction_info: dict, renewal_info: dict):
    """Handle subscription plan change (upgrade/downgrade)"""
    if not renewal_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    new_product_id = renewal_info.get("autoRenewProductId")
    
    if original_transaction_id and new_product_id:
        # Determine new tier
        new_tier = "premium"
        if "vip" in new_product_id.lower():
            new_tier = "vip"
        
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": "apple"},
            {
                "$set": {
                    "pending_plan_change": new_product_id,
                    "pending_tier": new_tier,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": "DID_CHANGE_RENEWAL_PREF"
                }
            }
        )
        
        logger.info(f"[Apple Webhook] Plan change pending to {new_product_id} for {original_transaction_id}")

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
    current_user: dict = Depends(get_current_user),
    limit: int = 10
):
    """Get user's IAP transaction history"""
    user_id = current_user.user_id
    
    transactions = await db.iap_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {
        "transactions": [
            {
                "transaction_id": t.get("transaction_id"),
                "platform": t.get("platform"),
                "product_id": t.get("product_id"),
                "plan": t.get("plan"),
                "purchase_date": t.get("purchase_date"),
                "expiry_date": t.get("expiry_date"),
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
    """Admin: Get IAP statistics"""
    # Count by platform
    ios_count = await db.iap_transactions.count_documents({"platform": "ios"})
    android_count = await db.iap_transactions.count_documents({"platform": "android"})
    
    # Count by status
    active_count = await db.iap_transactions.count_documents({"status": "active"})
    expired_count = await db.iap_transactions.count_documents({"status": "expired"})
    cancelled_count = await db.iap_transactions.count_documents({"status": "cancelled"})
    
    # Count active subscriptions by plan
    premium_users = await count_profiles("premium")
    vip_users = await count_profiles("vip")
    
    return {
        "by_platform": {
            "ios": ios_count,
            "android": android_count
        },
        "by_status": {
            "active": active_count,
            "expired": expired_count,
            "cancelled": cancelled_count
        },
        "active_subscribers": {
            "premium": premium_users,
            "vip": vip_users,
            "total": premium_users + vip_users
        }
    }


# ===================== AI CHART ANALYZER =====================

"""
services/subscription.py — Subscription tier resolution, access checks, AI limits.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from core.database import db

logger = logging.getLogger(__name__)


def get_subscription_level(subscription: str) -> int:
    """Get numeric level for subscription comparison"""
    levels = {"free": 0, "premium": 1, "vip": 2}
    return levels.get(subscription.lower(), 0)


def can_access_visibility(user_subscription: str, signal_visibility: str) -> bool:
    """Check if user subscription can access signal visibility level"""
    user_level = get_subscription_level(user_subscription)
    visibility_level = get_subscription_level(signal_visibility)
    return user_level >= visibility_level


def get_ai_weekly_limit(subscription: str) -> int:
    """Get weekly AI analysis limit based on subscription"""
    limits = {"free": 3, "premium": 10, "vip": 999999}
    return limits.get(subscription.lower(), 3)


def check_subscription_active(user_doc: dict) -> bool:
    """Check if user subscription is active (not expired)"""
    expiry = user_doc.get("subscription_expiry")
    if expiry is None:
        return True
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry > datetime.now(timezone.utc)


async def get_active_override(user_id: str) -> Optional[dict]:
    """Get active subscription override for user (if any)."""
    override = await db.subscription_overrides.find_one(
        {"user_id": user_id, "is_active": True},
        {"_id": 0}
    )
    if not override:
        return None

    expires_at = override.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            try:
                exp = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            except ValueError:
                return None
        else:
            exp = expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            await db.subscription_overrides.update_one(
                {"user_id": user_id, "is_active": True},
                {"$set": {"is_active": False}}
            )
            return None
    return override


async def get_effective_subscription(user_doc: dict) -> str:
    """
    Get user's effective subscription tier.
    Resolution order:
      1. Admin/Super Admin -> always "vip"
      2. Active subscription override -> override tier
      3. Verified IAP transactions in MongoDB -> store-based tier
      4. Fallback -> "free"
    """
    user_id = user_doc.get("id") or user_doc.get("user_id", "")
    role = user_doc.get("role", "free")

    if role in ("admin", "super_admin"):
        return "vip"

    override = await get_active_override(user_id)
    if override:
        return override.get("tier", "free")

    now = datetime.now(timezone.utc)
    tier_priority = {"vip": 2, "premium": 1}
    best_tier = "free"
    best_priority = 0

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
                continue

        txn_plan = txn.get("plan", "").lower()
        priority = tier_priority.get(txn_plan, 0)
        if priority > best_priority:
            best_priority = priority
            best_tier = txn_plan

    return best_tier

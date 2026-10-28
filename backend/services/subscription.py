"""
services/subscription.py — Unified subscription tier resolution, entitlement sync, access checks, AI limits.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional, Union

from core.config import get_plan_from_product_id
from core.database import db
from supabase_auth import fetch_profile, update_profile

logger = logging.getLogger(__name__)

TIER_LEVELS = {"free": 0, "premium": 1, "vip": 2}


def parse_utc_datetime(value: Any) -> Optional[datetime]:
    """Parse datetime / ISO-8601 string / epoch seconds or ms into a timezone-aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        ts = float(value) / 1000.0 if value > 1e12 else float(value)
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except (ValueError, OSError):
            return None
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def get_subscription_level(subscription: str) -> int:
    """Get numeric level for subscription comparison."""
    return TIER_LEVELS.get((subscription or "free").lower(), 0)


def can_access_visibility(user_subscription: str, signal_visibility: str) -> bool:
    """Check if user subscription can access signal visibility level."""
    return get_subscription_level(user_subscription) >= get_subscription_level(signal_visibility)


def get_ai_weekly_limit(subscription: str) -> int:
    """Get weekly AI analysis limit based on subscription."""
    limits = {"free": 3, "premium": 10, "vip": 999999}
    return limits.get((subscription or "free").lower(), 3)


def check_subscription_active(user_doc: dict) -> bool:
    """Check if user profile subscription is currently active (not expired or inactive)."""
    if not user_doc:
        return False
    role_val = str(user_doc.get("role") or "").lower()
    if role_val in ("admin", "super_admin") or (user_doc.get("admin_role") and user_doc.get("admin_enabled", True)):
        return True

    tier = (user_doc.get("subscription_tier") or user_doc.get("subscription") or "free").lower()
    status = (user_doc.get("subscription_status") or "").lower()
    if tier not in ("premium", "vip"):
        return False
    if status in ("inactive", "expired", "revoked", "refunded"):
        return False

    expiry = parse_utc_datetime(user_doc.get("subscription_expiry"))
    if expiry is None:
        return status == "active"
    return expiry > datetime.now(timezone.utc)


async def get_active_override(user_id: str) -> Optional[dict]:
    """Get active, non-expired subscription override for user (if any)."""
    if not user_id:
        return None
    override = await db.subscription_overrides.find_one(
        {"user_id": user_id, "is_active": True},
        {"_id": 0},
    )
    if not override:
        return None

    exp = parse_utc_datetime(override.get("expires_at"))
    if exp is not None and exp <= datetime.now(timezone.utc):
        await db.subscription_overrides.update_one(
            {"user_id": user_id, "is_active": True},
            {"$set": {"is_active": False}},
        )
        return None
    return override


def _is_admin_profile(profile: Optional[dict], user_role: Optional[str] = None, is_admin: Optional[bool] = None) -> bool:
    if is_admin is True:
        return True
    role_str = (user_role or (profile or {}).get("role") or "").lower()
    if role_str in ("admin", "super_admin"):
        return True
    if profile and profile.get("admin_role") and profile.get("admin_enabled", True) is not False:
        return True
    return False


async def resolve_subscription_details(
    user_or_id: Union[dict, Any, str],
    *,
    user_role: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> dict:
    """
    Single source of truth for subscription status & effective entitlement tier.
    Accepts a profile dict, a User model instance, or a user_id string.

    Priority order:
      1. Admin / Super Admin -> 'vip' (active, permanent)
      2. Active non-expired db.subscription_overrides -> override tier
      3. Active non-expired verified db.iap_transactions (Apple, Google, Flutterwave, Referral)
      4. Active non-expired Supabase profile subscription fallback
      5. Otherwise -> 'free'
    """
    now = datetime.now(timezone.utc)
    profile: Optional[dict] = None
    user_id = ""
    inferred_role = user_role

    if isinstance(user_or_id, str):
        user_id = user_or_id
    elif isinstance(user_or_id, dict):
        profile = user_or_id
        user_id = str(profile.get("id") or profile.get("user_id") or "")
        if not inferred_role:
            raw_r = profile.get("role")
            inferred_role = raw_r.value if hasattr(raw_r, "value") else str(raw_r or "")
    elif user_or_id is not None:
        user_id = str(getattr(user_or_id, "user_id", "") or getattr(user_or_id, "id", "") or "")
        raw_r = getattr(user_or_id, "role", None)
        if not inferred_role and raw_r is not None:
            inferred_role = raw_r.value if hasattr(raw_r, "value") else str(raw_r)
        if is_admin is None and getattr(user_or_id, "admin_role", None) and getattr(user_or_id, "admin_enabled", True):
            is_admin = True

    if _is_admin_profile(profile, user_role=inferred_role, is_admin=is_admin):
        return {
            "tier": "vip",
            "is_active": True,
            "status": "active",
            "platform": "admin",
            "source": "admin",
            "product_id": None,
            "expiry_date": None,
            "auto_renew": False,
            "renewal_provider": None,
            "next_billing_date": None,
            "is_trial": False,
            "is_override": False,
        }

    if not user_id:
        return {
            "tier": "free",
            "is_active": False,
            "status": "inactive",
            "platform": None,
            "source": None,
            "product_id": None,
            "expiry_date": None,
            "auto_renew": False,
            "renewal_provider": None,
            "next_billing_date": None,
            "is_trial": False,
            "is_override": False,
        }

    # If caller only passed user_id or User without profile dict, fetch profile when needed
    if profile is None:
        profile = await fetch_profile(user_id)
        if _is_admin_profile(profile, user_role=inferred_role, is_admin=is_admin):
            return {
                "tier": "vip",
                "is_active": True,
                "status": "active",
                "platform": "admin",
                "source": "admin",
                "product_id": None,
                "expiry_date": None,
                "auto_renew": False,
                "renewal_provider": None,
                "next_billing_date": None,
                "is_trial": False,
                "is_override": False,
            }

    # 2. Check active subscription override
    override = await get_active_override(user_id)
    if override:
        ov_tier = (override.get("tier") or "free").lower()
        ov_exp = parse_utc_datetime(override.get("expires_at"))
        return {
            "tier": ov_tier,
            "is_active": ov_tier in ("premium", "vip"),
            "status": "active" if ov_tier in ("premium", "vip") else "inactive",
            "platform": "override",
            "source": "override",
            "product_id": None,
            "expiry_date": ov_exp.isoformat() if ov_exp else None,
            "auto_renew": False,
            "renewal_provider": None,
            "next_billing_date": None,
            "is_trial": False,
            "is_override": True,
        }

    # 3. Check verified transactions across all platforms in MongoDB
    candidate_txns = await db.iap_transactions.find(
        {
            "user_id": user_id,
            "status": {"$in": ["active", "billing_issue"]},
        }
    ).sort("expiry_date", -1).to_list(30)

    best_txn: Optional[dict] = None
    best_tier = "free"
    best_level = 0
    best_expiry: Optional[datetime] = None

    for txn in candidate_txns:
        exp_dt = parse_utc_datetime(txn.get("expiry_date"))
        if exp_dt is not None and exp_dt <= now:
            # Lazily mark expired transactions so future queries stay fast
            if txn.get("status") == "active" and txn.get("_id") is not None:
                await db.iap_transactions.update_one(
                    {"_id": txn["_id"]},
                    {"$set": {"status": "expired", "auto_renew": False, "updated_at": now}},
                )
            continue

        raw_plan = (
            txn.get("plan")
            or txn.get("tier")
            or get_plan_from_product_id(str(txn.get("product_id") or ""))
            or "free"
        )
        plan_tier = str(raw_plan).lower()
        level = get_subscription_level(plan_tier)
        if level <= 0:
            continue

        is_better = False
        if level > best_level:
            is_better = True
        elif level == best_level:
            if best_expiry is not None and (exp_dt is None or exp_dt > best_expiry):
                is_better = True

        if is_better:
            best_txn = txn
            best_tier = plan_tier
            best_level = level
            best_expiry = exp_dt

    if best_txn is not None and best_level > 0:
        next_bill_dt = parse_utc_datetime(best_txn.get("next_billing_date"))
        platform_val = best_txn.get("platform") or best_txn.get("provider") or "store"
        if platform_val == "ios":
            platform_val = "apple"
        return {
            "tier": best_tier,
            "is_active": True,
            "status": best_txn.get("status", "active"),
            "platform": platform_val,
            "source": platform_val,
            "product_id": best_txn.get("product_id"),
            "expiry_date": best_expiry.isoformat() if best_expiry else None,
            "auto_renew": bool(best_txn.get("auto_renew", False)),
            "renewal_provider": best_txn.get("renewal_provider"),
            "next_billing_date": next_bill_dt.isoformat() if next_bill_dt else None,
            "is_trial": bool(best_txn.get("is_trial", False)),
            "is_override": False,
        }

    # 4. Profile fallback (manual grants, legacy Flutterwave/referral rows)
    if profile:
        prof_tier = (profile.get("subscription_tier") or profile.get("subscription") or "free").lower()
        prof_status = (profile.get("subscription_status") or "").lower()
        prof_exp = parse_utc_datetime(profile.get("subscription_expiry"))

        if prof_tier in ("premium", "vip") and prof_status not in ("inactive", "expired", "revoked", "refunded"):
            if prof_exp is None and prof_status == "active":
                return {
                    "tier": prof_tier,
                    "is_active": True,
                    "status": "active",
                    "platform": profile.get("subscription_platform") or "manual",
                    "source": profile.get("subscription_platform") or "manual",
                    "product_id": profile.get("subscription_product_id"),
                    "expiry_date": None,
                    "auto_renew": bool(profile.get("subscription_auto_renew", False)),
                    "renewal_provider": None,
                    "next_billing_date": None,
                    "is_trial": bool(profile.get("subscription_is_trial", False)),
                    "is_override": False,
                }
            if prof_exp is not None and prof_exp > now:
                return {
                    "tier": prof_tier,
                    "is_active": True,
                    "status": prof_status or "active",
                    "platform": profile.get("subscription_platform") or "manual",
                    "source": profile.get("subscription_platform") or "manual",
                    "product_id": profile.get("subscription_product_id"),
                    "expiry_date": prof_exp.isoformat(),
                    "auto_renew": bool(profile.get("subscription_auto_renew", False)),
                    "renewal_provider": None,
                    "next_billing_date": None,
                    "is_trial": bool(profile.get("subscription_is_trial", False)),
                    "is_override": False,
                }

    return {
        "tier": "free",
        "is_active": False,
        "status": "inactive",
        "platform": None,
        "source": None,
        "product_id": None,
        "expiry_date": None,
        "auto_renew": False,
        "renewal_provider": None,
        "next_billing_date": None,
        "is_trial": False,
        "is_override": False,
    }


async def get_effective_subscription(
    user_or_id: Union[dict, Any, str],
    *,
    user_role: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> str:
    """Return effective subscription tier ('free' | 'premium' | 'vip') for dict, User, or user_id."""
    details = await resolve_subscription_details(user_or_id, user_role=user_role, is_admin=is_admin)
    return details["tier"]


async def get_effective_expiry(user_id: str, profile: Optional[dict] = None) -> Optional[datetime]:
    """Return latest active expiry datetime across iap_transactions, overrides, and profile."""
    now = datetime.now(timezone.utc)
    candidates: list[datetime] = []

    if profile is None and user_id:
        profile = await fetch_profile(user_id)

    if profile:
        prof_exp = parse_utc_datetime(profile.get("subscription_expiry"))
        if prof_exp and prof_exp > now:
            candidates.append(prof_exp)

    if user_id:
        active_txns = await db.iap_transactions.find(
            {"user_id": user_id, "status": {"$in": ["active", "billing_issue"]}},
            {"expiry_date": 1},
        ).to_list(20)
        for txn in active_txns:
            exp = parse_utc_datetime(txn.get("expiry_date"))
            if exp and exp > now:
                candidates.append(exp)

    return max(candidates) if candidates else None


async def sync_profile_subscription(
    user_id: str,
    *,
    tier: str,
    status: str,
    expiry: Optional[Union[datetime, str]] = None,
    platform: Optional[str] = None,
    product_id: Optional[str] = None,
    auto_renew: bool = False,
    is_trial: bool = False,
    activated_at: Optional[Union[datetime, str]] = None,
    profile: Optional[dict] = None,
) -> bool:
    """
    Synchronize subscription columns on public.profiles while strictly preserving
    admin / super_admin roles so billing events can NEVER demote an admin.
    """
    if profile is None:
        profile = await fetch_profile(user_id)
    if not profile:
        logger.warning("[Subscription] sync_profile_subscription: profile not found for %s", user_id)
        return False

    normalized_tier = (tier or "free").lower()
    if normalized_tier not in ("free", "premium", "vip"):
        normalized_tier = "free"

    now = datetime.now(timezone.utc)
    exp_dt = parse_utc_datetime(expiry)

    payload: dict[str, Any] = {
        "subscription": normalized_tier,
        "subscription_tier": normalized_tier,
        "subscription_status": status,
        "subscription_expiry": exp_dt.isoformat() if exp_dt else None,
        "subscription_auto_renew": bool(auto_renew),
        "subscription_is_trial": bool(is_trial),
        "updated_at": now.isoformat(),
    }
    if platform is not None:
        payload["subscription_platform"] = platform
    if product_id is not None:
        payload["subscription_product_id"] = product_id
    if activated_at is not None:
        act_dt = parse_utc_datetime(activated_at)
        payload["activated_at"] = act_dt.isoformat() if act_dt else activated_at

    # NEVER overwrite role if user is an admin or super_admin!
    if not _is_admin_profile(profile):
        payload["role"] = normalized_tier

    return await update_profile(user_id, payload)

"""
core/dependencies.py — FastAPI request-level dependencies (Depends).
get_current_user, require_auth, require_admin, require_super_admin.
"""
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends

from models.enums import UserRole
from models.schemas import User
from services.auth import is_super_admin
from supabase_auth import get_supabase_user, fetch_profile

logger = logging.getLogger(__name__)


def _normalize_admin_role(raw_admin_role: Optional[str]) -> Optional[str]:
    """Map legacy Postgres enum values ('fund_manager') to Python AdminRole values."""
    if not raw_admin_role:
        return None
    if raw_admin_role == "fund_manager":
        return "fund_admin"
    return raw_admin_role


async def _resolve_authenticated_profile(authorization: Optional[str]) -> tuple[Optional[dict], str, Optional[str]]:
    """
    Internal helper returning (profile, email, auth_error).
    auth_error is:
      - "unauthenticated" if header is missing/invalid/no profile
      - "deactivated" if account_status is 'deactivated' or 'deleted'
      - None if active and valid
    """
    if not authorization:
        return None, "", "unauthenticated"

    token = authorization.replace("Bearer ", "", 1) if authorization.startswith("Bearer ") else authorization
    try:
        claims = await get_supabase_user(token)
    except Exception:
        return None, "", "unauthenticated"

    user_id = claims.get("sub")
    if not user_id:
        return None, "", "unauthenticated"

    profile = await fetch_profile(user_id)
    if not profile:
        return None, "", "unauthenticated"

    account_status = (profile.get("account_status") or "active").lower()
    if account_status in ("deactivated", "deleted"):
        return profile, claims.get("email", ""), "deactivated"

    return profile, claims.get("email", ""), None


def _build_user_from_profile(profile: dict, email: str) -> User:
    raw_role = profile.get("role", "free")
    admin_role = _normalize_admin_role(profile.get("admin_role"))
    admin_enabled = profile.get("admin_enabled", True)

    return User(
        user_id=profile["id"],
        name=profile.get("name", ""),
        email=email,
        role=raw_role,
        admin_role=admin_role,
        admin_enabled=admin_enabled,
        ai_weekly_used=profile.get("ai_weekly_used", 0),
        ai_weekly_reset=profile.get("ai_weekly_reset"),
        notification_preferences=profile.get("notification_preferences", {"signals": True, "community": True}),
        created_at=profile.get("created_at", datetime.now(timezone.utc)),
        picture=profile.get("picture"),
    )


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    """Decode Supabase JWT and return User from profiles table. Returns None if unauthenticated or deactivated."""
    profile, email, auth_error = await _resolve_authenticated_profile(authorization)
    if auth_error or not profile:
        return None
    return _build_user_from_profile(profile, email)


async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    """Require an active authenticated Supabase session. Raises 401/403 otherwise."""
    profile, email, auth_error = await _resolve_authenticated_profile(authorization)
    if auth_error == "deactivated":
        raise HTTPException(status_code=403, detail="Account has been deactivated")
    if auth_error or not profile:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _build_user_from_profile(profile, email)


async def require_admin(authorization: Optional[str] = Header(None)) -> User:
    """Require an authenticated admin or super_admin. Raises 403 if not admin."""
    user = await require_auth(authorization)
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    has_admin_role = role_val in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value, "admin", "super_admin") or bool(user.admin_role)
    if not has_admin_role:
        raise HTTPException(status_code=403, detail="Admin access required")
    if not user.admin_enabled:
        raise HTTPException(status_code=403, detail="Admin account is disabled")
    return user


async def require_super_admin(authorization: Optional[str] = Header(None)) -> User:
    """Require SUPER_ADMIN role. Rejects all other roles with 403."""
    user = await require_admin(authorization)
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return user


def require_permission(resource: str, action: str):
    """Factory for permission-checking dependencies"""
    from services.auth import has_permission

    async def checker(admin: User = Depends(require_admin)):
        if not has_permission(admin, resource, action):
            raise HTTPException(
                status_code=403,
                detail=f"No permission: {action} on {resource}"
            )
        return admin
    return checker

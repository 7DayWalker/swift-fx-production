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


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    """Decode Supabase JWT and return User from profiles table. Returns None if unauthenticated."""
    if not authorization:
        return None

    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    try:
        claims = await get_supabase_user(token)
    except Exception:
        return None

    user_id = claims.get("sub")
    if not user_id:
        return None

    profile = await fetch_profile(user_id)
    if not profile:
        return None

    email = claims.get("email", "")
    return User(
        user_id=profile["id"],
        name=profile.get("name", ""),
        email=email,
        role=profile.get("role", "free"),
        admin_role=profile.get("admin_role"),
        admin_enabled=profile.get("admin_enabled", True),
        ai_weekly_used=profile.get("ai_weekly_used", 0),
        ai_weekly_reset=profile.get("ai_weekly_reset"),
        notification_preferences=profile.get("notification_preferences", {"signals": True, "community": True}),
        created_at=profile.get("created_at", datetime.now(timezone.utc)),
        picture=profile.get("picture"),
    )


async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    """Require a valid Supabase session. Raises 401 if not authenticated."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(authorization: Optional[str] = Header(None)) -> User:
    """Require an authenticated admin or super_admin. Raises 403 if not admin."""
    user = await require_auth(authorization)
    if user.role not in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value, 'admin', 'super_admin'):
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

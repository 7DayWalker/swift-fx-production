"""
services/auth.py — Pure auth / RBAC helper functions.
These are NOT FastAPI dependencies — they are plain functions
used by dependencies and routes alike.
"""
import logging
from models.enums import UserRole, AdminRole
from models.schemas import User
from core.config import PROTECTED_SUPER_ADMINS, ADMIN_PERMISSIONS

logger = logging.getLogger(__name__)

_ADMIN_USER_ROLES = {UserRole.ADMIN, UserRole.SUPER_ADMIN, "admin", "super_admin"}


def is_super_admin(user: User) -> bool:
    """Check if user is a Super Admin (supports both role='super_admin' and role='admin'+admin_role='super_admin')."""
    if not user or not user.admin_enabled:
        return False
    if user.role == UserRole.SUPER_ADMIN or str(user.role) == "super_admin":
        return True
    return user.role in _ADMIN_USER_ROLES and user.admin_role == AdminRole.SUPER_ADMIN


def is_protected_super_admin(email: str) -> bool:
    """Check if email belongs to a protected Super Admin."""
    if not email:
        return False
    return email.lower() in [e.lower() for e in PROTECTED_SUPER_ADMINS]


def has_permission(user: User, resource: str, action: str) -> bool:
    """Check if admin user has permission for resource/action."""
    if not user or user.role not in _ADMIN_USER_ROLES:
        return False
    if not user.admin_enabled:
        return False

    if is_super_admin(user):
        return True

    if user.admin_role is None:
        return False

    role_permissions = ADMIN_PERMISSIONS.get(user.admin_role, {})
    resource_actions = role_permissions.get(resource, [])
    return action in resource_actions

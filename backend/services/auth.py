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


def is_super_admin(user: User) -> bool:
    """Check if user is a Super Admin"""
    return user.role == UserRole.ADMIN and user.admin_role == AdminRole.SUPER_ADMIN


def is_protected_super_admin(email: str) -> bool:
    """Check if email belongs to a protected Super Admin"""
    return email.lower() in [e.lower() for e in PROTECTED_SUPER_ADMINS]


def has_permission(user: User, resource: str, action: str) -> bool:
    """Check if admin user has permission for resource/action"""
    if user.role != UserRole.ADMIN:
        return False
    if not user.admin_enabled:
        return False
    if user.admin_role is None:
        return False

    if user.admin_role == AdminRole.SUPER_ADMIN:
        return True

    role_permissions = ADMIN_PERMISSIONS.get(user.admin_role, {})
    resource_actions = role_permissions.get(resource, [])
    return action in resource_actions

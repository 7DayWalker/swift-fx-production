"""
services/admin.py — Admin helper functions: audit logging, notifications.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from core.database import db
from models.enums import AdminRole

logger = logging.getLogger(__name__)


async def log_admin_action(
    admin_id: str,
    admin_role: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict = None
):
    """Log an admin action for audit trail"""
    log_entry = {
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "admin_id": admin_id,
        "admin_role": admin_role,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(log_entry)
    logger.info(f"[Audit] {admin_role} {admin_id}: {action} on {resource_type}/{resource_id}")


async def create_admin_notification(
    target_roles: List[AdminRole],
    notification_type: str,
    title: str,
    message: str,
    resource_id: str = None
):
    """Create notification for specific admin roles"""
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "target_roles": [r.value for r in target_roles],
        "notification_type": notification_type,
        "title": title,
        "message": message,
        "resource_id": resource_id,
        "read_by": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_notifications.insert_one(notification)
    logger.info(f"[Notification] {notification_type}: {title} -> {[r.value for r in target_roles]}")

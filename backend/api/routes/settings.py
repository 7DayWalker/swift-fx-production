"""
api/routes/settings.py — User settings, profile, notifications, admin user settings.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from enum import Enum

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.dependencies import require_auth, require_admin, require_super_admin
from models.schemas import User
from models.enums import AccountStatus, AdminRole, TicketStatus, UserRole
from services.subscription import get_effective_subscription
from services.admin import log_admin_action, create_admin_notification
from services.auth import is_protected_super_admin, is_super_admin
from supabase_auth import (
    fetch_profile,
    update_profile,
    update_auth_user,
    verify_user_password,
    delete_profile,
    delete_auth_user,
    get_auth_user_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

class AccountStatus(str, Enum):
    ACTIVE = "active"
    DEACTIVATED = "deactivated"
    DELETED = "deleted"

# Settings Models
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    picture: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class NotificationPreferencesUpdate(BaseModel):
    push_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    signals: Optional[bool] = None
    fund_updates: Optional[bool] = None
    referral_rewards: Optional[bool] = None
    support_replies: Optional[bool] = None

class AccountDeactivateRequest(BaseModel):
    reason: Optional[str] = None

# Static Legal Content
LEGAL_CONTENT = {
    "privacy_policy": {
        "title": "Privacy Policy",
        "last_updated": "2025-01-01",
        "content": """
**Swift FX Signals Privacy Policy**

**1. Information We Collect**
We collect information you provide directly to us, including:
- Account information (name, email, phone number)
- Trading preferences and history within the app
- Device information for push notifications
- Usage data to improve our services

**2. How We Use Your Information**
We use the information to:
- Provide and maintain our trading signal services
- Send you notifications about new signals and updates
- Process your subscription and payments
- Improve and personalize your experience
- Communicate with you about support inquiries

**3. Information Sharing**
We do not sell your personal information. We may share information with:
- Service providers who assist in our operations
- Legal authorities when required by law
- Third parties with your explicit consent

**4. Data Security**
We implement industry-standard security measures to protect your data, including encryption and secure servers.

**5. Your Rights**
You have the right to:
- Access your personal data
- Request correction of inaccurate data
- Request deletion of your data
- Opt-out of marketing communications

**6. Contact Us**
For privacy inquiries, contact us at support@swiftfx.online
        """
    },
    "terms_of_service": {
        "title": "Terms of Service",
        "last_updated": "2025-01-01",
        "content": """
**Swift FX Signals Terms of Service**

**1. Acceptance of Terms**
By using Swift FX Signals, you agree to these Terms of Service. If you disagree with any part, you may not use our services.

**2. Service Description**
Swift FX Signals provides trading signals, market analysis, and educational content for Forex, Gold, and Cryptocurrency markets.

**3. Account Responsibilities**
- You must provide accurate account information
- You are responsible for maintaining account security
- You must be at least 18 years old to use our services
- One account per person; sharing accounts is prohibited

**4. Subscription and Payments**
- Subscription fees are billed according to your chosen plan
- Refunds are provided per our refund policy
- We may modify pricing with 30 days notice

**5. Trading Disclaimer**
- Our signals are for informational purposes only
- Past performance does not guarantee future results
- You are solely responsible for your trading decisions
- Never trade with money you cannot afford to lose

**6. Prohibited Activities**
- Sharing signals with non-subscribers
- Attempting to reverse-engineer our systems
- Using our service for illegal purposes
- Harassment of other users or staff

**7. Termination**
We may terminate accounts that violate these terms without refund.

**8. Limitation of Liability**
Swift FX Signals is not liable for any trading losses or damages resulting from the use of our services.

**9. Changes to Terms**
We may update these terms at any time. Continued use constitutes acceptance.

**10. Contact**
Questions about these terms: support@swiftfx.online
        """
    },
    "risk_disclaimer": {
        "title": "Risk Disclaimer",
        "last_updated": "2025-01-01",
        "content": """
**Swift FX Signals Risk Disclaimer**

**IMPORTANT: Please read this disclaimer carefully before using our services.**

**1. High-Risk Investment Warning**
Trading Forex, Gold, Cryptocurrencies, and other financial instruments carries a HIGH LEVEL OF RISK and may not be suitable for all investors. You should carefully consider your investment objectives, level of experience, and risk appetite.

**2. No Guarantee of Profits**
- Past performance of our signals is NOT indicative of future results
- There is NO GUARANTEE that you will make profits
- You may lose some or ALL of your invested capital
- Only trade with funds you can afford to lose entirely

**3. Educational Purpose**
Our signals and analysis are provided for EDUCATIONAL and INFORMATIONAL purposes only. They should not be construed as:
- Personalized investment advice
- Recommendations to buy or sell any financial instrument
- Promises of specific returns

**4. Your Responsibility**
- You are solely responsible for your trading decisions
- You should conduct your own research before trading
- Consider consulting a licensed financial advisor
- Understand the risks before opening any position

**5. Leverage Risk**
Forex and CFD trading often involves leverage, which can:
- Amplify both profits AND losses
- Result in losing more than your initial deposit
- Lead to margin calls and forced liquidation

**6. Market Volatility**
Financial markets are highly volatile. Prices can move rapidly due to:
- Economic news and events
- Political developments
- Market sentiment changes
- Technical factors

**7. Third-Party Broker Risk**
We are not responsible for:
- Actions or failures of third-party brokers
- Execution quality or slippage
- Broker insolvency or fraud

**8. Acknowledgment**
By using Swift FX Signals, you acknowledge that:
- You understand the risks involved in trading
- You accept full responsibility for your trading decisions
- You will not hold Swift FX liable for any losses

**For questions about risk, contact: support@swiftfx.online**
        """
    }
}

# ==================== USER SETTINGS ENDPOINTS ====================

@router.get("/settings/profile")
async def get_user_profile(current_user: User = Depends(require_auth)):
    """Get current user's profile information with unified subscription state."""
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    role_val = user_doc.get("role", "free")
    is_admin_flag = role_val in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value, "admin", "super_admin")
    effective_sub = await get_effective_subscription(
        current_user.user_id,
        user_role=role_val,
        is_admin=is_admin_flag,
    )

    return {
        "user_id": user_doc["id"],
        "name": user_doc.get("name", ""),
        "email": current_user.email,
        "phone": user_doc.get("phone", "") or "",
        "role": role_val,
        "subscription": effective_sub,
        "subscription_expiry": user_doc.get("subscription_expiry"),
        "admin_role": user_doc.get("admin_role"),
        "is_admin": is_admin_flag,
        "account_status": user_doc.get("account_status", "active"),
        "created_at": user_doc.get("created_at"),
        "last_login": user_doc.get("last_login"),
        "picture": user_doc.get("picture"),
    }

@router.put("/settings/profile")
async def update_user_profile(
    update: ProfileUpdate,
    current_user: User = Depends(require_auth)
):
    """Update user profile (name, phone, picture)"""
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.name is not None:
        if len(update.name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        update_data["name"] = update.name.strip()
    
    if update.phone is not None:
        phone_clean = update.phone.strip()
        if len(phone_clean) > 30:
            raise HTTPException(status_code=400, detail="Phone number is too long")
        update_data["phone"] = phone_clean

    if update.picture is not None:
        picture_value = update.picture.strip()
        update_data["picture"] = picture_value if picture_value else None
    
    ok = await update_profile(current_user.user_id, update_data)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to update profile")
    
    logger.info(f"[Settings] User {current_user.user_id} updated profile")
    
    return {"success": True, "message": "Profile updated successfully"}

@router.put("/settings/password")
async def change_password(
    password_change: PasswordChange,
    current_user: User = Depends(require_auth)
):
    """Change user password after verifying current_password."""
    if len(password_change.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    # Verify current_password before allowing password overwrite (prevents session-steal takeover)
    is_valid_current = await verify_user_password(current_user.email, password_change.current_password)
    if not is_valid_current:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    success = await update_auth_user(current_user.user_id, {"password": password_change.new_password})
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")
    
    logger.info(f"[Settings] User {current_user.user_id} changed password")
    
    return {"success": True, "message": "Password changed successfully"}

@router.get("/settings/notifications")
async def get_notification_preferences(current_user: User = Depends(require_auth)):
    """Get user notification preferences"""
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Default preferences
    default_prefs = {
        "push_enabled": True,
        "email_enabled": True,
        "signals": True,
        "fund_updates": True,
        "referral_rewards": True,
        "support_replies": True,
    }
    
    prefs = user_doc.get("notification_preferences", default_prefs)
    
    # Merge with defaults for any missing keys
    for key, value in default_prefs.items():
        if key not in prefs:
            prefs[key] = value
    
    return {"preferences": prefs}

@router.put("/settings/notifications")
async def update_notification_preferences(
    update: NotificationPreferencesUpdate,
    current_user: User = Depends(require_auth)
):
    """Update notification preferences"""
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current preferences
    current_prefs = user_doc.get("notification_preferences", {
        "push_enabled": True,
        "email_enabled": True,
        "signals": True,
        "fund_updates": True,
        "referral_rewards": True,
        "support_replies": True,
    })
    
    # Update only provided fields
    if update.push_enabled is not None:
        current_prefs["push_enabled"] = update.push_enabled
    if update.email_enabled is not None:
        current_prefs["email_enabled"] = update.email_enabled
    if update.signals is not None:
        current_prefs["signals"] = update.signals
    if update.fund_updates is not None:
        current_prefs["fund_updates"] = update.fund_updates
    if update.referral_rewards is not None:
        current_prefs["referral_rewards"] = update.referral_rewards
    if update.support_replies is not None:
        current_prefs["support_replies"] = update.support_replies
    
    await update_profile(current_user.user_id, {"notification_preferences": current_prefs})
    
    logger.info(f"[Settings] User {current_user.user_id} updated notification preferences")
    
    return {"success": True, "message": "Notification preferences updated", "preferences": current_prefs}

@router.get("/settings/legal/{document_type}")
async def get_legal_document(document_type: str):
    """Get legal document content (public endpoint)"""
    if document_type not in LEGAL_CONTENT:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return LEGAL_CONTENT[document_type]

@router.post("/settings/deactivate")
async def deactivate_account(
    request: Optional[AccountDeactivateRequest] = None,
    current_user: User = Depends(require_auth)
):
    """Deactivate user account (soft delete) and disable active push tokens."""
    if is_protected_super_admin(current_user.email):
        raise HTTPException(status_code=403, detail="Protected admin accounts cannot be deactivated")
    
    await update_profile(current_user.user_id, {
        "account_status": AccountStatus.DEACTIVATED.value,
        "deactivated_at": datetime.now(timezone.utc).isoformat(),
        "deactivation_reason": request.reason if request else None,
    })
    await db.device_tokens.update_many(
        {"user_id": current_user.user_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    
    logger.info(f"[Settings] User {current_user.user_id} deactivated account")
    
    return {"success": True, "message": "Account deactivated. Contact support@swiftfx.online to reactivate."}

@router.post("/settings/delete-request")
async def request_account_deletion(
    current_user: User = Depends(require_auth)
):
    """Submit account deletion request (creates a support ticket)"""
    # Prevent protected admin deletion
    if is_protected_super_admin(current_user.email):
        raise HTTPException(status_code=403, detail="Protected admin accounts cannot be deleted")
    
    # Create a support ticket for account deletion
    ticket_id = f"TKT-DEL-{uuid.uuid4().hex[:6].upper()}"
    
    ticket_doc = {
        "ticket_id": ticket_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "user_email": current_user.email,
        "category": "other",
        "subject": "Account Deletion Request",
        "message": f"User {current_user.name} ({current_user.email}) has requested account deletion. Please process this request according to our data retention policy.",
        "status": TicketStatus.OPEN.value,
        "is_deletion_request": True,
        "replies": [],
        "admin_notes": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.support_tickets.insert_one(ticket_doc)
    
    # Notify admins
    await create_admin_notification(
        target_roles=[AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT],
        notification_type="account_deletion_request",
        title="Account Deletion Request",
        message=f"User {current_user.name} requested account deletion",
        resource_id=ticket_id
    )
    
    logger.info(f"[Settings] User {current_user.user_id} requested account deletion (ticket: {ticket_id})")
    
    return {
        "success": True,
        "message": "Account deletion request submitted. Our team will process your request within 30 days.",
        "ticket_id": ticket_id
    }

@router.delete("/settings/account")
async def delete_own_account(
    current_user: User = Depends(require_auth),
):
    """
    Permanently delete the authenticated user's account and personal data.
    Satisfies Apple App Store Review Guideline 5.1.1(v) and Google Play User Data Policy.
    """
    if is_protected_super_admin(current_user.email) or is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Super Admin accounts cannot be self-deleted")

    uid = current_user.user_id
    now_iso = datetime.now(timezone.utc).isoformat()

    # Clean up personal/user-scoped collections in MongoDB
    await db.device_tokens.delete_many({"user_id": uid})
    await db.journals.delete_many({"user_id": uid})
    await db.ai_analyses.delete_many({"user_id": uid})
    await db.academy_progress.delete_many({"user_id": uid})
    await db.user_streaks.delete_many({"user_id": uid})
    await db.insight_likes.delete_many({"user_id": uid})
    await db.insight_comments.delete_many({"user_id": uid})
    await db.posts.delete_many({"user_id": uid})
    await db.comments.delete_many({"user_id": uid})
    await db.subscription_overrides.delete_many({"user_id": uid})

    # Anonymize billing/audit records that must remain for financial reconciliation
    await db.iap_transactions.update_many(
        {"user_id": uid},
        {"$set": {"account_deleted_at": now_iso}},
    )
    await db.payment_transactions.update_many(
        {"user_id": uid},
        {"$set": {"user_email": "[deleted]", "account_deleted_at": now_iso}},
    )

    # Delete Supabase profile & GoTrue Auth account
    await delete_profile(uid)
    auth_deleted = await delete_auth_user(uid)
    if not auth_deleted:
        logger.warning(f"[Settings] delete_auth_user returned False for {uid}")

    logger.info(f"[Settings] Permanently deleted account for user {uid}")
    return {
        "success": True,
        "message": "Your account and personal data have been permanently deleted.",
    }

@router.get("/settings/sessions")
async def get_user_sessions(current_user: User = Depends(require_auth)):
    """Get user session information (prepared for multi-device control)"""
    user_doc = await fetch_profile(current_user.user_id) or {}
    
    return {
        "current_session": {
            "last_login": user_doc.get("last_login"),
            "login_ip": user_doc.get("last_login_ip"),
        },
        "multi_device_enabled": False,
        "active_sessions": 1,
    }

# ==================== ADMIN USER SETTINGS ENDPOINTS ====================

@router.get("/admin/users/{user_id}/settings")
async def admin_get_user_settings(
    user_id: str,
    admin: User = Depends(require_admin)
):
    """Get a user's settings (read-only for admins)"""
    user_doc = await fetch_profile(user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove sensitive fields
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    
    return {
        "user": user_doc,
        "notification_settings": user_doc.get("notification_preferences", {}),
        "account_status": user_doc.get("account_status", "active"),
    }

@router.post("/admin/users/{user_id}/deactivate")
async def admin_deactivate_user(
    user_id: str,
    reason: str,
    admin: User = Depends(require_super_admin)
):
    """Force deactivate a user account. Super Admin only."""
    user_doc = await fetch_profile(user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_email = await get_auth_user_email(user_id) or user_doc.get("email", "")
    if is_protected_super_admin(target_email):
        raise HTTPException(status_code=403, detail="Cannot deactivate protected Super Admin accounts")
    
    await update_profile(user_id, {
        "account_status": AccountStatus.DEACTIVATED.value,
        "deactivated_at": datetime.now(timezone.utc).isoformat(),
        "deactivated_by": admin.user_id,
        "deactivation_reason": reason,
    })
    await db.device_tokens.update_many(
        {"user_id": user_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "super_admin",
        "deactivate_user",
        "user",
        user_id,
        {"reason": reason}
    )
    
    logger.info(f"[Admin] Super Admin {admin.user_id} deactivated user {user_id}")
    
    return {"success": True, "message": "User account deactivated"}

@router.post("/admin/users/{user_id}/restore")
async def admin_restore_user(
    user_id: str,
    admin: User = Depends(require_super_admin)
):
    """Restore a deactivated user account. Super Admin only."""
    user_doc = await fetch_profile(user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_doc.get("account_status") == AccountStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Account is already active")
    
    await update_profile(user_id, {
        "account_status": AccountStatus.ACTIVE.value,
        "restored_at": datetime.now(timezone.utc).isoformat(),
        "restored_by": admin.user_id,
    })
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "super_admin",
        "restore_user",
        "user",
        user_id,
        {}
    )
    
    logger.info(f"[Admin] Super Admin {admin.user_id} restored user {user_id}")
    
    return {"success": True, "message": "User account restored"}


# ==============================================================================

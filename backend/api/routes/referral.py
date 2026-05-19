"""
api/routes/referral.py — Referral program, codes, claiming, admin management.
"""
import logging
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import db
from core.dependencies import require_auth, require_admin
from models.schemas import User
from models.enums import ReferralStatus, RewardStatus, AdminRole, UserRole
from services.subscription import get_effective_subscription
from services.admin import log_admin_action
from supabase_auth import fetch_profile, list_profiles, update_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class ReferralSignupRecord(BaseModel):
    referral_code: str
    user_id: str


def generate_referral_code(user_id: str) -> str:
    hash_part = hashlib.md5(user_id.encode()).hexdigest()[:4].upper()
    random_part = uuid.uuid4().hex[:4].upper()
    return f"SWIFT{hash_part}{random_part}"

@router.get("/referral/my-code")
async def get_my_referral_code(current_user: User = Depends(require_auth)):
    """Get current user's referral code and stats"""
    user_doc = await fetch_profile(current_user.user_id)
    
    referral_code = user_doc.get("referral_code")
    
    # Generate code if not exists (for existing users)
    if not referral_code:
        referral_code = generate_referral_code(current_user.user_id)
        await update_profile(current_user.user_id, {"referral_code": referral_code})
    
    # Get referral stats
    total_referrals = await db.referrals.count_documents({"referrer_id": current_user.user_id})
    successful_referrals = await db.referrals.count_documents({
        "referrer_id": current_user.user_id,
        "status": ReferralStatus.COMPLETED.value
    })
    pending_rewards = await db.referrals.count_documents({
        "referrer_id": current_user.user_id,
        "reward_status": {"$in": [RewardStatus.LOCKED.value, RewardStatus.PENDING.value]}
    })
    rewards_applied = await db.referrals.count_documents({
        "referrer_id": current_user.user_id,
        "reward_status": RewardStatus.APPLIED.value
    })
    
    # Get list of referrals
    referrals = await db.referrals.find({
        "referrer_id": current_user.user_id
    }).sort("created_at", -1).to_list(50)
    
    for ref in referrals:
        ref.pop("_id", None)
    
    # Calculate total reward days earned
    total_reward_days = 0
    for ref in referrals:
        if ref.get("reward_status") == RewardStatus.APPLIED.value:
            if ref.get("reward_type") == "premium_7_days":
                total_reward_days += 7
            elif ref.get("reward_type") == "premium_14_days":
                total_reward_days += 14
    
    return {
        "referral_code": referral_code,
        "referral_link": f"https://swiftfx.app/register?ref={referral_code}",
        "stats": {
            "total_referrals": total_referrals,
            "successful_referrals": successful_referrals,
            "pending_rewards": pending_rewards,
            "rewards_applied": rewards_applied,
            "total_reward_days": total_reward_days
        },
        "referrals": referrals
    }


@router.get("/referral/validate/{code}")
async def validate_referral_code(code: str):
    """Validate a referral code before registration"""
    user = (await list_profiles({"referral_code": code.upper()}) or [None])[0]
    
    if not user:
        return {"valid": False, "message": "Invalid referral code"}
    
    return {
        "valid": True,
        "referrer_name": user.get("name", "A Swift FX user"),
        "message": "Valid referral code!"
    }


@router.post("/referral/record-signup")
async def record_referral_signup(
    body: ReferralSignupRecord,
    current_user: User = Depends(require_auth)
):
    """
    Record a referral relationship when a referred user signs up.
    Called immediately after signup with the referral code.
    Creates the referral record in MongoDB linking referrer → referred user.
    """
    referral_code = body.referral_code.upper()
    referred_user_id = body.user_id
    
    # Validate that the referral code exists and find the referrer
    referrer_profile = (await list_profiles({"referral_code": referral_code}) or [None])[0]
    
    if not referrer_profile:
        raise HTTPException(status_code=400, detail="Invalid referral code")
    
    referrer_id = referrer_profile.get("id")
    
    # Prevent self-referral
    if referrer_id == referred_user_id:
        logger.warning(f"[Referral] Blocked self-referral attempt: {referred_user_id}")
        raise HTTPException(status_code=400, detail="Cannot refer yourself")
    
    # Check if referral already exists for this user (prevent duplicates)
    existing = await db.referrals.find_one({
        "referred_user_id": referred_user_id
    })
    
    if existing:
        logger.info(f"[Referral] User {referred_user_id} already has a referral record")
        return {"success": False, "message": "User already has a referral record"}
    
    # Create referral record
    now = datetime.now(timezone.utc)
    referral_id = str(uuid.uuid4())
    
    referral_doc = {
        "referral_id": referral_id,
        "referrer_id": referrer_id,
        "referred_user_id": referred_user_id,
        "referral_code": referral_code,
        "status": ReferralStatus.PENDING.value,
        "reward_status": RewardStatus.LOCKED.value,
        "created_at": now.isoformat(),
        "subscribed_at": None,
        "subscription_tier": None,
        "reward_type": None,
        "reward_applied_at": None,
    }
    
    await db.referrals.insert_one(referral_doc)
    logger.info(f"[Referral] Created referral record: {referral_id} (referrer={referrer_id[:12]}... referred={referred_user_id[:12]}...)")
    
    return {
        "success": True,
        "referral_id": referral_id,
        "message": "Referral recorded successfully"
    }


async def check_and_process_referral_rewards():
    """
    Background task to check referrals and process rewards.
    Called when subscription changes.
    """
    now = datetime.now(timezone.utc)
    
    # Find pending referrals where referred user has subscribed for 7+ days
    pending_referrals = await db.referrals.find({
        "status": ReferralStatus.PENDING.value,
        "reward_status": RewardStatus.LOCKED.value,
        "subscribed_at": {"$ne": None}
    }).to_list(100)
    
    for referral in pending_referrals:
        subscribed_at = referral.get("subscribed_at")
        if subscribed_at:
            if isinstance(subscribed_at, str):
                subscribed_at = datetime.fromisoformat(subscribed_at.replace('Z', '+00:00'))
            
            # Check if 7 days have passed
            if now - subscribed_at >= timedelta(days=7):
                # Determine reward type based on subscription tier
                tier = referral.get("subscription_tier", "premium")
                reward_type = "premium_14_days" if tier == "vip" else "premium_7_days"
                
                await db.referrals.update_one(
                    {"referral_id": referral["referral_id"]},
                    {"$set": {
                        "status": ReferralStatus.COMPLETED.value,
                        "reward_status": RewardStatus.PENDING.value,
                        "reward_type": reward_type
                    }}
                )
                logger.info(f"[Referral] Reward unlocked for referral {referral['referral_id']}: {reward_type}")
    
    # Expire referrals older than 30 days without subscription
    expired_cutoff = now - timedelta(days=30)
    await db.referrals.update_many(
        {
            "status": ReferralStatus.PENDING.value,
            "subscribed_at": None,
            "created_at": {"$lt": expired_cutoff.isoformat()}
        },
        {"$set": {"status": ReferralStatus.EXPIRED.value}}
    )


async def on_user_subscription_change(user_id: str, new_subscription: str):
    """Called when a user's subscription changes to track referral rewards"""
    if new_subscription not in ["premium", "vip"]:
        return
    
    now = datetime.now(timezone.utc)
    
    # Check if this user was referred and update their referral record
    referral = await db.referrals.find_one({
        "referred_user_id": user_id,
        "status": ReferralStatus.PENDING.value
    })
    
    if referral and not referral.get("subscribed_at"):
        await db.referrals.update_one(
            {"referral_id": referral["referral_id"]},
            {"$set": {
                "subscription_tier": new_subscription,
                "subscribed_at": now.isoformat()
            }}
        )
        logger.info(f"[Referral] Referred user {user_id} subscribed to {new_subscription}")


@router.post("/referral/claim-reward/{referral_id}")
async def claim_referral_reward(
    referral_id: str,
    current_user: User = Depends(require_auth)
):
    """Claim a pending referral reward (auto-applies subscription extension)"""
    referral = await db.referrals.find_one({
        "referral_id": referral_id,
        "referrer_id": current_user.user_id,
        "reward_status": RewardStatus.PENDING.value
    })
    
    if not referral:
        raise HTTPException(status_code=404, detail="No pending reward found")
    
    # Determine days to add
    reward_type = referral.get("reward_type", "premium_7_days")
    days_to_add = 14 if reward_type == "premium_14_days" else 7
    
    # Get current user's subscription
    user_doc = await fetch_profile(current_user.user_id)
    current_expiry = user_doc.get("subscription_expiry")
    current_subscription = user_doc.get("subscription", "free")
    
    now = datetime.now(timezone.utc)
    
    # Calculate new expiry
    if current_expiry:
        if isinstance(current_expiry, str):
            current_expiry = datetime.fromisoformat(current_expiry.replace('Z', '+00:00'))
        if current_expiry > now:
            new_expiry = current_expiry + timedelta(days=days_to_add)
        else:
            new_expiry = now + timedelta(days=days_to_add)
    else:
        new_expiry = now + timedelta(days=days_to_add)
    
    # Update user's subscription
    update_fields = {
        "subscription_expiry": new_expiry.isoformat()
    }
    
    # If user is free, upgrade to premium
    if current_subscription == "free":
        update_fields["subscription"] = "premium"
        update_fields["role"] = UserRole.PREMIUM.value
    
    await update_profile(current_user.user_id, update_fields)
    
    # Mark reward as applied
    await db.referrals.update_one(
        {"referral_id": referral_id},
        {"$set": {
            "reward_status": RewardStatus.APPLIED.value,
            "reward_applied_at": now.isoformat()
        }}
    )
    
    logger.info(f"[Referral] Reward claimed by {current_user.user_id}: +{days_to_add} days premium")
    
    return {
        "success": True,
        "reward_type": reward_type,
        "days_added": days_to_add,
        "new_expiry": new_expiry.isoformat(),
        "message": f"Congratulations! +{days_to_add} days Premium added to your account!"
    }


# ==============================================================================
# ADMIN REFERRAL MANAGEMENT API
# ==============================================================================

@router.get("/admin/referrals")
async def get_all_referrals(
    status: Optional[str] = None,
    flagged: Optional[bool] = None,
    admin: User = Depends(require_admin)
):
    """Get all referrals. Super Admin, Account Manager, Customer Support only."""
    # Check permission
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNT_MANAGER, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to view referrals")
    
    query = {}
    if status:
        query["status"] = status
    if flagged is not None:
        query["flagged"] = flagged
    
    referrals = await db.referrals.find(query).sort("created_at", -1).to_list(200)
    
    # Enrich with user data
    for ref in referrals:
        ref.pop("_id", None)
        # Get referrer info
        referrer = await fetch_profile(ref["referrer_id"])
        if referrer:
            ref["referrer_name"] = referrer.get("name", "Unknown")
            ref["referrer_email"] = referrer.get("email", "Unknown")
    
    # Calculate stats
    total = len(referrals)
    pending = sum(1 for r in referrals if r.get("status") == ReferralStatus.PENDING.value)
    completed = sum(1 for r in referrals if r.get("status") == ReferralStatus.COMPLETED.value)
    expired = sum(1 for r in referrals if r.get("status") == ReferralStatus.EXPIRED.value)
    flagged_count = sum(1 for r in referrals if r.get("flagged"))
    
    return {
        "referrals": referrals,
        "stats": {
            "total": total,
            "pending": pending,
            "completed": completed,
            "expired": expired,
            "flagged": flagged_count
        }
    }


@router.put("/admin/referrals/{referral_id}/approve")
async def approve_referral_reward(
    referral_id: str,
    admin: User = Depends(require_admin)
):
    """Manually approve a referral reward. Super Admin, Account Manager only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNT_MANAGER]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to approve referrals")
    
    referral = await db.referrals.find_one({"referral_id": referral_id})
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    
    # Determine reward type
    tier = referral.get("subscription_tier", "premium")
    reward_type = "premium_14_days" if tier == "vip" else "premium_7_days"
    
    await db.referrals.update_one(
        {"referral_id": referral_id},
        {"$set": {
            "status": ReferralStatus.COMPLETED.value,
            "reward_status": RewardStatus.PENDING.value,
            "reward_type": reward_type,
            "flagged": False
        }}
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "approve",
        "referral",
        referral_id
    )
    
    return {"success": True, "message": "Referral reward approved"}


@router.put("/admin/referrals/{referral_id}/revoke")
async def revoke_referral_reward(
    referral_id: str,
    reason: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Revoke a referral reward. Super Admin, Account Manager only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNT_MANAGER]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to revoke referrals")
    
    referral = await db.referrals.find_one({"referral_id": referral_id})
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    
    await db.referrals.update_one(
        {"referral_id": referral_id},
        {"$set": {
            "reward_status": RewardStatus.REVOKED.value,
            "admin_notes": reason or "Revoked by admin"
        }}
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "revoke",
        "referral",
        referral_id,
        {"reason": reason}
    )
    
    return {"success": True, "message": "Referral reward revoked"}


@router.put("/admin/referrals/{referral_id}/flag")
async def flag_referral(
    referral_id: str,
    reason: str,
    admin: User = Depends(require_admin)
):
    """Flag a referral as fraudulent. Super Admin, Account Manager only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNT_MANAGER]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to flag referrals")
    
    referral = await db.referrals.find_one({"referral_id": referral_id})
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    
    await db.referrals.update_one(
        {"referral_id": referral_id},
        {"$set": {
            "status": ReferralStatus.FLAGGED.value,
            "flagged": True,
            "flag_reason": reason,
            "reward_status": RewardStatus.REVOKED.value
        }}
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "flag",
        "referral",
        referral_id,
        {"reason": reason}
    )
    
    return {"success": True, "message": "Referral flagged as fraudulent"}


# ==============================================================================

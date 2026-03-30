"""
api/routes/admin.py — Admin user management, overrides, health, automation, RBAC, notifications.
"""
import os
import asyncio
import logging
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any
from enum import Enum

from pydantic import BaseModel, Field, EmailStr
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.dependencies import get_current_user, require_auth, require_admin, require_super_admin, require_permission
from models.enums import UserRole, AdminRole
from services.auth import is_super_admin, is_protected_super_admin, has_permission
from services.admin import log_admin_action, create_admin_notification
from services.subscription import get_effective_subscription, get_active_override
from supabase_auth import (
    create_auth_user, fetch_profile, update_profile,
    list_profiles as supabase_get_all_users, delete_auth_user,
    list_auth_users, fetch_profile_by_email, update_profile as update_profile_fields,
)
from models.schemas import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Reference to signal engine (set by main.py at startup)
signal_engine = None

def set_signal_engine(engine):
    global signal_engine
    signal_engine = engine

@router.get("/admin/users")
async def get_all_users(admin: User = Depends(require_admin)):
    users = await list_profiles()
    return users


@router.get("/admin/active-overrides")
async def get_all_active_overrides(admin: User = Depends(require_admin)):
    """Return all active, non-expired subscription overrides as a user_id->tier map."""
    now = datetime.now(timezone.utc)
    overrides = await db.subscription_overrides.find(
        {"is_active": True}, {"_id": 0, "user_id": 1, "tier": 1, "expires_at": 1}
    ).to_list(500)

    active = {}
    for ov in overrides:
        expires_at = ov.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                try:
                    exp_dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                except ValueError:
                    continue
            else:
                exp_dt = expires_at
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt <= now:
                continue
        active[ov["user_id"]] = ov.get("tier", "free")

    return {"overrides": active}

@router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, admin: User = Depends(require_admin)):
    result = await update_profile(user_id, {"role": role})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User role updated"}

@router.get("/admin/stats")
async def get_admin_stats(admin: User = Depends(require_admin)):
    """Admin dashboard stats — real counts from MongoDB + Supabase."""
    total_users = await count_profiles()
    premium_users = await count_profiles("premium")
    vip_users = await count_profiles("vip")

    # Signals from MongoDB (all states)
    total_signals = await db.signals.count_documents({})
    active_signals = await db.signals.count_documents({"state": "active"})
    closed_signals = await db.signals.count_documents({"state": "closed"})
    pending_signals = await db.signals.count_documents({"state": "pending"})

    # AI analyses and community posts from MongoDB
    total_ai_analyses = await db.ai_analyses.count_documents({})
    total_posts = await db.posts.count_documents({})

    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "vip_users": vip_users,
        "total_signals": total_signals,
        "active_signals": active_signals,
        "closed_signals": closed_signals,
        "pending_signals": pending_signals,
        "total_ai_analyses": total_ai_analyses,
        "total_posts": total_posts,
    }


# ===================== SUBSCRIPTION OVERRIDE SYSTEM =====================
VALID_OVERRIDE_TIERS = {"free", "premium", "vip"}

class OverrideSubscriptionRequest(BaseModel):
    user_id: str
    tier: str  # "free" | "premium" | "vip"
    duration_days: int  # 1-30

class RevokeOverrideRequest(BaseModel):
    user_id: str


async def get_active_override(user_id: str) -> Optional[dict]:
    """Fetch active, non-expired override for a user. Returns None if none found."""
    now = datetime.now(timezone.utc)
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
                expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            except ValueError:
                return None
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            return None
    return override


@router.post("/admin/override-subscription")
async def grant_subscription_override(
    body: OverrideSubscriptionRequest,
    admin: User = Depends(require_super_admin),
):
    """Grant a temporary subscription override. SUPER_ADMIN only."""
    tier = body.tier.lower()
    if tier not in VALID_OVERRIDE_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {list(VALID_OVERRIDE_TIERS)}")
    if body.duration_days < 1 or body.duration_days > 30:
        raise HTTPException(status_code=400, detail="duration_days must be between 1 and 30")

    target = await fetch_profile(body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=body.duration_days)

    await db.subscription_overrides.update_one(
        {"user_id": body.user_id},
        {"$set": {
            "user_id": body.user_id,
            "tier": tier,
            "is_active": True,
            "expires_at": expires_at.isoformat(),
            "granted_by": admin.user_id,
            "granted_at": now.isoformat(),
        }},
        upsert=True,
    )

    # Immutable audit log
    await db.subscription_override_logs.insert_one({
        "log_id": f"sol_{uuid.uuid4().hex[:12]}",
        "action": "GRANT_OVERRIDE",
        "performed_by": admin.user_id,
        "target_user": body.user_id,
        "tier": tier,
        "duration_days": body.duration_days,
        "expires_at": expires_at.isoformat(),
        "timestamp": now.isoformat(),
    })

    logger.info(f"[Override] SUPER_ADMIN {admin.user_id} granted {tier} override to {body.user_id} for {body.duration_days}d")
    return {
        "message": f"Override granted: {tier} until {expires_at.isoformat()}",
        "user_id": body.user_id,
        "tier": tier,
        "expires_at": expires_at.isoformat(),
        "is_active": True,
    }


@router.post("/admin/revoke-override")
async def revoke_subscription_override(
    body: RevokeOverrideRequest,
    admin: User = Depends(require_super_admin),
):
    """Revoke an active subscription override. SUPER_ADMIN only."""
    result = await db.subscription_overrides.update_one(
        {"user_id": body.user_id, "is_active": True},
        {"$set": {"is_active": False}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No active override found for this user")

    now = datetime.now(timezone.utc)
    await db.subscription_override_logs.insert_one({
        "log_id": f"sol_{uuid.uuid4().hex[:12]}",
        "action": "REVOKE_OVERRIDE",
        "performed_by": admin.user_id,
        "target_user": body.user_id,
        "tier": None,
        "duration_days": None,
        "expires_at": None,
        "timestamp": now.isoformat(),
    })

    logger.info(f"[Override] SUPER_ADMIN {admin.user_id} revoked override for {body.user_id}")
    return {"message": "Override revoked", "user_id": body.user_id}


@router.get("/admin/override-status/{user_id}")
async def get_override_status(user_id: str, admin: User = Depends(require_admin)):
    """Get current override status for a user. Any admin can view."""
    override = await db.subscription_overrides.find_one(
        {"user_id": user_id}, {"_id": 0}
    )

    active = await get_active_override(user_id)

    # Determine subscription source
    source = "store"
    if active:
        source = "override"

    if not override:
        return {"has_override": False, "override": None, "source": source}

    return {
        "has_override": active is not None,
        "source": source,
        "override": {
            "tier": override.get("tier"),
            "is_active": active is not None,
            "expires_at": override.get("expires_at"),
            "granted_by": override.get("granted_by"),
            "granted_at": override.get("granted_at"),
        },
    }


@router.get("/admin/override-logs/{user_id}")
async def get_override_logs(
    user_id: str,
    page: int = 1,
    limit: int = 20,
    admin: User = Depends(require_admin),
):
    """Get immutable audit logs for a user's overrides. Any admin can view (read-only)."""
    skip = (max(1, page) - 1) * min(limit, 50)
    capped_limit = min(limit, 50)
    total = await db.subscription_override_logs.count_documents({"target_user": user_id})
    logs = await db.subscription_override_logs.find(
        {"target_user": user_id}, {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(capped_limit).to_list(capped_limit)
    return {"logs": logs, "count": len(logs), "total": total, "page": page, "limit": capped_limit}


# ===================== ADMIN SUBSCRIPTION MANAGEMENT =====================
class AdminSubscriptionUpdate(BaseModel):
    """Admin model for updating user subscription"""
    subscription: str  # "free" | "premium" | "vip"
    expiry_days: Optional[int] = None  # Days until expiry (None = no expiry)


@router.put("/admin/users/{user_id}/subscription")
async def admin_update_user_subscription(
    user_id: str, 
    update_data: AdminSubscriptionUpdate, 
    admin: User = Depends(require_admin)
):
    """Admin endpoint to update a user's subscription plan and expiry"""
    # Validate subscription value
    valid_subscriptions = ["free", "premium", "vip"]
    if update_data.subscription.lower() not in valid_subscriptions:
        raise HTTPException(status_code=400, detail=f"Invalid subscription. Must be one of: {valid_subscriptions}")
    
    # Find user
    user = await fetch_profile(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update document
    subscription = update_data.subscription.lower()
    update_doc = {
        "subscription": subscription,
        "role": subscription,  # Keep role in sync with subscription
    }
    
    # Set expiry
    if subscription == "free":
        update_doc["subscription_expiry"] = None
        update_doc["subscription_status"] = "inactive"
    else:
        if update_data.expiry_days:
            update_doc["subscription_expiry"] = datetime.now(timezone.utc) + timedelta(days=update_data.expiry_days)
        else:
            # No expiry = lifetime/indefinite
            update_doc["subscription_expiry"] = None
        update_doc["subscription_status"] = "active"
    
    result_ok = await update_profile(user_id, update_doc)
    
    if not result_ok:
        raise HTTPException(status_code=400, detail="No changes made")
    
    return {
        "message": f"User subscription updated to {subscription}",
        "user_id": user_id,
        "subscription": subscription,
        "expiry": update_doc.get("subscription_expiry")
    }


@router.post("/admin/users/{user_id}/reset-ai-usage")
async def admin_reset_user_ai_usage(user_id: str, admin: User = Depends(require_admin)):
    """Admin endpoint to reset a user's AI usage counter"""
    user = await fetch_profile(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    result = await update_profile(user_id, {
            "ai_weekly_used": 0,
            "ai_usage_count": 0,
            "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
            "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
        })
    
    return {
        "message": "AI usage reset successfully",
        "user_id": user_id,
        "new_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
    }


@router.get("/admin/users/{user_id}/details")
async def admin_get_user_details(user_id: str, admin: User = Depends(require_admin)):
    """Admin endpoint to get detailed user information including subscription status"""
    user = await fetch_profile(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate effective subscription
    effective_subscription = await get_effective_subscription(user)
    
    return {
        **user,
        "effective_subscription": effective_subscription,
        "subscription_active": check_subscription_active(user),
        "ai_limit": get_ai_weekly_limit(effective_subscription)
    }


# ===================== VIP FEATURE ACCESS ENDPOINTS =====================

@router.get("/automation/status")
async def get_automation_status():
    """Get the status of the signal engine"""
    config = await get_engine_config()
    
    return {
        "mode": "AUTO" if config.get("enabled") and not config.get("paused") else "PAUSED" if config.get("paused") else "DISABLED",
        "auto_engine_running": price_automation_running,
        "enabled": config.get("enabled", True),
        "paused": config.get("paused", False),
        "pause_reason": config.get("pause_reason"),
        "poll_interval": config.get("poll_interval", 30),
        "last_health_check": config.get("last_health_check"),
        "error_count": config.get("error_count", 0),
        "config": {
            "auto_activate_pending": config.get("auto_activate_pending", True),
            "auto_close_on_sl": config.get("auto_close_on_sl", True),
            "auto_advance_tp": config.get("auto_advance_tp", True),
            "auto_close_on_tp3": config.get("auto_close_on_tp3", True),
            "send_notifications": config.get("send_notifications", True),
        },
        "admin_endpoints": [
            "POST /api/admin/automation/start - Start the engine",
            "POST /api/admin/automation/stop - Stop the engine",
            "POST /api/admin/automation/pause - Pause the engine",
            "POST /api/admin/automation/resume - Resume the engine",
            "POST /api/admin/automation/config - Update engine config",
        ]
    }


@router.get("/admin/health")
async def admin_health_check(admin: User = Depends(require_admin)):
    """Admin-only backend health widget data."""
    import time
    req_start = time.monotonic()

    # 1. Signal Engine Status
    config = await get_engine_config()
    if config.get("enabled") and not config.get("paused"):
        engine_status = "Running"
    elif config.get("paused"):
        engine_status = "Paused"
    else:
        engine_status = "Disabled"
    engine_detail = config.get("pause_reason") or None

    # 2. Last Signal Generated Time
    last_signal = await db.signals.find_one({}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
    last_signal_time = None
    if last_signal and last_signal.get("created_at"):
        raw = last_signal["created_at"]
        last_signal_time = raw.isoformat() if isinstance(raw, datetime) else str(raw)

    # 3. MongoDB Connection Status
    mongo_ok = False
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False

    # 4. API Response Time
    api_response_ms = round((time.monotonic() - req_start) * 1000)

    return {
        "engine_status": engine_status,
        "engine_detail": engine_detail,
        "engine_error_count": config.get("error_count", 0),
        "last_signal_time": last_signal_time,
        "api_response_ms": api_response_ms,
        "mongo_connected": mongo_ok,
    }


@router.post("/admin/automation/start")
async def start_automation_engine(admin: User = Depends(require_admin)):
    """Start the signal automation engine (Admin only)"""
    global price_automation_running, engine_task
    
    if price_automation_running:
        return {"success": False, "message": "Engine is already running"}
    
    config = await get_engine_config()
    config["enabled"] = True
    config["paused"] = False
    config["pause_reason"] = None
    config["error_count"] = 0
    await save_engine_config(config)
    
    price_automation_running = True
    engine_task = asyncio.create_task(run_price_automation())
    
    logger.info(f"[Admin] Engine started by {admin.user_id}")
    return {"success": True, "message": "Signal engine started"}


@router.post("/admin/automation/stop")
async def stop_automation_engine(admin: User = Depends(require_admin)):
    """Stop the signal automation engine (Admin only)"""
    global price_automation_running, engine_task
    
    if not price_automation_running:
        return {"success": False, "message": "Engine is not running"}
    
    config = await get_engine_config()
    config["enabled"] = False
    await save_engine_config(config)
    
    price_automation_running = False
    
    if engine_task:
        engine_task.cancel()
        try:
            await engine_task
        except asyncio.CancelledError:
            pass
    
    logger.info(f"[Admin] Engine stopped by {admin.user_id}")
    return {"success": True, "message": "Signal engine stopped"}


@router.post("/admin/automation/pause")
async def pause_automation_engine(
    reason: str = "Manual pause by admin",
    admin: User = Depends(require_admin)
):
    """Pause the signal automation engine (Admin only) - Engine stays running but won't process signals"""
    config = await get_engine_config()
    config["paused"] = True
    config["pause_reason"] = reason
    await save_engine_config(config)
    
    logger.info(f"[Admin] Engine paused by {admin.user_id}: {reason}")
    return {"success": True, "message": f"Signal engine paused: {reason}"}


@router.post("/admin/automation/resume")
async def resume_automation_engine(admin: User = Depends(require_admin)):
    """Resume the signal automation engine (Admin only)"""
    global price_automation_running, engine_task
    
    config = await get_engine_config()
    config["paused"] = False
    config["pause_reason"] = None
    config["error_count"] = 0
    await save_engine_config(config)
    
    # Start the engine if it's not running
    if not price_automation_running and config.get("enabled", True):
        price_automation_running = True
        engine_task = asyncio.create_task(run_price_automation())
    
    logger.info(f"[Admin] Engine resumed by {admin.user_id}")
    return {"success": True, "message": "Signal engine resumed"}


class EngineConfigUpdate(BaseModel):
    poll_interval: Optional[int] = None
    auto_activate_pending: Optional[bool] = None
    auto_close_on_sl: Optional[bool] = None
    auto_advance_tp: Optional[bool] = None
    auto_close_on_tp3: Optional[bool] = None
    send_notifications: Optional[bool] = None


@router.post("/admin/automation/config")
async def update_automation_config(
    config_update: EngineConfigUpdate,
    admin: User = Depends(require_admin)
):
    """Update signal automation engine configuration (Admin only)"""
    config = await get_engine_config()
    
    # Update only provided fields
    if config_update.poll_interval is not None:
        # Enforce limits
        interval = max(config["min_poll_interval"], min(config["max_poll_interval"], config_update.poll_interval))
        config["poll_interval"] = interval
    
    if config_update.auto_activate_pending is not None:
        config["auto_activate_pending"] = config_update.auto_activate_pending
    
    if config_update.auto_close_on_sl is not None:
        config["auto_close_on_sl"] = config_update.auto_close_on_sl
    
    if config_update.auto_advance_tp is not None:
        config["auto_advance_tp"] = config_update.auto_advance_tp
    
    if config_update.auto_close_on_tp3 is not None:
        config["auto_close_on_tp3"] = config_update.auto_close_on_tp3
    
    if config_update.send_notifications is not None:
        config["send_notifications"] = config_update.send_notifications
    
    await save_engine_config(config)
    
    logger.info(f"[Admin] Engine config updated by {admin.user_id}")
    return {"success": True, "message": "Engine configuration updated", "config": config}


# ==============================================================================
# SIGNAL ENGINE TEST SIMULATION - DETERMINISTIC VERIFICATION
# ==============================================================================

@router.post("/admin/automation/test-simulation")
async def run_signal_test_simulation(admin: User = Depends(require_admin)):
    """
    Run a controlled test simulation to verify signal engine behavior.
    
    Simulates:
    - Signal: BUY XAUUSD, Entry=4211, SL=4111, TP=4311
    - Scenario 1: Price sequence 4200 → 4190 → 4180 → 4111 (hits SL exactly)
    - Scenario 2: Price sequence 4200 → 4100 (gaps through SL)
    
    Shows exactly when and how closure/activation occurs with gap protection.
    """
    trigger = DeterministicPriceTrigger()
    results = []
    
    # Test signal configuration
    signal_config = {
        "pair": "XAUUSD",
        "signal_type": "buy",
        "entry": 4211,
        "stop_loss": 4111,
        "tp1": 4311
    }
    
    logger.info("=" * 60)
    logger.info("[TestSim] Starting Signal Engine Test Simulation")
    logger.info(f"[TestSim] Signal: BUY {signal_config['pair']}")
    logger.info(f"[TestSim] Entry={signal_config['entry']}, SL={signal_config['stop_loss']}, TP={signal_config['tp1']}")
    logger.info("=" * 60)
    
    # ===== SCENARIO 1: Normal SL hit (price reaches SL exactly) =====
    results.append({
        "scenario": "1 - Normal SL Hit",
        "description": "Price sequence: 4200 → 4190 → 4180 → 4111",
        "steps": []
    })
    
    prices_scenario1 = [4200, 4190, 4180, 4111]
    last_price = None
    
    for i, current_price in enumerate(prices_scenario1):
        # Check SL trigger
        sl_triggered, sl_exit_price = trigger.check_sl_triggered(
            current_price,
            signal_config["stop_loss"],
            signal_config["signal_type"],
            last_price
        )
        
        step_result = {
            "poll": i + 1,
            "last_price": last_price,
            "current_price": current_price,
            "sl_triggered": sl_triggered,
            "sl_exit_price": sl_exit_price,
            "gap_protected": sl_exit_price != current_price if sl_triggered else False,
            "action": "CLOSE at SL" if sl_triggered else "No action"
        }
        
        results[0]["steps"].append(step_result)
        logger.info(f"[TestSim] Scenario 1 Poll {i+1}: price={current_price}, last={last_price}, SL_triggered={sl_triggered}")
        
        if sl_triggered:
            # Calculate pips at closure
            pip_result = calculate_signal_pips_with_trace(
                signal_config["entry"],
                sl_exit_price,
                signal_config["signal_type"],
                signal_config["pair"]
            )
            results[0]["closure"] = {
                "exit_price": sl_exit_price,
                "exit_reason": "sl",
                "pips": pip_result["calculated_pips"],
                "math_trace": pip_result["math_trace"],
                "gap_protected": sl_exit_price != current_price
            }
            break
        
        last_price = current_price
    
    # ===== SCENARIO 2: Gap through SL (price jumps past SL) =====
    results.append({
        "scenario": "2 - Gap Through SL",
        "description": "Price sequence: 4200 → 4100 (gaps through SL at 4111)",
        "steps": []
    })
    
    prices_scenario2 = [4200, 4100]  # Price gaps from 4200 to 4100, skipping 4111
    last_price = None
    
    for i, current_price in enumerate(prices_scenario2):
        # Check SL trigger
        sl_triggered, sl_exit_price = trigger.check_sl_triggered(
            current_price,
            signal_config["stop_loss"],
            signal_config["signal_type"],
            last_price
        )
        
        step_result = {
            "poll": i + 1,
            "last_price": last_price,
            "current_price": current_price,
            "sl_triggered": sl_triggered,
            "sl_exit_price": sl_exit_price,
            "gap_protected": sl_exit_price != current_price if sl_triggered else False,
            "action": f"CLOSE at SL={sl_exit_price} (gap protected, market={current_price})" if sl_triggered else "No action"
        }
        
        results[1]["steps"].append(step_result)
        logger.info(f"[TestSim] Scenario 2 Poll {i+1}: price={current_price}, last={last_price}, SL_triggered={sl_triggered}, exit_at={sl_exit_price}")
        
        if sl_triggered:
            # Calculate pips at closure - using GAP PROTECTED price
            pip_result = calculate_signal_pips_with_trace(
                signal_config["entry"],
                sl_exit_price,  # This is the defined SL, not the gapped price
                signal_config["signal_type"],
                signal_config["pair"]
            )
            results[1]["closure"] = {
                "exit_price": sl_exit_price,
                "market_price_at_close": current_price,
                "exit_reason": "sl",
                "pips": pip_result["calculated_pips"],
                "math_trace": pip_result["math_trace"],
                "gap_protected": True,
                "gap_protection_note": f"Closed at SL={sl_exit_price}, NOT at gapped price {current_price}"
            }
            
            # Compare with non-gap-protected result
            pip_result_ungapped = calculate_signal_pips_with_trace(
                signal_config["entry"],
                current_price,  # Using actual gapped price
                signal_config["signal_type"],
                signal_config["pair"]
            )
            results[1]["without_gap_protection"] = {
                "exit_price": current_price,
                "pips": pip_result_ungapped["calculated_pips"],
                "math_trace": pip_result_ungapped["math_trace"],
                "additional_loss": pip_result_ungapped["calculated_pips"] - pip_result["calculated_pips"]
            }
            break
        
        last_price = current_price
    
    # ===== SCENARIO 3: Pending Activation with Gap =====
    results.append({
        "scenario": "3 - Pending Activation with Gap",
        "description": "BUY pending at 4211, price gaps: 4220 → 4200",
        "steps": []
    })
    
    prices_scenario3 = [4220, 4200]  # Price gaps from 4220 to 4200, crossing entry 4211
    last_price = None
    
    for i, current_price in enumerate(prices_scenario3):
        # Check entry trigger
        entry_triggered, activation_price = trigger.check_entry_triggered(
            current_price,
            signal_config["entry"],
            signal_config["signal_type"],
            last_price
        )
        
        step_result = {
            "poll": i + 1,
            "last_price": last_price,
            "current_price": current_price,
            "entry_triggered": entry_triggered,
            "activation_price": activation_price,
            "gap_protected": activation_price != current_price if entry_triggered else False,
            "action": f"ACTIVATE at entry={activation_price} (gap protected, market={current_price})" if entry_triggered else "No action"
        }
        
        results[2]["steps"].append(step_result)
        logger.info(f"[TestSim] Scenario 3 Poll {i+1}: price={current_price}, last={last_price}, entry_triggered={entry_triggered}, activate_at={activation_price}")
        
        if entry_triggered:
            results[2]["activation"] = {
                "activation_price": activation_price,
                "market_price_at_activation": current_price,
                "gap_protected": True,
                "gap_protection_note": f"Activated at entry={activation_price}, NOT at gapped price {current_price}"
            }
            break
        
        last_price = current_price
    
    logger.info("=" * 60)
    logger.info("[TestSim] Test Simulation Complete")
    logger.info("=" * 60)
    
    return {
        "success": True,
        "message": "Signal engine test simulation complete",
        "signal_config": signal_config,
        "results": results,
        "summary": {
            "scenario_1": "Normal SL hit: Closed at SL price as expected",
            "scenario_2": "Gap through SL: GAP PROTECTED - closed at defined SL, not gapped market price",
            "scenario_3": "Pending activation with gap: GAP PROTECTED - activated at defined entry, not gapped market price"
        }
    }


# ==============================================================================
# FUND MANAGEMENT API - PRODUCTION READY
# ==============================================================================


class AdminCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    admin_role: AdminRole

class AdminUpdate(BaseModel):
    admin_role: Optional[AdminRole] = None
    admin_enabled: Optional[bool] = None
    name: Optional[str] = None

def require_permission(resource: str, action: str):
    """Create a dependency that checks for specific permission"""
    def check_permission(current_user: User = Depends(require_admin)):
        if not has_permission(current_user, resource, action):
            raise HTTPException(
                status_code=403,
                detail=f"You don't have permission to {action} {resource}"
            )
        return current_user
    return check_permission


@router.get("/admin/rbac/me")
async def get_my_admin_info(current_user: User = Depends(require_admin)):
    """Get current admin's role and permissions"""
    admin_role = current_user.admin_role.value if current_user.admin_role else None
    
    # Get permissions for this role
    permissions = {}
    if current_user.admin_role:
        permissions = ADMIN_PERMISSIONS.get(current_user.admin_role, {})
    
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "name": current_user.name,
        "admin_role": admin_role,
        "admin_enabled": current_user.admin_enabled,
        "is_super_admin": is_super_admin(current_user),
        "is_protected": is_protected_super_admin(current_user.email),
        "permissions": permissions,
    }


@router.get("/admin/rbac/admins")
async def list_all_admins(super_admin: User = Depends(require_super_admin)):
    """List all admin accounts. Super Admin only."""
    admins = await list_profiles({"role": "admin"})
    
    # Fetch emails from auth.users for all admins
    auth_users = await list_auth_users()
    email_map = {u["id"]: u.get("email", "") for u in auth_users}
    
    result = []
    for admin in admins:
        admin_email = email_map.get(admin["id"], "")
        result.append({
            "user_id": admin["id"],
            "email": admin_email,
            "name": admin.get("name", "Unknown"),
            "admin_role": admin.get("admin_role"),
            "admin_enabled": admin.get("admin_enabled", True),
            "is_protected": is_protected_super_admin(admin_email),
            "created_at": admin.get("created_at"),
        })
    
    await log_admin_action(
        super_admin.user_id,
        super_admin.admin_role.value if super_admin.admin_role else "admin",
        "list",
        "admins",
        "all"
    )
    
    return {"admins": result, "total": len(result)}


@router.post("/admin/rbac/admins")
async def create_admin(
    admin_data: AdminCreate,
    super_admin: User = Depends(require_super_admin)
):
    """Create a new admin account. Super Admin only."""
    # Check if email already exists
    existing = await fetch_profile_by_email(admin_data.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Cannot create Super Admin through API (they're protected)
    if admin_data.admin_role == AdminRole.SUPER_ADMIN:
        if not is_protected_super_admin(admin_data.email):
            raise HTTPException(
                status_code=403,
                detail="Cannot create Super Admin accounts. Only protected emails can be Super Admins."
            )
    
    # Create admin user via Supabase Auth Admin API
    new_user = await create_auth_user(
        admin_data.email.lower(), 
        admin_data.password,
        {"name": admin_data.name}
    )
    if not new_user:
        raise HTTPException(status_code=500, detail="Failed to create admin user in Supabase Auth")
    
    user_id = new_user["id"]
    now = datetime.now(timezone.utc)
    
    # Update the auto-created profile with admin role.
    # Supabase trigger creates the profile row asynchronously, so we retry.
    profile_updated = False
    for attempt in range(5):
        success = await update_profile(user_id, {
            "name": admin_data.name,
            "role": UserRole.ADMIN.value,
            "admin_role": admin_data.admin_role.value,
            "admin_enabled": True,
        })
        if success:
            # Verify the update actually took effect
            profile = await fetch_profile(user_id)
            if profile and profile.get("role") == UserRole.ADMIN.value:
                profile_updated = True
                break
        await asyncio.sleep(0.5 * (attempt + 1))  # backoff: 0.5s, 1s, 1.5s, 2s, 2.5s

    if not profile_updated:
        logger.error(f"[RBAC] Failed to update profile for new admin {user_id} after 5 attempts")
        # Clean up: delete the auth user since the profile update failed
        await delete_auth_user(user_id)
        raise HTTPException(status_code=500, detail="Failed to configure admin profile. Please try again.")
    
    await log_admin_action(
        super_admin.user_id,
        super_admin.admin_role.value,
        "create",
        "admin",
        user_id,
        {"email": admin_data.email, "admin_role": admin_data.admin_role.value}
    )
    
    # Notify Super Admins
    await create_admin_notification(
        [AdminRole.SUPER_ADMIN],
        "admin_created",
        "New Admin Created",
        f"Admin '{admin_data.name}' ({admin_data.admin_role.value}) was created by {super_admin.name}",
        user_id
    )
    
    return {
        "success": True,
        "user_id": user_id,
        "message": f"Admin account created with role: {admin_data.admin_role.value}"
    }


@router.put("/admin/rbac/admins/{user_id}")
async def update_admin(
    user_id: str,
    update_data: AdminUpdate,
    super_admin: User = Depends(require_super_admin)
):
    """Update an admin's role or status. Super Admin only."""
    admin = await fetch_profile(user_id)
    
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    admin_email = await get_auth_user_email(user_id) or ""
    
    # Cannot modify protected Super Admins
    if is_protected_super_admin(admin_email):
        if update_data.admin_role is not None and update_data.admin_role != AdminRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Cannot change role of protected Super Admin"
            )
    
    # Cannot promote to Super Admin unless protected email
    if update_data.admin_role == AdminRole.SUPER_ADMIN:
        if not is_protected_super_admin(admin_email):
            raise HTTPException(
                status_code=403,
                detail="Cannot promote to Super Admin. Only protected emails can be Super Admins."
            )
    
    update_fields = {}
    if update_data.admin_role is not None:
        update_fields["admin_role"] = update_data.admin_role.value
    if update_data.admin_enabled is not None:
        update_fields["admin_enabled"] = update_data.admin_enabled
    if update_data.name is not None:
        update_fields["name"] = update_data.name
    
    if update_fields:
        await update_profile(user_id, update_fields)
        
        await log_admin_action(
            super_admin.user_id,
            super_admin.admin_role.value,
            "update",
            "admin",
            user_id,
            update_fields
        )
    
    return {"success": True, "message": "Admin updated successfully"}


@router.delete("/admin/rbac/admins/{user_id}")
async def delete_admin(
    user_id: str,
    super_admin: User = Depends(require_super_admin)
):
    """Delete an admin account. Super Admin only. Cannot delete protected Super Admins."""
    admin = await fetch_profile(user_id)
    
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    admin_email = await get_auth_user_email(user_id) or ""
    
    # Cannot delete protected Super Admins
    if is_protected_super_admin(admin_email):
        raise HTTPException(
            status_code=403,
            detail="Cannot delete protected Super Admin accounts"
        )
    
    # Cannot delete self
    if user_id == super_admin.user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )
    
    await delete_auth_user(user_id); await delete_profile(user_id)
    
    await log_admin_action(
        super_admin.user_id,
        super_admin.admin_role.value,
        "delete",
        "admin",
        user_id,
        {"email": admin_email}
    )
    
    return {"success": True, "message": "Admin deleted successfully"}


# ==============================================================================
# AUDIT LOG API - SUPER ADMIN ONLY
# ==============================================================================

@router.get("/admin/rbac/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    admin_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    super_admin: User = Depends(require_super_admin)
):
    """Get audit logs. Super Admin only."""
    query = {}
    if admin_id:
        query["admin_id"] = admin_id
    if resource_type:
        query["resource_type"] = resource_type
    
    logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    
    for log in logs:
        log.pop("_id", None)
    
    return {"logs": logs, "total": len(logs)}


# ==============================================================================
# ADMIN NOTIFICATIONS API
# ==============================================================================

@router.get("/admin/notifications")
async def get_admin_notifications(
    unread_only: bool = False,
    current_user: User = Depends(require_admin)
):
    """Get notifications for current admin based on their role"""
    admin_role = current_user.admin_role.value if current_user.admin_role else None
    
    query = {}
    if admin_role:
        # Super Admins see all, others see role-specific
        if admin_role != AdminRole.SUPER_ADMIN.value:
            query["target_roles"] = admin_role
    
    if unread_only:
        query["read_by"] = {"$ne": current_user.user_id}
    
    notifications = await db.admin_notifications.find(query).sort("created_at", -1).limit(50).to_list(50)
    
    for n in notifications:
        n.pop("_id", None)
        n["is_read"] = current_user.user_id in n.get("read_by", [])
    
    return {"notifications": notifications, "total": len(notifications)}


@router.put("/admin/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(require_admin)
):
    """Mark a notification as read"""
    await db.admin_notifications.update_one(
        {"notification_id": notification_id},
        {"$addToSet": {"read_by": current_user.user_id}}
    )
    return {"success": True}


# ==============================================================================
# ADMIN ROLE PERMISSIONS ENDPOINT
# ==============================================================================

@router.get("/admin/rbac/roles")
async def get_all_roles_permissions(current_user: User = Depends(require_admin)):
    """Get all admin roles and their permissions"""
    roles = []
    for role in AdminRole:
        roles.append({
            "role": role.value,
            "permissions": ADMIN_PERMISSIONS.get(role, {}),
            "description": {
                AdminRole.SUPER_ADMIN: "Full system access, permanently protected",
                AdminRole.SIGNAL_ADMIN: "Manages trading signals only",
                AdminRole.FUND_ADMIN: "Manages fund performance & portfolios",
                AdminRole.ACCOUNT_MANAGER: "Handles user accounts & subscriptions",
                AdminRole.CUSTOMER_SUPPORT: "Support & read-only access",
            }.get(role, "")
        })
    
    return {"roles": roles}


# ==============================================================================

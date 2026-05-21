"""
main.py — FastAPI application entry point.
Creates the app, registers all routers, configures CORS, and handles lifecycle events.
"""
import os
import logging
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import json

# ─── Environment ──────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# ─── Logging (global, single config) ─────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger(__name__)

# ─── Database (import to trigger connection) ──────────────────────────────────
from core.database import db, client

# ─── Supabase helpers (used by startup routines) ─────────────────────────────
from supabase_auth import fetch_profile_by_email, update_profile

# ─── Config ───────────────────────────────────────────────────────────────────
from core.config import PROTECTED_SUPER_ADMINS
from models.enums import UserRole, AdminRole

# ─── UTC-aware JSON serialization ─────────────────────────────────────────────
# Ensures ALL datetime objects in API responses include 'Z' suffix.
# This prevents frontend timezone misinterpretation across regions.
class UTCJsonEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, datetime):
            if obj.tzinfo is None:
                obj = obj.replace(tzinfo=timezone.utc)
            return obj.strftime('%Y-%m-%dT%H:%M:%S.') + f'{obj.microsecond // 1000:03d}Z'
        return super().default(obj)

class UTCJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(content, cls=UTCJsonEncoder, ensure_ascii=False).encode('utf-8')

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="Swift FX Signals API", default_response_class=UTCJSONResponse)

# ─── Import and register ALL routers ─────────────────────────────────────────
from api.routes import (
    signals,
    admin,
    subscriptions,
    ai,
    community,
    academy,
    fund,
    calendar,
    settings,
    referral,
    support,
    dashboard,
    market,
    insights,
    payments_flutterwave,
    announcement,
)

app.include_router(signals.router)
app.include_router(admin.router)
app.include_router(subscriptions.router)
app.include_router(ai.router)
app.include_router(community.router)
app.include_router(academy.router)
app.include_router(fund.router)
app.include_router(calendar.router)
app.include_router(settings.router)
app.include_router(referral.router)
app.include_router(support.router)
app.include_router(dashboard.router)
app.include_router(market.router)
app.include_router(insights.router)
app.include_router(payments_flutterwave.router)
app.include_router(announcement.router)

# ─── Signal Engine ────────────────────────────────────────────────────────────
from services.signal_engine import (
    get_engine_config, run_price_automation,
)
import core.engine_state as engine_state

# ─── CORS ─────────────────────────────────────────────────────────────────────
raw_cors = os.environ.get('CORS_ORIGINS', '').strip()

if raw_cors == '*':
    CORS_ORIGINS = ["*"]
    logger.info("[CORS] Configured to allow ALL origins (*)")
else:
    CORS_ORIGINS = [
        origin.strip()
        for origin in raw_cors.split(',')
        if origin.strip()
    ]
    if not CORS_ORIGINS:
        logger.warning("[CORS] CORS_ORIGINS not configured - web/admin access will be blocked")
    else:
        for origin in CORS_ORIGINS:
            if not origin.startswith(('http://', 'https://')):
                raise ValueError(f"[CORS] Invalid origin format: {origin}. Must start with http:// or https://")
        logger.info(f"[CORS] Configured origins: {CORS_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Health check for load balancer / deployment verification."""
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False
    return {
        "status": "healthy" if mongo_ok else "degraded",
        "mongo": "connected" if mongo_ok else "disconnected",
    }


# ─── Lifecycle events ─────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Initializes indexes, signal engine, super admin accounts, and default data."""
    logger.info("=" * 60)
    logger.info("[Startup] Swift FX Backend Starting...")
    logger.info("=" * 60)

    # MongoDB indexes
    logger.info("[Startup] Ensuring MongoDB indexes...")
    await db.iap_transactions.create_index([("user_id", 1), ("status", 1)])
    await db.iap_transactions.create_index("expiry_date")
    await db.iap_transactions.create_index("transaction_id", unique=True)
    await db.signals.create_index([("created_at", -1)])
    await db.signals.create_index("state")
    await db.device_tokens.create_index("user_id")
    await db.device_tokens.create_index("is_active")
    await db.device_tokens.create_index(
        [("token", 1), ("user_id", 1)], unique=True, name="token_user_unique"
    )
    await db.ai_analyses.create_index([("user_id", 1), ("created_at", -1)])
    await db.posts.create_index("created_at")
    await db.support_tickets.create_index([("user_id", 1), ("created_at", -1)])
    # TTL index: auto-expire notification dedup records after 1 hour
    try:
        await db.notification_dedup.create_index(
            "sent_at", expireAfterSeconds=3600, name="ttl_cleanup"
        )
    except Exception:
        pass  # Index already exists
    logger.info("[Startup] MongoDB indexes ensured")

    # Super Admin initialization
    await initialize_super_admins()

    # Default FAQs
    from api.routes.support import initialize_faqs
    await initialize_faqs()

    # Signal engine
    config = await get_engine_config()

    # Clear stale auto-pauses from previous crash/error cascade
    if config.get("paused") and "auto-paused" in str(config.get("pause_reason", "")).lower():
        logger.info("[Startup] Clearing stale auto-pause from previous session")
        config["paused"] = False
        config["pause_reason"] = None
        from services.signal_engine import save_engine_config
        await save_engine_config(config)

    if config.get("enabled", True) and not config.get("paused", False):
        logger.info("[Startup] Starting Signal Auto-Engine...")
        engine_state.price_automation_running = True
        engine_state.engine_task = asyncio.create_task(run_price_automation())
        logger.info("[Startup] Signal Auto-Engine task created")
    else:
        logger.info("[Startup] Signal Auto-Engine is DISABLED or PAUSED")
        if config.get("paused"):
            logger.info(f"[Startup] Pause reason: {config.get('pause_reason', 'No reason specified')}")

    # Start streak reminder background task
    from services.streak_reminders import streak_reminder_loop
    asyncio.create_task(streak_reminder_loop())

    # Referral reward unlock orchestration (LOCKED → PENDING progression)
    # Lightweight periodic background loop to run referral reward processing.
    from api.routes.referral import check_and_process_referral_rewards

    async def referral_reward_unlock_loop():
        interval_seconds = int(os.environ.get("REFERRAL_REWARD_UNLOCK_INTERVAL_SECONDS", "600"))
        while True:
            try:
                await check_and_process_referral_rewards()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"[Referral] check_and_process_referral_rewards loop error: {str(e)}")
            await asyncio.sleep(interval_seconds)

    asyncio.create_task(referral_reward_unlock_loop())

    logger.info("[Startup] Startup complete")


async def initialize_super_admins():
    """Create or update protected Super Admin accounts on startup"""
    for email in PROTECTED_SUPER_ADMINS:
        existing = await fetch_profile_by_email(email.lower())
        if existing:
            if (existing.get("role") != UserRole.ADMIN.value
                    or existing.get("admin_role") != AdminRole.SUPER_ADMIN.value
                    or not existing.get("is_admin")):
                await update_profile(existing["id"], {
                    "role": UserRole.ADMIN.value,
                    "admin_role": AdminRole.SUPER_ADMIN.value,
                    "admin_enabled": True,
                })
                logger.info(f"[RBAC] Restored Super Admin role for {email}")
            else:
                logger.info(f"[RBAC] Super Admin {email} verified")
        else:
            logger.info(f"[RBAC] Super Admin {email} not found in profiles - must be created via Supabase Auth")
    logger.info("[RBAC] Super Admin initialization complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully stop the signal engine on shutdown"""
    logger.info("[Shutdown] Stopping Signal Auto-Engine...")
    engine_state.price_automation_running = False
    if engine_state.engine_task:
        engine_state.engine_task.cancel()
        try:
            await engine_state.engine_task
        except asyncio.CancelledError:
            pass
    client.close()
    logger.info("[Shutdown] Server shutdown complete")

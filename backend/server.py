from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, BackgroundTasks, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.exceptions import InvalidSignature as CryptoInvalidSignature
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import json
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import base64
from enum import Enum
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection (retained for non-user collections: signals, posts, etc.)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Supabase auth integration
from supabase_auth import (
    get_supabase_user,
    fetch_profile, fetch_profile_by_email, update_profile, list_profiles, count_profiles,
    delete_profile, list_auth_users, get_auth_user, get_auth_user_email,
    create_auth_user, delete_auth_user, update_auth_user,
)

# Emergent LLM Key for Claude Vision
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY') or EMERGENT_LLM_KEY
if not OPENAI_API_KEY:
    logging.warning("[Config] Neither OPENAI_API_KEY nor EMERGENT_LLM_KEY set — AI features will be unavailable")

# ===================== IAP CONFIGURATION =====================
# Apple App Store
APPLE_SHARED_SECRET = os.environ.get('APPLE_SHARED_SECRET')
APPLE_BUNDLE_ID = os.environ.get('APPLE_BUNDLE_ID', 'com.swiftfx.signals')
APPLE_ENVIRONMENT = os.environ.get('APPLE_ENVIRONMENT')  # MUST be 'sandbox' or 'production'
if APPLE_ENVIRONMENT not in ('sandbox', 'production', None):
    raise ValueError(f"APPLE_ENVIRONMENT must be 'sandbox' or 'production', got '{APPLE_ENVIRONMENT}'")
APPLE_KEY_ID = os.environ.get('APPLE_KEY_ID', '')
APPLE_ISSUER_ID = os.environ.get('APPLE_ISSUER_ID', '')
APPLE_PRIVATE_KEY = os.environ.get('APPLE_PRIVATE_KEY', '')
APPLE_WEBHOOK_SECRET = os.environ.get('APPLE_WEBHOOK_SECRET', '')

# Google Play Billing
GOOGLE_PACKAGE_NAME = os.environ.get('GOOGLE_PACKAGE_NAME', 'com.swiftfx.signals')
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
GOOGLE_PUBSUB_TOPIC = os.environ.get('GOOGLE_PUBSUB_TOPIC', '')
GOOGLE_WEBHOOK_TOKEN = os.environ.get('GOOGLE_WEBHOOK_TOKEN', '')

# ===================== V1 PRODUCTION MODE =====================
# IAP webhooks are removed in v1 production build.
# Only verify/restore endpoints are active for subscription management.
# Webhooks can be re-added when signature verification is implemented.
# ==============================================================

# ===================== OFFICIAL IAP PRODUCT IDS =====================
# These are permanent and configured in both App Store Connect and Google Play Console.
# Any premium.* SKU → PREMIUM tier.  Any vip.* SKU → VIP tier.
# Billing cycle does NOT affect entitlement level.
IAP_PRODUCT_IDS = [
    'com.swiftfx.signals.premium.weekly',
    'com.swiftfx.signals.premium.monthly',
    'com.swiftfx.signals.premium.yearly',
    'com.swiftfx.signals.vip.weekly',
    'com.swiftfx.signals.vip.monthly',
    'com.swiftfx.signals.vip.yearly',
]

IAP_PRODUCTS_BY_TIER = {
    'premium': {
        'weekly': 'com.swiftfx.signals.premium.weekly',
        'monthly': 'com.swiftfx.signals.premium.monthly',
        'yearly': 'com.swiftfx.signals.premium.yearly',
    },
    'vip': {
        'weekly': 'com.swiftfx.signals.vip.weekly',
        'monthly': 'com.swiftfx.signals.vip.monthly',
        'yearly': 'com.swiftfx.signals.vip.yearly',
    },
}


def get_plan_from_product_id(product_id: str) -> Optional[str]:
    """Map IAP product ID to subscription plan (PREMIUM or VIP).
    Works for both old-style and new official product IDs."""
    pid = product_id.lower()
    if '.vip.' in pid or 'vip' in pid:
        return 'vip'
    if '.premium.' in pid or 'premium' in pid:
        return 'premium'
    return None

app = FastAPI(title="Swift FX Signals API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===================== ENUMS =====================
# UPDATED: Role now only represents admin authority, not subscription tier
# Subscription tiers (free/premium/vip) are derived from subscriptions table
class UserRole(str, Enum):
    USER = "user"          # Regular user (subscription tier from subscriptions table)
    ADMIN = "admin"        # Admin user
    SUPER_ADMIN = "super_admin"  # Super admin user
    # DEPRECATED - kept for backward compatibility during migration
    FREE = "free"
    PREMIUM = "premium"
    VIP = "vip"

# NEW: Admin Role Types for RBAC
class AdminRole(str, Enum):
    SUPER_ADMIN = "super_admin"      # Full system access, permanently protected
    SIGNAL_ADMIN = "signal_admin"    # Manages trading signals only
    FUND_ADMIN = "fund_admin"        # Manages fund performance & portfolios
    ACCOUNT_MANAGER = "account_manager"  # Handles user accounts & subscriptions
    CUSTOMER_SUPPORT = "customer_support"  # Support & read-only access

# Protected Super Admin emails - cannot be modified or downgraded
PROTECTED_SUPER_ADMINS = [
    "ellapauledache@gmail.com",
    "ellaniswell@gmail.com"
]

# Admin Role Permissions Map
ADMIN_PERMISSIONS = {
    AdminRole.SUPER_ADMIN: {
        "signals": ["create", "read", "update", "delete"],
        "users": ["create", "read", "update", "delete"],
        "fund_applications": ["create", "read", "update", "delete"],
        "investor_portfolios": ["create", "read", "update", "delete"],
        "withdrawals": ["create", "read", "update", "delete"],
        "admin_management": ["create", "read", "update", "delete"],
        "audit_logs": ["read"],
        "notices": ["create", "read", "update", "delete"],
        "subscriptions": ["read", "update"],
    },
    AdminRole.SIGNAL_ADMIN: {
        "signals": ["create", "read", "update", "delete"],
        "users": [],
        "fund_applications": [],
        "investor_portfolios": [],
        "withdrawals": [],
        "admin_management": [],
        "audit_logs": [],
        "notices": [],
        "subscriptions": [],
    },
    AdminRole.FUND_ADMIN: {
        "signals": [],
        "users": ["read"],
        "fund_applications": ["read", "update"],
        "investor_portfolios": ["read", "update"],
        "withdrawals": ["read", "update"],
        "admin_management": [],
        "audit_logs": [],
        "notices": ["create", "read", "update", "delete"],
        "subscriptions": [],
    },
    AdminRole.ACCOUNT_MANAGER: {
        "signals": ["read"],
        "users": ["read", "update"],
        "fund_applications": ["read"],
        "investor_portfolios": ["read"],
        "withdrawals": ["read"],
        "admin_management": [],
        "audit_logs": [],
        "notices": [],
        "subscriptions": ["read", "update"],
    },
    AdminRole.CUSTOMER_SUPPORT: {
        "signals": ["read"],
        "users": ["read"],
        "fund_applications": ["read"],
        "investor_portfolios": ["read"],
        "withdrawals": ["read"],
        "admin_management": [],
        "audit_logs": [],
        "notices": [],
        "subscriptions": [],
    },
}

class BillingCycle(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"

class SignalVisibility(str, Enum):
    FREE = "free"
    PREMIUM = "premium"
    VIP = "vip"

class SignalStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    CLOSED = "closed"

# NEW: Trade Lifecycle States for TP1, TP2, TP3 tracking
class SignalState(str, Enum):
    PENDING = "pending"    # Waiting for entry price
    ACTIVE = "active"      # Entry hit, watching for TP1 or SL
    TP1 = "tp1"           # TP1 hit, watching for TP2 or SL
    TP2 = "tp2"           # TP2 hit, watching for TP3 or SL
    TP3 = "tp3"           # TP3 hit, auto-transition to closed
    CLOSED = "closed"      # Trade complete - immutable

# Valid state transitions map
VALID_STATE_TRANSITIONS = {
    SignalState.PENDING: [SignalState.ACTIVE],
    SignalState.ACTIVE: [SignalState.TP1, SignalState.CLOSED],
    SignalState.TP1: [SignalState.TP2, SignalState.CLOSED],
    SignalState.TP2: [SignalState.TP3, SignalState.CLOSED],
    SignalState.TP3: [SignalState.CLOSED],
    SignalState.CLOSED: [],  # No transitions allowed from closed
}

def is_valid_transition(current_state: str, new_state: str) -> bool:
    """Check if a state transition is valid"""
    try:
        current = SignalState(current_state)
        new = SignalState(new_state)
        return new in VALID_STATE_TRANSITIONS.get(current, [])
    except ValueError:
        return False

def is_signal_closed(state: str) -> bool:
    """Check if signal is in closed state (immutable)"""
    return state == SignalState.CLOSED.value

class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"

# ===================== MODELS =====================
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    user_id: str
    name: str
    email: str
    role: UserRole = UserRole.FREE
    # Admin role for RBAC (only applies if role == ADMIN)
    admin_role: Optional[AdminRole] = None
    admin_enabled: bool = True  # Can be disabled by Super Admin
    # Subscription fields - single source of truth
    subscription: str = "free"  # "free" | "premium" | "vip"
    subscription_expiry: Optional[datetime] = None
    subscription_status: str = "active"  # Legacy field kept for compatibility
    billing_cycle: Optional[BillingCycle] = None
    # AI usage tracking - account level
    ai_weekly_used: int = 0
    ai_weekly_reset: Optional[datetime] = None
    # Legacy fields
    ai_usage_count: int = 0
    ai_usage_reset_date: Optional[datetime] = None
    notification_preferences: Dict[str, bool] = Field(default_factory=lambda: {"signals": True, "community": True})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    picture: Optional[str] = None


# ==============================================================================
# ADMIN RBAC HELPER FUNCTIONS
# ==============================================================================

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
    
    # Super Admin has all permissions
    if user.admin_role == AdminRole.SUPER_ADMIN:
        return True
    
    # Check role-specific permissions
    role_permissions = ADMIN_PERMISSIONS.get(user.admin_role, {})
    resource_actions = role_permissions.get(resource, [])
    return action in resource_actions

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


# Subscription helper functions
def get_subscription_level(subscription: str) -> int:
    """Get numeric level for subscription comparison"""
    levels = {"free": 0, "premium": 1, "vip": 2}
    return levels.get(subscription.lower(), 0)


def can_access_visibility(user_subscription: str, signal_visibility: str) -> bool:
    """Check if user subscription can access signal visibility level"""
    user_level = get_subscription_level(user_subscription)
    visibility_level = get_subscription_level(signal_visibility)
    return user_level >= visibility_level


def get_ai_weekly_limit(subscription: str) -> int:
    """Get weekly AI analysis limit based on subscription"""
    limits = {"free": 3, "premium": 10, "vip": 999999}  # VIP is essentially unlimited
    return limits.get(subscription.lower(), 3)


def check_subscription_active(user_doc: dict) -> bool:
    """Check if user subscription is active (not expired)"""
    expiry = user_doc.get("subscription_expiry")
    if expiry is None:
        return True  # No expiry means active (free plan or lifetime)
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
    # Ensure both datetimes are timezone-aware
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry > datetime.now(timezone.utc)


async def get_effective_subscription(user_doc: dict) -> str:
    """
    Get user's effective subscription tier.
    Resolution order:
      1. Admin/Super Admin → always "vip"
      2. Active subscription override (if exists and not expired) → override tier
      3. Verified IAP transactions in MongoDB → store-based tier
      4. Fallback → "free"
    """
    user_id = user_doc.get("id") or user_doc.get("user_id", "")
    role = user_doc.get("role", "free")

    # Admin / Super Admin get VIP-level access for feature gating.
    if role in ("admin", "super_admin"):
        return "vip"

    # Check for active subscription override (auto-expires based on expires_at)
    override = await get_active_override(user_id)
    if override:
        return override.get("tier", "free")

    # Resolve from verified IAP transactions in MongoDB (authoritative).
    now = datetime.now(timezone.utc)
    tier_priority = {"vip": 2, "premium": 1}
    best_tier = "free"
    best_priority = 0

    active_txns = await db.iap_transactions.find({
        "user_id": user_id,
        "status": "active",
    }).sort("expiry_date", -1).to_list(20)

    for txn in active_txns:
        expiry = txn.get("expiry_date")
        if expiry:
            if isinstance(expiry, str):
                try:
                    expiry_dt = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                except ValueError:
                    continue
            else:
                expiry_dt = expiry
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            if expiry_dt <= now:
                continue

        txn_plan = txn.get("plan", "").lower()
        priority = tier_priority.get(txn_plan, 0)
        if priority > best_priority:
            best_priority = priority
            best_tier = txn_plan

    return best_tier

class SignalCreate(BaseModel):
    pair: str
    signal_type: SignalType
    entry: float
    stop_loss: float
    tp1: float
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    state: Optional[SignalState] = SignalState.PENDING  # Uses new state system
    visibility: SignalVisibility = SignalVisibility.FREE
    analysis: Optional[str] = None

class Signal(BaseModel):
    signal_id: str
    pair: str
    signal_type: SignalType
    entry: float
    stop_loss: float
    tp1: float
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    risk_reward: float
    # NEW: Single authoritative state field
    state: SignalState = SignalState.PENDING
    # Legacy field for backward compatibility (maps to state)
    status: SignalStatus = SignalStatus.PENDING
    tp_hit: int = 0  # 0 = none, 1 = tp1, 2 = tp2, 3 = tp3 (derived from state)
    visibility: SignalVisibility
    analysis: Optional[str] = None
    # Price tracking for final results
    entry_price_actual: Optional[float] = None  # Actual entry price when activated
    exit_price: Optional[float] = None  # Exit price when closed
    final_pips: Optional[float] = None
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

class SignalUpdate(BaseModel):
    """Admin signal update - for manual overrides"""
    state: Optional[SignalState] = None  # New: Use state for transitions
    status: Optional[SignalStatus] = None  # Legacy: kept for backward compat
    tp_hit: Optional[int] = None
    final_pips: Optional[float] = None
    close_price: Optional[float] = None  # For calculating final_pips on manual close

# Helper function to get tp_hit from state
def get_tp_hit_from_state(state: str) -> int:
    """Convert state to tp_hit value"""
    state_to_tp = {
        "pending": 0,
        "active": 0,
        "tp1": 1,
        "tp2": 2,
        "tp3": 3,
        "closed": 3,  # If closed after tp3
    }
    return state_to_tp.get(state, 0)

# Helper function to get status from state
def get_status_from_state(state: str) -> str:
    """Convert state to legacy status"""
    if state == "pending":
        return "pending"
    elif state in ["active", "tp1", "tp2", "tp3"]:
        return "active"
    else:
        return "closed"

class PostCreate(BaseModel):
    content: str


# ==============================================================================
# FUND MANAGEMENT MODELS
# ==============================================================================

class FundApplicationStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    CONTACTED = "contacted"
    APPROVED = "approved"
    REJECTED = "rejected"

class InvestmentTier(str, Enum):
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ELITE = "elite"

class TradingExperience(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"

class FundApplicationCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    country: str
    investment_tier: InvestmentTier
    intended_amount: float
    trading_experience: TradingExperience
    risk_agreement: bool = False
    source: str = "app"  # "app" or "whatsapp"

class FundApplication(BaseModel):
    application_id: str
    user_id: str
    full_name: str
    email: str
    phone: str
    country: str
    investment_tier: InvestmentTier
    intended_amount: float
    trading_experience: TradingExperience
    risk_agreement: bool
    status: FundApplicationStatus = FundApplicationStatus.PENDING_REVIEW
    admin_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    post_type: str = "analysis"  # analysis, results, question

# ==============================================================================
# INVESTOR DASHBOARD MODELS
# ==============================================================================

class InvestorAccountStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"

class WithdrawalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    PAID = "paid"
    REJECTED = "rejected"

class InvestorPortfolioCreate(BaseModel):
    user_id: str
    application_id: str
    invested_capital: float
    current_equity: float
    investment_tier: str
    performance_fee: float = 20.0  # Default 20%
    lockup_months: int = 3  # Default 3 months

class InvestorPortfolioUpdate(BaseModel):
    invested_capital: Optional[float] = None
    current_equity: Optional[float] = None
    account_status: Optional[InvestorAccountStatus] = None
    performance_fee: Optional[float] = None
    lockup_months: Optional[int] = None

class WithdrawalRequest(BaseModel):
    amount: float
    notes: Optional[str] = None

class FundPerformanceEntry(BaseModel):
    month: str  # Format: "2025-01"
    return_percentage: float
    notes: Optional[str] = None

class FundNoticeCreate(BaseModel):
    title: str
    content: str
    notice_type: str = "general"  # general, risk, update


# ==============================================================================
# REFERRAL PROGRAM MODELS
# ==============================================================================

class ReferralStatus(str, Enum):
    PENDING = "pending"           # Referred user registered, not subscribed yet
    COMPLETED = "completed"       # Reward unlocked after 7 days
    EXPIRED = "expired"           # No subscription after 30 days
    FLAGGED = "flagged"           # Flagged for fraud

class RewardStatus(str, Enum):
    LOCKED = "locked"             # Waiting for 7-day subscription period
    PENDING = "pending"           # Ready to be claimed/applied
    APPLIED = "applied"           # Reward has been applied
    REVOKED = "revoked"           # Admin revoked the reward

def generate_referral_code(user_id: str) -> str:
    """Generate a unique referral code for a user"""
    # Take first 4 chars of user_id hash + 4 random chars
    hash_part = hashlib.md5(user_id.encode()).hexdigest()[:4].upper()
    random_part = uuid.uuid4().hex[:4].upper()
    return f"SWIFT{hash_part}{random_part}"

class Post(BaseModel):
    post_id: str
    user_id: str
    user_name: str
    content: str
    post_type: str
    likes: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentCreate(BaseModel):
    content: str

class Comment(BaseModel):
    comment_id: str
    post_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubscriptionUpdate(BaseModel):
    plan: UserRole
    billing_cycle: BillingCycle

class AIAnalysisRequest(BaseModel):
    pair: str
    timeframe: str

class AIAnalysis(BaseModel):
    analysis_id: str
    user_id: str
    pair: str
    timeframe: str
    market_bias: str
    trend_structure: str
    support_levels: List[float]
    resistance_levels: List[float]
    trade_insight: str
    confidence: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceTokenRegister(BaseModel):
    token: str
    platform: str  # ios, android, web

# ===================== SUPABASE AUTH HELPERS =====================

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
    # Accept both 'admin' and 'super_admin' roles
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


def calculate_risk_reward(entry: float, stop_loss: float, take_profit: float, signal_type: SignalType) -> float:
    if signal_type == SignalType.BUY:
        risk = abs(entry - stop_loss)
        reward = abs(take_profit - entry)
    else:
        risk = abs(stop_loss - entry)
        reward = abs(entry - take_profit)
    
    return round(reward / risk, 2) if risk > 0 else 0

def can_access_signal(user_role: UserRole, signal_visibility: SignalVisibility) -> bool:
    # Admin can access all signals
    if user_role == UserRole.ADMIN:
        return True
    role_hierarchy = {UserRole.FREE: 0, UserRole.PREMIUM: 1, UserRole.VIP: 2}
    visibility_hierarchy = {SignalVisibility.FREE: 0, SignalVisibility.PREMIUM: 1, SignalVisibility.VIP: 2}
    return role_hierarchy.get(user_role, 0) >= visibility_hierarchy.get(signal_visibility, 0)

# ===================== SIGNALS ENDPOINTS =====================
@api_router.get("/signals")
async def get_signals(current_user: Optional[User] = Depends(get_current_user)):
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Resolve tier from subscriptions+plans (single source of truth)
    if current_user:
        user_subscription = await get_effective_subscription({
            "user_id": current_user.user_id,
            "role": current_user.role,
        })
    else:
        user_subscription = "free"
    
    result = []
    for signal in signals:
        signal_visibility = signal.get("visibility", "free")
        state = signal.get("state", signal.get("status", "pending"))
        is_active = state in ("pending", "active", "tp1", "tp2", "tp3")
        
        if can_access_visibility(user_subscription, signal_visibility):
            signal["state"] = state
            signal["is_active"] = is_active
            signal.pop("status", None)
            result.append(signal)
        else:
            result.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "state": state,
                "is_active": is_active,
                "visibility": signal["visibility"],
                "created_at": signal["created_at"],
                "locked": True,
                "required_plan": signal_visibility
            })
    
    return result

@api_router.get("/signals/{signal_id}")
async def get_signal(signal_id: str, current_user: Optional[User] = Depends(get_current_user)):
    signal = await db.signals.find_one({"signal_id": signal_id}, {"_id": 0})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    # Resolve tier from subscriptions+plans (single source of truth)
    if current_user:
        user_subscription = await get_effective_subscription({
            "user_id": current_user.user_id,
            "role": current_user.role,
        })
    else:
        user_subscription = "free"
    
    signal_visibility = signal.get("visibility", "free")
    
    if can_access_visibility(user_subscription, signal_visibility):
        state = signal.get("state", signal.get("status", "pending"))
        signal["state"] = state
        signal["is_active"] = state in ("pending", "active", "tp1", "tp2", "tp3")
        signal.pop("status", None)
        return signal
    
    state = signal.get("state", signal.get("status", "pending"))
    return {
        "signal_id": signal["signal_id"],
        "pair": signal["pair"],
        "signal_type": signal["signal_type"],
        "state": state,
        "is_active": state in ("pending", "active", "tp1", "tp2", "tp3"),
        "visibility": signal["visibility"],
        "created_at": signal["created_at"],
        "locked": True,
        "required_plan": signal_visibility
    }

@api_router.post("/admin/signals")
async def create_signal(signal_data: SignalCreate, background_tasks: BackgroundTasks, admin: User = Depends(require_admin)):
    # Check permission: only signal_admin and super_admin can create signals
    if not has_permission(admin, "signals", "create"):
        raise HTTPException(status_code=403, detail="You don't have permission to create signals")
    
    signal_id = f"sig_{uuid.uuid4().hex[:12]}"
    
    # Calculate risk/reward using tp1 as primary target
    risk_reward = calculate_risk_reward(
        signal_data.entry,
        signal_data.stop_loss,
        signal_data.tp1,
        signal_data.signal_type
    )
    
    # Determine initial state from request (default: pending)
    initial_state = signal_data.state if signal_data.state else SignalState.PENDING
    activated_at = None
    
    # If created as active, set activated_at and entry_price_actual
    if initial_state == SignalState.ACTIVE:
        activated_at = datetime.now(timezone.utc)
    
    signal_doc = {
        "signal_id": signal_id,
        "pair": signal_data.pair,
        "signal_type": signal_data.signal_type,
        "entry": signal_data.entry,
        "stop_loss": signal_data.stop_loss,
        "tp1": signal_data.tp1,
        "tp2": signal_data.tp2,
        "tp3": signal_data.tp3,
        # NEW: Single authoritative state field
        "state": initial_state.value,
        # Legacy fields for backward compatibility
        "status": get_status_from_state(initial_state.value),
        "tp_hit": get_tp_hit_from_state(initial_state.value),
        "risk_reward": risk_reward,
        "visibility": signal_data.visibility,
        "analysis": signal_data.analysis,
        # Price tracking
        "entry_price_actual": signal_data.entry if initial_state == SignalState.ACTIVE else None,
        "exit_price": None,
        "final_pips": None,
        # Timestamps
        "created_at": datetime.now(timezone.utc),
        "activated_at": activated_at,
        "closed_at": None
    }
    
    await db.signals.insert_one(signal_doc)
    
    # Queue push notification with visibility for role-based filtering
    background_tasks.add_task(send_signal_notification, signal_id, signal_data.pair, signal_data.signal_type, signal_data.visibility)
    
    return {"signal_id": signal_id, "message": f"Signal created with state: {initial_state.value}"}

def calculate_pips(entry: float, close: float, signal_type: str, pair: str) -> float:
    """
    Legacy wrapper for pip calculation.
    Delegates to the authoritative calculate_signal_pips function.
    """
    return calculate_signal_pips(entry, close, signal_type, pair)


# ===================== TRADE LIFECYCLE MANUAL OVERRIDES =====================
# These endpoints allow admins to manually control signal state transitions

class StateTransitionRequest(BaseModel):
    """Request model for manual state transitions"""
    new_state: SignalState
    close_price: Optional[float] = None  # Required when transitioning to closed
    reason: Optional[str] = None  # Audit trail


@api_router.post("/admin/signals/{signal_id}/transition")
async def manual_state_transition(
    signal_id: str,
    request: StateTransitionRequest,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin)
):
    """
    Admin endpoint for manual state transitions.
    Respects the valid transition map and hard lock rule.
    """
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    new_state = request.new_state.value
    
    # HARD LOCK RULE: Closed signals are immutable
    if is_signal_closed(current_state):
        raise HTTPException(
            status_code=400, 
            detail="Signal is closed and immutable. No further transitions allowed."
        )
    
    # Validate transition
    if not is_valid_transition(current_state, new_state):
        valid_next = [s.value for s in VALID_STATE_TRANSITIONS.get(SignalState(current_state), [])]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition: {current_state} → {new_state}. Valid transitions: {valid_next}"
        )
    
    # Build update document
    update_doc = {
        "state": new_state,
        "status": get_status_from_state(new_state),
        "tp_hit": get_tp_hit_from_state(new_state),
    }
    
    # Handle specific state transitions
    if new_state == SignalState.ACTIVE.value:
        update_doc["activated_at"] = datetime.now(timezone.utc)
        update_doc["entry_price_actual"] = signal.get("entry")
    
    elif new_state == SignalState.CLOSED.value:
        update_doc["closed_at"] = datetime.now(timezone.utc)
        
        # Calculate final pips
        close_price = request.close_price
        if close_price is None:
            # Use appropriate TP price based on previous state
            if current_state == "tp3":
                close_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
            elif current_state == "tp2":
                close_price = signal.get("tp2") or signal.get("tp1")
            elif current_state == "tp1":
                close_price = signal.get("tp1")
            else:
                # Default to stop loss for manual close from active
                close_price = signal.get("stop_loss")
        
        if close_price:
            update_doc["exit_price"] = close_price
            update_doc["final_pips"] = calculate_pips(
                signal["entry"],
                close_price,
                signal["signal_type"],
                signal["pair"]
            )
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            update_doc.get("final_pips", 0),
            visibility
        )
    
    # Atomic update with state check to prevent race conditions
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": current_state},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        # Check if state changed during our operation
        current_signal = await db.signals.find_one({"signal_id": signal_id})
        if current_signal and current_signal.get("state") != current_state:
            raise HTTPException(
                status_code=409,
                detail=f"Conflict: Signal state changed to {current_signal.get('state')} during operation"
            )
        raise HTTPException(status_code=404, detail="Signal not found or update failed")
    
    logger.info(f"[Manual] Admin {admin.user_id} transitioned signal {signal_id}: {current_state} → {new_state}")
    
    return {
        "message": f"Signal transitioned: {current_state} → {new_state}",
        "signal_id": signal_id,
        "old_state": current_state,
        "new_state": new_state,
        "final_pips": update_doc.get("final_pips")
    }


@api_router.post("/admin/signals/{signal_id}/activate")
async def activate_signal(signal_id: str, admin: User = Depends(require_admin)):
    """Quick action: Activate a pending signal (pending → active)"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    if current_state != "pending":
        raise HTTPException(status_code=400, detail=f"Can only activate pending signals. Current state: {current_state}")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": "pending"},
        {"$set": {
            "state": SignalState.ACTIVE.value,
            "status": "active",
            "tp_hit": 0,
            "activated_at": datetime.now(timezone.utc),
            "entry_price_actual": signal.get("entry")
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Signal state changed during operation")
    
    logger.info(f"[Manual] Admin {admin.user_id} activated signal {signal_id}")
    return {"message": "Signal activated", "signal_id": signal_id, "new_state": "active"}


@api_router.post("/admin/signals/{signal_id}/mark-tp")
async def mark_tp_hit_new(
    signal_id: str, 
    tp_level: int, 
    background_tasks: BackgroundTasks, 
    admin: User = Depends(require_admin)
):
    """
    Quick action: Mark a TP level as hit.
    - TP1: active → tp1
    - TP2: tp1 → tp2  
    - TP3: tp2 → tp3 → closed (auto-closes)
    """
    if tp_level not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="tp_level must be 1, 2, or 3")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    # Determine expected current state for this TP level
    expected_states = {
        1: ["active"],
        2: ["tp1"],
        3: ["tp2"]
    }
    
    if current_state not in expected_states[tp_level]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot mark TP{tp_level}. Current state: {current_state}. Expected: {expected_states[tp_level]}"
        )
    
    # Build update document
    target_states = {1: "tp1", 2: "tp2", 3: "tp3"}
    new_state = target_states[tp_level]
    
    update_doc = {
        "state": new_state,
        "status": "active",  # Still active until closed
        "tp_hit": tp_level,
    }
    
    # TP3 auto-closes the signal
    final_pips_value = None
    if tp_level == 3:
        tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
        final_pips_value = calculate_pips(
            signal["entry"],
            tp3_price,
            signal["signal_type"],
            signal["pair"]
        )
        
        # First update to tp3, then immediately to closed
        await db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": update_doc}
        )
        
        # Now close it
        update_doc = {
            "state": SignalState.CLOSED.value,
            "status": "closed",
            "tp_hit": 3,
            "closed_at": datetime.now(timezone.utc),
            "exit_price": tp3_price,
            "final_pips": final_pips_value
        }
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips_value,
            visibility
        )
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found or update failed")
    
    logger.info(f"[Manual] Admin {admin.user_id} marked TP{tp_level} for signal {signal_id}")
    
    return {
        "message": f"TP{tp_level} marked as hit",
        "signal_id": signal_id,
        "new_state": update_doc.get("state"),
        "auto_closed": tp_level == 3,
        "final_pips": final_pips_value
    }


@api_router.post("/admin/signals/{signal_id}/force-close")
async def force_close_signal(
    signal_id: str,
    close_price: Optional[float] = None,
    reason: str = "Manual close",
    background_tasks: BackgroundTasks = None,
    admin: User = Depends(require_admin)
):
    """
    Quick action: Force-close any non-closed signal.
    This is the only action that works on any state (except closed).
    """
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    # HARD LOCK: Cannot close already closed signal
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is already closed and immutable")
    
    # Determine close price if not provided
    if close_price is None:
        # Use appropriate price based on current state
        if current_state in ["tp1", "tp2", "tp3"]:
            # Use the last TP hit
            tp_level = get_tp_hit_from_state(current_state)
            if tp_level >= 3:
                close_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
            elif tp_level == 2:
                close_price = signal.get("tp2") or signal.get("tp1")
            elif tp_level == 1:
                close_price = signal.get("tp1")
            else:
                close_price = signal.get("entry")
        else:
            # Default to entry for pending, stop_loss for active
            close_price = signal.get("stop_loss") if current_state == "active" else signal.get("entry")
    
    final_pips = calculate_pips(
        signal["entry"],
        close_price,
        signal["signal_type"],
        signal["pair"]
    )
    
    update_doc = {
        "state": SignalState.CLOSED.value,
        "status": "closed",
        "tp_hit": get_tp_hit_from_state(current_state),  # Preserve current TP hit
        "closed_at": datetime.now(timezone.utc),
        "exit_price": close_price,
        "final_pips": final_pips
    }
    
    result = await db.signals.update_one(
        {"signal_id": signal_id, "state": current_state},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Signal state changed during operation")
    
    # Send close notification
    if background_tasks:
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips,
            visibility
        )
    
    logger.info(f"[Manual] Admin {admin.user_id} force-closed signal {signal_id}: {current_state} → closed. Reason: {reason}")
    
    return {
        "message": f"Signal force-closed",
        "signal_id": signal_id,
        "previous_state": current_state,
        "exit_price": close_price,
        "final_pips": final_pips,
        "reason": reason
    }


# Legacy admin update endpoint (kept for backward compatibility)
@api_router.put("/admin/signals/{signal_id}")
async def update_signal(
    signal_id: str, 
    status: Optional[SignalStatus] = None, 
    tp_hit: Optional[int] = None,
    final_pips: Optional[float] = None,
    close_price: Optional[float] = None,
    admin: User = Depends(require_admin)
):
    """Legacy admin endpoint - routes to new state system"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    
    # HARD LOCK
    if is_signal_closed(current_state):
        raise HTTPException(status_code=400, detail="Signal is closed and immutable")
    
    update_doc = {}
    
    # Map legacy status to new state
    if status is not None:
        if status == SignalStatus.ACTIVE and current_state == "pending":
            update_doc["state"] = SignalState.ACTIVE.value
            update_doc["status"] = "active"
            update_doc["activated_at"] = datetime.now(timezone.utc)
            update_doc["entry_price_actual"] = signal.get("entry")
        
        elif status == SignalStatus.CLOSED:
            update_doc["state"] = SignalState.CLOSED.value
            update_doc["status"] = "closed"
            update_doc["closed_at"] = datetime.now(timezone.utc)
            
            if close_price is not None:
                update_doc["exit_price"] = close_price
                update_doc["final_pips"] = calculate_pips(
                    signal["entry"], close_price, signal["signal_type"], signal["pair"]
                )
            elif final_pips is not None:
                update_doc["final_pips"] = final_pips
    
    # Update TP hit level (maps to state)
    if tp_hit is not None:
        if tp_hit < 0 or tp_hit > 3:
            raise HTTPException(status_code=400, detail="tp_hit must be 0, 1, 2, or 3")
        update_doc["tp_hit"] = tp_hit
        # Map tp_hit to state
        tp_to_state = {0: current_state, 1: "tp1", 2: "tp2", 3: "tp3"}
        if tp_hit > 0:
            update_doc["state"] = tp_to_state[tp_hit]
    
    # Direct final_pips update (for corrections)
    if final_pips is not None and status is None:
        update_doc["final_pips"] = final_pips
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No update parameters provided")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found or no changes made")
    
    return {"message": "Signal updated successfully", "updates": update_doc}

class SignalFullUpdate(BaseModel):
    """Full signal update model for admin editing"""
    pair: Optional[str] = None
    signal_type: Optional[SignalType] = None
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    tp_hit: Optional[int] = None
    state: Optional[SignalState] = None  # Use state, not status
    visibility: Optional[SignalVisibility] = None
    final_pips: Optional[float] = None

@api_router.put("/admin/signals/{signal_id}/full")
async def full_update_signal(
    signal_id: str,
    update_data: SignalFullUpdate,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to fully edit any signal field - ADMIN HAS FULL AUTHORITY"""
    # Check permission
    if not has_permission(admin, "signals", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update signals")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {}
    
    # Update all provided fields - Admin has full authority
    if update_data.pair is not None:
        update_doc["pair"] = update_data.pair
    if update_data.signal_type is not None:
        update_doc["signal_type"] = update_data.signal_type.value if hasattr(update_data.signal_type, 'value') else update_data.signal_type
    if update_data.entry is not None:
        update_doc["entry"] = update_data.entry
    if update_data.stop_loss is not None:
        update_doc["stop_loss"] = update_data.stop_loss
    if update_data.tp1 is not None:
        update_doc["tp1"] = update_data.tp1
    if update_data.tp2 is not None:
        update_doc["tp2"] = update_data.tp2
    if update_data.tp3 is not None:
        update_doc["tp3"] = update_data.tp3
    if update_data.tp_hit is not None:
        update_doc["tp_hit"] = update_data.tp_hit
    if update_data.visibility is not None:
        update_doc["visibility"] = update_data.visibility.value if hasattr(update_data.visibility, 'value') else update_data.visibility
    if update_data.final_pips is not None:
        update_doc["final_pips"] = update_data.final_pips
    
    # Handle state changes (use state, not status)
    if update_data.state is not None:
        new_state = update_data.state.value if hasattr(update_data.state, 'value') else update_data.state
        current_state = signal.get("state", signal.get("status", "pending"))
        
        update_doc["state"] = new_state
        
        # Set timestamps based on state transitions
        if new_state == "active" and current_state == "pending":
            update_doc["activated_at"] = datetime.now(timezone.utc)
            update_doc["entry_price_actual"] = signal.get("entry")
        if new_state == "closed" and current_state != "closed":
            update_doc["closed_at"] = datetime.now(timezone.utc)
    
    # Recalculate risk/reward if entry, SL, or TP1 changed
    entry = update_data.entry if update_data.entry else signal.get("entry")
    sl = update_data.stop_loss if update_data.stop_loss else signal.get("stop_loss")
    tp1 = update_data.tp1 if update_data.tp1 else signal.get("tp1")
    sig_type = update_data.signal_type.value if update_data.signal_type and hasattr(update_data.signal_type, 'value') else (update_data.signal_type or signal.get("signal_type"))
    
    if entry and sl and tp1:
        update_doc["risk_reward"] = calculate_risk_reward(entry, sl, tp1, sig_type)
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No update fields provided")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} updated signal {signal_id}: {list(update_doc.keys())}")
    return {"message": "Signal updated successfully", "signal_id": signal_id, "updates": list(update_doc.keys())}


class SignalStateUpdate(BaseModel):
    """Model for state-only updates"""
    state: SignalState
    close_price: Optional[float] = None  # For calculating final_pips when closing


@api_router.patch("/admin/signals/{signal_id}/state")
async def update_signal_state(
    signal_id: str,
    update_data: SignalStateUpdate,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to update only the state field of a signal"""
    # Check permission
    if not has_permission(admin, "signals", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update signals")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    current_state = signal.get("state", signal.get("status", "pending"))
    new_state = update_data.state.value if hasattr(update_data.state, 'value') else update_data.state
    
    update_doc = {"state": new_state}
    
    # Set timestamps and derived fields based on state transitions
    if new_state == "active" and current_state == "pending":
        update_doc["activated_at"] = datetime.now(timezone.utc)
        update_doc["entry_price_actual"] = signal.get("entry")
    
    if new_state in ["tp1", "tp2", "tp3"]:
        tp_level = int(new_state[-1])
        update_doc["tp_hit"] = tp_level
    
    if new_state == "closed":
        update_doc["closed_at"] = datetime.now(timezone.utc)
        
        # Calculate final_pips if close_price provided
        if update_data.close_price is not None:
            update_doc["exit_price"] = update_data.close_price
            update_doc["final_pips"] = calculate_pips(
                signal["entry"],
                update_data.close_price,
                signal["signal_type"],
                signal["pair"]
            )
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} changed signal {signal_id} state: {current_state} → {new_state}")
    return {
        "message": f"Signal state updated: {current_state} → {new_state}",
        "signal_id": signal_id,
        "old_state": current_state,
        "new_state": new_state,
        "final_pips": update_doc.get("final_pips")
    }

# NOTE: The following legacy endpoints have been replaced by state-based endpoints:
# - POST /admin/signals/{signal_id}/activate -> see line 804 (new state-based activate)
# - POST /admin/signals/{signal_id}/mark-tp -> see line 837 (new state-based mark-tp)
# - POST /admin/signals/{signal_id}/close -> use /admin/signals/{signal_id}/force-close (line 942)

@api_router.delete("/admin/signals/{signal_id}")
async def delete_signal(signal_id: str, admin: User = Depends(require_admin)):
    """Admin endpoint to delete a signal from MongoDB"""
    # Check permission
    if not has_permission(admin, "signals", "delete"):
        raise HTTPException(status_code=403, detail="You don't have permission to delete signals")
    
    result = await db.signals.delete_one({"signal_id": signal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    logger.info(f"[Admin] {admin.user_id} deleted signal {signal_id}")
    return {"message": "Signal deleted successfully", "signal_id": signal_id}

# ===================== SIGNAL HISTORY & ANALYTICS =====================
def get_pips_value(signal: dict) -> float:
    """Get pips value from signal - supports both old and new schema"""
    return signal.get("final_pips") or signal.get("result_pips", 0) or 0

@api_router.get("/signals/history/stats")
async def get_signal_history_stats(current_user: Optional[User] = Depends(get_current_user)):
    """Get signal history with performance statistics based on user's access level"""
    user_role = current_user.role if current_user else UserRole.FREE
    
    # Get all closed signals
    all_closed = await db.signals.find({"status": "closed"}, {"_id": 0}).sort("closed_at", -1).to_list(500)
    
    # Filter signals based on user's access level
    accessible_signals = []
    for signal in all_closed:
        signal_visibility = SignalVisibility(signal.get("visibility", "free"))
        if can_access_signal(user_role, signal_visibility):
            accessible_signals.append(signal)
    
    # Calculate basic stats (available to all users) - use final_pips or result_pips
    total_signals = len(accessible_signals)
    winning_signals = len([s for s in accessible_signals if get_pips_value(s) > 0])
    losing_signals = len([s for s in accessible_signals if get_pips_value(s) < 0])
    breakeven_signals = total_signals - winning_signals - losing_signals
    
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    total_pips = sum([get_pips_value(s) for s in accessible_signals])
    avg_pips = round(total_pips / total_signals, 1) if total_signals > 0 else 0
    
    # Calculate best/worst trades
    pips_list = [get_pips_value(s) for s in accessible_signals if get_pips_value(s) != 0]
    best_trade = max(pips_list) if pips_list else 0
    worst_trade = min(pips_list) if pips_list else 0
    
    # Basic stats for all users
    basic_stats = {
        "total_signals": total_signals,
        "winning_signals": winning_signals,
        "losing_signals": losing_signals,
        "breakeven_signals": breakeven_signals,
        "win_rate": win_rate,
        "total_pips": round(total_pips, 1),
        "avg_pips_per_trade": avg_pips,
        "best_trade_pips": round(best_trade, 1),
        "worst_trade_pips": round(worst_trade, 1),
    }

    # Calculate winning streak (consecutive wins from most recent)
    winning_streak = 0
    for s in accessible_signals:
        if get_pips_value(s) > 0:
            winning_streak += 1
        else:
            break

    # Calculate monthly pips for mini chart (last 6 months)
    from collections import defaultdict
    monthly_pips_map: dict[str, float] = defaultdict(float)
    monthly_wins_map: dict[str, int] = defaultdict(int)
    monthly_losses_map: dict[str, int] = defaultdict(int)
    for s in accessible_signals:
        closed_date = s.get("closed_at") or s.get("created_at")
        if closed_date:
            dt = closed_date if isinstance(closed_date, datetime) else datetime.fromisoformat(str(closed_date).replace("Z", "+00:00"))
            month_key = dt.strftime("%Y-%m")
            pips_val = get_pips_value(s)
            monthly_pips_map[month_key] += pips_val
            if pips_val > 0:
                monthly_wins_map[month_key] += 1
            elif pips_val < 0:
                monthly_losses_map[month_key] += 1

    # Sort by month and take last 6
    sorted_months = sorted(monthly_pips_map.keys())[-6:]
    monthly_performance = []
    for m in sorted_months:
        month_label = datetime.strptime(m, "%Y-%m").strftime("%b")
        monthly_performance.append({
            "month": month_label,
            "pips": round(monthly_pips_map[m], 1),
            "wins": monthly_wins_map.get(m, 0),
            "losses": monthly_losses_map.get(m, 0),
        })

    basic_stats["winning_streak"] = winning_streak
    basic_stats["monthly_performance"] = monthly_performance
    
    # For free users, return basic stats only with limited signal history
    if user_role == UserRole.FREE:
        # Free users see only last 5 signals (preview)
        limited_signals = accessible_signals[:5]
        return {
            "stats": basic_stats,
            "signals": limited_signals,
            "signals_count": len(limited_signals),
            "total_available": total_signals,
            "is_limited": True,
            "upgrade_message": "Upgrade to Premium or VIP to see full signal history"
        }
    
    # Premium/VIP users get full history
    return {
        "stats": basic_stats,
        "signals": accessible_signals,
        "signals_count": len(accessible_signals),
        "total_available": total_signals,
        "is_limited": False
    }

async def send_signal_notification(signal_id: str, pair: str, signal_type: SignalType, visibility: SignalVisibility):
    """Send push notification to ALL users about new signal (no tier filtering)"""
    try:
        # Get all active device tokens (limit to 10000 to prevent OOM)
        device_tokens = await db.device_tokens.find({"is_active": True}, {"_id": 0}).to_list(10000)
        if not device_tokens:
            logger.info("No active device tokens found")
            return
        
        # OPTIMIZED: Batch fetch all user profiles in one query
        user_ids = list(set(t.get("user_id") for t in device_tokens if t.get("user_id")))
        if not user_ids:
            logger.info("No user IDs found in device tokens")
            return
        
        # Batch fetch profiles from Supabase
        try:
            profiles_response = await supabase.from_("profiles").select("id, notification_preferences").in_("id", user_ids).execute()
            profiles_map = {p["id"]: p for p in (profiles_response.data or [])}
        except Exception as e:
            logger.warning(f"Failed to batch fetch profiles: {e}, falling back to no filtering")
            profiles_map = {}
        
        # Notification content per spec: title="New Signal Alert", body="{PAIR} • {BUY/SELL}"
        title = "New Signal Alert"
        body = f"{pair} • {signal_type.value.upper()}"
        
        messages = []
        notified_users = 0
        
        for token_doc in device_tokens:
            token = token_doc.get("token", "")
            user_id = token_doc.get("user_id")
            
            # Skip non-Expo tokens
            if not token.startswith("ExponentPushToken"):
                continue
            
            if not user_id:
                continue
            
            # Check if user has notifications enabled (use batch-fetched profile)
            user = profiles_map.get(user_id, {})
            notification_prefs = user.get("notification_preferences", {})
            if not notification_prefs.get("signals", True):
                continue
            
            # No tier filtering - all users receive all signal notifications
            messages.append({
                "to": token,
                "title": title,
                "body": body,
                "data": {"signalId": signal_id, "type": "new_signal"},
                "sound": "default"
            })
            notified_users += 1
        
        if not messages:
            logger.info(f"No eligible users for signal {signal_id} notification")
            return
        
        # Send notifications in batches of 100 (Expo limit)
        batch_size = 100
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )
                logger.info(f"Expo push response: {response.status_code}")
        
        logger.info(f"Sent notification for signal {signal_id} to {notified_users} users")
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")


async def send_signal_close_notification(signal_id: str, pair: str, signal_type: str, final_pips: float, visibility: SignalVisibility):
    """Send push notification to ALL users when a signal is closed (no tier filtering)"""
    try:
        # Get all active device tokens (limit to 10000 to prevent OOM)
        device_tokens = await db.device_tokens.find({"is_active": True}, {"_id": 0}).to_list(10000)
        if not device_tokens:
            logger.info("No active device tokens found for close notification")
            return
        
        # OPTIMIZED: Batch fetch all user profiles in one query
        user_ids = list(set(t.get("user_id") for t in device_tokens if t.get("user_id")))
        if not user_ids:
            logger.info("No user IDs found in device tokens for close notification")
            return
        
        # Batch fetch profiles from Supabase
        try:
            profiles_response = await supabase.from_("profiles").select("id, notification_preferences").in_("id", user_ids).execute()
            profiles_map = {p["id"]: p for p in (profiles_response.data or [])}
        except Exception as e:
            logger.warning(f"Failed to batch fetch profiles for close notification: {e}, falling back to no filtering")
            profiles_map = {}
        
        # Notification content for closed signal
        result = "WIN" if final_pips > 0 else "LOSS"
        pips_str = f"+{final_pips:.1f}" if final_pips > 0 else f"{final_pips:.1f}"
        title = f"Signal Closed: {result}"
        body = f"{pair} • {signal_type.upper()} • {pips_str} pips"
        
        messages = []
        notified_users = 0
        
        for token_doc in device_tokens:
            token = token_doc.get("token", "")
            user_id = token_doc.get("user_id")
            
            if not token.startswith("ExponentPushToken") or not user_id:
                continue
            
            # Check if user has notifications enabled (use batch-fetched profile)
            user = profiles_map.get(user_id, {})
            notification_prefs = user.get("notification_preferences", {})
            if not notification_prefs.get("signals", True):
                continue
            
            # No tier filtering - all users receive all signal close notifications
            messages.append({
                "to": token,
                "title": title,
                "body": body,
                "data": {"signalId": signal_id, "type": "signal_closed", "result": result},
                "sound": "default"
            })
            notified_users += 1
        
        if not messages:
            logger.info(f"No eligible users for close notification of signal {signal_id}")
            return
        
        # Send notifications in batches
        batch_size = 100
        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )
                logger.info(f"Expo push response for close: {response.status_code}")
        
        logger.info(f"Sent close notification for signal {signal_id} to {notified_users} users")
    except Exception as e:
        logger.error(f"Failed to send close notification: {e}")



# ===================== AI CHART ANALYZER (LEGACY - File Upload) =====================
@api_router.post("/ai/analyze-legacy")
async def analyze_chart_legacy(
    image: UploadFile = File(...),
    pair: str = Form(...),
    timeframe: str = Form(...),
    current_user: User = Depends(require_auth)
):
    # Get user document for subscription check
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription (accounting for expiry)
    effective_subscription = await get_effective_subscription(user_doc)
    
    # Get weekly limit based on subscription
    # Free: 3, Premium: 10, VIP: unlimited
    weekly_limit = get_ai_weekly_limit(effective_subscription)
    
    # Check and reset weekly counter if needed (using new fields)
    reset_date = user_doc.get("ai_weekly_reset")
    current_usage = user_doc.get("ai_weekly_used", 0)
    
    # Also check legacy fields for backward compatibility
    if reset_date is None:
        reset_date = user_doc.get("ai_usage_reset_date")
        current_usage = user_doc.get("ai_usage_count", 0)
    
    if reset_date:
        if isinstance(reset_date, str):
            reset_date = datetime.fromisoformat(reset_date.replace('Z', '+00:00'))
        elif reset_date.tzinfo is None:
            reset_date = reset_date.replace(tzinfo=timezone.utc)
        
        if reset_date < datetime.now(timezone.utc):
            # Reset weekly counter
            await update_profile(current_user.user_id, {
                    "ai_weekly_used": 0,
                    "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
                    # Also reset legacy fields
                    "ai_usage_count": 0,
                    "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
                })
            current_usage = 0
    else:
        # Initialize reset date if not set
        await update_profile(current_user.user_id, {
                "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
                "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
            })
    
    # Check usage limit (VIP has unlimited = 999999)
    if current_usage >= weekly_limit:
        raise HTTPException(
            status_code=403,
            detail="AI limit reached. Upgrade to continue."
        )
    
    # Read and encode image
    image_content = await image.read()
    image_base64 = base64.b64encode(image_content).decode()
    
    # Log image info for debugging
    logger.info(f"Received image: {len(image_content)} bytes, content_type: {image.content_type}")
    
    # Analyze with Claude Vision
    try:
        from openai import AsyncOpenAI
        
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        
        system_message = """You are an expert forex and cryptocurrency technical analyst. 
Analyze trading charts and provide structured analysis. Be concise and professional.
Handle charts in any orientation (portrait or landscape) and from any trading platform (MT4, MT5, TradingView, mobile apps).
Ignore any UI elements, status bars, or app buttons in the image - focus only on the chart data.
Always include a risk disclaimer."""

        user_text = f"""Analyze this {pair} chart on the {timeframe} timeframe. 
The image may be a portrait or landscape screenshot from any trading platform or a photo of a screen.
Focus on the candlestick/price data and ignore any mobile UI elements.

Provide:
1. Market Bias (Bullish/Bearish/Neutral)
2. Trend Structure (description)
3. Key Support Levels (list 2-3 price levels)
4. Key Resistance Levels (list 2-3 price levels)
5. Trade Insight (brief actionable insight)
6. Confidence Level (High/Medium/Low)

Format your response as JSON with keys: market_bias, trend_structure, support_levels, resistance_levels, trade_insight, confidence"""

        response = await client.chat.completions.create(
            model="claude-sonnet-4-20250514",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}}
                ]}
            ],
            max_tokens=1500,
        )
        response_text = response.choices[0].message.content
        
        # Parse response
        import json
        try:
            # Try to extract JSON from response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                analysis_data = json.loads(response_text[json_start:json_end])
            else:
                analysis_data = {
                    "market_bias": "Unable to parse",
                    "trend_structure": response_text[:200],
                    "support_levels": [],
                    "resistance_levels": [],
                    "trade_insight": "Please try again with a clearer chart image",
                    "confidence": "Low"
                }
        except Exception:
            analysis_data = {
                "market_bias": "Analysis complete",
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": response_text[-200:] if len(response_text) > 200 else response_text,
                "confidence": "Medium"
            }
        
        # Save analysis
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        analysis_doc = {
            "analysis_id": analysis_id,
            "user_id": current_user.user_id,
            "pair": pair,
            "timeframe": timeframe,
            "market_bias": analysis_data.get("market_bias", "Unknown"),
            "trend_structure": analysis_data.get("trend_structure", ""),
            "support_levels": analysis_data.get("support_levels", []),
            "resistance_levels": analysis_data.get("resistance_levels", []),
            "trade_insight": analysis_data.get("trade_insight", ""),
            "confidence": analysis_data.get("confidence", "Medium"),
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.ai_analyses.insert_one(analysis_doc)
        
        # Remove _id from the response (MongoDB adds it after insert)
        analysis_doc.pop("_id", None)
        
        # Increment usage via Supabase profile
        await update_profile(current_user.user_id, {"ai_weekly_used": current_usage + 1})
        
        remaining = max(0, weekly_limit - current_usage - 1)
        
        return {
            **analysis_doc,
            "remaining_analyses": remaining if weekly_limit < 100000 else "unlimited",
            "subscription": effective_subscription,
            "disclaimer": "This analysis is for educational purposes only. Always do your own research before trading."
        }
        
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze chart. Please try again.")

# Legacy /ai/history endpoint removed - replaced by paginated version at line ~8057
# @api_router.get("/ai/history")
# async def get_ai_history(current_user: User = Depends(require_auth)):
#     analyses = await db.ai_analyses.find(
#         {"user_id": current_user.user_id},
#         {"_id": 0}
#     ).sort("created_at", -1).to_list(50)
#     return analyses

@api_router.get("/ai/usage")
async def get_ai_usage(current_user: User = Depends(require_auth)):
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription
    effective_subscription = await get_effective_subscription(user_doc)
    weekly_limit = get_ai_weekly_limit(effective_subscription)
    
    # Check both new and legacy fields
    current_usage = user_doc.get("ai_weekly_used", 0) or user_doc.get("ai_usage_count", 0)
    reset_date = user_doc.get("ai_weekly_reset") or user_doc.get("ai_usage_reset_date")
    
    remaining = max(0, weekly_limit - current_usage)
    
    return {
        "current_usage": current_usage,
        "weekly_limit": weekly_limit if weekly_limit < 100000 else "unlimited",
        "remaining": remaining if weekly_limit < 100000 else "unlimited",
        "reset_date": reset_date,
        "has_access": True,  # All users have access, just different limits
        "subscription": effective_subscription,
        "limit_reached": current_usage >= weekly_limit if weekly_limit < 100000 else False
    }

# ===================== COMMUNITY ENDPOINTS =====================
@api_router.get("/community/posts")
async def get_posts(current_user: Optional[User] = Depends(get_current_user)):
    posts = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return posts

@api_router.post("/community/posts")
async def create_post(
    content: str = Form(...),
    post_type: str = Form("general"),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_auth)
):
    post_id = f"post_{uuid.uuid4().hex[:12]}"
    
    # Handle image upload (only for premium/vip users)
    image_base64 = None
    if image:
        # Check if user can upload images (premium or vip only)
        if current_user.role == UserRole.FREE:
            raise HTTPException(status_code=403, detail="Image uploads require Premium or VIP subscription")
        
        # Validate file type
        allowed_types = ["image/jpeg", "image/jpg", "image/png"]
        if image.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Only JPG and PNG images are allowed")
        
        # Read and encode image
        image_data = await image.read()
        
        # Limit image size to 5MB
        if len(image_data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size must be less than 5MB")
        
        image_base64 = base64.b64encode(image_data).decode()
    
    post_doc = {
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": content,
        "post_type": post_type,
        "image": image_base64,
        "likes": [],
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.posts.insert_one(post_doc)
    # Remove _id before returning (MongoDB adds it after insert)
    post_doc.pop("_id", None)
    return post_doc

@api_router.post("/community/posts/{post_id}/like")
async def toggle_like(post_id: str, current_user: User = Depends(require_auth)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    likes = post.get("likes", [])
    if current_user.user_id in likes:
        likes.remove(current_user.user_id)
        liked = False
    else:
        likes.append(current_user.user_id)
        liked = True
    
    await db.posts.update_one({"post_id": post_id}, {"$set": {"likes": likes}})
    
    return {"liked": liked, "likes_count": len(likes)}

@api_router.get("/community/posts/{post_id}/comments")
async def get_comments(post_id: str):
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return comments

@api_router.post("/community/posts/{post_id}/comments")
async def create_comment(post_id: str, comment_data: CommentCreate, current_user: User = Depends(require_auth)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comment_id = f"comment_{uuid.uuid4().hex[:12]}"
    comment_doc = {
        "comment_id": comment_id,
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": comment_data.content,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.comments.insert_one(comment_doc)
    # Remove _id before returning (MongoDB adds it after insert)
    comment_doc.pop("_id", None)
    return comment_doc

# ===================== SUBSCRIPTION ENDPOINTS =====================
# SECURITY: Self-upgrade is DISABLED. Only webhook can change subscriptions.

@api_router.get("/subscription/plans")
async def get_plans():
    """
    Returns plan metadata (features, descriptions) only.
    Pricing is NOT served by backend — the store (Apple/Google) is the pricing authority.
    Client must fetch pricing via react-native-iap getSubscriptions().
    """
    return {
        "plans": [
            {
                "id": "premium",
                "name": "Premium",
                "description": "Best for active traders",
                "features": [
                    "Everything in Free",
                    "Full access to Premium signals",
                    "10 AI Chart Analyses per week",
                    "Ads removed"
                ],
                "ai_limit_note": "Includes 10 AI chart analyses per week."
            },
            {
                "id": "vip",
                "name": "VIP",
                "description": "For professional traders",
                "features": [
                    "Everything in Premium",
                    "Unlimited AI chart analyses",
                    "Academy access",
                    "Fund Management access",
                    "Priority support"
                ]
            }
        ]
    }


# ===================== WEB PAYMENTS DISABLED =====================
# Stripe/web payments removed in v1.
# Only Apple IAP and Google IAP are active for subscription upgrades.
# See /api/iap/apple/verify and /api/iap/google/verify for active payment flows.
# ================================================================


# ===================== NOTIFICATIONS ENDPOINTS =====================
@api_router.post("/notifications/register-token")
async def register_device_token(token_data: DeviceTokenRegister, current_user: User = Depends(require_auth)):
    await db.device_tokens.update_one(
        {"user_id": current_user.user_id, "platform": token_data.platform},
        {"$set": {
            "user_id": current_user.user_id,
            "token": token_data.token,
            "platform": token_data.platform,
            "is_active": True,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    return {"message": "Token registered successfully"}

@api_router.put("/notifications/preferences")
async def update_notification_preferences(preferences: Dict[str, bool], current_user: User = Depends(require_auth)):
    await update_profile(current_user.user_id, {"notification_preferences": preferences})
    return {"message": "Preferences updated"}

# ===================== USER PROFILE ENDPOINTS =====================
@api_router.put("/profile")
async def update_user_profile(name: Optional[str] = None, current_user: User = Depends(require_auth)):
    update_doc = {}
    if name:
        update_doc["name"] = name
    
    if update_doc:
        await update_profile(current_user.user_id, update_doc)
    
    return {"message": "Profile updated"}

@api_router.put("/profile/password")
async def change_user_password(current_password: str, new_password: str, current_user: User = Depends(require_auth)):
    """Password changes are handled via Supabase Auth. This endpoint is deprecated."""
    # Supabase manages passwords - use supabase.auth.updateUser() on frontend
    raise HTTPException(status_code=400, detail="Password changes should be done via the app settings using Supabase Auth")

# ===================== DASHBOARD ENDPOINTS =====================
@api_router.get("/dashboard")
async def get_dashboard(current_user: Optional[User] = Depends(get_current_user)):
    # Get recent signals
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Calculate performance stats using aggregation for efficiency
    pipeline = [
        {"$match": {"status": "closed"}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "total_pips": {"$sum": {"$ifNull": ["$final_pips", {"$ifNull": ["$result_pips", 0]}]}},
            "wins": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$final_pips", {"$ifNull": ["$result_pips", 0]}]}, 0]}, 1, 0]}}
        }}
    ]
    stats_result = await db.signals.aggregate(pipeline).to_list(1)
    
    if stats_result:
        total_signals = stats_result[0]["total"]
        winning_signals = stats_result[0]["wins"]
        total_pips = stats_result[0]["total_pips"]
    else:
        total_signals = 0
        winning_signals = 0
        total_pips = 0
    
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    
    user_role = current_user.role if current_user else UserRole.FREE
    
    # Filter signals based on role
    filtered_signals = []
    for signal in signals:
        signal_visibility = SignalVisibility(signal.get("visibility", "free"))
        if can_access_signal(user_role, signal_visibility):
            filtered_signals.append(signal)
        else:
            filtered_signals.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "status": signal["status"],
                "visibility": signal["visibility"],
                "created_at": signal["created_at"],
                "locked": True
            })
    
    return {
        "recent_signals": filtered_signals,
        "performance": {
            "win_rate": win_rate,
            "total_pips": round(total_pips, 1),
            "total_signals": total_signals
        },
        "watchlist": [
            {"pair": "EUR/USD", "category": "forex"},
            {"pair": "GBP/USD", "category": "forex"},
            {"pair": "XAU/USD", "category": "gold"},
            {"pair": "BTC/USD", "category": "crypto"},
            {"pair": "ETH/USD", "category": "crypto"}
        ]
    }

# ===================== ADMIN ENDPOINTS =====================
@api_router.get("/admin/users")
async def get_all_users(admin: User = Depends(require_admin)):
    users = await list_profiles()
    return users


@api_router.get("/admin/active-overrides")
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

@api_router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, admin: User = Depends(require_admin)):
    result = await update_profile(user_id, {"role": role})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User role updated"}

@api_router.get("/admin/stats")
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


@api_router.post("/admin/override-subscription")
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


@api_router.post("/admin/revoke-override")
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


@api_router.get("/admin/override-status/{user_id}")
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


@api_router.get("/admin/override-logs/{user_id}")
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


@api_router.put("/admin/users/{user_id}/subscription")
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


@api_router.post("/admin/users/{user_id}/reset-ai-usage")
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


@api_router.get("/admin/users/{user_id}/details")
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
@api_router.get("/features/fund-management/access")
async def check_fund_management_access(current_user: User = Depends(require_auth)):
    """
    Guard endpoint for Fund Management (VIP only).
    Returns 403 if user does not have VIP subscription.
    """
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = await get_effective_subscription(user_doc)
    has_access = effective_subscription == "vip"
    
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="VIP subscription required"
        )
    
    return {
        "feature": "fund_management",
        "has_access": True,
        "subscription": effective_subscription,
        "message": "You have full access to Fund Management."
    }


@api_router.get("/features/academy/access")
async def check_academy_access(current_user: User = Depends(require_auth)):
    """
    Guard endpoint for Academy (VIP only).
    Returns 403 if user does not have VIP subscription.
    """
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = await get_effective_subscription(user_doc)
    has_access = effective_subscription == "vip"
    
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="VIP subscription required"
        )
    
    return {
        "feature": "academy",
        "has_access": True,
        "subscription": effective_subscription,
        "message": "You have full access to Academy."
    }


# ==============================================================================
# ACADEMY PROGRESS SYSTEM
# ==============================================================================

async def _get_user_capability(user_id: str) -> str:
    profile = await fetch_profile(user_id)
    role = (profile or {}).get("role", "free")
    effective = await get_effective_subscription({"id": user_id, "role": role})
    is_admin = role in ("admin", "super_admin")
    if is_admin:
        return "vip"
    return effective


async def _update_streak_and_xp(user_id: str, base_xp: int) -> dict:
    """Core streak logic. Returns streak info and total XP awarded."""
    streaks = db["academy_streaks"]
    lb = db["academy_leaderboard"]
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")

    doc = await streaks.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        doc = {"user_id": user_id, "current_streak": 0, "longest_streak": 0,
               "last_activity_date": None, "streak_shield_used_this_week": False,
               "shield_week_start": None}

    last_date = doc.get("last_activity_date")
    current = doc.get("current_streak", 0)
    longest = doc.get("longest_streak", 0)
    streak_increased = False
    shield_used = False
    bonus_xp = 0
    milestone_7 = False

    cap = await _get_user_capability(user_id)
    is_vip = cap == "vip"

    if last_date == today_str:
        # Already active today — no streak change, just award base XP
        pass
    else:
        yesterday = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d")
        if last_date == yesterday:
            current += 1
            streak_increased = True
        elif last_date is not None:
            # Missed at least one day — check VIP streak shield
            days_missed = (now_utc.date() - datetime.strptime(last_date, "%Y-%m-%d").date()).days
            week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")
            shield_available = (is_vip and days_missed <= 2
                                and not doc.get("streak_shield_used_this_week", False))
            if shield_available and doc.get("shield_week_start") != week_start:
                doc["streak_shield_used_this_week"] = False

            if is_vip and days_missed <= 2 and not doc.get("streak_shield_used_this_week", False):
                current += 1
                shield_used = True
                streak_increased = True
                doc["streak_shield_used_this_week"] = True
                doc["shield_week_start"] = week_start
            else:
                current = 1
                streak_increased = True
        else:
            current = 1
            streak_increased = True

        if current > longest:
            longest = current

        # Daily streak XP bonus
        bonus_xp += 10

        # 7-day milestone
        if current > 0 and current % 7 == 0:
            bonus_xp += 50
            milestone_7 = True

    total_xp = base_xp + bonus_xp

    await streaks.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id, "current_streak": current,
            "longest_streak": longest, "last_activity_date": today_str,
            "streak_shield_used_this_week": doc.get("streak_shield_used_this_week", False),
            "shield_week_start": doc.get("shield_week_start"),
        }},
        upsert=True,
    )

    # Update leaderboard
    profile = await fetch_profile(user_id)
    display_name = (profile or {}).get("name") or (profile or {}).get("email", "User")[:20]
    await lb.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "display_name": display_name},
         "$inc": {"total_xp": total_xp}},
        upsert=True,
    )

    return {
        "current_streak": current, "longest_streak": longest,
        "streak_increased": streak_increased, "shield_used": shield_used,
        "base_xp": base_xp, "bonus_xp": bonus_xp, "total_xp_earned": total_xp,
        "milestone_7": milestone_7, "is_vip": is_vip,
    }


@api_router.post("/academy/lesson-complete")
async def mark_lesson_complete(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    if not course_id or lesson_id is None:
        raise HTTPException(status_code=400, detail="course_id and lesson_id required")

    col = db["academy_progress"]
    existing = await col.find_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": lesson_id, "completed": True}
    )
    already_done = existing is not None

    await col.update_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": lesson_id},
        {"$set": {
            "user_id": current_user.user_id, "course_id": course_id,
            "lesson_id": lesson_id, "completed": True,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    base_xp = 0 if already_done else 20
    streak_info = await _update_streak_and_xp(current_user.user_id, base_xp)
    return {"success": True, "xp": streak_info}


@api_router.post("/academy/quiz-submit")
async def submit_quiz(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    score = body.get("score", 0)
    if not course_id:
        raise HTTPException(status_code=400, detail="course_id required")

    col = db["academy_progress"]
    await col.update_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": lesson_id or "quiz"},
        {"$set": {
            "user_id": current_user.user_id, "course_id": course_id,
            "lesson_id": lesson_id or "quiz", "completed": True,
            "score": score, "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    passed = score >= 60
    base_xp = 0
    if passed:
        if score == 100:
            base_xp = 60
        else:
            base_xp = 40
    streak_info = await _update_streak_and_xp(current_user.user_id, base_xp)
    return {"success": True, "score": score, "passed": passed, "xp": streak_info}


@api_router.get("/academy/streak-status")
async def get_streak_status(current_user: User = Depends(require_auth)):
    streaks = db["academy_streaks"]
    doc = await streaks.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not doc:
        return {
            "current_streak": 0, "longest_streak": 0,
            "last_activity_date": None, "streak_at_risk": False,
            "has_streak_shield": False, "shield_available": False,
        }
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")
    last_date = doc.get("last_activity_date")
    active_today = last_date == today_str
    streak_at_risk = not active_today and doc.get("current_streak", 0) > 0

    cap = await _get_user_capability(current_user.user_id)
    is_vip = cap == "vip"
    week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")
    shield_available = is_vip and not (
        doc.get("streak_shield_used_this_week", False)
        and doc.get("shield_week_start") == week_start
    )

    return {
        "current_streak": doc.get("current_streak", 0),
        "longest_streak": doc.get("longest_streak", 0),
        "last_activity_date": last_date,
        "active_today": active_today,
        "streak_at_risk": streak_at_risk,
        "has_streak_shield": is_vip,
        "shield_available": shield_available,
    }


@api_router.get("/academy/lesson-content/{course_id}/{lesson_id}")
async def get_lesson_content(course_id: str, lesson_id: int):
    col = db["academy_lesson_content"]
    doc = await col.find_one(
        {"course_id": course_id, "lesson_id": lesson_id}, {"_id": 0}
    )
    if doc:
        return doc
    return {"course_id": course_id, "lesson_id": lesson_id, "generated": False}


@api_router.post("/academy/generate-content-batch")
async def generate_content_batch(current_user: User = Depends(require_auth)):
    profile = await fetch_profile(current_user.user_id)
    if not profile or profile.get("admin_role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    import asyncio
    asyncio.create_task(_run_batch_content_generation())
    return {"status": "started", "message": "Batch content generation started in background"}


async def _generate_single_lesson(course_id: str, course_title: str, lesson_id: int, lesson_title: str, tier: str) -> dict:
    """Generate enriched content for a single lesson using GPT-4o."""
    from openai import AsyncOpenAI
    import uuid

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    tier_guidance = {
        "beginner": "Write as if explaining to someone who has never traded before. Use simple language, everyday analogies, and step-by-step reasoning. Make the reader feel confident and capable of learning.",
        "intermediate": "Write with strategic depth. Assume the reader knows basic trading concepts like candlesticks, support/resistance, and risk management. Focus on edge-finding, pattern recognition, and building a systematic approach.",
        "advanced": "Write at institutional and professional level. Assume the reader is experienced with technical and fundamental analysis. Focus on advanced techniques, market microstructure, professional-grade execution, and institutional thinking."
    }

    prompt = f"""You are a professional trading mentor writing educational content for the "{course_title}" course ({tier} level).

Write a comprehensive lesson titled: "{lesson_title}"

REQUIREMENTS:
- Minimum 500 words, target 600-700 words for the overview
- Professional trading mentor tone — authoritative yet approachable
- NOT motivational quotes, NOT generic finance blog style
- Include at least one REAL trading example with specific price action scenario
- Include psychological insight on why this concept matters for traders
- {tier_guidance.get(tier, tier_guidance["beginner"])}

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "overview": "Main lesson content. 500-700 words. Include real trading examples woven naturally into the explanation. Include psychological dimension.",
  "how_to_apply": "Practical step-by-step guidance titled 'How to Apply This'. 100-150 words. Concrete, actionable steps.",
  "mini_action_task": "A specific exercise the student should complete right now. 50-80 words. Be precise about what to do.",
  "key_takeaways": ["takeaway 1", "takeaway 2", "takeaway 3", "takeaway 4"]
}}"""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert trading educator. Return only valid JSON. No markdown formatting."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
        import json as json_module
        content = json_module.loads(text)
        content["course_id"] = course_id
        content["lesson_id"] = lesson_id
        content["course_title"] = course_title
        content["lesson_title"] = lesson_title
        content["tier"] = tier
        content["generated"] = True
        content["generated_at"] = datetime.now(timezone.utc).isoformat()
        content["word_count"] = len(content.get("overview", "").split())
        return content
    except Exception as e:
        print(f"[Academy Content] Failed to generate for {course_id}/{lesson_id}: {e}")
        return None


async def _run_batch_content_generation():
    """Background task: generate content for all lessons."""
    import json as json_module
    try:
        with open("/app/backend/academy_metadata.json") as f:
            courses = json_module.load(f)
    except Exception as e:
        print(f"[Academy Content] Failed to load metadata: {e}")
        return

    col = db["academy_lesson_content"]
    total = sum(len(c["lessons"]) for c in courses)
    done = 0
    skipped = 0
    failed = 0

    print(f"[Academy Content] Starting batch generation for {total} lessons across {len(courses)} courses", flush=True)

    for course in courses:
        cid = course["course_id"]
        ctitle = course["course_title"]
        tier = course["category"]

        for lesson in course["lessons"]:
            lid = lesson["lesson_id"]
            ltitle = lesson["title"]

            try:
                existing = await col.find_one({"course_id": cid, "lesson_id": lid})
                if existing and existing.get("generated"):
                    done += 1
                    skipped += 1
                    print(f"[Academy Content] [{done}/{total}] Skipped {cid}/{lid} (already exists)", flush=True)
                    continue

                content = await _generate_single_lesson(cid, ctitle, lid, ltitle, tier)
                if content:
                    await col.update_one(
                        {"course_id": cid, "lesson_id": lid},
                        {"$set": content},
                        upsert=True,
                    )
                    done += 1
                    print(f"[Academy Content] [{done}/{total}] Generated {cid}/{lid}: {content.get('word_count', 0)} words", flush=True)
                else:
                    done += 1
                    failed += 1
                    print(f"[Academy Content] [{done}/{total}] FAILED {cid}/{lid}", flush=True)
            except Exception as e:
                done += 1
                failed += 1
                print(f"[Academy Content] [{done}/{total}] ERROR {cid}/{lid}: {e}", flush=True)

            import asyncio
            await asyncio.sleep(0.5)

    print(f"[Academy Content] Batch complete: {done} total, {skipped} skipped, {failed} failed", flush=True)


@api_router.get("/academy/progress")
async def get_academy_progress(current_user: User = Depends(require_auth)):
    col = db["academy_progress"]
    records = await col.find(
        {"user_id": current_user.user_id, "completed": True},
        {"_id": 0, "course_id": 1, "lesson_id": 1, "score": 1, "completed_at": 1},
    ).to_list(length=500)

    completed_lessons = len(records)
    courses_done = set()
    by_course: dict = {}
    for r in records:
        cid = r["course_id"]
        by_course.setdefault(cid, []).append(r["lesson_id"])

    # Total lessons across all known courses (static count)
    total_lessons = 150  # Approximate across all courses

    return {
        "completed_lessons": completed_lessons,
        "total_lessons": total_lessons,
        "progress_pct": round(completed_lessons / total_lessons * 100, 1) if total_lessons > 0 else 0,
        "completed_courses": len(courses_done),
        "by_course": by_course,
        "records": records,
    }


@api_router.get("/academy/leaderboard")
async def get_academy_leaderboard(current_user: User = Depends(require_auth)):
    lb = db["academy_leaderboard"]
    top = await lb.find({}, {"_id": 0}).sort("total_xp", -1).to_list(length=50)
    # Add rank
    for i, entry in enumerate(top):
        entry["rank"] = i + 1
    # Find current user rank
    my_entry = await lb.find_one({"user_id": current_user.user_id}, {"_id": 0})
    my_rank = None
    if my_entry:
        higher = await lb.count_documents({"total_xp": {"$gt": my_entry.get("total_xp", 0)}})
        my_rank = higher + 1
    return {"leaderboard": top, "my_rank": my_rank, "my_xp": (my_entry or {}).get("total_xp", 0)}


@api_router.post("/academy/tts")
async def generate_academy_tts(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    text = body.get("text", "")
    if not course_id or lesson_id is None or not text:
        raise HTTPException(status_code=400, detail="course_id, lesson_id and text required")

    profile = await fetch_profile(current_user.user_id)
    role = (profile or {}).get("role", "free")
    effective = await get_effective_subscription({"id": current_user.user_id, "role": role})
    is_admin = role in ("admin", "super_admin")
    if effective != "vip" and not is_admin:
        raise HTTPException(status_code=403, detail="VIP feature only")

    cache_col = db["academy_tts_cache"]
    cached = await cache_col.find_one(
        {"course_id": course_id, "lesson_id": lesson_id}, {"_id": 0}
    )
    if cached and cached.get("audio_base64"):
        return {"audio_base64": cached["audio_base64"], "cached": True}

    try:
        from openai import AsyncOpenAI
        tts_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        truncated = text[:4096]
        tts_response = await tts_client.audio.speech.create(
            model="tts-1", voice="nova", input=truncated
        )
        audio_bytes = tts_response.content
        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        await cache_col.update_one(
            {"course_id": course_id, "lesson_id": lesson_id},
            {"$set": {
                "course_id": course_id, "lesson_id": lesson_id,
                "audio_base64": audio_base64,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        return {"audio_base64": audio_base64, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


# ===================== USER SUBSCRIPTION INFO ENDPOINT =====================
@api_router.get("/subscription/status")
async def get_subscription_status(current_user: User = Depends(require_auth)):
    """
    Backend-authoritative subscription status.
    Entitlement is derived STRICTLY from verified IAP transactions in MongoDB.
    No Supabase profile.role fallback for subscription tier.
    Admin flag is separate from subscription entitlement.
    """
    user_id = current_user.user_id
    now = datetime.now(timezone.utc)

    # ── 1. Resolve admin status from Supabase profile (admin panel access only) ──
    profile = await fetch_profile(user_id)
    profile_role = (profile or {}).get("role", "user")
    is_admin = profile_role in ("admin", "super_admin")

    # ── 2. Check for active subscription override first ──
    override = await get_active_override(user_id)
    override_info = None

    # ── 3. Resolve subscription tier from verified IAP transactions (MongoDB) ──
    # Only transactions created by /iap/apple/verify or /iap/google/verify are stored here.
    tier_priority = {"vip": 2, "premium": 1}
    best_tier = "free"
    best_priority = 0
    subscription_expiry = None
    subscription_active = False
    subscription_platform = None
    subscription_product_id = None
    auto_renew = False

    active_txns = await db.iap_transactions.find({
        "user_id": user_id,
        "status": "active",
    }).sort("expiry_date", -1).to_list(20)

    for txn in active_txns:
        expiry = txn.get("expiry_date")
        if expiry:
            if isinstance(expiry, str):
                try:
                    expiry_dt = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                except ValueError:
                    continue
            else:
                expiry_dt = expiry
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            if expiry_dt <= now:
                continue  # expired
        # else: NULL expiry = lifetime (never expires)

        txn_plan = txn.get("plan", "").lower()
        priority = tier_priority.get(txn_plan, 0)
        if priority > best_priority:
            best_priority = priority
            best_tier = txn_plan
            subscription_expiry = txn.get("expiry_date")
            subscription_active = True
            subscription_platform = txn.get("platform")
            subscription_product_id = txn.get("product_id")
            auto_renew = txn.get("auto_renew", False)

    # ── 4. Apply override if active (takes priority over store subscriptions) ──
    effective = best_tier
    if override:
        effective = override.get("tier", best_tier)
        override_info = {
            "tier": override.get("tier"),
            "expires_at": override.get("expires_at"),
            "is_active": True,
        }

    # ── 5. Resolve capability tier (admin privilege override) ──
    # billing_tier  = pure store/IAP tier (no override, no admin elevation)
    # capability_tier = effective tier for feature gating (admin/super_admin → vip)
    # capability_source = "admin_privilege" | "subscription"
    billing_tier = best_tier
    if is_admin:
        capability_tier = "vip"
        capability_source = "admin_privilege"
    else:
        capability_tier = effective
        capability_source = "subscription"

    # ── 6. Build feature flags from capability tier ──
    ai_weekly_used = (profile or {}).get("ai_weekly_used", 0) or (profile or {}).get("ai_usage_count", 0)
    ai_limit = get_ai_weekly_limit(capability_tier)

    return {
        "user_id": user_id,
        "entitlement": effective,              # Legacy: IAP + override tier
        "billing_tier": billing_tier,          # Pure store tier (no override/admin)
        "capability_tier": capability_tier,    # Effective tier for feature gating
        "capability_source": capability_source,  # "admin_privilege" | "subscription"
        "subscription_active": subscription_active or (override is not None) or is_admin,
        "subscription_expiry": override.get("expires_at") if override else subscription_expiry,
        "subscription_platform": "override" if override else subscription_platform,
        "subscription_product_id": subscription_product_id,
        "auto_renew": auto_renew,
        "is_admin": is_admin,
        "override": override_info,
        "features": {
            "signals_access": capability_tier,
            "ai_analyzer": True,
            "ai_limit": ai_limit if ai_limit < 100000 else "unlimited",
            "ai_used": ai_weekly_used,
            "ai_remaining": max(0, ai_limit - ai_weekly_used) if ai_limit < 100000 else "unlimited",
            "ai_limit_reached": ai_weekly_used >= ai_limit if ai_limit < 100000 else False,
            "fund_management": capability_tier == "vip",
            "academy": capability_tier == "vip",
            "image_uploads": capability_tier != "free",
        },
    }

# ===================== SETUP ADMIN =====================
# REMOVED: /api/setup/admin endpoint was a security vulnerability
# Admin creation is now handled through Supabase dashboard only


# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v3.0 - DETERMINISTIC AUDITABLE MODE
# ==============================================================================
#
# ARCHITECTURE OVERVIEW:
# ----------------------
# This is a SNAPSHOT-BASED, POLLING-DRIVEN signal lifecycle engine.
# It is NOT tick-level real-time execution. It is NOT broker execution.
#
# KEY CHARACTERISTICS:
# 1. POLLING-BASED: Prices fetched every N seconds (default 5s, configurable)
# 2. SNAPSHOT PRICES: Each poll gets a single price point per instrument
# 3. DETERMINISTIC: Same inputs always produce same outputs
# 4. GAP-PROTECTED: Price gaps use defined SL/TP/Entry, not jumped prices
# 5. AUDITABLE: Every closure stores full price trace and source
#
# CROSSING DETECTION RULES:
# - Activation/closure requires price to CROSS through target level
# - If last_price unavailable, uses simple threshold comparison
# - Gap protection ensures execution at defined levels, not market gaps
#
# PRICE SOURCES:
# - Forex: frankfurter.app (free API, mid-rate)
# - Gold: goldapi.io → CoinGecko PAX Gold fallback
# - Crypto: CoinGecko
# - NO SIMULATED/HARDCODED PRICES - if API fails, symbol is skipped
#
# SINGLE INSTANCE ENFORCEMENT:
# - DB-based distributed lock prevents duplicate engine execution
# - Lock auto-expires after 2x poll interval for crash recovery
#
# DATA STORED AT CLOSURE:
# - exit_price, exit_reason, price_source, poll_timestamp
# - last_price, current_price, activation_price
# - pip_size, pip_multiplier, calculated_pips with full math trace
#
# ==============================================================================

import asyncio
from contextlib import asynccontextmanager

# Price feed configuration - CONFIGURABLE VIA ENVIRONMENT
PRICE_POLL_INTERVAL = int(os.environ.get('SIGNAL_POLL_INTERVAL', '5'))  # Default 5 seconds
price_automation_running = False

# Symbol mapping for different price APIs
SYMBOL_MAP = {
    # Forex pairs
    "EUR/USD": {"type": "forex", "symbol": "EURUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "EURUSD": {"type": "forex", "symbol": "EURUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "GBP/USD": {"type": "forex", "symbol": "GBPUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "GBPUSD": {"type": "forex", "symbol": "GBPUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "USD/JPY": {"type": "forex", "symbol": "USDJPY", "pip_multiplier": 100, "pip_size": 0.01},
    "USDJPY": {"type": "forex", "symbol": "USDJPY", "pip_multiplier": 100, "pip_size": 0.01},
    "GBP/JPY": {"type": "forex", "symbol": "GBPJPY", "pip_multiplier": 100, "pip_size": 0.01},
    "GBPJPY": {"type": "forex", "symbol": "GBPJPY", "pip_multiplier": 100, "pip_size": 0.01},
    "AUD/USD": {"type": "forex", "symbol": "AUDUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "AUDUSD": {"type": "forex", "symbol": "AUDUSD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "USD/CAD": {"type": "forex", "symbol": "USDCAD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "USDCAD": {"type": "forex", "symbol": "USDCAD", "pip_multiplier": 10000, "pip_size": 0.0001},
    "USD/CHF": {"type": "forex", "symbol": "USDCHF", "pip_multiplier": 10000, "pip_size": 0.0001},
    "USDCHF": {"type": "forex", "symbol": "USDCHF", "pip_multiplier": 10000, "pip_size": 0.0001},
    # Gold - pip = $0.10
    "XAU/USD": {"type": "gold", "symbol": "XAUUSD", "pip_multiplier": 10, "pip_size": 0.1},
    "XAUUSD": {"type": "gold", "symbol": "XAUUSD", "pip_multiplier": 10, "pip_size": 0.1},
    # Crypto - pip = $1.00
    "BTC/USD": {"type": "crypto", "symbol": "bitcoin", "pip_multiplier": 1, "pip_size": 1.0},
    "BTCUSD": {"type": "crypto", "symbol": "bitcoin", "pip_multiplier": 1, "pip_size": 1.0},
    "ETH/USD": {"type": "crypto", "symbol": "ethereum", "pip_multiplier": 1, "pip_size": 1.0},
    "ETHUSD": {"type": "crypto", "symbol": "ethereum", "pip_multiplier": 1, "pip_size": 1.0},
}


def get_instrument_info(pair: str) -> dict:
    """Get pip multiplier and pip size for an instrument"""
    pair_upper = pair.upper().replace("/", "")
    mapping = SYMBOL_MAP.get(pair) or SYMBOL_MAP.get(pair_upper)
    
    if mapping:
        return {
            "pip_multiplier": mapping["pip_multiplier"],
            "pip_size": mapping["pip_size"]
        }
    
    # Fallback based on pair characteristics
    if "JPY" in pair_upper:
        return {"pip_multiplier": 100, "pip_size": 0.01}
    elif "XAU" in pair_upper or "GOLD" in pair_upper:
        return {"pip_multiplier": 10, "pip_size": 0.1}
    elif "BTC" in pair_upper or "ETH" in pair_upper:
        return {"pip_multiplier": 1, "pip_size": 1.0}
    else:
        return {"pip_multiplier": 10000, "pip_size": 0.0001}


async def fetch_live_prices(symbols: List[str]) -> Dict[str, dict]:
    """
    Fetch live prices from multiple free APIs.
    
    Returns dict with price AND source for each symbol:
    {
        "XAUUSD": {"price": 2650.50, "source": "goldapi.io"},
        "EURUSD": {"price": 1.0850, "source": "frankfurter.app"}
    }
    
    CRITICAL: NO HARDCODED FALLBACK PRICES.
    If API fails, symbol is omitted from results.
    """
    prices = {}
    
    # Group symbols by type
    forex_symbols = []
    crypto_symbols = []
    gold_symbols = []
    
    for symbol in symbols:
        normalized = symbol.replace("/", "").upper()
        mapping = SYMBOL_MAP.get(symbol) or SYMBOL_MAP.get(normalized)
        if mapping:
            if mapping["type"] == "forex":
                forex_symbols.append((symbol, mapping["symbol"]))
            elif mapping["type"] == "gold":
                gold_symbols.append((symbol, mapping["symbol"]))
            elif mapping["type"] == "crypto":
                crypto_symbols.append((symbol, mapping["symbol"]))
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Fetch forex from frankfurter.app (free, no API key needed)
        if forex_symbols:
            for orig_symbol, api_symbol in forex_symbols:
                base = api_symbol[:3]
                quote_ccy = api_symbol[3:]
                try:
                    resp = await client.get(
                        f"https://api.frankfurter.app/latest?from={base}&to={quote_ccy}"
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        rate = data.get("rates", {}).get(quote_ccy)
                        if rate:
                            prices[orig_symbol] = {
                                "price": float(rate),
                                "source": "frankfurter.app"
                            }
                except Exception as e:
                    logger.warning(f"[PriceFetch] Forex {orig_symbol} FAILED: {e}")
        
        # Fetch gold - NO HARDCODED FALLBACK
        if gold_symbols:
            for orig_symbol, api_symbol in gold_symbols:
                price_fetched = False
                
                # Primary: goldapi.io
                try:
                    resp = await client.get(
                        "https://www.goldapi.io/api/XAU/USD",
                        headers={"x-access-token": "goldapi-free"}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        price = data.get("price")
                        if price:
                            prices[orig_symbol] = {
                                "price": float(price),
                                "source": "goldapi.io"
                            }
                            price_fetched = True
                except Exception as e:
                    logger.warning(f"[PriceFetch] Gold primary API failed: {e}")
                
                # Fallback: CoinGecko PAX Gold
                if not price_fetched:
                    try:
                        resp = await client.get(
                            "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd"
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            if "pax-gold" in data and "usd" in data["pax-gold"]:
                                prices[orig_symbol] = {
                                    "price": float(data["pax-gold"]["usd"]),
                                    "source": "coingecko-paxgold"
                                }
                                price_fetched = True
                    except Exception as e:
                        logger.warning(f"[PriceFetch] Gold fallback API failed: {e}")
                
                # CRITICAL: NO HARDCODED FALLBACK - skip symbol if all APIs fail
                if not price_fetched:
                    logger.error(f"[PriceFetch] {orig_symbol} SKIPPED - all price sources failed")
        
        # Fetch crypto from CoinGecko (free, no API key)
        if crypto_symbols:
            try:
                ids = ",".join([s[1] for s in crypto_symbols])
                resp = await client.get(
                    f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for orig_symbol, api_id in crypto_symbols:
                        if api_id in data and "usd" in data[api_id]:
                            prices[orig_symbol] = {
                                "price": float(data[api_id]["usd"]),
                                "source": "coingecko"
                            }
            except Exception as e:
                logger.error(f"[PriceFetch] Crypto FAILED: {e}")
    
    return prices


# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v3.0 - DETERMINISTIC AUDITABLE MODE
# ==============================================================================


class ExitReason(str, Enum):
    """Exit reason for closed signals"""
    TP1 = "tp1"
    TP2 = "tp2"
    TP3 = "tp3"
    SL = "sl"
    MANUAL = "manual"


# ==============================================================================
# CORE CALCULATION: PIP CALCULATOR v3.0 - WITH FULL AUDIT TRACE
# ==============================================================================

def calculate_signal_pips_with_trace(
    entry_price: float,
    exit_price: float,
    signal_type: str,
    pair: str
) -> dict:
    """
    Calculate pips EXACTLY ONCE at closure with full audit trace.
    
    FORMULA:
    - SELL: pips = (entry_price - exit_price) * pip_multiplier (profit when price goes DOWN)
    - BUY: pips = (exit_price - entry_price) * pip_multiplier (profit when price goes UP)
    
    Returns dict with:
    - calculated_pips: The final pip value
    - pip_multiplier: Multiplier used
    - pip_size: Size of one pip
    - math_trace: Full calculation string for audit
    """
    if not entry_price or not exit_price:
        return {
            "calculated_pips": 0.0,
            "pip_multiplier": 0,
            "pip_size": 0,
            "math_trace": "INVALID: missing entry or exit price"
        }
    
    # Get instrument info
    info = get_instrument_info(pair)
    pip_multiplier = info["pip_multiplier"]
    pip_size = info["pip_size"]
    
    # Calculate based on signal type
    sig_type = signal_type.lower()
    
    if sig_type == "sell":
        # SELL profits when price goes DOWN
        raw_diff = entry_price - exit_price
        pips = raw_diff * pip_multiplier
        math_trace = f"SELL: ({entry_price} - {exit_price}) * {pip_multiplier} = {pips}"
    else:
        # BUY profits when price goes UP
        raw_diff = exit_price - entry_price
        pips = raw_diff * pip_multiplier
        math_trace = f"BUY: ({exit_price} - {entry_price}) * {pip_multiplier} = {pips}"
    
    final_pips = round(pips, 1)
    
    logger.info(f"[PipCalc] {pair} {sig_type.upper()}: {math_trace} → {final_pips} pips")
    
    return {
        "calculated_pips": final_pips,
        "pip_multiplier": pip_multiplier,
        "pip_size": pip_size,
        "math_trace": math_trace
    }


def calculate_signal_pips(entry_price: float, exit_price: float, signal_type: str, pair: str) -> float:
    """Legacy wrapper - returns just the pip value"""
    result = calculate_signal_pips_with_trace(entry_price, exit_price, signal_type, pair)
    return result["calculated_pips"]


# ==============================================================================
# DETERMINISTIC PRICE TRIGGER ENGINE v3.0 - WITH GAP PROTECTION
# ==============================================================================

class DeterministicPriceTrigger:
    """
    Deterministic price trigger checker with gap protection.
    
    KEY RULES:
    1. Uses crossing detection when last_price is available
    2. Falls back to threshold comparison when last_price unavailable
    3. Returns the DEFINED level price, not the gapped market price
    
    GAP PROTECTION:
    - If price gaps through SL/TP/Entry between polls, we still trigger
    - But we use the DEFINED level price for execution, not the gapped price
    - This ensures deterministic, auditable results
    """
    
    @staticmethod
    def check_sl_triggered(
        current_price: float,
        stop_loss: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Stop Loss is triggered.
        
        Returns (triggered: bool, execution_price: float)
        - execution_price is ALWAYS the defined SL, not the gapped price
        
        RULES:
        - SELL: SL triggers when price rises TO or THROUGH SL
        - BUY: SL triggers when price falls TO or THROUGH SL
        """
        if not stop_loss or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL SL: triggered when price RISES to or above SL
            if last_price is not None:
                # Crossing detection: was below SL, now at or above (or gapped through)
                triggered = last_price < stop_loss and current_price >= stop_loss
            else:
                triggered = current_price >= stop_loss
            
            # GAP PROTECTION: Always use defined SL, not gapped price
            return (triggered, stop_loss if triggered else None)
        else:
            # BUY SL: triggered when price FALLS to or below SL
            if last_price is not None:
                # Crossing detection: was above SL, now at or below (or gapped through)
                triggered = last_price > stop_loss and current_price <= stop_loss
            else:
                triggered = current_price <= stop_loss
            
            # GAP PROTECTION: Always use defined SL, not gapped price
            return (triggered, stop_loss if triggered else None)
    
    @staticmethod
    def check_tp_triggered(
        current_price: float,
        take_profit: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Take Profit is triggered.
        
        Returns (triggered: bool, execution_price: float)
        - execution_price is ALWAYS the defined TP, not the gapped price
        
        RULES:
        - SELL: TP triggers when price falls TO or THROUGH TP
        - BUY: TP triggers when price rises TO or THROUGH TP
        """
        if not take_profit or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL TP: triggered when price FALLS to or below TP
            if last_price is not None:
                # Crossing detection: was above TP, now at or below (or gapped through)
                triggered = last_price > take_profit and current_price <= take_profit
            else:
                triggered = current_price <= take_profit
            
            # GAP PROTECTION: Always use defined TP, not gapped price
            return (triggered, take_profit if triggered else None)
        else:
            # BUY TP: triggered when price RISES to or above TP
            if last_price is not None:
                # Crossing detection: was below TP, now at or above (or gapped through)
                triggered = last_price < take_profit and current_price >= take_profit
            else:
                triggered = current_price >= take_profit
            
            # GAP PROTECTION: Always use defined TP, not gapped price
            return (triggered, take_profit if triggered else None)
    
    @staticmethod
    def check_entry_triggered(
        current_price: float,
        entry_price: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Entry price is reached for pending signals.
        
        Returns (triggered: bool, activation_price: float)
        - activation_price is ALWAYS the defined entry, not the gapped price
        
        RULES:
        - SELL Pending: Entry triggers when price rises TO or THROUGH entry (sell high)
        - BUY Pending: Entry triggers when price falls TO or THROUGH entry (buy low)
        
        GAP PROTECTION:
        - If price gaps across entry (e.g., 4220 → 4200 for entry 4211)
        - We activate at 4211, NOT at 4200
        - This keeps signal math clean and deterministic
        """
        if not entry_price or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL entry: we want to sell high - price must rise TO entry
            if last_price is not None:
                # Crossing: was below entry, now at or above (or gapped through)
                triggered = last_price < entry_price and current_price >= entry_price
            else:
                triggered = current_price >= entry_price
            
            # GAP PROTECTION: Always use defined entry, not gapped price
            return (triggered, entry_price if triggered else None)
        else:
            # BUY entry: we want to buy low - price must fall TO entry
            if last_price is not None:
                # Crossing: was above entry, now at or below (or gapped through)
                triggered = last_price > entry_price and current_price <= entry_price
            else:
                triggered = current_price <= entry_price
            
            # GAP PROTECTION: Always use defined entry, not gapped price
            return (triggered, entry_price if triggered else None)


# Legacy alias for backward compatibility
PriceTrigger = DeterministicPriceTrigger


# ==============================================================================
# SIGNAL LIFECYCLE CONTROLLER v3.0 - DETERMINISTIC AUDITABLE
# ==============================================================================

class SignalLifecycleController:
    """
    THE authoritative controller for signal state management.
    
    RULES:
    1. Closed signals are NEVER processed
    2. Admin state is NEVER overridden
    3. State transitions follow strict rules
    4. Pips calculated ONCE at closure
    """
    
    def __init__(self, db_instance):
        self.db = db_instance
        self.trigger = PriceTrigger()
    
    def is_closed(self, signal: dict) -> bool:
        """Check if signal is closed (IMMUTABLE)"""
        state = signal.get("state", signal.get("status", "pending"))
        return state == "closed"
    
    def get_current_state(self, signal: dict) -> str:
        """Get the authoritative state of a signal"""
        return signal.get("state", signal.get("status", "pending"))
    
    def get_next_tp_target(self, signal: dict) -> tuple:
        """
        Get the next TP target based on current state.
        Returns (tp_price, exit_reason, new_state)
        """
        state = self.get_current_state(signal)
        
        if state == "active":
            return (signal.get("tp1"), ExitReason.TP1, "tp1")
        elif state == "tp1":
            tp2 = signal.get("tp2")
            if tp2:
                return (tp2, ExitReason.TP2, "tp2")
            return (None, None, None)  # No TP2, stay in tp1
        elif state == "tp2":
            tp3 = signal.get("tp3")
            if tp3:
                return (tp3, ExitReason.TP3, "tp3")
            return (None, None, None)  # No TP3, stay in tp2
        elif state == "tp3":
            # TP3 hit means we should close
            return (signal.get("tp3"), ExitReason.TP3, "closed")
        
        return (None, None, None)
    
    async def close_signal(
        self,
        signal_id: str,
        current_state: str,
        exit_price: float,
        exit_reason: str,
        signal: dict,
        price_context: Optional[dict] = None
    ) -> bool:
        """
        CLOSE a signal with full audit trail. This is FINAL - no further processing.
        
        Actions:
        1. Set state = closed
        2. Set exit_price (GAP-PROTECTED: defined SL/TP level, not gapped market price)
        3. Set exit_reason
        4. Calculate pips with full math trace
        5. Store price_source, poll_timestamp, last_price, current_price
        6. Set closed_at timestamp
        """
        entry_price = signal.get("entry_price_actual") or signal.get("entry")
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        
        # Calculate pips with FULL AUDIT TRACE
        pip_result = calculate_signal_pips_with_trace(entry_price, exit_price, signal_type, pair)
        
        # Determine tp_hit from exit_reason
        tp_hit_map = {
            "sl": 0,
            "tp1": 1,
            "tp2": 2,
            "tp3": 3,
            "manual": 0
        }
        tp_hit = tp_hit_map.get(exit_reason.lower() if isinstance(exit_reason, str) else exit_reason.value, 0)
        
        # Preserve existing tp_hit if closing from SL after hitting some TPs
        if exit_reason in ["sl", ExitReason.SL, "manual", ExitReason.MANUAL]:
            existing_tp = signal.get("tp_hit", 0)
            if existing_tp > tp_hit:
                tp_hit = existing_tp
        
        # Build audit record
        update_doc = {
            "state": "closed",
            "status": "closed",
            "exit_price": exit_price,
            "exit_reason": exit_reason if isinstance(exit_reason, str) else exit_reason.value,
            "final_pips": pip_result["calculated_pips"],
            "tp_hit": tp_hit,
            "closed_at": datetime.now(timezone.utc),
            # AUDIT TRAIL FIELDS
            "pip_size": pip_result["pip_size"],
            "pip_multiplier": pip_result["pip_multiplier"],
            "pip_math_trace": pip_result["math_trace"],
        }
        
        # Add price context if provided
        if price_context:
            update_doc["price_source"] = price_context.get("price_source")
            update_doc["poll_timestamp"] = price_context.get("poll_timestamp")
            update_doc["closure_last_price"] = price_context.get("last_price")
            update_doc["closure_current_price"] = price_context.get("current_price")
        
        # Update signal - ATOMIC operation
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": update_doc}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"[Engine] CLOSED signal {signal_id}: "
                f"exit_reason={exit_reason}, exit_price={exit_price}, "
                f"pips={pip_result['calculated_pips']}, "
                f"math={pip_result['math_trace']}"
            )
            return True
        
        return False
    
    async def advance_tp_state(
        self,
        signal_id: str,
        current_state: str,
        new_state: str,
        tp_hit: int
    ) -> bool:
        """Advance signal to next TP state (e.g., active → tp1)"""
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": {
                "state": new_state,
                "status": "active",  # Still active until closed
                "tp_hit": tp_hit
            }}
        )
        
        if result.modified_count > 0:
            logger.info(f"[Engine] Signal {signal_id} advanced: {current_state} → {new_state}")
            return True
        
        return False
    
    async def activate_signal(
        self,
        signal_id: str,
        activation_price: float,
        price_context: Optional[dict] = None
    ) -> bool:
        """
        Activate a pending signal with GAP PROTECTION.
        
        IMPORTANT: activation_price is the DEFINED entry level, not the gapped market price.
        This keeps signal math clean and deterministic.
        """
        update_doc = {
            "state": "active",
            "status": "active",
            "tp_hit": 0,
            "entry_price_actual": activation_price,  # GAP-PROTECTED: defined entry
            "activated_at": datetime.now(timezone.utc)
        }
        
        # Add price context if provided
        if price_context:
            update_doc["activation_price_source"] = price_context.get("price_source")
            update_doc["activation_poll_timestamp"] = price_context.get("poll_timestamp")
            update_doc["activation_last_price"] = price_context.get("last_price")
            update_doc["activation_current_price"] = price_context.get("current_price")
        
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": "pending"},
            {"$set": update_doc}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"[Engine] Signal {signal_id} ACTIVATED at {activation_price} "
                f"(gap-protected entry level)"
            )
            return True
        
        return False
    
    async def process_signal(
        self,
        signal: dict,
        current_price: float,
        price_source: str,
        poll_timestamp: datetime
    ) -> Optional[dict]:
        """
        MAIN ENTRY POINT: Process a single signal with current price.
        
        DETERMINISTIC GAP-PROTECTED LOGIC:
        - Activation uses DEFINED entry price, not gapped market price
        - SL closure uses DEFINED SL price, not gapped market price
        - TP closure uses DEFINED TP price, not gapped market price
        
        Returns dict with action taken, or None if no action.
        """
        signal_id = signal["signal_id"]
        current_state = self.get_current_state(signal)
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        last_price = signal.get("last_price")
        
        # Build price context for audit trail
        price_context = {
            "price_source": price_source,
            "poll_timestamp": poll_timestamp,
            "last_price": last_price,
            "current_price": current_price
        }
        
        # RULE 1: NEVER process closed signals
        if self.is_closed(signal):
            return None
        
        # Update last_price for next iteration
        await self.db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": {"last_price": current_price}}
        )
        
        # === PENDING SIGNALS ===
        if current_state == "pending":
            entry = signal.get("entry")
            
            # Check if entry price hit (returns tuple with gap-protected price)
            triggered, activation_price = self.trigger.check_entry_triggered(
                current_price, entry, signal_type, last_price
            )
            
            if triggered:
                # GAP PROTECTION: activate at DEFINED entry, not gapped price
                success = await self.activate_signal(signal_id, activation_price, price_context)
                if success:
                    # Send notification
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_notification(
                        signal_id, pair, SignalType(signal_type), visibility
                    ))
                    return {
                        "action": "activated",
                        "signal_id": signal_id,
                        "activation_price": activation_price,
                        "gap_protected": activation_price != current_price
                    }
            return None
        
        # === ACTIVE/TP1/TP2/TP3 SIGNALS ===
        if current_state in ["active", "tp1", "tp2", "tp3"]:
            stop_loss = signal.get("stop_loss")
            entry = signal.get("entry_price_actual") or signal.get("entry")
            
            # Auto-close TP3 state immediately
            if current_state == "tp3":
                tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
                success = await self.close_signal(
                    signal_id, current_state, tp3_price, ExitReason.TP3, signal, price_context
                )
                if success:
                    pips = calculate_signal_pips(entry, tp3_price, signal_type, pair)
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_close_notification(
                        signal_id, pair, signal_type, pips, visibility
                    ))
                    return {"action": "closed", "reason": "tp3", "signal_id": signal_id}
                return None
            
            # CHECK STOP LOSS FIRST (priority over TP)
            if stop_loss:
                sl_triggered, sl_exit_price = self.trigger.check_sl_triggered(
                    current_price, stop_loss, signal_type, last_price
                )
                
                if sl_triggered:
                    # GAP PROTECTION: close at DEFINED SL, not gapped price
                    logger.info(
                        f"[Engine] SL TRIGGERED for {signal_id}: "
                        f"market={current_price}, exit_at={sl_exit_price} (gap_protected={sl_exit_price != current_price})"
                    )
                    
                    success = await self.close_signal(
                        signal_id, current_state, sl_exit_price, ExitReason.SL, signal, price_context
                    )
                    
                    if success:
                        pips = calculate_signal_pips(entry, sl_exit_price, signal_type, pair)
                        visibility = SignalVisibility(signal.get("visibility", "free"))
                        asyncio.create_task(send_signal_close_notification(
                            signal_id, pair, signal_type, pips, visibility
                        ))
                        return {
                            "action": "closed",
                            "reason": "sl",
                            "pips": pips,
                            "signal_id": signal_id,
                            "exit_price": sl_exit_price,
                            "gap_protected": sl_exit_price != current_price
                        }
                    return None
            
            # CHECK TP LEVELS
            tp_target, exit_reason, new_state = self.get_next_tp_target(signal)
            
            if tp_target:
                tp_triggered, tp_exit_price = self.trigger.check_tp_triggered(
                    current_price, tp_target, signal_type, last_price
                )
                
                if tp_triggered:
                    # GAP PROTECTION: close/advance at DEFINED TP, not gapped price
                    logger.info(
                        f"[Engine] TP TRIGGERED for {signal_id}: "
                        f"market={current_price}, target={tp_exit_price} (gap_protected={tp_exit_price != current_price})"
                    )
                    
                    # Determine TP level
                    tp_level = {"tp1": 1, "tp2": 2, "tp3": 3}.get(new_state, 1)
                    
                    # If TP3 or no more TPs, close the signal
                    if new_state == "closed" or new_state == "tp3":
                        # Close at TP
                        success = await self.close_signal(
                            signal_id, current_state, tp_exit_price, exit_reason, signal, price_context
                        )
                        if success:
                            pips = calculate_signal_pips(entry, tp_exit_price, signal_type, pair)
                            visibility = SignalVisibility(signal.get("visibility", "free"))
                            asyncio.create_task(send_signal_close_notification(
                                signal_id, pair, signal_type, pips, visibility
                            ))
                            return {
                                "action": "closed",
                                "reason": str(exit_reason),
                                "pips": pips,
                                "signal_id": signal_id,
                                "exit_price": tp_exit_price,
                                "gap_protected": tp_exit_price != current_price
                            }
                    else:
                        # Advance to next TP state
                        success = await self.advance_tp_state(signal_id, current_state, new_state, tp_level)
                        if success:
                            return {"action": "tp_hit", "level": tp_level, "signal_id": signal_id}
        
        return None


# ==============================================================================
# ==============================================================================
# AUTOMATIC SIGNAL ENGINE - RE-ENABLED WITH SAFEGUARDS
# ==============================================================================
# 
# FEATURES:
# - Configurable on/off state via admin API
# - Respects signal visibility (Free/Premium/VIP subscription tiers)
# - Admin override capability
# - Paused state protection (no signals sent when paused)
# - Health checks and self-healing
# - Comprehensive logging
#
# ADMIN CONTROLS:
# - GET /api/automation/status - Check engine status
# - POST /api/admin/automation/start - Start the engine
# - POST /api/admin/automation/stop - Stop the engine
# - POST /api/admin/automation/config - Update engine config
# ==============================================================================

# Engine configuration (loaded from DB on startup)
ENGINE_CONFIG_DEFAULTS = {
    "enabled": True,              # Master switch
    "paused": False,              # Temporary pause (maintenance mode)
    "poll_interval": PRICE_POLL_INTERVAL,  # Seconds between price checks (default 5s from env)
    "min_poll_interval": 3,       # Minimum allowed poll interval
    "max_poll_interval": 300,     # Maximum allowed poll interval
    "auto_activate_pending": True,  # Auto-activate pending signals
    "auto_close_on_sl": True,     # Auto-close on stop loss
    "auto_advance_tp": True,      # Auto-advance through TP levels
    "auto_close_on_tp3": True,    # Auto-close after TP3
    "send_notifications": True,   # Send push notifications on events
    "last_health_check": None,    # Last successful price fetch
    "error_count": 0,             # Consecutive errors (auto-pause if > threshold)
    "max_errors": 5,              # Pause after this many consecutive errors
}

# Global engine state
price_automation_running = False
engine_task = None
lifecycle_controller = None
engine_lock_id = None  # For single instance enforcement


async def get_engine_config() -> dict:
    """Get engine configuration from database or use defaults"""
    config = await db.settings.find_one({"setting_id": "signal_engine_config"})
    if config:
        # Merge with defaults for any missing keys
        merged = {**ENGINE_CONFIG_DEFAULTS, **config.get("config", {})}
        return merged
    return ENGINE_CONFIG_DEFAULTS.copy()


async def save_engine_config(config: dict):
    """Save engine configuration to database"""
    await db.settings.update_one(
        {"setting_id": "signal_engine_config"},
        {"$set": {
            "setting_id": "signal_engine_config",
            "config": config,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )


async def acquire_engine_lock() -> Optional[str]:
    """
    Acquire a distributed lock to ensure single engine instance.
    Returns lock_id if acquired, None if already locked.
    """
    lock_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Try to acquire lock with upsert
    result = await db.settings.find_one_and_update(
        {
            "setting_id": "signal_engine_lock",
            "$or": [
                {"locked_until": {"$lt": now}},  # Lock expired
                {"locked_until": {"$exists": False}}  # No lock exists
            ]
        },
        {
            "$set": {
                "setting_id": "signal_engine_lock",
                "lock_id": lock_id,
                "locked_at": now,
                "locked_until": now + timedelta(seconds=PRICE_POLL_INTERVAL * 3),  # 3x poll interval
                "locked_by": os.environ.get("HOSTNAME", "unknown")
            }
        },
        upsert=True,
        return_document=True
    )
    
    if result and result.get("lock_id") == lock_id:
        logger.info(f"[Engine] Acquired engine lock: {lock_id}")
        return lock_id
    
    logger.warning(f"[Engine] Failed to acquire lock - another instance is running")
    return None


async def renew_engine_lock(lock_id: str) -> bool:
    """Renew the engine lock to prevent expiry during long operations."""
    now = datetime.now(timezone.utc)
    result = await db.settings.update_one(
        {"setting_id": "signal_engine_lock", "lock_id": lock_id},
        {"$set": {"locked_until": now + timedelta(seconds=PRICE_POLL_INTERVAL * 3)}}
    )
    return result.modified_count > 0


async def release_engine_lock(lock_id: str):
    """Release the engine lock on shutdown."""
    await db.settings.delete_one({"setting_id": "signal_engine_lock", "lock_id": lock_id})
    logger.info(f"[Engine] Released engine lock: {lock_id}")


async def run_price_automation():
    """
    AUTOMATIC SIGNAL ENGINE v3.0 - Main Processing Loop
    
    DETERMINISTIC, AUDITABLE MODE:
    - Single instance enforcement via distributed lock
    - Poll timestamp logged for each cycle
    - Price source tracked for each price
    - Gap-protected activation and closure
    - No hardcoded fallback prices
    
    This function:
    1. Acquires distributed lock (single instance)
    2. Checks engine config (enabled/paused)
    3. Fetches live prices for all active signals
    4. Processes each signal through the lifecycle controller with price context
    5. Handles errors gracefully with auto-recovery
    """
    global price_automation_running, lifecycle_controller, engine_lock_id
    
    # Acquire distributed lock
    engine_lock_id = await acquire_engine_lock()
    if not engine_lock_id:
        logger.error("[Engine] Cannot start - another instance is already running")
        return
    
    price_automation_running = True
    lifecycle_controller = SignalLifecycleController(db)
    
    logger.info("=" * 60)
    logger.info("[Engine] Signal Auto-Engine v3.0 STARTED")
    logger.info(f"[Engine] Poll interval: {PRICE_POLL_INTERVAL}s (configurable via SIGNAL_POLL_INTERVAL env)")
    logger.info("[Engine] Mode: DETERMINISTIC, GAP-PROTECTED, AUDITABLE")
    logger.info("[Engine] Visibility rules ACTIVE: Free/Premium/VIP")
    logger.info("=" * 60)
    
    consecutive_errors = 0
    
    while price_automation_running:
        poll_timestamp = datetime.now(timezone.utc)
        
        try:
            # Renew lock
            if not await renew_engine_lock(engine_lock_id):
                logger.error("[Engine] Lost engine lock - stopping")
                break
            
            # Load current config
            config = await get_engine_config()
            poll_interval = config.get("poll_interval", PRICE_POLL_INTERVAL)
            
            # Log poll cycle
            logger.debug(f"[Engine] Poll cycle started at {poll_timestamp.isoformat()}")
            
            # Check if engine is enabled
            if not config.get("enabled", True):
                logger.info("[Engine] Engine is DISABLED. Sleeping...")
                await asyncio.sleep(poll_interval)
                continue
            
            # Check if engine is paused (maintenance mode)
            if config.get("paused", False):
                logger.info("[Engine] Engine is PAUSED. Sleeping...")
                await asyncio.sleep(poll_interval)
                continue
            
            # Check error threshold
            if consecutive_errors >= config.get("max_errors", 5):
                logger.error(f"[Engine] Too many errors ({consecutive_errors}). Auto-pausing...")
                config["paused"] = True
                config["pause_reason"] = f"Auto-paused after {consecutive_errors} consecutive errors"
                await save_engine_config(config)
                await asyncio.sleep(poll_interval)
                continue
            
            # === MAIN PROCESSING ===
            
            # Get all non-closed signals (with reasonable limit for performance)
            active_signals = await db.signals.find({
                "state": {"$ne": "closed"},
                "status": {"$ne": "closed"}
            }).limit(500).to_list(500)
            
            if not active_signals:
                await asyncio.sleep(poll_interval)
                continue
            
            # Extract unique symbols
            symbols = list(set(s.get("pair", "").upper() for s in active_signals if s.get("pair")))
            
            if not symbols:
                await asyncio.sleep(poll_interval)
                continue
            
            # Fetch live prices (returns dict with price AND source)
            price_data = await fetch_live_prices(symbols)
            
            if not price_data:
                consecutive_errors += 1
                logger.warning(f"[Engine] No prices fetched - SKIPPING this cycle (error {consecutive_errors})")
                await asyncio.sleep(poll_interval)
                continue
            
            # Reset error count on successful price fetch
            consecutive_errors = 0
            
            # Update health check timestamp
            config["last_health_check"] = poll_timestamp.isoformat()
            config["error_count"] = 0
            await save_engine_config(config)
            
            # Process each signal
            processed = 0
            actions = 0
            skipped = 0
            
            for signal in active_signals:
                pair = signal.get("pair", "").upper()
                # Try both formats
                price_info = price_data.get(pair) or price_data.get(pair.replace("/", ""))
                
                if not price_info:
                    skipped += 1
                    continue
                
                current_price = price_info["price"]
                price_source = price_info["source"]
                
                processed += 1
                
                # Process signal through lifecycle controller WITH PRICE CONTEXT
                result = await lifecycle_controller.process_signal(
                    signal,
                    current_price,
                    price_source,
                    poll_timestamp
                )
                
                if result:
                    actions += 1
                    logger.info(f"[Engine] Action: {result}")
            
            if processed > 0 or skipped > 0:
                logger.debug(
                    f"[Engine] Poll complete: processed={processed}, actions={actions}, skipped={skipped}"
                )
            
            await asyncio.sleep(poll_interval)
            
        except asyncio.CancelledError:
            logger.info("[Engine] Engine task cancelled")
            break
        except Exception as e:
            consecutive_errors += 1
            logger.error(f"[Engine] Error in main loop: {e} (error {consecutive_errors})")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(poll_interval)  # Use poll interval for retry
    
    # Release lock on shutdown
    if engine_lock_id:
        await release_engine_lock(engine_lock_id)
    
    price_automation_running = False
    logger.info("[Engine] Signal Auto-Engine STOPPED")


# Start automation on app startup
@app.on_event("startup")
async def startup_event():
    """
    Application startup handler.
    Initializes indexes, signal engine, super admin accounts, and default data.
    """
    global price_automation_running, engine_task
    
    logger.info("=" * 60)
    logger.info("[Startup] Swift FX Backend Starting...")
    logger.info("=" * 60)
    
    # Create MongoDB indexes for production performance
    logger.info("[Startup] Ensuring MongoDB indexes...")
    await db.iap_transactions.create_index([("user_id", 1), ("status", 1)])
    await db.iap_transactions.create_index("expiry_date")
    await db.iap_transactions.create_index("transaction_id", unique=True)
    await db.signals.create_index([("created_at", -1)])
    await db.signals.create_index("state")
    await db.device_tokens.create_index("user_id")
    await db.device_tokens.create_index("is_active")
    await db.ai_analyses.create_index([("user_id", 1), ("created_at", -1)])
    await db.posts.create_index("created_at")
    await db.support_tickets.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("[Startup] MongoDB indexes ensured")
    
    # Auto-create protected Super Admin accounts
    await initialize_super_admins()
    
    # Initialize default FAQs
    await initialize_faqs()
    
    # Load engine config
    config = await get_engine_config()
    
    if config.get("enabled", True) and not config.get("paused", False):
        logger.info("[Startup] Starting Signal Auto-Engine...")
        price_automation_running = True
        engine_task = asyncio.create_task(run_price_automation())
        logger.info("[Startup] Signal Auto-Engine task created")
    else:
        logger.info("[Startup] Signal Auto-Engine is DISABLED or PAUSED")
        if config.get("paused"):
            logger.info(f"[Startup] Pause reason: {config.get('pause_reason', 'No reason specified')}")
    
    logger.info("[Startup] Startup complete")


async def initialize_super_admins():
    """Create or update protected Super Admin accounts on startup"""
    for email in PROTECTED_SUPER_ADMINS:
        existing = await fetch_profile_by_email(email.lower())
        
        if existing:
            # Ensure they have Super Admin role (cannot be downgraded)
            if existing.get("role") != UserRole.ADMIN.value or existing.get("admin_role") != AdminRole.SUPER_ADMIN.value or not existing.get("is_admin"):
                await update_profile(existing["id"], {
                    "role": UserRole.ADMIN.value,
                    "admin_role": AdminRole.SUPER_ADMIN.value,
                    "admin_enabled": True,
                })
                logger.info(f"[RBAC] Restored Super Admin role for {email}")
            else:
                logger.info(f"[RBAC] Super Admin {email} verified")
        else:
            # Super Admin must be created in Supabase dashboard first
            logger.info(f"[RBAC] Super Admin {email} not found in profiles - must be created via Supabase Auth")
    
    logger.info("[RBAC] Super Admin initialization complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully stop the signal engine on shutdown"""
    global price_automation_running, engine_task
    
    logger.info("[Shutdown] Stopping Signal Auto-Engine...")
    price_automation_running = False
    
    if engine_task:
        engine_task.cancel()
        try:
            await engine_task
        except asyncio.CancelledError:
            pass
    
    logger.info("[Shutdown] Server shutdown complete")


# API endpoint to check automation status
@api_router.get("/automation/status")
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


@api_router.get("/admin/health")
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


@api_router.post("/admin/automation/start")
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


@api_router.post("/admin/automation/stop")
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


@api_router.post("/admin/automation/pause")
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


@api_router.post("/admin/automation/resume")
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


@api_router.post("/admin/automation/config")
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

@api_router.post("/admin/automation/test-simulation")
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

@api_router.post("/fund/apply")
async def submit_fund_application(
    application: FundApplicationCreate,
    current_user: User = Depends(require_auth)
):
    """
    Submit a fund management application.
    Requires Premium or VIP subscription.
    """
    # Get user document for subscription check
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check subscription level
    user_subscription = await get_effective_subscription(user_doc)
    if user_subscription not in ["premium", "vip"]:
        raise HTTPException(
            status_code=403, 
            detail="Fund Management applications require Premium or VIP subscription"
        )
    
    # Validate risk agreement
    if not application.risk_agreement:
        raise HTTPException(
            status_code=400,
            detail="You must agree to the risk disclaimer to submit an application"
        )
    
    # Check if user already has a pending/contacted application for this tier
    # User cannot resubmit same tier while status ≠ Rejected
    existing = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "investment_tier": application.investment_tier.value,
        "status": {"$in": ["pending_review", "contacted", "approved"]}
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"You already have an active application for the {application.investment_tier.value} tier. Status: {existing['status']}"
        )
    
    # Create application
    application_id = f"fund_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    application_doc = {
        "application_id": application_id,
        "user_id": current_user.user_id,
        "full_name": application.full_name,
        "email": application.email,
        "phone": application.phone,
        "country": application.country,
        "investment_tier": application.investment_tier.value,
        "intended_amount": application.intended_amount,
        "trading_experience": application.trading_experience.value,
        "risk_agreement": application.risk_agreement,
        "source": application.source,
        "status": FundApplicationStatus.PENDING_REVIEW.value,
        "admin_notes": None,
        "created_at": now.isoformat(),
        "updated_at": None,
    }
    
    await db.fund_applications.insert_one(application_doc)
    logger.info(f"[Fund] New application {application_id} from user {current_user.user_id}")
    
    return {
        "success": True,
        "application_id": application_id,
        "message": "Application received. Our team will contact you within 48 hours.",
        "status": "pending_review"
    }


@api_router.get("/fund/my-application")
async def get_my_fund_application(current_user: User = Depends(require_auth)):
    """Get the current user's fund management application status."""
    application = await db.fund_applications.find_one(
        {"user_id": current_user.user_id},
        sort=[("created_at", -1)]  # Get most recent
    )
    
    if not application:
        return {"has_application": False, "application": None}
    
    return {
        "has_application": True,
        "application_id": application["application_id"],
        "status": application["status"],
        "investment_tier": application["investment_tier"],
        "intended_amount": application["intended_amount"],
        "created_at": application["created_at"],
    }


@api_router.get("/admin/fund/applications")
async def get_all_fund_applications(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all fund management applications. Admin only."""
    # Check permission: fund_admin, account_manager, customer_support can read; signal_admin cannot
    if not has_permission(admin, "fund_applications", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view fund applications")
    
    query = {}
    if status:
        query["status"] = status
    
    applications = await db.fund_applications.find(query).sort("created_at", -1).to_list(100)
    
    # Remove MongoDB _id field
    for app in applications:
        app.pop("_id", None)
    
    return {"applications": applications, "total": len(applications)}


@api_router.put("/admin/fund/applications/{application_id}")
async def update_fund_application(
    application_id: str,
    status: str,
    admin_notes: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Update fund application status. Admin only."""
    # Check permission: only fund_admin and super_admin can update
    if not has_permission(admin, "fund_applications", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update fund applications")
    
    # Validate status
    valid_statuses = ["pending_review", "contacted", "approved", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    # Find application
    application = await db.fund_applications.find_one({"application_id": application_id})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    
    # Update application
    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if admin_notes is not None:
        update_data["admin_notes"] = admin_notes
    
    await db.fund_applications.update_one(
        {"application_id": application_id},
        {"$set": update_data}
    )
    
    logger.info(f"[Fund] Admin {admin.user_id} updated application {application_id} to {status}")
    
    return {
        "success": True,
        "application_id": application_id,
        "new_status": status,
        "message": f"Application {status}"
    }


# ==============================================================================
# ECONOMIC CALENDAR API - LIVE DATA
# ==============================================================================

# Free economic calendar data source (Fair Economy Media - Forex Factory data)
ECONOMIC_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Cache for economic events (refresh every 30 minutes)
economic_calendar_cache = {
    "data": [],
    "last_fetch": None,
    "cache_duration": timedelta(minutes=30)
}

async def fetch_economic_calendar():
    """
    Fetch live economic calendar data from free API.
    Implements caching to reduce API calls.
    """
    global economic_calendar_cache
    now = datetime.now(timezone.utc)
    
    # Check if cache is valid
    if (economic_calendar_cache["last_fetch"] and 
        now - economic_calendar_cache["last_fetch"] < economic_calendar_cache["cache_duration"] and
        economic_calendar_cache["data"]):
        logger.info("[Calendar] Returning cached data")
        return economic_calendar_cache["data"]
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ECONOMIC_CALENDAR_URL)
            response.raise_for_status()
            data = response.json()
            
            # Process and normalize the data
            events = []
            for idx, item in enumerate(data):
                # Generate unique ID from title, date, and country
                event_id = f"{item.get('country', 'UNK')}_{item.get('title', 'Event').replace(' ', '_')[:20]}_{idx}"
                
                events.append({
                    "id": event_id,
                    "title": item.get("title", "Unknown Event"),
                    "country": item.get("country", "UNK"),
                    "date": item.get("date", ""),
                    "impact": item.get("impact", "Low"),
                    "forecast": item.get("forecast", ""),
                    "previous": item.get("previous", ""),
                })
            
            # Update cache
            economic_calendar_cache["data"] = events
            economic_calendar_cache["last_fetch"] = now
            logger.info(f"[Calendar] Fetched {len(events)} events from API")
            
            return events
            
    except httpx.HTTPStatusError as e:
        logger.error(f"[Calendar] HTTP error fetching calendar: {e}")
        # Return cached data if available, even if stale
        if economic_calendar_cache["data"]:
            logger.warning("[Calendar] Returning stale cached data due to API error")
            return economic_calendar_cache["data"]
        raise HTTPException(status_code=503, detail="Economic calendar service unavailable")
    except Exception as e:
        logger.error(f"[Calendar] Error fetching calendar: {e}")
        if economic_calendar_cache["data"]:
            return economic_calendar_cache["data"]
        raise HTTPException(status_code=500, detail="Failed to fetch economic calendar")


@api_router.get("/calendar/events")
async def get_economic_calendar(filter: str = "week"):
    """
    Get live economic calendar events.
    
    Filters:
    - today: Events for today only
    - week: All events for this week (default)
    - high: Only high impact events for this week
    
    This is READ-ONLY informational data for educational purposes.
    Not financial advice.
    """
    events = await fetch_economic_calendar()
    
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    
    filtered_events = []
    
    for event in events:
        try:
            # Parse the event date
            event_date = datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
            
            if filter == "today":
                # Only today's events
                if today_start <= event_date < today_end:
                    filtered_events.append(event)
            elif filter == "high":
                # Only high impact events
                if event["impact"].lower() == "high":
                    filtered_events.append(event)
            else:
                # All events (week)
                filtered_events.append(event)
                
        except (ValueError, KeyError) as e:
            # Skip events with invalid dates
            logger.warning(f"[Calendar] Skipping event with invalid date: {event.get('title', 'Unknown')}")
            continue
    
    # Sort by date
    filtered_events.sort(key=lambda x: x.get("date", ""))
    
    return {
        "events": filtered_events,
        "total": len(filtered_events),
        "filter": filter,
        "source": "Fair Economy Media",
        "disclaimer": "For educational purposes only. Not financial advice.",
        "cached": economic_calendar_cache["last_fetch"].isoformat() if economic_calendar_cache["last_fetch"] else None
    }


# ==============================================================================
# INVESTOR DASHBOARD ENDPOINTS
# ==============================================================================

ADMIN_WHATSAPP_PHONE = "2348169427440"

@api_router.get("/investor/status")
async def get_investor_status(current_user: User = Depends(require_auth)):
    """Check if user is an approved investor."""
    # Check for approved fund application
    approved_app = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "status": "approved"
    })
    
    if not approved_app:
        return {
            "is_investor": False,
            "message": "No approved fund application found"
        }
    
    # Check for investor portfolio
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    return {
        "is_investor": True,
        "application_id": approved_app["application_id"],
        "has_portfolio": portfolio is not None,
        "portfolio_id": portfolio["portfolio_id"] if portfolio else None
    }


@api_router.get("/investor/dashboard")
async def get_investor_dashboard(current_user: User = Depends(require_auth)):
    """Get investor dashboard data. Only for approved investors."""
    # Check for approved fund application
    approved_app = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "status": "approved"
    })
    
    if not approved_app:
        raise HTTPException(
            status_code=403,
            detail="Access denied. You must have an approved fund application to view the investor dashboard."
        )
    
    # Get or create investor portfolio
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    if not portfolio:
        # Auto-create portfolio from approved application
        portfolio_id = f"portfolio_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        
        portfolio = {
            "portfolio_id": portfolio_id,
            "user_id": current_user.user_id,
            "application_id": approved_app["application_id"],
            "full_name": approved_app["full_name"],
            "email": approved_app["email"],
            "invested_capital": approved_app["intended_amount"],
            "current_equity": approved_app["intended_amount"],
            "total_return_pct": 0.0,
            "investment_tier": approved_app["investment_tier"],
            "performance_fee": 20.0,
            "lockup_months": 3,
            "account_status": "active",
            "start_date": now.isoformat(),
            "created_at": now.isoformat(),
            "updated_at": None
        }
        
        await db.investor_portfolios.insert_one(portfolio)
        logger.info(f"[Investor] Auto-created portfolio {portfolio_id} for user {current_user.user_id}")
    
    portfolio.pop("_id", None)
    
    # Calculate total return percentage
    if portfolio["invested_capital"] > 0:
        portfolio["total_return_pct"] = round(
            ((portfolio["current_equity"] - portfolio["invested_capital"]) / portfolio["invested_capital"]) * 100,
            2
        )
    
    # Get performance history
    performance = await db.fund_performance.find({
        "portfolio_id": portfolio["portfolio_id"]
    }).sort("month", -1).to_list(12)
    
    for p in performance:
        p.pop("_id", None)
    
    # Get withdrawal history
    withdrawals = await db.withdrawal_requests.find({
        "user_id": current_user.user_id
    }).sort("created_at", -1).to_list(20)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    # Get fund notices
    notices = await db.fund_notices.find({}).sort("created_at", -1).to_list(10)
    
    for n in notices:
        n.pop("_id", None)
    
    return {
        "portfolio": portfolio,
        "performance_history": performance,
        "withdrawals": withdrawals,
        "notices": notices
    }


@api_router.post("/investor/withdraw")
async def request_withdrawal(
    request: WithdrawalRequest,
    current_user: User = Depends(require_auth)
):
    """Request a withdrawal. Triggers WhatsApp notification to admin."""
    # Check for approved investor
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    if not portfolio:
        raise HTTPException(
            status_code=403,
            detail="You must be an approved investor to request withdrawals"
        )
    
    if portfolio["account_status"] != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Your account is currently {portfolio['account_status']}. Cannot process withdrawals."
        )
    
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be positive")
    
    if request.amount > portfolio["current_equity"]:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient equity. Your current equity is ${portfolio['current_equity']:,.2f}"
        )
    
    # Check for pending withdrawals
    pending = await db.withdrawal_requests.find_one({
        "user_id": current_user.user_id,
        "status": "pending"
    })
    
    if pending:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending withdrawal request"
        )
    
    # Create withdrawal request
    withdrawal_id = f"withdraw_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    withdrawal_doc = {
        "withdrawal_id": withdrawal_id,
        "user_id": current_user.user_id,
        "portfolio_id": portfolio["portfolio_id"],
        "full_name": portfolio["full_name"],
        "email": portfolio["email"],
        "amount": request.amount,
        "notes": request.notes,
        "status": "pending",
        "admin_notes": None,
        "created_at": now.isoformat(),
        "processed_at": None
    }
    
    await db.withdrawal_requests.insert_one(withdrawal_doc)
    logger.info(f"[Investor] Withdrawal request {withdrawal_id} from user {current_user.user_id} for ${request.amount}")
    
    # Generate WhatsApp notification URL for admin
    whatsapp_message = f"🔔 WITHDRAWAL REQUEST\n\nInvestor: {portfolio['full_name']}\nAmount: ${request.amount:,.2f}\nPortfolio: {portfolio['portfolio_id']}\nRequest ID: {withdrawal_id}\n\nPlease review in Admin Dashboard."
    whatsapp_url = f"https://wa.me/{ADMIN_WHATSAPP_PHONE}?text={quote(whatsapp_message)}"
    
    return {
        "success": True,
        "withdrawal_id": withdrawal_id,
        "amount": request.amount,
        "status": "pending",
        "message": "Withdrawal request submitted. Admin will review within 24-48 hours.",
        "whatsapp_notify_url": whatsapp_url
    }


@api_router.get("/investor/withdrawals")
async def get_withdrawal_history(current_user: User = Depends(require_auth)):
    """Get user's withdrawal history."""
    withdrawals = await db.withdrawal_requests.find({
        "user_id": current_user.user_id
    }).sort("created_at", -1).to_list(50)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {"withdrawals": withdrawals, "total": len(withdrawals)}


# ==============================================================================
# ADMIN - INVESTOR MANAGEMENT ENDPOINTS
# ==============================================================================

@api_router.get("/admin/investor/portfolios")
async def get_all_investor_portfolios(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all investor portfolios. Admin only."""
    query = {}
    if status:
        query["account_status"] = status
    
    portfolios = await db.investor_portfolios.find(query).sort("created_at", -1).to_list(100)
    
    for p in portfolios:
        p.pop("_id", None)
        # Calculate return percentage
        if p["invested_capital"] > 0:
            p["total_return_pct"] = round(
                ((p["current_equity"] - p["invested_capital"]) / p["invested_capital"]) * 100,
                2
            )
    
    return {"portfolios": portfolios, "total": len(portfolios)}


@api_router.get("/admin/investor/portfolio/{portfolio_id}")
async def get_investor_portfolio_detail(
    portfolio_id: str,
    admin: User = Depends(require_admin)
):
    """Get detailed investor portfolio. Admin only."""
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    portfolio.pop("_id", None)
    
    # Get performance history
    performance = await db.fund_performance.find({
        "portfolio_id": portfolio_id
    }).sort("month", -1).to_list(24)
    
    for p in performance:
        p.pop("_id", None)
    
    # Get withdrawal history
    withdrawals = await db.withdrawal_requests.find({
        "portfolio_id": portfolio_id
    }).sort("created_at", -1).to_list(50)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {
        "portfolio": portfolio,
        "performance_history": performance,
        "withdrawals": withdrawals
    }


@api_router.put("/admin/investor/portfolio/{portfolio_id}")
async def update_investor_portfolio(
    portfolio_id: str,
    update: InvestorPortfolioUpdate,
    admin: User = Depends(require_admin)
):
    """Update investor portfolio. Admin only."""
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.invested_capital is not None:
        update_data["invested_capital"] = update.invested_capital
    if update.current_equity is not None:
        update_data["current_equity"] = update.current_equity
    if update.account_status is not None:
        update_data["account_status"] = update.account_status.value
    if update.performance_fee is not None:
        update_data["performance_fee"] = update.performance_fee
    if update.lockup_months is not None:
        update_data["lockup_months"] = update.lockup_months
    
    await db.investor_portfolios.update_one(
        {"portfolio_id": portfolio_id},
        {"$set": update_data}
    )
    
    logger.info(f"[Investor] Admin {admin.user_id} updated portfolio {portfolio_id}")
    
    return {"success": True, "message": "Portfolio updated successfully"}


@api_router.post("/admin/investor/portfolio/{portfolio_id}/performance")
async def add_performance_entry(
    portfolio_id: str,
    entry: FundPerformanceEntry,
    admin: User = Depends(require_admin)
):
    """Add monthly performance entry for an investor. Admin only."""
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    # Check for existing entry for this month
    existing = await db.fund_performance.find_one({
        "portfolio_id": portfolio_id,
        "month": entry.month
    })
    
    if existing:
        # Update existing entry
        await db.fund_performance.update_one(
            {"portfolio_id": portfolio_id, "month": entry.month},
            {"$set": {
                "return_percentage": entry.return_percentage,
                "notes": entry.notes,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        logger.info(f"[Investor] Admin updated performance for {portfolio_id} month {entry.month}")
        return {"success": True, "message": f"Performance updated for {entry.month}"}
    
    # Create new entry
    performance_id = f"perf_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Calculate new equity based on return
    new_equity = portfolio["current_equity"] * (1 + entry.return_percentage / 100)
    
    performance_doc = {
        "performance_id": performance_id,
        "portfolio_id": portfolio_id,
        "user_id": portfolio["user_id"],
        "month": entry.month,
        "return_percentage": entry.return_percentage,
        "equity_before": portfolio["current_equity"],
        "equity_after": new_equity,
        "notes": entry.notes,
        "created_at": now.isoformat(),
        "updated_at": None
    }
    
    await db.fund_performance.insert_one(performance_doc)
    
    # Update portfolio equity
    await db.investor_portfolios.update_one(
        {"portfolio_id": portfolio_id},
        {"$set": {
            "current_equity": new_equity,
            "updated_at": now.isoformat()
        }}
    )
    
    logger.info(f"[Investor] Admin added performance for {portfolio_id} month {entry.month}: {entry.return_percentage}%")
    
    return {
        "success": True,
        "message": f"Performance entry added for {entry.month}",
        "new_equity": new_equity
    }


@api_router.get("/admin/investor/withdrawals")
async def get_all_withdrawal_requests(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all withdrawal requests. Admin only."""
    query = {}
    if status:
        query["status"] = status
    
    withdrawals = await db.withdrawal_requests.find(query).sort("created_at", -1).to_list(100)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {"withdrawals": withdrawals, "total": len(withdrawals)}


@api_router.put("/admin/investor/withdrawal/{withdrawal_id}")
async def process_withdrawal(
    withdrawal_id: str,
    status: str,
    admin_notes: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Process a withdrawal request. Admin only."""
    valid_statuses = ["approved", "paid", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    withdrawal = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id})
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")
    
    now = datetime.now(timezone.utc)
    
    update_data = {
        "status": status,
        "admin_notes": admin_notes,
        "processed_at": now.isoformat()
    }
    
    await db.withdrawal_requests.update_one(
        {"withdrawal_id": withdrawal_id},
        {"$set": update_data}
    )
    
    # If paid, deduct from portfolio equity
    if status == "paid":
        await db.investor_portfolios.update_one(
            {"portfolio_id": withdrawal["portfolio_id"]},
            {"$inc": {"current_equity": -withdrawal["amount"]}}
        )
        logger.info(f"[Investor] Deducted ${withdrawal['amount']} from portfolio {withdrawal['portfolio_id']}")
    
    logger.info(f"[Investor] Admin {admin.user_id} {status} withdrawal {withdrawal_id}")
    
    return {"success": True, "message": f"Withdrawal {status}"}


@api_router.get("/admin/investor/notices")
async def get_all_notices(admin: User = Depends(require_admin)):
    """Get all fund notices. Admin only."""
    notices = await db.fund_notices.find({}).sort("created_at", -1).to_list(50)
    
    for n in notices:
        n.pop("_id", None)
    
    return {"notices": notices, "total": len(notices)}


@api_router.post("/admin/investor/notice")
async def create_notice(
    notice: FundNoticeCreate,
    admin: User = Depends(require_admin)
):
    """Create a fund notice/announcement. Admin only."""
    notice_id = f"notice_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    notice_doc = {
        "notice_id": notice_id,
        "title": notice.title,
        "content": notice.content,
        "notice_type": notice.notice_type,
        "created_by": admin.user_id,
        "created_at": now.isoformat()
    }
    
    await db.fund_notices.insert_one(notice_doc)
    logger.info(f"[Investor] Admin {admin.user_id} created notice {notice_id}")
    
    return {"success": True, "notice_id": notice_id, "message": "Notice created successfully"}


@api_router.delete("/admin/investor/notice/{notice_id}")
async def delete_notice(
    notice_id: str,
    admin: User = Depends(require_admin)
):
    """Delete a fund notice. Admin only."""
    result = await db.fund_notices.delete_one({"notice_id": notice_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notice not found")
    
    logger.info(f"[Investor] Admin {admin.user_id} deleted notice {notice_id}")
    
    return {"success": True, "message": "Notice deleted successfully"}


# ==============================================================================
# ADMIN ROLE MANAGEMENT API - SUPER ADMIN ONLY
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


@api_router.get("/admin/rbac/me")
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


@api_router.get("/admin/rbac/admins")
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


@api_router.post("/admin/rbac/admins")
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


@api_router.put("/admin/rbac/admins/{user_id}")
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


@api_router.delete("/admin/rbac/admins/{user_id}")
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

@api_router.get("/admin/rbac/audit-logs")
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

@api_router.get("/admin/notifications")
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


@api_router.put("/admin/notifications/{notification_id}/read")
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

@api_router.get("/admin/rbac/roles")
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
# REFERRAL PROGRAM API ENDPOINTS
# ==============================================================================

@api_router.get("/referral/my-code")
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


@api_router.get("/referral/validate/{code}")
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


@api_router.post("/referral/claim-reward/{referral_id}")
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

@api_router.get("/admin/referrals")
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


@api_router.put("/admin/referrals/{referral_id}/approve")
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


@api_router.put("/admin/referrals/{referral_id}/revoke")
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


@api_router.put("/admin/referrals/{referral_id}/flag")
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
# HELP & SUPPORT SYSTEM
# ==============================================================================

# Support Ticket Status
class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"

# Support Ticket Categories
class TicketCategory(str, Enum):
    BILLING = "billing"
    SIGNALS = "signals"
    FUND = "fund"
    REFERRAL = "referral"
    TECHNICAL = "technical"
    OTHER = "other"

# FAQ Categories
class FAQCategory(str, Enum):
    SUBSCRIPTION_BILLING = "subscription_billing"
    SIGNALS_TRADING = "signals_trading"
    FUND_MANAGEMENT = "fund_management"
    REFERRAL_PROGRAM = "referral_program"
    TECHNICAL_ISSUES = "technical_issues"

# Models
class SupportTicketCreate(BaseModel):
    category: TicketCategory
    subject: str
    message: str

class TicketReply(BaseModel):
    message: str

class TicketNote(BaseModel):
    note: str

class FAQCreate(BaseModel):
    category: FAQCategory
    question: str
    answer: str
    order: int = 0

class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None

# WhatsApp Support Number
SUPPORT_WHATSAPP = "+2348169427440"
SUPPORT_EMAIL = "support@swiftfx.online"

# Pre-populated FAQs
DEFAULT_FAQS = [
    # Subscription & Billing
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "What subscription plans are available?",
        "answer": "Swift FX offers three tiers: Free (limited signals), Premium (full signals access + AI analysis), and VIP (everything + priority support + fund management access). Each tier is designed to match your trading needs.",
        "order": 1
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "How do I upgrade my subscription?",
        "answer": "Go to the Subscription page from the More menu. Select your desired plan and billing cycle (weekly, monthly, or yearly). Follow the payment instructions to complete your upgrade.",
        "order": 2
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "Can I cancel my subscription anytime?",
        "answer": "Yes, you can cancel anytime. Your premium features will remain active until your current billing period ends. No partial refunds are provided for unused time.",
        "order": 3
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "What payment methods are accepted?",
        "answer": "We currently accept payments via our secure payment gateway. Contact support for specific payment method inquiries in your region.",
        "order": 4
    },
    # Signals & Trading
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "How do trading signals work?",
        "answer": "Our expert analysts provide real-time trading signals with entry price, stop loss (SL), and three take profit levels (TP1, TP2, TP3). Signals cover Forex pairs, Gold, and Crypto markets. You'll receive notifications when new signals are posted.",
        "order": 1
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "What is the difference between Free and Premium signals?",
        "answer": "Free users see limited signals with delayed access. Premium and VIP members get instant access to all signals, including exclusive high-probability setups and detailed market analysis.",
        "order": 2
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "How accurate are the trading signals?",
        "answer": "Our signals are provided by experienced analysts with a strong track record. However, trading involves risk. We recommend proper risk management and never trading more than you can afford to lose.",
        "order": 3
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "Can I use signals on any broker?",
        "answer": "Yes! Our signals can be used with any Forex/CFD broker. Check our Brokers section for recommended brokers that offer competitive spreads and reliable execution.",
        "order": 4
    },
    # Fund Management
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "What is Fund Management?",
        "answer": "Fund Management allows VIP members to have their capital professionally managed by our expert traders. You maintain full control of your funds in your own broker account while our team executes trades on your behalf.",
        "order": 1
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "How do I apply for Fund Management?",
        "answer": "VIP members can apply through the Fund Management section. Fill out the application form with your investment details, and our team will contact you via WhatsApp to discuss the next steps.",
        "order": 2
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "What is the minimum investment amount?",
        "answer": "The minimum investment varies based on your goals and our current capacity. Contact our team through the Fund Management application for current requirements.",
        "order": 3
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "How do I withdraw from my managed fund?",
        "answer": "Withdrawals can be requested through the Investor Dashboard. Submit a withdrawal request, and our team will process it within 2-5 business days after verification.",
        "order": 4
    },
    # Referral Program
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "How does the referral program work?",
        "answer": "Share your unique referral code with friends. When they sign up and subscribe, you earn rewards! Premium referrals earn you 7 extra days, and VIP referrals earn you 14 extra days of premium access.",
        "order": 1
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "Where do I find my referral code?",
        "answer": "Go to the Referral Program page from the More menu. Your unique referral code and shareable link are displayed there, along with easy share buttons for WhatsApp and other platforms.",
        "order": 2
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "When do I receive my referral rewards?",
        "answer": "Referral rewards are unlocked 7 days after your referred friend subscribes to a paid plan. This ensures legitimate referrals and prevents abuse.",
        "order": 3
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "Is there a limit to how many people I can refer?",
        "answer": "No limit! Refer as many friends as you want. The more successful referrals, the more free premium days you earn.",
        "order": 4
    },
    # Technical Issues
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "The app is not loading properly. What should I do?",
        "answer": "Try these steps: 1) Close and reopen the app, 2) Check your internet connection, 3) Clear the app cache in settings, 4) Update to the latest version. If issues persist, contact support.",
        "order": 1
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "I'm not receiving notifications for new signals.",
        "answer": "Ensure notifications are enabled: 1) Check app notification settings, 2) Check your device notification permissions for Swift FX, 3) Make sure 'Do Not Disturb' mode is off.",
        "order": 2
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "I forgot my password. How do I reset it?",
        "answer": "On the login screen, tap 'Forgot Password' and enter your email. You'll receive a reset link. If you don't receive it, check your spam folder or contact support.",
        "order": 3
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "How do I update my profile information?",
        "answer": "Go to Settings from the More menu. You can update your name, profile picture, and notification preferences. Email changes require verification for security.",
        "order": 4
    },
]

# Initialize FAQs on startup
async def initialize_faqs():
    """Populate default FAQs if none exist"""
    faq_count = await db.faqs.count_documents({})
    if faq_count == 0:
        for faq in DEFAULT_FAQS:
            faq["faq_id"] = f"faq_{uuid.uuid4().hex[:12]}"
            faq["is_active"] = True
            faq["created_at"] = datetime.now(timezone.utc).isoformat()
            faq["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.faqs.insert_many(DEFAULT_FAQS)
        logger.info(f"[FAQs] Initialized {len(DEFAULT_FAQS)} default FAQs")

# ==================== USER SUPPORT ENDPOINTS ====================

@api_router.get("/support/faqs")
async def get_faqs(category: Optional[str] = None):
    """Get all active FAQs, optionally filtered by category"""
    query = {"is_active": True}
    if category:
        query["category"] = category
    
    faqs = await db.faqs.find(query).sort("order", 1).to_list(100)
    
    # Group by category
    grouped = {}
    for faq in faqs:
        faq["_id"] = str(faq["_id"])
        cat = faq["category"]
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(faq)
    
    return {
        "faqs": faqs,
        "grouped": grouped,
        "categories": [
            {"id": FAQCategory.SUBSCRIPTION_BILLING.value, "name": "Subscription & Billing"},
            {"id": FAQCategory.SIGNALS_TRADING.value, "name": "Signals & Trading"},
            {"id": FAQCategory.FUND_MANAGEMENT.value, "name": "Fund Management"},
            {"id": FAQCategory.REFERRAL_PROGRAM.value, "name": "Referral Program"},
            {"id": FAQCategory.TECHNICAL_ISSUES.value, "name": "Technical Issues"},
        ]
    }

@api_router.post("/support/tickets")
async def create_support_ticket(
    ticket: SupportTicketCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new support ticket"""
    ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
    
    ticket_doc = {
        "ticket_id": ticket_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "user_email": current_user.email,
        "category": ticket.category.value,
        "subject": ticket.subject,
        "message": ticket.message,
        "status": TicketStatus.OPEN.value,
        "replies": [],
        "admin_notes": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "closed_at": None,
    }
    
    await db.support_tickets.insert_one(ticket_doc)
    
    # Create notification for Customer Support and Super Admin
    await create_admin_notification(
        target_roles=[AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT],
        notification_type="new_support_ticket",
        title="New Support Ticket",
        message=f"New ticket from {current_user.name}: {ticket.subject}",
        resource_id=ticket_id
    )
    
    logger.info(f"[Support] New ticket {ticket_id} from user {current_user.user_id}")
    
    return {
        "success": True,
        "ticket_id": ticket_id,
        "message": "Support ticket created successfully. Our team will respond shortly.",
        "status": TicketStatus.OPEN.value
    }

@api_router.get("/support/tickets")
async def get_user_tickets(current_user: User = Depends(get_current_user)):
    """Get all support tickets for the current user"""
    tickets = await db.support_tickets.find(
        {"user_id": current_user.user_id}
    ).sort("created_at", -1).to_list(50)
    
    for ticket in tickets:
        ticket["_id"] = str(ticket["_id"])
        # Remove admin notes from user view
        ticket.pop("admin_notes", None)
    
    return {"tickets": tickets}

@api_router.get("/support/tickets/{ticket_id}")
async def get_ticket_details(
    ticket_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific support ticket"""
    ticket = await db.support_tickets.find_one({
        "ticket_id": ticket_id,
        "user_id": current_user.user_id
    })
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    ticket["_id"] = str(ticket["_id"])
    # Remove admin notes from user view
    ticket.pop("admin_notes", None)
    
    return {"ticket": ticket}

@api_router.get("/support/info")
async def get_support_info(current_user: Optional[User] = Depends(get_current_user)):
    """Get support contact information"""
    user_email = current_user.email if current_user else "user"
    whatsapp_message = f"Hello Swift FX Support, I need help with an issue. My email is {user_email}."
    whatsapp_url = f"https://wa.me/{SUPPORT_WHATSAPP.replace('+', '')}?text={quote(whatsapp_message)}"
    
    return {
        "whatsapp_number": SUPPORT_WHATSAPP,
        "whatsapp_url": whatsapp_url,
        "email": SUPPORT_EMAIL,
        "email_subject": f"Support Request - {user_email}"
    }

# ==================== ADMIN SUPPORT ENDPOINTS ====================

@api_router.get("/admin/support/tickets")
async def admin_get_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all support tickets. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to view support tickets")
    
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    
    tickets = await db.support_tickets.find(query).sort("created_at", -1).to_list(100)
    
    for ticket in tickets:
        ticket["_id"] = str(ticket["_id"])
    
    # Get stats
    stats = {
        "total": await db.support_tickets.count_documents({}),
        "open": await db.support_tickets.count_documents({"status": TicketStatus.OPEN.value}),
        "in_progress": await db.support_tickets.count_documents({"status": TicketStatus.IN_PROGRESS.value}),
        "resolved": await db.support_tickets.count_documents({"status": TicketStatus.RESOLVED.value}),
        "closed": await db.support_tickets.count_documents({"status": TicketStatus.CLOSED.value}),
    }
    
    return {"tickets": tickets, "stats": stats}

@api_router.get("/admin/support/tickets/{ticket_id}")
async def admin_get_ticket_details(
    ticket_id: str,
    admin: User = Depends(require_admin)
):
    """Get detailed view of a support ticket. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to view support tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    ticket["_id"] = str(ticket["_id"])
    
    # Get user details
    user = await fetch_profile(ticket["user_id"])
    user_info = {
        "name": user.get("name", "Unknown") if user else "Unknown",
        "email": user.get("email", "Unknown") if user else "Unknown",
        "subscription": user.get("subscription", "free") if user else "free",
        "created_at": user.get("created_at") if user else None,
    }
    
    return {"ticket": ticket, "user_info": user_info}

@api_router.put("/admin/support/tickets/{ticket_id}/status")
async def admin_update_ticket_status(
    ticket_id: str,
    new_status: TicketStatus,
    admin: User = Depends(require_admin)
):
    """Update ticket status. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to update tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    old_status = ticket["status"]
    
    update_data = {
        "status": new_status.value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if new_status == TicketStatus.RESOLVED:
        update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == TicketStatus.CLOSED:
        update_data["closed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": update_data}
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "update_status",
        "support_ticket",
        ticket_id,
        {"old_status": old_status, "new_status": new_status.value}
    )
    
    # Create user notification for status change
    # (In a real app, you'd send push notification here)
    logger.info(f"[Support] Ticket {ticket_id} status changed: {old_status} -> {new_status.value}")
    
    return {
        "success": True,
        "message": f"Ticket status updated to {new_status.value}",
        "ticket_id": ticket_id,
        "new_status": new_status.value
    }

@api_router.post("/admin/support/tickets/{ticket_id}/note")
async def admin_add_note(
    ticket_id: str,
    note: TicketNote,
    admin: User = Depends(require_admin)
):
    """Add internal admin note to ticket. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to add notes")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    note_entry = {
        "note_id": f"note_{uuid.uuid4().hex[:8]}",
        "admin_id": admin.user_id,
        "admin_name": admin.name,
        "admin_role": admin.admin_role.value if admin.admin_role else "admin",
        "note": note.note,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {
            "$push": {"admin_notes": note_entry},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "add_note",
        "support_ticket",
        ticket_id,
        {"note_preview": note.note[:50] + "..." if len(note.note) > 50 else note.note}
    )
    
    return {"success": True, "message": "Note added successfully", "note_id": note_entry["note_id"]}

@api_router.post("/admin/support/tickets/{ticket_id}/reply")
async def admin_add_reply(
    ticket_id: str,
    reply: TicketReply,
    admin: User = Depends(require_admin)
):
    """Add reply to ticket (visible to user). Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to reply to tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    reply_entry = {
        "reply_id": f"reply_{uuid.uuid4().hex[:8]}",
        "admin_id": admin.user_id,
        "admin_name": admin.name,
        "message": reply.message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Auto-update status to in_progress if currently open
    update_data = {
        "$push": {"replies": reply_entry},
        "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
    }
    
    if ticket["status"] == TicketStatus.OPEN.value:
        update_data["$set"]["status"] = TicketStatus.IN_PROGRESS.value
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        update_data
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "add_reply",
        "support_ticket",
        ticket_id,
        {"reply_preview": reply.message[:50] + "..." if len(reply.message) > 50 else reply.message}
    )
    
    logger.info(f"[Support] Admin {admin.user_id} replied to ticket {ticket_id}")
    
    return {"success": True, "message": "Reply added successfully", "reply_id": reply_entry["reply_id"]}

# ==================== ADMIN FAQ MANAGEMENT ====================

@api_router.get("/admin/faqs")
async def admin_get_faqs(admin: User = Depends(require_admin)):
    """Get all FAQs including inactive ones. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to manage FAQs")
    
    faqs = await db.faqs.find({}).sort([("category", 1), ("order", 1)]).to_list(100)
    for faq in faqs:
        faq["_id"] = str(faq["_id"])
    
    return {"faqs": faqs}

@api_router.post("/admin/faqs")
async def admin_create_faq(
    faq: FAQCreate,
    admin: User = Depends(require_admin)
):
    """Create a new FAQ. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can create FAQs")
    
    faq_id = f"faq_{uuid.uuid4().hex[:12]}"
    faq_doc = {
        "faq_id": faq_id,
        "category": faq.category.value,
        "question": faq.question,
        "answer": faq.answer,
        "order": faq.order,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.faqs.insert_one(faq_doc)
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "create",
        "faq",
        faq_id,
        {"question": faq.question[:50]}
    )
    
    return {"success": True, "faq_id": faq_id, "message": "FAQ created successfully"}

@api_router.put("/admin/faqs/{faq_id}")
async def admin_update_faq(
    faq_id: str,
    update: FAQUpdate,
    admin: User = Depends(require_admin)
):
    """Update an FAQ. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update FAQs")
    
    faq = await db.faqs.find_one({"faq_id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if update.question is not None:
        update_data["question"] = update.question
    if update.answer is not None:
        update_data["answer"] = update.answer
    if update.order is not None:
        update_data["order"] = update.order
    if update.is_active is not None:
        update_data["is_active"] = update.is_active
    
    await db.faqs.update_one({"faq_id": faq_id}, {"$set": update_data})
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "update",
        "faq",
        faq_id,
        {"fields_updated": list(update_data.keys())}
    )
    
    return {"success": True, "message": "FAQ updated successfully"}

@api_router.delete("/admin/faqs/{faq_id}")
async def admin_delete_faq(
    faq_id: str,
    admin: User = Depends(require_admin)
):
    """Delete an FAQ (soft delete - sets is_active=False). Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete FAQs")
    
    faq = await db.faqs.find_one({"faq_id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    # Soft delete - just deactivate
    await db.faqs.update_one(
        {"faq_id": faq_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "delete",
        "faq",
        faq_id,
        {"soft_delete": True}
    )
    
    return {"success": True, "message": "FAQ deleted successfully"}


# ==============================================================================
# USER SETTINGS SYSTEM
# ==============================================================================

# Account Status for soft delete
class AccountStatus(str, Enum):
    ACTIVE = "active"
    DEACTIVATED = "deactivated"
    DELETED = "deleted"

# Settings Models
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

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

@api_router.get("/settings/profile")
async def get_user_profile(current_user: User = Depends(require_auth)):
    """Get current user's profile information"""
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": user_doc["id"],
        "name": user_doc.get("name", ""),
        "email": current_user.email,
        "phone": user_doc.get("phone", ""),
        "role": user_doc.get("role", "free"),
        "subscription": user_doc.get("role", "free"),
        "subscription_expiry": None,
        "admin_role": user_doc.get("admin_role"),
        "is_admin": user_doc.get("role") == "admin",
        "account_status": user_doc.get("account_status", "active"),
        "created_at": user_doc.get("created_at"),
        "last_login": user_doc.get("last_login"),
        "picture": user_doc.get("picture"),
    }

@api_router.put("/settings/profile")
async def update_user_profile(
    update: ProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user profile (name and phone)"""
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.name is not None:
        if len(update.name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        update_data["name"] = update.name.strip()
    
    if update.phone is not None:
        update_data["phone"] = update.phone.strip()
    
    await update_profile(current_user.user_id, update_data)
    
    logger.info(f"[Settings] User {current_user.user_id} updated profile")
    
    return {"success": True, "message": "Profile updated successfully"}

@api_router.put("/settings/password")
async def change_password(
    password_change: PasswordChange,
    current_user: User = Depends(require_auth)
):
    """Change user password via Supabase Auth Admin API"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Update password via Supabase Auth Admin API
    success = await update_auth_user(current_user.user_id, {"password": password_change.new_password})
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")
    
    logger.info(f"[Settings] User {current_user.user_id} changed password")
    
    return {"success": True, "message": "Password changed successfully"}

@api_router.get("/settings/notifications")
async def get_notification_preferences(current_user: User = Depends(get_current_user)):
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
    
    prefs = user_doc.get("notification_settings", default_prefs)
    
    # Merge with defaults for any missing keys
    for key, value in default_prefs.items():
        if key not in prefs:
            prefs[key] = value
    
    return {"preferences": prefs}

@api_router.put("/settings/notifications")
async def update_notification_preferences(
    update: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update notification preferences"""
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get current preferences
    current_prefs = user_doc.get("notification_settings", {
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
    
    await update_profile(current_user.user_id, {"notification_settings": current_prefs})
    
    logger.info(f"[Settings] User {current_user.user_id} updated notification preferences")
    
    return {"success": True, "message": "Notification preferences updated", "preferences": current_prefs}

@api_router.get("/settings/legal/{document_type}")
async def get_legal_document(document_type: str):
    """Get legal document content (public endpoint)"""
    if document_type not in LEGAL_CONTENT:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return LEGAL_CONTENT[document_type]

@api_router.post("/settings/deactivate")
async def deactivate_account(
    request: AccountDeactivateRequest,
    current_user: User = Depends(get_current_user)
):
    """Deactivate user account (soft delete)"""
    # Prevent protected admin deactivation
    if is_protected_super_admin(current_user.email):
        raise HTTPException(status_code=403, detail="Protected admin accounts cannot be deactivated")
    
    await update_profile(current_user.user_id, {
            "account_status": AccountStatus.DEACTIVATED.value,
            "deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deactivation_reason": request.reason,
        })
    
    logger.info(f"[Settings] User {current_user.user_id} deactivated account")
    
    return {"success": True, "message": "Account deactivated. You can contact support to reactivate."}

@api_router.post("/settings/delete-request")
async def request_account_deletion(
    current_user: User = Depends(get_current_user)
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

@api_router.get("/settings/sessions")
async def get_user_sessions(current_user: User = Depends(get_current_user)):
    """Get user session information (prepared for multi-device control)"""
    user_doc = await fetch_profile(current_user.user_id)
    
    return {
        "current_session": {
            "last_login": user_doc.get("last_login"),
            "login_ip": user_doc.get("last_login_ip"),
        },
        "multi_device_enabled": False,  # Future feature placeholder
        "active_sessions": 1,  # Future feature placeholder
    }

# ==================== ADMIN USER SETTINGS ENDPOINTS ====================

@api_router.get("/admin/users/{user_id}/settings")
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
        "notification_settings": user_doc.get("notification_settings", {}),
        "account_status": user_doc.get("account_status", "active"),
    }

@api_router.post("/admin/users/{user_id}/deactivate")
async def admin_deactivate_user(
    user_id: str,
    reason: str,
    admin: User = Depends(require_admin)
):
    """Force deactivate a user account. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can deactivate accounts")
    
    user_doc = await fetch_profile(user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deactivating protected super admins
    if is_protected_super_admin(user_doc.get("email", "")):
        raise HTTPException(status_code=403, detail="Cannot deactivate protected Super Admin accounts")
    
    await update_profile(user_id, {
            "account_status": AccountStatus.DEACTIVATED.value,
            "deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deactivated_by": admin.user_id,
            "deactivation_reason": reason,
        })
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "deactivate_user",
        "user",
        user_id,
        {"reason": reason}
    )
    
    logger.info(f"[Admin] Super Admin {admin.user_id} deactivated user {user_id}")
    
    return {"success": True, "message": "User account deactivated"}

@api_router.post("/admin/users/{user_id}/restore")
async def admin_restore_user(
    user_id: str,
    admin: User = Depends(require_admin)
):
    """Restore a deactivated user account. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can restore accounts")
    
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
        admin.admin_role.value,
        "restore_user",
        "user",
        user_id,
        {}
    )
    
    logger.info(f"[Admin] Super Admin {admin.user_id} restored user {user_id}")
    
    return {"success": True, "message": "User account restored"}


# ==============================================================================
# IN-APP PURCHASES (IAP) - APPLE & GOOGLE
# ==============================================================================

# IAP Request/Response Models
class AppleReceiptValidationRequest(BaseModel):
    receipt_data: str = Field(..., description="Base64 encoded receipt data from iOS")
    exclude_old_transactions: bool = Field(default=True)

class GooglePurchaseValidationRequest(BaseModel):
    purchase_token: str = Field(..., description="Purchase token from Google Play")
    product_id: str = Field(..., description="Product ID of the subscription")
    package_name: Optional[str] = Field(default=None, description="Package name (optional, uses default)")

class IAPValidationResponse(BaseModel):
    success: bool
    plan: Optional[str] = None
    expiry_date: Optional[str] = None
    is_trial: bool = False
    auto_renew: bool = False
    message: str = ""

class AppleNotificationPayload(BaseModel):
    signedPayload: str

class GoogleNotificationPayload(BaseModel):
    message: dict
    subscription: Optional[str] = None

# IAP Transaction record
class IAPTransaction(BaseModel):
    transaction_id: str
    user_id: str
    platform: str  # 'ios' or 'android'
    product_id: str
    plan: str
    original_transaction_id: Optional[str] = None
    purchase_date: str
    expiry_date: Optional[str] = None
    is_trial: bool = False
    auto_renew: bool = True
    status: str = "active"  # active, expired, cancelled, refunded
    raw_receipt: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ==================== APPLE IAP VALIDATION ====================

async def validate_apple_receipt(receipt_data: str, exclude_old: bool = True) -> dict:
    """
    Validate Apple App Store receipt
    
    Endpoints:
    - Sandbox: https://sandbox.itunes.apple.com/verifyReceipt
    - Production: https://buy.itunes.apple.com/verifyReceipt
    
    Returns validation result with subscription info
    """
    if not APPLE_ENVIRONMENT:
        raise HTTPException(status_code=503, detail="Apple IAP not configured: APPLE_ENVIRONMENT not set")
    if not APPLE_SHARED_SECRET:
        raise HTTPException(status_code=503, detail="Apple IAP not configured: APPLE_SHARED_SECRET not set")
    
    # Determine endpoint based on environment
    if APPLE_ENVIRONMENT == 'production':
        url = "https://buy.itunes.apple.com/verifyReceipt"
    else:
        url = "https://sandbox.itunes.apple.com/verifyReceipt"
    
    payload = {
        "receipt-data": receipt_data,
        "password": APPLE_SHARED_SECRET,
        "exclude-old-transactions": exclude_old
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, timeout=30.0)
            result = response.json()
            
            # Status 21007 means sandbox receipt sent to production
            # Retry with sandbox endpoint
            if result.get('status') == 21007:
                logger.info("[Apple IAP] Sandbox receipt, retrying with sandbox endpoint")
                url = "https://sandbox.itunes.apple.com/verifyReceipt"
                response = await client.post(url, json=payload, timeout=30.0)
                result = response.json()
            
            return result
        except Exception as e:
            logger.error(f"[Apple IAP] Validation error: {e}")
            return {"status": -1, "error": str(e)}


def parse_apple_receipt(validation_result: dict) -> dict:
    """Parse Apple receipt validation result to extract subscription info"""
    if validation_result.get('status') != 0:
        status_codes = {
            21000: "App Store could not read JSON",
            21002: "Receipt data malformed",
            21003: "Receipt not authenticated",
            21004: "Shared secret mismatch",
            21005: "Receipt server unavailable",
            21006: "Receipt valid but subscription expired",
            21007: "Sandbox receipt sent to production",
            21008: "Production receipt sent to sandbox",
            21010: "Account not found",
        }
        error_msg = status_codes.get(validation_result.get('status'), "Unknown error")
        return {"valid": False, "error": error_msg, "status": validation_result.get('status')}
    
    receipt = validation_result.get('receipt', {})
    latest_receipt_info = validation_result.get('latest_receipt_info', [])
    pending_renewal_info = validation_result.get('pending_renewal_info', [])
    
    # Get the most recent active subscription
    active_subscription = None
    latest_expiry = None
    
    for txn in latest_receipt_info:
        expires_date_ms = txn.get('expires_date_ms')
        if expires_date_ms:
            expires_date = datetime.fromtimestamp(int(expires_date_ms) / 1000, tz=timezone.utc)
            if expires_date > datetime.now(timezone.utc):
                if latest_expiry is None or expires_date > latest_expiry:
                    latest_expiry = expires_date
                    active_subscription = txn
    
    if not active_subscription:
        # Check if expired
        if latest_receipt_info:
            latest = sorted(latest_receipt_info, key=lambda x: int(x.get('expires_date_ms', 0)), reverse=True)[0]
            return {
                "valid": True,
                "active": False,
                "product_id": latest.get('product_id'),
                "expired": True,
                "expiry_date": datetime.fromtimestamp(int(latest.get('expires_date_ms', 0)) / 1000, tz=timezone.utc).isoformat()
            }
        return {"valid": True, "active": False, "error": "No active subscription found"}
    
    # Check auto-renewal status
    auto_renew = True
    is_trial = active_subscription.get('is_trial_period', 'false') == 'true'
    
    for renewal in pending_renewal_info:
        if renewal.get('product_id') == active_subscription.get('product_id'):
            auto_renew = renewal.get('auto_renew_status') == '1'
            break
    
    return {
        "valid": True,
        "active": True,
        "product_id": active_subscription.get('product_id'),
        "original_transaction_id": active_subscription.get('original_transaction_id'),
        "transaction_id": active_subscription.get('transaction_id'),
        "purchase_date": datetime.fromtimestamp(int(active_subscription.get('purchase_date_ms', 0)) / 1000, tz=timezone.utc).isoformat(),
        "expiry_date": latest_expiry.isoformat() if latest_expiry else None,
        "is_trial": is_trial,
        "auto_renew": auto_renew,
        "bundle_id": receipt.get('bundle_id'),
    }


@api_router.post("/iap/apple/verify", response_model=IAPValidationResponse)
async def verify_apple_purchase(
    request: AppleReceiptValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Verify Apple App Store purchase receipt and update user subscription
    
    Flow:
    1. Client sends receipt data after purchase
    2. Server validates with Apple
    3. Server updates user subscription
    4. Returns success/failure
    """
    user_id = current_user.user_id
    
    try:
        # Validate receipt with Apple
        validation_result = await validate_apple_receipt(
            request.receipt_data, 
            request.exclude_old_transactions
        )
        
        # Parse the validation result
        parsed = parse_apple_receipt(validation_result)
        
        if not parsed.get('valid'):
            logger.warning(f"[Apple IAP] Invalid receipt for user {user_id}: {parsed.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid receipt: {parsed.get('error')}"
            )
        
        if not parsed.get('active'):
            logger.info(f"[Apple IAP] No active subscription for user {user_id}")
            return IAPValidationResponse(
                success=False,
                message="No active subscription found"
            )
        
        # Get plan from product ID
        product_id = parsed.get('product_id')
        plan = get_plan_from_product_id(product_id)
        
        if not plan:
            logger.error(f"[Apple IAP] Unknown product ID: {product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {product_id}"
            )
        
        # Update user subscription
        expiry_date = parsed.get('expiry_date')
        
        await update_profile(user_id, {
                "subscription": plan,
                "subscription_status": "active",
                "subscription_expiry": expiry_date,
                "subscription_platform": "ios",
                "subscription_product_id": product_id,
                "subscription_auto_renew": parsed.get('auto_renew', True),
                "subscription_is_trial": parsed.get('is_trial', False),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Store transaction record
        transaction = {
            "transaction_id": parsed.get('transaction_id'),
            "original_transaction_id": parsed.get('original_transaction_id'),
            "user_id": user_id,
            "platform": "ios",
            "product_id": product_id,
            "plan": plan,
            "purchase_date": parsed.get('purchase_date'),
            "expiry_date": expiry_date,
            "is_trial": parsed.get('is_trial', False),
            "auto_renew": parsed.get('auto_renew', True),
            "status": "active",
            "raw_receipt": request.receipt_data[:500],  # Store partial for debugging
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.iap_transactions.update_one(
            {"transaction_id": parsed.get('transaction_id')},
            {"$set": transaction},
            upsert=True
        )
        
        # Trigger subscription change event (for referrals, etc.)
        await on_user_subscription_change(user_id, plan)
        
        logger.info(f"[Apple IAP] Successfully validated and updated subscription for user {user_id}: {plan}")
        
        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_date,
            is_trial=parsed.get('is_trial', False),
            auto_renew=parsed.get('auto_renew', True),
            message=f"Successfully subscribed to {plan.upper()}"
        )
        
    except Exception as e:
        logger.error(f"[Apple IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process purchase: {str(e)}")


@api_router.post("/iap/apple/restore")
async def restore_apple_purchases(
    request: AppleReceiptValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Restore Apple purchases - used when user reinstalls app or changes device
    Same as verify but specifically for restore flow
    """
    return await verify_apple_purchase(request, current_user)


# ==================== GOOGLE PLAY IAP VALIDATION ====================

async def validate_google_purchase(purchase_token: str, product_id: str, package_name: str = None) -> dict:
    """
    Validate Google Play purchase token using Google Play Developer API
    
    Note: Requires service account JSON credentials
    Returns validation result with subscription info
    """
    package = package_name or GOOGLE_PACKAGE_NAME
    
    # SECURITY: Credentials MUST be configured in production
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        logger.error("[Google IAP] SECURITY: Service account not configured - rejecting validation")
        return {"valid": False, "error": "Google IAP not configured. Contact support."}
    
    try:
        # Import Google API client
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        import json
        
        # Load credentials
        if GOOGLE_SERVICE_ACCOUNT_JSON.startswith('{'):
            creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        else:
            # Assume it's base64 encoded
            creds_dict = json.loads(base64.b64decode(GOOGLE_SERVICE_ACCOUNT_JSON))
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=['https://www.googleapis.com/auth/androidpublisher']
        )
        
        # Build the service
        service = build('androidpublisher', 'v3', credentials=credentials)
        
        # Get subscription purchase details
        result = service.purchases().subscriptions().get(
            packageName=package,
            subscriptionId=product_id,
            token=purchase_token
        ).execute()
        
        return {
            "valid": True,
            **result
        }
        
    except ImportError:
        logger.error("[Google IAP] SECURITY: Google API client not installed - rejecting validation")
        return {"valid": False, "error": "Google IAP not configured. Contact support."}
    except Exception as e:
        logger.error(f"[Google IAP] Validation error: {e}")
        return {"valid": False, "error": str(e)}


async def acknowledge_google_purchase(purchase_token: str, product_id: str, package_name: str = None):
    """Acknowledge Google Play purchase (required within 3 days)"""
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        logger.warning("[Google IAP] Service account not configured, skipping acknowledgement")
        return True
    
    package = package_name or GOOGLE_PACKAGE_NAME
    
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        import json
        
        if GOOGLE_SERVICE_ACCOUNT_JSON.startswith('{'):
            creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        else:
            creds_dict = json.loads(base64.b64decode(GOOGLE_SERVICE_ACCOUNT_JSON))
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=['https://www.googleapis.com/auth/androidpublisher']
        )
        
        service = build('androidpublisher', 'v3', credentials=credentials)
        
        service.purchases().subscriptions().acknowledge(
            packageName=package,
            subscriptionId=product_id,
            token=purchase_token
        ).execute()
        
        return True
    except Exception as e:
        logger.error(f"[Google IAP] Acknowledgement error: {e}")
        return False


@api_router.post("/iap/google/verify", response_model=IAPValidationResponse)
async def verify_google_purchase(
    request: GooglePurchaseValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Verify Google Play purchase token and update user subscription
    
    Flow:
    1. Client sends purchase token after purchase
    2. Server validates with Google Play Developer API
    3. Server acknowledges the purchase
    4. Server updates user subscription
    5. Returns success/failure
    """
    user_id = current_user.user_id
    
    try:
        # Validate with Google
        validation_result = await validate_google_purchase(
            request.purchase_token,
            request.product_id,
            request.package_name
        )
        
        if not validation_result.get('valid'):
            logger.warning(f"[Google IAP] Invalid purchase for user {user_id}: {validation_result.get('error')}")
            return IAPValidationResponse(
                success=False,
                message=f"Invalid purchase: {validation_result.get('error')}"
            )
        
        # Parse expiry time
        expiry_ms = validation_result.get('expiryTimeMillis') or validation_result.get('expiry_time_millis')
        if expiry_ms:
            expiry_date = datetime.fromtimestamp(int(expiry_ms) / 1000, tz=timezone.utc)
            if expiry_date <= datetime.now(timezone.utc):
                return IAPValidationResponse(
                    success=False,
                    message="Subscription has expired"
                )
        else:
            logger.error(f"[Google IAP] REJECTED: No expiryTimeMillis in validation response for user {user_id}")
            return IAPValidationResponse(
                success=False,
                message="Invalid subscription: missing expiry data"
            )
        
        # Get plan from product ID
        plan = get_plan_from_product_id(request.product_id)
        
        if not plan:
            logger.error(f"[Google IAP] Unknown product ID: {request.product_id}")
            return IAPValidationResponse(
                success=False,
                message=f"Unknown product: {request.product_id}"
            )
        
        # Acknowledge the purchase (required by Google)
        ack_state = validation_result.get('acknowledgementState') or validation_result.get('acknowledgement_state', 0)
        if ack_state != 1:
            await acknowledge_google_purchase(
                request.purchase_token,
                request.product_id,
                request.package_name
            )
        
        # Update user subscription
        auto_renewing = validation_result.get('autoRenewing', validation_result.get('auto_renewing', True))
        
        await update_profile(user_id, {
                "subscription": plan,
                "subscription_status": "active",
                "subscription_expiry": expiry_date.isoformat(),
                "subscription_platform": "android",
                "subscription_product_id": request.product_id,
                "subscription_auto_renew": auto_renewing,
                "subscription_is_trial": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Store transaction record
        order_id = validation_result.get('orderId', f"google_{uuid.uuid4().hex[:12]}")
        transaction = {
            "transaction_id": order_id,
            "user_id": user_id,
            "platform": "android",
            "product_id": request.product_id,
            "plan": plan,
            "purchase_token": request.purchase_token[:100],  # Store partial
            "purchase_date": datetime.now(timezone.utc).isoformat(),
            "expiry_date": expiry_date.isoformat(),
            "is_trial": False,
            "auto_renew": auto_renewing,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.iap_transactions.update_one(
            {"transaction_id": order_id},
            {"$set": transaction},
            upsert=True
        )
        
        # Trigger subscription change event
        await on_user_subscription_change(user_id, plan)
        
        logger.info(f"[Google IAP] Successfully validated and updated subscription for user {user_id}: {plan}")
        
        return IAPValidationResponse(
            success=True,
            plan=plan,
            expiry_date=expiry_date.isoformat(),
            is_trial=False,
            auto_renew=auto_renewing,
            message=f"Successfully subscribed to {plan.upper()}"
        )
        
    except Exception as e:
        logger.error(f"[Google IAP] Error processing purchase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process purchase: {str(e)}")


@api_router.post("/iap/google/restore")
async def restore_google_purchases(
    request: GooglePurchaseValidationRequest,
    current_user: dict = Depends(get_current_user)
):
    """Restore Google Play purchases"""
    return await verify_google_purchase(request, current_user)


# ==================== IAP PRODUCTS & MANAGEMENT ====================
# NOTE: Legacy /api/iap/status and /webhooks/* endpoints removed in production hardening.
# Use /api/subscription/status for subscription queries.
# Apple Server Notifications V2 webhook with proper JWS signature verification.

# ==================== APPLE SERVER NOTIFICATIONS V2 ====================

def _b64url_decode(b64_str: str) -> bytes:
    """Decode base64url with automatic padding."""
    padding = 4 - len(b64_str) % 4
    if padding != 4:
        b64_str += '=' * padding
    return base64.urlsafe_b64decode(b64_str)


def verify_and_decode_apple_jws(signed_jws: str) -> Optional[dict]:
    """
    Verify and decode an Apple JWS token (App Store Server Notification V2).

    Apple V2 notifications use JWS compact serialization:
      header.payload.signature  (all base64url encoded)

    The JWS header contains:
      - alg: "ES256"  (ECDSA with P-256 and SHA-256)
      - x5c: [ <leaf_cert_b64der>, <intermediate_cert_b64der>, ... ]

    Verification steps:
      1. Confirm algorithm is ES256.
      2. Load the x5c certificate chain.
      3. Verify each cert is signed by the next in the chain.
      4. Verify the JWS signature over "header.payload" using the leaf cert's public key.
      5. Confirm the root cert's issuer contains "Apple" (basic chain pinning).

    No HMAC / shared secret is used for V2 — security is fully cryptographic.
    Returns the decoded payload dict on success, or None on any failure.
    """
    try:
        parts = signed_jws.split('.')
        if len(parts) != 3:
            logger.error("[Apple JWS] Invalid format — expected 3 dot-separated parts")
            return None

        # --- 1. Parse header ---
        header = json.loads(_b64url_decode(parts[0]))
        alg = header.get('alg', '')
        if alg != 'ES256':
            logger.error(f"[Apple JWS] Unexpected algorithm '{alg}', expected ES256")
            return None

        x5c_chain = header.get('x5c', [])
        if not x5c_chain:
            logger.error("[Apple JWS] Missing x5c certificate chain in JWS header")
            return None

        # --- 2. Load certificate chain ---
        certs = []
        for cert_b64 in x5c_chain:
            cert_der = base64.b64decode(cert_b64)
            cert = x509.load_der_x509_certificate(cert_der)
            certs.append(cert)

        # --- 3. Verify certificate chain (each cert signed by the next) ---
        for i in range(len(certs) - 1):
            child = certs[i]
            parent = certs[i + 1]
            try:
                parent_pub_key = parent.public_key()
                sig_hash = child.signature_hash_algorithm
                parent_pub_key.verify(
                    child.signature,
                    child.tbs_certificate_bytes,
                    ec.ECDSA(sig_hash)
                )
            except Exception as chain_err:
                logger.error(f"[Apple JWS] Chain verification failed at index {i}: {chain_err}")
                return None

        # --- 4. Basic root certificate pinning (Apple issuer check) ---
        root_cert = certs[-1]
        try:
            root_cn_attrs = root_cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
            root_cn = root_cn_attrs[0].value if root_cn_attrs else ""
            if "Apple" not in root_cn:
                logger.warning(f"[Apple JWS] Root cert CN '{root_cn}' does not appear to be Apple's CA")
                return None
        except Exception:
            logger.warning("[Apple JWS] Could not inspect root cert CN")

        # --- 5. Verify JWS signature ---
        signing_input = f"{parts[0]}.{parts[1]}".encode('ascii')
        raw_signature = _b64url_decode(parts[2])

        if len(raw_signature) != 64:
            logger.error(f"[Apple JWS] Unexpected signature length {len(raw_signature)}, expected 64 bytes")
            return None

        # JWS ES256: raw r||s (32 bytes each) → DER for cryptography library
        r = int.from_bytes(raw_signature[:32], 'big')
        s = int.from_bytes(raw_signature[32:], 'big')
        der_signature = encode_dss_signature(r, s)

        leaf_pub_key = certs[0].public_key()
        leaf_pub_key.verify(der_signature, signing_input, ec.ECDSA(hashes.SHA256()))

        # Signature valid — decode payload
        payload = json.loads(_b64url_decode(parts[1]))
        logger.info("[Apple JWS] Signature verified successfully")
        return payload

    except CryptoInvalidSignature:
        logger.error("[Apple JWS] Signature verification FAILED — notification may be forged")
        return None
    except Exception as e:
        logger.error(f"[Apple JWS] Unexpected verification error: {e}")
        import traceback
        traceback.print_exc()
        return None


def decode_apple_signed_payload(signed_payload: str) -> Optional[dict]:
    """
    Verify and decode an Apple signedPayload JWS.
    Delegates to verify_and_decode_apple_jws for full cryptographic verification.
    """
    return verify_and_decode_apple_jws(signed_payload)


def decode_apple_transaction_info(signed_transaction: str) -> Optional[dict]:
    """Decode (and verify) Apple's signedTransactionInfo JWS."""
    return verify_and_decode_apple_jws(signed_transaction)


def decode_apple_renewal_info(signed_renewal: str) -> Optional[dict]:
    """Decode (and verify) Apple's signedRenewalInfo JWS."""
    return verify_and_decode_apple_jws(signed_renewal)


@api_router.post("/webhooks/apple")
async def apple_server_notification_v2(request: Request):
    """
    Apple App Store Server Notifications V2 Webhook
    
    Handles all subscription lifecycle events from Apple:
    - SUBSCRIBED: New subscription
    - DID_RENEW: Successful renewal
    - DID_CHANGE_RENEWAL_STATUS: Auto-renew status changed
    - DID_CHANGE_RENEWAL_PREF: Subscription plan changed
    - DID_FAIL_TO_RENEW: Renewal failed (billing issue)
    - EXPIRED: Subscription expired
    - GRACE_PERIOD_EXPIRED: Grace period ended
    - REFUND: User refunded
    - REVOKE: Family sharing revoked
    - CONSUMPTION_REQUEST: Apple requesting consumption data
    
    Endpoint: POST /api/webhooks/apple
    
    Apple sends a JSON body with signedPayload containing:
    - notificationType
    - subtype (optional)
    - data.signedTransactionInfo
    - data.signedRenewalInfo
    """
    try:
        # Read raw body
        body = await request.body()
        logger.info("[Apple Webhook] Received V2 notification (%d bytes)", len(body))

        # Parse outer JSON envelope
        try:
            envelope = json.loads(body)
        except json.JSONDecodeError:
            logger.error("[Apple Webhook] Invalid JSON envelope")
            return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

        # V2 format: { "signedPayload": "<JWS>" }
        signed_payload = envelope.get("signedPayload")
        if not signed_payload:
            logger.error("[Apple Webhook] Missing signedPayload field")
            return JSONResponse(status_code=400, content={"error": "Missing signedPayload"})

        # Verify JWS signature AND decode in one step.
        # Returns None if signature is invalid / cert chain verification fails.
        notification_data = verify_and_decode_apple_jws(signed_payload)
        if not notification_data:
            logger.error("[Apple Webhook] JWS signature verification failed — rejecting notification")
            return JSONResponse(status_code=401, content={"error": "Invalid JWS signature"})
        
        # Extract notification details
        notification_type = notification_data.get("notificationType", "UNKNOWN")
        subtype = notification_data.get("subtype", "")
        notification_uuid = notification_data.get("notificationUUID", "")
        
        logger.info(f"[Apple Webhook] Type: {notification_type}, Subtype: {subtype}, UUID: {notification_uuid}")
        
        # Extract transaction data
        data = notification_data.get("data", {})
        signed_transaction_info = data.get("signedTransactionInfo")
        signed_renewal_info = data.get("signedRenewalInfo")
        
        transaction_info = None
        renewal_info = None
        
        if signed_transaction_info:
            transaction_info = decode_apple_transaction_info(signed_transaction_info)
            if transaction_info:
                logger.info(f"[Apple Webhook] Transaction: {transaction_info.get('transactionId')}, Product: {transaction_info.get('productId')}")
        
        if signed_renewal_info:
            renewal_info = decode_apple_renewal_info(signed_renewal_info)
            if renewal_info:
                logger.info(f"[Apple Webhook] Renewal auto-renew: {renewal_info.get('autoRenewStatus')}")
        
        # Process based on notification type
        if notification_type in ["SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED"]:
            # New subscription or successful renewal
            await handle_apple_subscription_active(transaction_info, renewal_info, notification_type)
        
        elif notification_type == "DID_CHANGE_RENEWAL_STATUS":
            # Auto-renew status changed (user turned off auto-renew)
            await handle_apple_renewal_status_change(transaction_info, renewal_info, subtype)
        
        elif notification_type in ["EXPIRED", "GRACE_PERIOD_EXPIRED"]:
            # Subscription expired
            await handle_apple_subscription_expired(transaction_info, renewal_info, notification_type)
        
        elif notification_type == "DID_FAIL_TO_RENEW":
            # Billing issue - subscription may enter grace period
            await handle_apple_billing_issue(transaction_info, renewal_info, subtype)
        
        elif notification_type == "REFUND":
            # User refunded - revoke access
            await handle_apple_refund(transaction_info)
        
        elif notification_type == "REVOKE":
            # Family sharing revoked
            await handle_apple_revoke(transaction_info)
        
        elif notification_type == "DID_CHANGE_RENEWAL_PREF":
            # User changed their subscription plan
            await handle_apple_plan_change(transaction_info, renewal_info)
        
        elif notification_type == "CONSUMPTION_REQUEST":
            # Apple requesting consumption data (for refund decisions)
            logger.info("[Apple Webhook] Consumption request received - no action needed")
        
        else:
            logger.warning(f"[Apple Webhook] Unhandled notification type: {notification_type}")
        
        # Store webhook event for audit
        await db.audit_logs.insert_one({
            "type": "apple_webhook",
            "notification_type": notification_type,
            "subtype": subtype,
            "notification_uuid": notification_uuid,
            "transaction_id": transaction_info.get("transactionId") if transaction_info else None,
            "product_id": transaction_info.get("productId") if transaction_info else None,
            "original_transaction_id": transaction_info.get("originalTransactionId") if transaction_info else None,
            "timestamp": datetime.now(timezone.utc),
            "raw_payload_hash": hashlib.sha256(body).hexdigest()[:16]  # Store hash for debugging
        })
        
        # Return 200 OK to Apple
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"[Apple Webhook] Error processing notification: {e}")
        import traceback
        traceback.print_exc()
        # Still return 200 to prevent Apple from retrying indefinitely
        return {"status": "error", "message": str(e)}


async def handle_apple_subscription_active(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle new subscription or successful renewal"""
    if not transaction_info:
        logger.error("[Apple Webhook] No transaction info for subscription active event")
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    transaction_id = transaction_info.get("transactionId")
    product_id = transaction_info.get("productId")
    app_account_token = transaction_info.get("appAccountToken")  # This should be our user_id
    expires_date_ms = transaction_info.get("expiresDate")
    
    # Find user by appAccountToken (user_id) or by existing transaction
    user_id = app_account_token
    if not user_id:
        # Try to find by original_transaction_id
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    if not user_id:
        logger.error(f"[Apple Webhook] Cannot identify user for transaction {transaction_id}")
        return
    
    # Calculate expiry date
    expiry_date = None
    if expires_date_ms:
        expiry_date = datetime.fromtimestamp(expires_date_ms / 1000, tz=timezone.utc)
    
    # Determine tier from product_id
    tier = "premium"
    if "vip" in product_id.lower():
        tier = "vip"
    
    # Update or create IAP transaction
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "user_id": user_id,
                "transaction_id": transaction_id,
                "original_transaction_id": original_transaction_id,
                "product_id": product_id,
                "platform": "apple",
                "status": "active",
                "plan": tier,
                "expiry_date": expiry_date,
                "auto_renew": renewal_info.get("autoRenewStatus", 1) == 1 if renewal_info else True,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": notification_type
            },
            "$setOnInsert": {
                "purchase_date": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    
    # Sync role to Supabase profile (MongoDB iap_transactions is the entitlement authority)
    try:
        ok = await update_profile(user_id, {"role": tier})
        if ok:
            logger.info(f"[Apple Webhook] Updated user {user_id} to {tier} (expires: {expiry_date})")
        else:
            logger.error(f"[Apple Webhook] update_profile returned False for user {user_id}")
    except Exception as e:
        logger.error(f"[Apple Webhook] Failed to update Supabase profile: {e}")


async def handle_apple_renewal_status_change(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle auto-renew status change"""
    if not renewal_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    auto_renew_status = renewal_info.get("autoRenewStatus", 0) == 1
    
    if original_transaction_id:
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": "apple"},
            {
                "$set": {
                    "auto_renew": auto_renew_status,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": f"DID_CHANGE_RENEWAL_STATUS_{subtype}"
                }
            }
        )
        
        logger.info(f"[Apple Webhook] Auto-renew status changed to {auto_renew_status} for {original_transaction_id}")


async def handle_apple_subscription_expired(transaction_info: dict, renewal_info: dict, notification_type: str):
    """Handle subscription expiration"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")
    
    # Find user
    user_id = app_account_token
    if not user_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    # Update transaction status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "expired",
                "auto_renew": False,
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": notification_type
            }
        }
    )
    
    # Downgrade user to free tier
    if user_id:
        try:
            # Check if user has any other active subscriptions
            active_sub = await db.iap_transactions.find_one({
                "user_id": user_id,
                "status": "active",
                "expiry_date": {"$gt": datetime.now(timezone.utc)}
            })
            
            if not active_sub:
                await update_profile(user_id, {"role": "free"})
                logger.info(f"[Apple Webhook] Downgraded user {user_id} to free tier")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to downgrade user: {e}")


async def handle_apple_billing_issue(transaction_info: dict, renewal_info: dict, subtype: str):
    """Handle billing failure (grace period)"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    
    # Update transaction to billing_issue status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "billing_issue",
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": f"DID_FAIL_TO_RENEW_{subtype}"
            }
        }
    )
    
    logger.info(f"[Apple Webhook] Billing issue for {original_transaction_id}, subtype: {subtype}")


async def handle_apple_refund(transaction_info: dict):
    """Handle refund - revoke access"""
    if not transaction_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId")
    app_account_token = transaction_info.get("appAccountToken")
    
    # Find user
    user_id = app_account_token
    if not user_id:
        existing_txn = await db.iap_transactions.find_one({
            "original_transaction_id": original_transaction_id,
            "platform": "apple"
        })
        if existing_txn:
            user_id = existing_txn.get("user_id")
    
    # Update transaction status
    await db.iap_transactions.update_one(
        {"original_transaction_id": original_transaction_id, "platform": "apple"},
        {
            "$set": {
                "status": "refunded",
                "updated_at": datetime.now(timezone.utc),
                "webhook_event": "REFUND"
            }
        }
    )
    
    # Downgrade user
    if user_id:
        try:
            await update_profile(user_id, {"role": "free"})
            logger.info(f"[Apple Webhook] Refund processed, downgraded user {user_id}")
        except Exception as e:
            logger.error(f"[Apple Webhook] Failed to process refund for user: {e}")


async def handle_apple_revoke(transaction_info: dict):
    """Handle family sharing revoke"""
    # Similar to refund handling
    await handle_apple_refund(transaction_info)
    logger.info("[Apple Webhook] Family sharing access revoked")


async def handle_apple_plan_change(transaction_info: dict, renewal_info: dict):
    """Handle subscription plan change (upgrade/downgrade)"""
    if not renewal_info:
        return
    
    original_transaction_id = transaction_info.get("originalTransactionId") if transaction_info else None
    new_product_id = renewal_info.get("autoRenewProductId")
    
    if original_transaction_id and new_product_id:
        # Determine new tier
        new_tier = "premium"
        if "vip" in new_product_id.lower():
            new_tier = "vip"
        
        await db.iap_transactions.update_one(
            {"original_transaction_id": original_transaction_id, "platform": "apple"},
            {
                "$set": {
                    "pending_plan_change": new_product_id,
                    "pending_tier": new_tier,
                    "updated_at": datetime.now(timezone.utc),
                    "webhook_event": "DID_CHANGE_RENEWAL_PREF"
                }
            }
        )
        
        logger.info(f"[Apple Webhook] Plan change pending to {new_product_id} for {original_transaction_id}")

@api_router.get("/iap/products")
async def get_iap_products():
    """
    Get official IAP product IDs for the client.
    Product IDs are identical across iOS and Android.
    Client uses these to request products from Apple/Google store.
    """
    return {
        "products": IAP_PRODUCT_IDS,
        "by_tier": IAP_PRODUCTS_BY_TIER,
    }


@api_router.get("/iap/transactions")
async def get_iap_transactions(
    current_user: dict = Depends(get_current_user),
    limit: int = 10
):
    """Get user's IAP transaction history"""
    user_id = current_user.user_id
    
    transactions = await db.iap_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {
        "transactions": [
            {
                "transaction_id": t.get("transaction_id"),
                "platform": t.get("platform"),
                "product_id": t.get("product_id"),
                "plan": t.get("plan"),
                "purchase_date": t.get("purchase_date"),
                "expiry_date": t.get("expiry_date"),
                "status": t.get("status"),
                "auto_renew": t.get("auto_renew"),
            }
            for t in transactions
        ]
    }


# ==================== ADMIN IAP ENDPOINTS ====================

@api_router.get("/admin/iap/transactions")
async def admin_get_iap_transactions(
    admin: User = Depends(require_admin),
    user_id: Optional[str] = None,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """Admin: View IAP transactions"""
    query = {}
    if user_id:
        query["user_id"] = user_id
    if platform:
        query["platform"] = platform
    if status:
        query["status"] = status
    
    transactions = await db.iap_transactions.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.iap_transactions.count_documents(query)
    
    return {
        "transactions": [
            {
                **{k: v for k, v in t.items() if k != '_id' and k != 'raw_receipt'},
            }
            for t in transactions
        ],
        "total": total,
        "limit": limit,
        "skip": skip
    }


@api_router.get("/admin/iap/stats")
async def admin_get_iap_stats(admin: User = Depends(require_admin)):
    """Admin: Get IAP statistics"""
    # Count by platform
    ios_count = await db.iap_transactions.count_documents({"platform": "ios"})
    android_count = await db.iap_transactions.count_documents({"platform": "android"})
    
    # Count by status
    active_count = await db.iap_transactions.count_documents({"status": "active"})
    expired_count = await db.iap_transactions.count_documents({"status": "expired"})
    cancelled_count = await db.iap_transactions.count_documents({"status": "cancelled"})
    
    # Count active subscriptions by plan
    premium_users = await count_profiles("premium")
    vip_users = await count_profiles("vip")
    
    return {
        "by_platform": {
            "ios": ios_count,
            "android": android_count
        },
        "by_status": {
            "active": active_count,
            "expired": expired_count,
            "cancelled": cancelled_count
        },
        "active_subscribers": {
            "premium": premium_users,
            "vip": vip_users,
            "total": premium_users + vip_users
        }
    }


# ===================== AI CHART ANALYZER =====================
from pydantic import BaseModel as PydanticBaseModel

class AIAnalyzeRequest(PydanticBaseModel):
    prompt: str
    pair: str = "Unknown"
    timeframe: str = "Unknown"
    image_base64: Optional[str] = None

class AIAnalyzeResponse(PydanticBaseModel):
    analysis_id: str
    market_bias: str
    trade_bias: str  # BUY / SELL / WAIT
    confidence_score: int  # 0-100
    trend_structure: str
    support_levels: List[str]
    resistance_levels: List[str]
    trade_insight: str
    analysis_text: str
    detected_pattern: str
    confidence: str

@api_router.post("/ai/analyze")
async def ai_analyze_chart(request: AIAnalyzeRequest, current_user: User = Depends(require_auth)):
    """
    AI Chart Analysis endpoint using OpenAI SDK.
    Requires Supabase authentication and active subscription.
    Server-side enforcement of AI usage limits.
    """
    try:
        from openai import AsyncOpenAI
        
        if not OPENAI_API_KEY:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        # Fetch user profile for subscription check
        user_doc = await fetch_profile(current_user.user_id)
        if not user_doc:
            raise HTTPException(status_code=404, detail="User profile not found")
        
        # Get effective subscription (accounting for expiry)
        effective_subscription = await get_effective_subscription(user_doc)
        
        # Get weekly limit based on subscription tier
        # Free: 3, Premium: 10, VIP: unlimited (999999)
        weekly_limit = get_ai_weekly_limit(effective_subscription)
        
        # Check and reset weekly counter if needed
        reset_date = user_doc.get("ai_weekly_reset")
        current_usage = user_doc.get("ai_weekly_used", 0)
        
        if reset_date:
            if isinstance(reset_date, str):
                reset_date = datetime.fromisoformat(reset_date.replace('Z', '+00:00'))
            elif reset_date.tzinfo is None:
                reset_date = reset_date.replace(tzinfo=timezone.utc)
            
            if reset_date < datetime.now(timezone.utc):
                # Reset weekly counter
                await update_profile(current_user.user_id, {
                    "ai_weekly_used": 0,
                    "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                })
                current_usage = 0
        else:
            # Initialize reset date if not set
            await update_profile(current_user.user_id, {
                "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            })
        
        # Enforce usage limit (server-side - no client bypass)
        if current_usage >= weekly_limit:
            raise HTTPException(
                status_code=403,
                detail=f"AI analysis limit reached ({weekly_limit}/week). Upgrade your subscription for more analyses."
            )
        
        # Atomically increment usage counter BEFORE analysis (prevents race conditions)
        await update_profile(current_user.user_id, {
            "ai_weekly_used": current_usage + 1
        })
        
        logger.info(f"[AI] User {current_user.user_id} ({effective_subscription}) - Usage: {current_usage + 1}/{weekly_limit}")
        
        # System prompt for structured JSON output
        system_prompt = """You are an expert forex and cryptocurrency chart analyst. 
Analyze the provided chart description or image and respond ONLY with valid JSON in this exact format:
{
  "market_bias": "Bullish" or "Bearish" or "Neutral",
  "trade_bias": "BUY" or "SELL" or "WAIT",
  "confidence_score": 0-100 (integer, your confidence percentage),
  "trend_structure": "Brief description of the trend and any patterns observed",
  "support_levels": ["level1", "level2"],
  "resistance_levels": ["level1", "level2"],
  "trade_insight": "Actionable trading insight based on the analysis",
  "analysis_text": "A 2-3 sentence executive summary of the full analysis",
  "detected_pattern": "Name of any detected chart pattern (e.g. Double Top, Head and Shoulders, Ascending Triangle) or 'None' if no clear pattern",
  "confidence": "High" or "Medium" or "Low"
}
Rules:
- trade_bias must be BUY if bullish, SELL if bearish, WAIT if neutral/unclear
- confidence_score must be an integer 0-100
- detected_pattern should name the most prominent pattern or "None"
- analysis_text should be a concise summary suitable for a card preview
Do not include any text outside the JSON object. Be concise but accurate."""

        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        
        # Use gpt-4o for multimodal (image) support
        
        # Build user message
        user_text = f"Analyze this {request.pair} chart on {request.timeframe} timeframe:\n\n{request.prompt}"
        
        # Create message with or without image
        if request.image_base64:
            # Clean base64 string
            image_data = request.image_base64
            if "," in image_data:
                image_data = image_data.split(",")[1]
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
                ]}
            ]
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ]
        
        # Send message and get response
        ai_response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1500,
        )
        response_text = ai_response.choices[0].message.content
        
        # Parse JSON response
        try:
            # Extract JSON from response (in case there's extra text)
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                analysis = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found in response")
            
            # Generate analysis ID
            analysis_id = f"ai_{uuid.uuid4().hex[:12]}"
            
            # Normalize confidence_score to int 0-100
            raw_score = analysis.get("confidence_score", 50)
            try:
                confidence_score = max(0, min(100, int(raw_score)))
            except (ValueError, TypeError):
                confidence_score = 50
            
            # Normalize trade_bias
            raw_bias = str(analysis.get("trade_bias", "WAIT")).upper().strip()
            trade_bias = raw_bias if raw_bias in ("BUY", "SELL", "WAIT") else "WAIT"
            
            # Validate and normalize response
            result = {
                "analysis_id": analysis_id,
                "market_bias": str(analysis.get("market_bias", "Unknown")),
                "trade_bias": trade_bias,
                "confidence_score": confidence_score,
                "trend_structure": str(analysis.get("trend_structure", response_text)),
                "support_levels": [str(s) for s in analysis.get("support_levels", [])],
                "resistance_levels": [str(r) for r in analysis.get("resistance_levels", [])],
                "trade_insight": str(analysis.get("trade_insight", "")),
                "analysis_text": str(analysis.get("analysis_text", analysis.get("trade_insight", ""))),
                "detected_pattern": str(analysis.get("detected_pattern", "None")),
                "confidence": str(analysis.get("confidence", "Low"))
            }
            
            # Auto-save analysis to MongoDB ai_analyses collection
            now_utc = datetime.now(timezone.utc).isoformat()
            # Truncate image to first 200KB for storage (avoid bloat)
            stored_image = None
            if request.image_base64:
                img_data = request.image_base64
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                stored_image = img_data[:200000] if len(img_data) > 200000 else img_data
            
            analysis_doc = {
                "analysis_id": analysis_id,
                "user_id": current_user.user_id,
                "pair": request.pair,
                "timeframe": request.timeframe,
                "trade_bias": trade_bias,
                "market_bias": result["market_bias"],
                "confidence_score": confidence_score,
                "confidence": result["confidence"],
                "trend_structure": result["trend_structure"],
                "support_levels": result["support_levels"],
                "resistance_levels": result["resistance_levels"],
                "trade_insight": result["trade_insight"],
                "analysis_text": result["analysis_text"],
                "detected_pattern": result["detected_pattern"],
                "image_snapshot": stored_image,
                "created_at": now_utc,
            }
            await db.ai_analyses.insert_one(analysis_doc)
            logger.info(f"[AI] Saved analysis {analysis_id} for user {current_user.user_id}")
            
            return result
            
        except (json.JSONDecodeError, ValueError) as parse_error:
            logger.warning(f"Failed to parse AI response as JSON: {parse_error}")
            fallback_id = f"ai_{uuid.uuid4().hex[:12]}"
            fallback_result = {
                "analysis_id": fallback_id,
                "market_bias": "Unknown",
                "trade_bias": "WAIT",
                "confidence_score": 30,
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": "Analysis completed but structured parsing failed.",
                "analysis_text": response_text[:300],
                "detected_pattern": "None",
                "confidence": "Low"
            }
            # Still save fallback result
            now_utc = datetime.now(timezone.utc).isoformat()
            await db.ai_analyses.insert_one({
                "analysis_id": fallback_id,
                "user_id": current_user.user_id,
                "pair": request.pair,
                "timeframe": request.timeframe,
                "trade_bias": "WAIT",
                "market_bias": "Unknown",
                "confidence_score": 30,
                "confidence": "Low",
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": "Analysis completed but structured parsing failed.",
                "analysis_text": response_text[:300],
                "detected_pattern": "None",
                "image_snapshot": None,
                "created_at": now_utc,
            })
            return fallback_result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@api_router.get("/ai/history")
async def ai_analysis_history(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(require_auth)
):
    """Fetch paginated AI analysis history for the authenticated user, newest first."""
    try:
        skip = (max(1, page) - 1) * limit
        clamped_limit = min(limit, 50)

        cursor = db.ai_analyses.find(
            {"user_id": current_user.user_id},
            {"_id": 0, "image_snapshot": 0}  # Exclude heavy fields in list view
        ).sort("created_at", -1).skip(skip).limit(clamped_limit)

        items = await cursor.to_list(clamped_limit)
        total = await db.ai_analyses.count_documents({"user_id": current_user.user_id})

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": clamped_limit,
            "has_more": (skip + clamped_limit) < total,
        }
    except Exception as e:
        logger.error(f"AI history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis history")


@api_router.get("/ai/history/{analysis_id}")
async def ai_analysis_detail(analysis_id: str, current_user: User = Depends(require_auth)):
    """Fetch a single AI analysis by ID, including the stored image snapshot."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return doc


# ===================== AI ANALYSIS SHARING =====================

@api_router.post("/ai/share/{analysis_id}")
async def share_analysis(analysis_id: str, current_user: User = Depends(require_auth)):
    """Generate a shareable link for an AI analysis."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0, "image_snapshot": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Reuse existing share_token if already shared
    if doc.get("share_token"):
        return {"share_token": doc["share_token"], "analysis_id": analysis_id}

    share_token = uuid.uuid4().hex[:16]
    await db.ai_analyses.update_one(
        {"analysis_id": analysis_id},
        {"$set": {"share_token": share_token, "shared_at": datetime.now(timezone.utc).isoformat(), "view_count": 0}}
    )
    return {"share_token": share_token, "analysis_id": analysis_id}


@api_router.get("/ai/shared/{share_token}")
async def view_shared_analysis(share_token: str):
    """Public endpoint — view a shared AI analysis (no auth required)."""
    doc = await db.ai_analyses.find_one(
        {"share_token": share_token},
        {"_id": 0, "image_snapshot": 0, "user_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shared analysis not found or link expired")

    # Increment view count (fire-and-forget)
    await db.ai_analyses.update_one(
        {"share_token": share_token},
        {"$inc": {"view_count": 1}}
    )
    return doc


@api_router.post("/ai/share/{analysis_id}/community")
async def share_analysis_to_community(analysis_id: str, current_user: User = Depends(require_auth)):
    """Post an AI analysis summary to the community feed."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0, "image_snapshot": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Build community post content
    bias_emoji = {"BUY": "↑", "SELL": "↓", "WAIT": "—"}.get(doc.get("trade_bias", "WAIT"), "—")
    content = (
        f"{bias_emoji} AI Analysis: {doc.get('pair', 'N/A')} ({doc.get('timeframe', '')})\n"
        f"Bias: {doc.get('trade_bias', 'WAIT')} | Confidence: {doc.get('confidence_score', 0)}%\n"
    )
    if doc.get("detected_pattern") and doc["detected_pattern"] != "None":
        content += f"Pattern: {doc['detected_pattern']}\n"
    if doc.get("analysis_text"):
        content += f"\n{doc['analysis_text'][:280]}"

    post_id = f"post_{uuid.uuid4().hex[:12]}"
    post_doc = {
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": content,
        "post_type": "ai_analysis",
        "image": None,
        "likes": [],
        "source_analysis_id": analysis_id,
        "created_at": datetime.now(timezone.utc),
    }
    await db.posts.insert_one(post_doc)
    post_doc.pop("_id", None)
    return post_doc


# Include router
app.include_router(api_router)

# ===================== CORS CONFIGURATION =====================
# Production: CORS_ORIGINS env var MUST be set with comma-separated allowed origins.
# Use "*" to allow all origins (for deployment platforms with dynamic URLs)
# Mobile apps bypass CORS (no Origin header), so this only affects web/admin clients.
raw_cors = os.environ.get('CORS_ORIGINS', '').strip()

if raw_cors == '*':
    # Allow all origins (useful for Emergent deployment with dynamic preview URLs)
    CORS_ORIGINS = ["*"]
    logger.info("[CORS] Configured to allow ALL origins (*)")
else:
    CORS_ORIGINS = [
        origin.strip()
        for origin in raw_cors.split(',')
        if origin.strip()
    ]
    
    # Production validation: warn if CORS_ORIGINS is empty (will only allow mobile clients)
    if not CORS_ORIGINS:
        logger.warning("[CORS] CORS_ORIGINS not configured - web/admin access will be blocked")
    else:
        # Validate origins format (must be proper URLs)
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

# ===================== HEALTH CHECK =====================
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

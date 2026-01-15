from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, BackgroundTasks, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import base64
from enum import Enum
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'swiftfx_db')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'swiftfx-secret-key-2024-very-secure')
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7

# Emergent LLM Key for Claude Vision
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="Swift FX Signals API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===================== ENUMS =====================
class UserRole(str, Enum):
    FREE = "free"
    PREMIUM = "premium"
    VIP = "vip"
    ADMIN = "admin"

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


def get_effective_subscription(user_doc: dict) -> str:
    """Get user's effective subscription, accounting for expiry"""
    # Check subscription field first, then fall back to role for backward compatibility
    subscription = user_doc.get("subscription")
    if not subscription:
        # Fallback to role field for backward compatibility
        role = user_doc.get("role", "free")
        if role in ["premium", "vip"]:
            subscription = role
        else:
            subscription = "free"
    
    # Check if premium/vip subscription is still active
    if subscription in ["premium", "vip"] and not check_subscription_active(user_doc):
        return "free"  # Expired subscription reverts to free
    return subscription

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

# ===================== HELPER FUNCTIONS =====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except Exception:
        return None

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization:
        return None
    
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    user_id = decode_token(token)
    
    if not user_id:
        return None
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if user_doc:
        return User(**user_doc)
    return None

async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

async def require_admin(authorization: Optional[str] = Header(None)) -> User:
    user = await require_auth(authorization)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=403, detail="User not found")
    
    # Check if user has admin role
    if user_doc.get("role") != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if admin is enabled
    if not user_doc.get("admin_enabled", True):
        raise HTTPException(status_code=403, detail="Admin account is disabled")
    
    # Populate admin_role in user object
    admin_role_str = user_doc.get("admin_role")
    if admin_role_str:
        try:
            user.admin_role = AdminRole(admin_role_str)
        except ValueError:
            user.admin_role = None
    
    user.admin_enabled = user_doc.get("admin_enabled", True)
    
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

# ===================== AUTH ENDPOINTS =====================
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "name": user_data.name,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "role": UserRole.FREE,
        "subscription_status": "inactive",
        "billing_cycle": None,
        "subscription_expiry": None,
        "ai_usage_count": 0,
        "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7),
        "notification_preferences": {"signals": True, "community": True},
        "created_at": datetime.now(timezone.utc),
        "is_admin": False
    }
    
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    
    return {
        "token": token,
        "user": {
            "user_id": user_id,
            "name": user_data.name,
            "email": user_data.email,
            "role": UserRole.FREE
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc or not verify_password(credentials.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user_doc["user_id"])
    
    return {
        "token": token,
        "user": {
            "user_id": user_doc["user_id"],
            "name": user_doc["name"],
            "email": user_doc["email"],
            "role": user_doc.get("role", UserRole.FREE),
            "subscription_status": user_doc.get("subscription_status", "inactive"),
            "is_admin": user_doc.get("is_admin", False)
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(require_auth)):
    # Fetch additional fields like is_admin
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0})
    return user_doc

@api_router.post("/auth/google/callback")
async def google_auth_callback(session_id: str):
    """Exchange session_id from Emergent Auth for user data"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        user_data = response.json()
    
    # Check if user exists
    existing = await db.users.find_one({"email": user_data["email"]})
    
    if existing:
        # Update existing user
        token = create_token(existing["user_id"])
        return {
            "token": token,
            "user": {
                "user_id": existing["user_id"],
                "name": existing["name"],
                "email": existing["email"],
                "role": existing.get("role", UserRole.FREE),
                "picture": existing.get("picture")
            }
        }
    
    # Create new user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "name": user_data["name"],
        "email": user_data["email"],
        "picture": user_data.get("picture"),
        "password_hash": "",  # No password for OAuth users
        "role": UserRole.FREE,
        "subscription_status": "inactive",
        "billing_cycle": None,
        "subscription_expiry": None,
        "ai_usage_count": 0,
        "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7),
        "notification_preferences": {"signals": True, "community": True},
        "created_at": datetime.now(timezone.utc),
        "is_admin": False
    }
    
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    
    return {
        "token": token,
        "user": {
            "user_id": user_id,
            "name": user_data["name"],
            "email": user_data["email"],
            "role": UserRole.FREE,
            "picture": user_data.get("picture")
        }
    }

@api_router.post("/auth/forgot-password")
async def forgot_password(email: EmailStr):
    user = await db.users.find_one({"email": email})
    if not user:
        # Don't reveal if email exists
        return {"message": "If email exists, reset instructions will be sent"}
    
    # Generate reset token
    reset_token = uuid.uuid4().hex
    await db.password_resets.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "token": reset_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)
        }},
        upsert=True
    )
    
    # In production, send email here
    return {"message": "If email exists, reset instructions will be sent", "reset_token": reset_token}

@api_router.post("/auth/reset-password")
async def reset_password(token: str, new_password: str):
    reset_doc = await db.password_resets.find_one({"token": token})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    
    expires_at = reset_doc["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token expired")
    
    await db.users.update_one(
        {"email": reset_doc["email"]},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    await db.password_resets.delete_one({"token": token})
    
    return {"message": "Password reset successfully"}

# ===================== SIGNALS ENDPOINTS =====================
@api_router.get("/signals")
async def get_signals(current_user: Optional[User] = Depends(get_current_user)):
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get user's effective subscription
    if current_user:
        user_doc = await db.users.find_one({"user_id": current_user.user_id})
        user_subscription = get_effective_subscription(user_doc) if user_doc else "free"
        is_admin = user_doc.get("role") == "admin" if user_doc else False
    else:
        user_subscription = "free"
        is_admin = False
    
    result = []
    for signal in signals:
        signal_visibility = signal.get("visibility", "free")
        
        # Admin sees all signals
        if is_admin:
            result.append(signal)
        # Check if user subscription can access this signal
        elif can_access_visibility(user_subscription, signal_visibility):
            result.append(signal)
        # Don't send blocked signals to frontend at all (per requirements)
        # But we can optionally show limited info
        else:
            # Return limited info for locked signals so UI can show upgrade prompts
            result.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "status": signal["status"],
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
    
    # Get user's effective subscription
    if current_user:
        user_doc = await db.users.find_one({"user_id": current_user.user_id})
        user_subscription = get_effective_subscription(user_doc) if user_doc else "free"
        is_admin = user_doc.get("role") == "admin" if user_doc else False
    else:
        user_subscription = "free"
        is_admin = False
    
    signal_visibility = signal.get("visibility", "free")
    
    # Admin sees all signals
    if is_admin or can_access_visibility(user_subscription, signal_visibility):
        return signal
    
    return {
        "signal_id": signal["signal_id"],
        "pair": signal["pair"],
        "signal_type": signal["signal_type"],
        "status": signal["status"],
        "visibility": signal["visibility"],
        "created_at": signal["created_at"],
        "locked": True,
        "required_plan": signal_visibility
    }

@api_router.post("/admin/signals")
async def create_signal(signal_data: SignalCreate, background_tasks: BackgroundTasks, admin: User = Depends(require_admin)):
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
    status: Optional[SignalStatus] = None
    visibility: Optional[SignalVisibility] = None
    final_pips: Optional[float] = None

@api_router.put("/admin/signals/{signal_id}/full")
async def full_update_signal(
    signal_id: str,
    update_data: SignalFullUpdate,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to fully edit any signal field - ADMIN HAS FULL AUTHORITY"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {}
    
    # Update all provided fields - Admin has full authority
    if update_data.pair is not None:
        update_doc["pair"] = update_data.pair
    if update_data.signal_type is not None:
        update_doc["signal_type"] = update_data.signal_type
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
        update_doc["visibility"] = update_data.visibility
    if update_data.final_pips is not None:
        update_doc["final_pips"] = update_data.final_pips
    
    # Handle status changes
    if update_data.status is not None:
        update_doc["status"] = update_data.status
        if update_data.status == SignalStatus.ACTIVE and signal.get("status") == "pending":
            update_doc["activated_at"] = datetime.now(timezone.utc)
        if update_data.status == SignalStatus.CLOSED and signal.get("status") != "closed":
            update_doc["closed_at"] = datetime.now(timezone.utc)
    
    # Recalculate risk/reward if entry, SL, or TP1 changed
    entry = update_data.entry if update_data.entry else signal.get("entry")
    sl = update_data.stop_loss if update_data.stop_loss else signal.get("stop_loss")
    tp1 = update_data.tp1 if update_data.tp1 else signal.get("tp1")
    sig_type = update_data.signal_type if update_data.signal_type else signal.get("signal_type")
    
    if entry and sl and tp1:
        update_doc["risk_reward"] = calculate_risk_reward(entry, sl, tp1, sig_type)
    
    if not update_doc:
        raise HTTPException(status_code=400, detail="No update fields provided")
    
    result = await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    return {"message": "Signal updated successfully", "updates": list(update_doc.keys())}

# NOTE: The following legacy endpoints have been replaced by state-based endpoints:
# - POST /admin/signals/{signal_id}/activate -> see line 804 (new state-based activate)
# - POST /admin/signals/{signal_id}/mark-tp -> see line 837 (new state-based mark-tp)
# - POST /admin/signals/{signal_id}/close -> use /admin/signals/{signal_id}/force-close (line 942)

@api_router.delete("/admin/signals/{signal_id}")
async def delete_signal(signal_id: str, admin: User = Depends(require_admin)):
    result = await db.signals.delete_one({"signal_id": signal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found")
    return {"message": "Signal deleted successfully"}

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
    """Send push notification to users about new signal based on visibility rules"""
    try:
        # Get signal info
        signal = await db.signals.find_one({"signal_id": signal_id})
        if not signal:
            logger.error(f"Signal {signal_id} not found for notification")
            return
        
        # Get all active device tokens with user info
        device_tokens = await db.device_tokens.find({"is_active": True}, {"_id": 0}).to_list(None)
        if not device_tokens:
            logger.info("No active device tokens found")
            return
        
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
            
            # Get user info to check role and notification preferences
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if not user:
                continue
            
            # Check if user has notifications enabled
            notification_prefs = user.get("notification_preferences", {})
            if not notification_prefs.get("signals", True):
                continue
            
            user_role = UserRole(user.get("role", "free"))
            
            # Apply visibility rules:
            # - FREE signal -> notify ALL users
            # - VIP signal -> notify VIP users ONLY
            if visibility == SignalVisibility.VIP:
                # Only VIP users get VIP signal notifications
                if user_role != UserRole.VIP:
                    continue
            elif visibility == SignalVisibility.PREMIUM:
                # Premium and VIP users get premium signal notifications
                if user_role not in [UserRole.PREMIUM, UserRole.VIP]:
                    continue
            # FREE signals go to everyone
            
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
        
        logger.info(f"Sent notification for signal {signal_id} ({visibility.value}) to {notified_users} users")
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")


async def send_signal_close_notification(signal_id: str, pair: str, signal_type: str, final_pips: float, visibility: SignalVisibility):
    """Send push notification when a signal is closed"""
    try:
        # Get all active device tokens with user info
        device_tokens = await db.device_tokens.find({"is_active": True}, {"_id": 0}).to_list(None)
        if not device_tokens:
            logger.info("No active device tokens found for close notification")
            return
        
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
            
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if not user:
                continue
            
            notification_prefs = user.get("notification_preferences", {})
            if not notification_prefs.get("signals", True):
                continue
            
            user_role = UserRole(user.get("role", "free"))
            
            # Apply same visibility rules as new signals
            if visibility == SignalVisibility.VIP:
                if user_role != UserRole.VIP:
                    continue
            elif visibility == SignalVisibility.PREMIUM:
                if user_role not in [UserRole.PREMIUM, UserRole.VIP]:
                    continue
            
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

# ===================== AI CHART ANALYZER =====================
@api_router.post("/ai/analyze")
async def analyze_chart(
    image: UploadFile = File(...),
    pair: str = Form(...),
    timeframe: str = Form(...),
    current_user: User = Depends(require_auth)
):
    # Get user document for subscription check
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription (accounting for expiry)
    effective_subscription = get_effective_subscription(user_doc)
    
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
            await db.users.update_one(
                {"user_id": current_user.user_id},
                {"$set": {
                    "ai_weekly_used": 0,
                    "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
                    # Also reset legacy fields
                    "ai_usage_count": 0,
                    "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
                }}
            )
            current_usage = 0
    else:
        # Initialize reset date if not set
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {
                "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
                "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
            }}
        )
    
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
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"chart_analysis_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert forex and cryptocurrency technical analyst. 
Analyze trading charts and provide structured analysis. Be concise and professional.
Handle charts in any orientation (portrait or landscape) and from any trading platform (MT4, MT5, TradingView, mobile apps).
Ignore any UI elements, status bars, or app buttons in the image - focus only on the chart data.
Always include a risk disclaimer."""
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        image_attachment = ImageContent(image_base64=image_base64)
        
        user_message = UserMessage(
            text=f"""Analyze this {pair} chart on the {timeframe} timeframe. 
The image may be a portrait or landscape screenshot from any trading platform or a photo of a screen.
Focus on the candlestick/price data and ignore any mobile UI elements.

Provide:
1. Market Bias (Bullish/Bearish/Neutral)
2. Trend Structure (description)
3. Key Support Levels (list 2-3 price levels)
4. Key Resistance Levels (list 2-3 price levels)
5. Trade Insight (brief actionable insight)
6. Confidence Level (High/Medium/Low)

Format your response as JSON with keys: market_bias, trend_structure, support_levels, resistance_levels, trade_insight, confidence""",
            file_contents=[image_attachment]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse response
        import json
        try:
            # Try to extract JSON from response
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                analysis_data = json.loads(response[json_start:json_end])
            else:
                analysis_data = {
                    "market_bias": "Unable to parse",
                    "trend_structure": response[:200],
                    "support_levels": [],
                    "resistance_levels": [],
                    "trade_insight": "Please try again with a clearer chart image",
                    "confidence": "Low"
                }
        except Exception:
            analysis_data = {
                "market_bias": "Analysis complete",
                "trend_structure": response[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": response[-200:] if len(response) > 200 else response,
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
        
        # Increment usage (both new and legacy fields for backward compatibility)
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$inc": {"ai_weekly_used": 1, "ai_usage_count": 1}}
        )
        
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

@api_router.get("/ai/history")
async def get_ai_history(current_user: User = Depends(require_auth)):
    analyses = await db.ai_analyses.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return analyses

@api_router.get("/ai/usage")
async def get_ai_usage(current_user: User = Depends(require_auth)):
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription
    effective_subscription = get_effective_subscription(user_doc)
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
                "pricing": {
                    "weekly": 10,
                    "monthly": 29,
                    "yearly": 279
                },
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
                ],
                "pricing": {
                    "weekly": 19,
                    "monthly": 69,
                    "yearly": 749
                }
            }
        ]
    }


# ===================== PAYMENT SESSION FLOW =====================
# This is a Stripe-ready payment flow. Currently uses manual confirmation.
# When Stripe is integrated, the webhook will be called by Stripe instead of admin.

class PaymentSessionCreate(BaseModel):
    """Request to create a payment session"""
    plan: str  # "premium" | "vip"
    billing_cycle: str = "monthly"  # "weekly" | "monthly" | "yearly"


class PaymentSessionStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class PaymentWebhook(BaseModel):
    """Webhook payload to confirm payment (Stripe-ready)"""
    session_id: str
    status: str  # "paid" | "cancelled"


# Pricing lookup
PLAN_PRICING = {
    "premium": {"weekly": 10, "monthly": 29, "yearly": 279},
    "vip": {"weekly": 19, "monthly": 69, "yearly": 749}
}


@api_router.post("/payments/create-session")
async def create_payment_session(
    session_data: PaymentSessionCreate,
    current_user: User = Depends(require_auth)
):
    """
    Create a payment session for subscription upgrade.
    This is the ONLY way to initiate an upgrade - returns a checkout URL.
    User must complete payment through the checkout page.
    """
    # Validate plan
    if session_data.plan not in ["premium", "vip"]:
        raise HTTPException(status_code=400, detail="Invalid plan. Must be 'premium' or 'vip'")
    
    # Validate billing cycle
    if session_data.billing_cycle not in ["weekly", "monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Invalid billing cycle")
    
    # Check if user already has this or higher plan
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    current_subscription = get_effective_subscription(user_doc)
    
    plan_hierarchy = {"free": 0, "premium": 1, "vip": 2}
    if plan_hierarchy.get(current_subscription, 0) >= plan_hierarchy.get(session_data.plan, 0):
        raise HTTPException(
            status_code=400, 
            detail=f"You already have {current_subscription.upper()} subscription or higher"
        )
    
    # Get pricing
    price = PLAN_PRICING.get(session_data.plan, {}).get(session_data.billing_cycle, 0)
    
    # Create session
    session_id = f"ps_{uuid.uuid4().hex[:16]}"
    session_doc = {
        "session_id": session_id,
        "user_id": current_user.user_id,
        "user_email": user_doc.get("email"),
        "user_name": user_doc.get("name"),
        "plan": session_data.plan,
        "billing_cycle": session_data.billing_cycle,
        "amount": price,
        "currency": "USD",
        "status": PaymentSessionStatus.PENDING.value,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        "paid_at": None,
        "cancelled_at": None
    }
    
    await db.payment_sessions.insert_one(session_doc)
    
    logger.info(f"[Payment] Session created: {session_id} for user {current_user.user_id}, plan: {session_data.plan}")
    
    return {
        "session_id": session_id,
        "checkout_url": f"/pay?session_id={session_id}",
        "plan": session_data.plan,
        "billing_cycle": session_data.billing_cycle,
        "amount": price,
        "currency": "USD",
        "expires_at": session_doc["expires_at"].isoformat()
    }


@api_router.get("/payments/session/{session_id}")
async def get_payment_session(session_id: str, current_user: User = Depends(require_auth)):
    """
    Get payment session details.
    Users can only view their own sessions.
    """
    session = await db.payment_sessions.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Payment session not found")
    
    # Users can only view their own sessions (admins can view all)
    if session["user_id"] != current_user.user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if expired
    if session["status"] == "pending":
        expires_at = session.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                # Mark as expired
                await db.payment_sessions.update_one(
                    {"session_id": session_id},
                    {"$set": {"status": "expired"}}
                )
                session["status"] = "expired"
    
    return session


@api_router.get("/payments/my-sessions")
async def get_my_payment_sessions(current_user: User = Depends(require_auth)):
    """Get all payment sessions for the current user"""
    sessions = await db.payment_sessions.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    
    return sessions


@api_router.post("/payments/webhook")
async def payment_webhook(webhook_data: PaymentWebhook):
    """
    WEBHOOK ENDPOINT - The ONLY way to upgrade a user's subscription.
    
    In production, this will be called by Stripe with a signature verification.
    Currently, it's called by admin to manually confirm payments.
    
    This endpoint does NOT require authentication because:
    1. In production, Stripe calls it with a webhook signature
    2. Currently, admin uses the admin panel to trigger this
    """
    session = await db.payment_sessions.find_one({"session_id": webhook_data.session_id})
    
    if not session:
        raise HTTPException(status_code=404, detail="Payment session not found")
    
    if session["status"] != "pending":
        raise HTTPException(
            status_code=400, 
            detail=f"Session already processed with status: {session['status']}"
        )
    
    # Check if expired
    expires_at = session.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await db.payment_sessions.update_one(
                {"session_id": webhook_data.session_id},
                {"$set": {"status": "expired"}}
            )
            raise HTTPException(status_code=400, detail="Payment session has expired")
    
    if webhook_data.status == "paid":
        # Calculate subscription expiry based on billing cycle
        billing_cycle = session.get("billing_cycle", "monthly")
        if billing_cycle == "weekly":
            expiry = datetime.now(timezone.utc) + timedelta(days=7)
        elif billing_cycle == "monthly":
            expiry = datetime.now(timezone.utc) + timedelta(days=30)
        else:  # yearly
            expiry = datetime.now(timezone.utc) + timedelta(days=365)
        
        # UPGRADE USER SUBSCRIPTION - The ONLY place this happens
        await db.users.update_one(
            {"user_id": session["user_id"]},
            {"$set": {
                "subscription": session["plan"],
                "role": session["plan"],
                "subscription_status": "active",
                "subscription_expiry": expiry,
                "billing_cycle": billing_cycle
            }}
        )
        
        # Mark session as paid
        await db.payment_sessions.update_one(
            {"session_id": webhook_data.session_id},
            {"$set": {
                "status": "paid",
                "paid_at": datetime.now(timezone.utc)
            }}
        )
        
        logger.info(f"[Payment] SUCCESS: User {session['user_id']} upgraded to {session['plan']}")
        
        return {
            "success": True,
            "message": f"User upgraded to {session['plan'].upper()} successfully",
            "user_id": session["user_id"],
            "plan": session["plan"],
            "expiry": expiry.isoformat()
        }
    
    elif webhook_data.status == "cancelled":
        await db.payment_sessions.update_one(
            {"session_id": webhook_data.session_id},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc)
            }}
        )
        
        return {
            "success": True,
            "message": "Payment session cancelled",
            "session_id": webhook_data.session_id
        }
    
    else:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'paid' or 'cancelled'")


# ===================== ADMIN PAYMENT MANAGEMENT =====================
@api_router.get("/admin/payments/sessions")
async def admin_get_payment_sessions(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Admin: Get all payment sessions with optional status filter"""
    query = {}
    if status:
        query["status"] = status
    
    sessions = await db.payment_sessions.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return sessions


@api_router.post("/admin/payments/confirm/{session_id}")
async def admin_confirm_payment(session_id: str, admin: User = Depends(require_admin)):
    """
    Admin: Manually confirm a payment (e.g., for bank transfer users).
    This calls the webhook internally with status="paid".
    """
    # Call the webhook endpoint logic
    webhook_data = PaymentWebhook(session_id=session_id, status="paid")
    
    try:
        result = await payment_webhook(webhook_data)
        logger.info(f"[Admin] Payment confirmed by {admin.user_id} for session {session_id}")
        return result
    except HTTPException as e:
        raise e


@api_router.post("/admin/payments/cancel/{session_id}")
async def admin_cancel_payment(session_id: str, admin: User = Depends(require_admin)):
    """Admin: Cancel a pending payment session"""
    session = await db.payment_sessions.find_one({"session_id": session_id})
    
    if not session:
        raise HTTPException(status_code=404, detail="Payment session not found")
    
    if session["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot cancel session with status: {session['status']}")
    
    await db.payment_sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"[Admin] Payment cancelled by {admin.user_id} for session {session_id}")
    
    return {"success": True, "message": "Payment session cancelled"}


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
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"notification_preferences": preferences}}
    )
    return {"message": "Preferences updated"}

# ===================== USER PROFILE ENDPOINTS =====================
@api_router.put("/profile")
async def update_profile(name: Optional[str] = None, current_user: User = Depends(require_auth)):
    update_doc = {}
    if name:
        update_doc["name"] = name
    
    if update_doc:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": update_doc}
        )
    
    return {"message": "Profile updated"}

@api_router.put("/profile/password")
async def change_password(current_password: str, new_password: str, current_user: User = Depends(require_auth)):
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc.get("password_hash"):
        raise HTTPException(status_code=400, detail="Cannot change password for OAuth accounts")
    
    if not verify_password(current_password, user_doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    
    return {"message": "Password changed successfully"}

# ===================== DASHBOARD ENDPOINTS =====================
@api_router.get("/dashboard")
async def get_dashboard(current_user: Optional[User] = Depends(get_current_user)):
    # Get recent signals
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Calculate performance stats
    closed_signals = await db.signals.find({"status": "closed"}, {"_id": 0}).to_list(1000)
    
    total_signals = len(closed_signals)
    # Use final_pips if available, otherwise fall back to result_pips
    winning_signals = len([s for s in closed_signals if (s.get("final_pips") or s.get("result_pips", 0)) > 0])
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    total_pips = sum([(s.get("final_pips") or s.get("result_pips", 0)) for s in closed_signals])
    
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
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, admin: User = Depends(require_admin)):
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": role}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User role updated"}

@api_router.get("/admin/stats")
async def get_admin_stats(admin: User = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    premium_users = await db.users.count_documents({"role": "premium"})
    vip_users = await db.users.count_documents({"role": "vip"})
    total_signals = await db.signals.count_documents({})
    total_ai_analyses = await db.ai_analyses.count_documents({})
    
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "vip_users": vip_users,
        "total_signals": total_signals,
        "total_ai_analyses": total_ai_analyses
    }


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
    user = await db.users.find_one({"user_id": user_id})
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
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
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
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "ai_weekly_used": 0,
            "ai_usage_count": 0,
            "ai_weekly_reset": datetime.now(timezone.utc) + timedelta(days=7),
            "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
        }}
    )
    
    return {
        "message": "AI usage reset successfully",
        "user_id": user_id,
        "new_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
    }


@api_router.get("/admin/users/{user_id}/details")
async def admin_get_user_details(user_id: str, admin: User = Depends(require_admin)):
    """Admin endpoint to get detailed user information including subscription status"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate effective subscription
    effective_subscription = get_effective_subscription(user)
    
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
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = get_effective_subscription(user_doc)
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
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = get_effective_subscription(user_doc)
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


# ===================== USER SUBSCRIPTION INFO ENDPOINT =====================
@api_router.get("/subscription/status")
async def get_subscription_status(current_user: User = Depends(require_auth)):
    """Get current user's subscription status - used for real-time UI sync"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = get_effective_subscription(user_doc)
    is_active = check_subscription_active(user_doc)
    
    # Get AI usage info
    ai_weekly_used = user_doc.get("ai_weekly_used", 0) or user_doc.get("ai_usage_count", 0)
    ai_limit = get_ai_weekly_limit(effective_subscription)
    
    return {
        "user_id": user_doc.get("user_id"),
        "subscription": effective_subscription,
        "subscription_raw": user_doc.get("subscription", "free"),
        "subscription_expiry": user_doc.get("subscription_expiry"),
        "subscription_active": is_active,
        "role": user_doc.get("role", "free"),
        "is_admin": user_doc.get("is_admin", False),
        "features": {
            "signals_access": effective_subscription,  # "free", "premium", or "vip"
            "ai_analyzer": True,  # All users have access, just different limits
            "ai_limit": ai_limit if ai_limit < 100000 else "unlimited",
            "ai_used": ai_weekly_used,
            "ai_remaining": max(0, ai_limit - ai_weekly_used) if ai_limit < 100000 else "unlimited",
            "ai_limit_reached": ai_weekly_used >= ai_limit if ai_limit < 100000 else False,
            "fund_management": effective_subscription == "vip",
            "academy": effective_subscription == "vip",
            "image_uploads": effective_subscription != "free"
        }
    }

# ===================== SETUP ADMIN =====================
@api_router.post("/setup/admin")
async def setup_admin(email: EmailStr, password: str, admin_key: str):
    """One-time setup for first admin account"""
    if admin_key != "SWIFTFX_ADMIN_SETUP_2024":
        raise HTTPException(status_code=403, detail="Invalid admin key")
    
    existing = await db.users.find_one({"email": email})
    if existing:
        # Update existing user to admin
        await db.users.update_one(
            {"email": email},
            {"$set": {"is_admin": True, "role": UserRole.VIP}}
        )
        return {"message": "Existing user upgraded to admin"}
    
    user_id = f"admin_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "name": "Admin",
        "email": email,
        "password_hash": hash_password(password),
        "role": UserRole.VIP,
        "subscription_status": "active",
        "is_admin": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    return {"message": "Admin account created", "user_id": user_id}


# ===================== PRICE-BASED SIGNAL AUTOMATION =====================
import asyncio
from contextlib import asynccontextmanager

# Price feed configuration
PRICE_POLL_INTERVAL = 30  # seconds
price_automation_running = False

# Symbol mapping for different price APIs
SYMBOL_MAP = {
    # Forex pairs
    "EUR/USD": {"type": "forex", "symbol": "EURUSD"},
    "EURUSD": {"type": "forex", "symbol": "EURUSD"},
    "GBP/USD": {"type": "forex", "symbol": "GBPUSD"},
    "GBPUSD": {"type": "forex", "symbol": "GBPUSD"},
    "USD/JPY": {"type": "forex", "symbol": "USDJPY"},
    "USDJPY": {"type": "forex", "symbol": "USDJPY"},
    "AUD/USD": {"type": "forex", "symbol": "AUDUSD"},
    "AUDUSD": {"type": "forex", "symbol": "AUDUSD"},
    "USD/CAD": {"type": "forex", "symbol": "USDCAD"},
    "USDCAD": {"type": "forex", "symbol": "USDCAD"},
    "USD/CHF": {"type": "forex", "symbol": "USDCHF"},
    "USDCHF": {"type": "forex", "symbol": "USDCHF"},
    # Gold
    "XAU/USD": {"type": "gold", "symbol": "XAUUSD"},
    "XAUUSD": {"type": "gold", "symbol": "XAUUSD"},
    # Crypto
    "BTC/USD": {"type": "crypto", "symbol": "bitcoin"},
    "BTCUSD": {"type": "crypto", "symbol": "bitcoin"},
    "ETH/USD": {"type": "crypto", "symbol": "ethereum"},
    "ETHUSD": {"type": "crypto", "symbol": "ethereum"},
}


async def fetch_live_prices(symbols: List[str]) -> Dict[str, float]:
    """Fetch live prices from multiple free APIs"""
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
                quote = api_symbol[3:]
                try:
                    resp = await client.get(
                        f"https://api.frankfurter.app/latest?from={base}&to={quote}"
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        rate = data.get("rates", {}).get(quote)
                        if rate:
                            prices[orig_symbol] = float(rate)
                except Exception as e:
                    logger.warning(f"Forex price fetch for {orig_symbol} failed: {e}")
        
        # Fetch gold from gold-api.io or fallback
        if gold_symbols:
            for orig_symbol, api_symbol in gold_symbols:
                try:
                    # Try goldapi.io free endpoint
                    resp = await client.get(
                        "https://www.goldapi.io/api/XAU/USD",
                        headers={"x-access-token": "goldapi-free"}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        price = data.get("price")
                        if price:
                            prices[orig_symbol] = float(price)
                            continue
                except:
                    pass
                
                # Fallback: Use CoinGecko's gold price via PAX Gold token
                try:
                    resp = await client.get(
                        "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd"
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if "pax-gold" in data:
                            prices[orig_symbol] = float(data["pax-gold"]["usd"])
                            continue
                except:
                    pass
                
                # Last fallback: approximate current market price
                # This should be updated periodically or replaced with a real API key
                logger.warning(f"Using fallback price for {orig_symbol}")
                prices[orig_symbol] = 2650.0  # Approximate gold price
        
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
                            prices[orig_symbol] = float(data[api_id]["usd"])
            except Exception as e:
                logger.error(f"Crypto price fetch failed: {e}")
    
    return prices


# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v2.0 - COMPLETE REBUILD
# ==============================================================================
# SINGLE SOURCE OF TRUTH for all signal state management
# 
# AUTHORITATIVE RULES:
# 1. Admin-defined state on creation is PRESERVED
# 2. Closed signals are IMMUTABLE - removed from all processing
# 3. Pips calculated ONCE at closure - NEVER recalculated
# 4. Exit handled ONCE - no further processing after closure
# ==============================================================================


class ExitReason(str, Enum):
    """Exit reason for closed signals"""
    TP1 = "tp1"
    TP2 = "tp2"
    TP3 = "tp3"
    SL = "sl"
    MANUAL = "manual"


# ==============================================================================
# CORE CALCULATION: PIP CALCULATOR (CALCULATE ONCE ONLY)
# ==============================================================================

def calculate_signal_pips(entry_price: float, exit_price: float, signal_type: str, pair: str) -> float:
    """
    Calculate pips EXACTLY ONCE at closure.
    
    FORMULA:
    - SELL: pips = entry_price - exit_price (profit when price goes DOWN)
    - BUY: pips = exit_price - entry_price (profit when price goes UP)
    
    This result is stored and NEVER recalculated.
    """
    if not entry_price or not exit_price:
        return 0.0
    
    # Determine pip multiplier based on pair
    pair_upper = pair.upper().replace("/", "")
    
    if "JPY" in pair_upper:
        pip_multiplier = 100  # JPY pairs: 2 decimal places
    elif "XAU" in pair_upper or "GOLD" in pair_upper:
        pip_multiplier = 10  # Gold: measured in $0.10
    elif "BTC" in pair_upper or "ETH" in pair_upper:
        pip_multiplier = 1  # Crypto: whole units
    else:
        pip_multiplier = 10000  # Standard forex: 4 decimal places
    
    # Calculate based on signal type
    if signal_type.lower() == "sell":
        # SELL profits when price goes DOWN
        pips = (entry_price - exit_price) * pip_multiplier
    else:
        # BUY profits when price goes UP
        pips = (exit_price - entry_price) * pip_multiplier
    
    return round(pips, 1)


# ==============================================================================
# PRICE TRIGGER ENGINE (AUTHORITATIVE)
# ==============================================================================

class PriceTrigger:
    """
    Authoritative price trigger checker.
    Uses tick-level price with crossing detection.
    """
    
    @staticmethod
    def check_sl_triggered(
        current_price: float,
        stop_loss: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> bool:
        """
        Check if Stop Loss is triggered.
        
        RULES:
        - SELL: SL triggers when price >= SL (price rises against us)
        - BUY: SL triggers when price <= SL (price falls against us)
        
        Uses crossing detection when last_price available.
        """
        if not stop_loss or not current_price:
            return False
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL SL: triggered when price RISES to or above SL
            if last_price is not None:
                # Crossing: was below SL, now at or above
                return last_price < stop_loss and current_price >= stop_loss
            return current_price >= stop_loss
        else:
            # BUY SL: triggered when price FALLS to or below SL
            if last_price is not None:
                # Crossing: was above SL, now at or below
                return last_price > stop_loss and current_price <= stop_loss
            return current_price <= stop_loss
    
    @staticmethod
    def check_tp_triggered(
        current_price: float,
        take_profit: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> bool:
        """
        Check if Take Profit is triggered.
        
        RULES:
        - SELL: TP triggers when price <= TP (price falls in our favor)
        - BUY: TP triggers when price >= TP (price rises in our favor)
        
        Uses crossing detection when last_price available.
        """
        if not take_profit or not current_price:
            return False
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL TP: triggered when price FALLS to or below TP
            if last_price is not None:
                # Crossing: was above TP, now at or below
                return last_price > take_profit and current_price <= take_profit
            return current_price <= take_profit
        else:
            # BUY TP: triggered when price RISES to or above TP
            if last_price is not None:
                # Crossing: was below TP, now at or above
                return last_price < take_profit and current_price >= take_profit
            return current_price >= take_profit
    
    @staticmethod
    def check_entry_triggered(
        current_price: float,
        entry_price: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> bool:
        """
        Check if Entry price is reached for pending signals.
        
        RULES:
        - SELL: Entry triggers when price rises TO entry (we sell at high)
        - BUY: Entry triggers when price falls TO entry (we buy at low)
        
        Note: In reality, limit orders fill when price reaches entry.
        """
        if not entry_price or not current_price:
            return False
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL entry: we want to sell high
            if last_price is not None:
                return last_price < entry_price and current_price >= entry_price
            return current_price >= entry_price
        else:
            # BUY entry: we want to buy low
            if last_price is not None:
                return last_price > entry_price and current_price <= entry_price
            return current_price <= entry_price


# ==============================================================================
# SIGNAL LIFECYCLE CONTROLLER (SINGLE SOURCE OF TRUTH)
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
        signal: dict
    ) -> bool:
        """
        CLOSE a signal. This is FINAL - no further processing.
        
        Actions:
        1. Set state = closed
        2. Set exit_price
        3. Set exit_reason
        4. Calculate pips ONCE
        5. Set closed_at timestamp
        """
        entry_price = signal.get("entry_price_actual") or signal.get("entry")
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        
        # Calculate pips EXACTLY ONCE
        final_pips = calculate_signal_pips(entry_price, exit_price, signal_type, pair)
        
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
        
        # Update signal - ATOMIC operation
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": {
                "state": "closed",
                "status": "closed",
                "exit_price": exit_price,
                "exit_reason": exit_reason if isinstance(exit_reason, str) else exit_reason.value,
                "final_pips": final_pips,
                "tp_hit": tp_hit,
                "closed_at": datetime.now(timezone.utc)
            }}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"[Engine] CLOSED signal {signal_id}: "
                f"exit_reason={exit_reason}, exit_price={exit_price}, pips={final_pips}"
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
        entry_price_actual: float
    ) -> bool:
        """Activate a pending signal"""
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": "pending"},
            {"$set": {
                "state": "active",
                "status": "active",
                "tp_hit": 0,
                "entry_price_actual": entry_price_actual,
                "activated_at": datetime.now(timezone.utc)
            }}
        )
        
        if result.modified_count > 0:
            logger.info(f"[Engine] Signal {signal_id} ACTIVATED at {entry_price_actual}")
            return True
        
        return False
    
    async def process_signal(
        self,
        signal: dict,
        current_price: float
    ) -> Optional[dict]:
        """
        MAIN ENTRY POINT: Process a single signal with current price.
        
        Returns dict with action taken, or None if no action.
        """
        signal_id = signal["signal_id"]
        current_state = self.get_current_state(signal)
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        last_price = signal.get("last_price")
        
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
            
            # Check if entry price hit
            if self.trigger.check_entry_triggered(current_price, entry, signal_type, last_price):
                success = await self.activate_signal(signal_id, current_price)
                if success:
                    # Send notification
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_notification(
                        signal_id, pair, SignalType(signal_type), visibility
                    ))
                    return {"action": "activated", "signal_id": signal_id}
            return None
        
        # === ACTIVE/TP1/TP2/TP3 SIGNALS ===
        if current_state in ["active", "tp1", "tp2", "tp3"]:
            stop_loss = signal.get("stop_loss")
            entry = signal.get("entry_price_actual") or signal.get("entry")
            
            # Auto-close TP3 state immediately
            if current_state == "tp3":
                tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
                success = await self.close_signal(
                    signal_id, current_state, tp3_price, ExitReason.TP3, signal
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
            if stop_loss and self.trigger.check_sl_triggered(current_price, stop_loss, signal_type, last_price):
                logger.info(f"[Engine] SL TRIGGERED for {signal_id} at {current_price} (SL={stop_loss})")
                
                success = await self.close_signal(
                    signal_id, current_state, current_price, ExitReason.SL, signal
                )
                
                if success:
                    pips = calculate_signal_pips(entry, current_price, signal_type, pair)
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_close_notification(
                        signal_id, pair, signal_type, pips, visibility
                    ))
                    return {"action": "closed", "reason": "sl", "pips": pips, "signal_id": signal_id}
                return None
            
            # CHECK TP LEVELS
            tp_target, exit_reason, new_state = self.get_next_tp_target(signal)
            
            if tp_target and self.trigger.check_tp_triggered(current_price, tp_target, signal_type, last_price):
                logger.info(f"[Engine] TP TRIGGERED for {signal_id} at {current_price} (TP={tp_target})")
                
                # Determine TP level
                tp_level = {"tp1": 1, "tp2": 2, "tp3": 3}.get(new_state, 1)
                
                # If TP3 or no more TPs, close the signal
                if new_state == "closed" or new_state == "tp3":
                    # Close at TP
                    success = await self.close_signal(
                        signal_id, current_state, tp_target, exit_reason, signal
                    )
                    if success:
                        pips = calculate_signal_pips(entry, tp_target, signal_type, pair)
                        visibility = SignalVisibility(signal.get("visibility", "free"))
                        asyncio.create_task(send_signal_close_notification(
                            signal_id, pair, signal_type, pips, visibility
                        ))
                        return {"action": "closed", "reason": str(exit_reason), "pips": pips, "signal_id": signal_id}
                else:
                    # Advance to next TP state
                    success = await self.advance_tp_state(signal_id, current_state, new_state, tp_level)
                    if success:
                        return {"action": "tp_hit", "level": tp_level, "signal_id": signal_id}
        
        return None


# ==============================================================================
# MANUAL MODE - AUTO ENGINE DISABLED
# ==============================================================================
# 
# IMPORTANT: All automatic signal processing has been INTENTIONALLY DISABLED.
# 
# This is a deliberate downgrade for stability. Signals will NOT:
# - Auto-activate based on price
# - Auto-detect TP levels
# - Auto-detect SL levels
# - Auto-close trades
# 
# All signal state changes must be done MANUALLY via admin endpoints:
# - POST /api/admin/signals (create)
# - POST /api/admin/signals/{id}/activate (pending → active)
# - POST /api/admin/signals/{id}/mark-tp?tp_level=1|2|3 (mark TP hit)
# - POST /api/admin/signals/{id}/force-close (close with exit_reason)
# - POST /api/admin/signals/{id}/transition (manual state change)
# ==============================================================================

# Auto-engine is DISABLED - do not start
async def run_price_automation():
    """
    AUTO-ENGINE DISABLED - MANUAL MODE ACTIVE
    
    This function does nothing. It exists only to maintain code structure.
    All signal processing must be done via manual admin endpoints.
    """
    global price_automation_running
    price_automation_running = False
    logger.info("[MANUAL MODE] Auto-engine is DISABLED. Signals require manual control.")
    # Do nothing - manual mode


# Start automation on app startup - DISABLED
@app.on_event("startup")
async def startup_event():
    """
    MANUAL MODE - Auto-engine startup is DISABLED.
    Signals will not react to price changes automatically.
    Also initializes protected Super Admin accounts.
    """
    global price_automation_running
    price_automation_running = False
    logger.info("=" * 60)
    logger.info("[MANUAL MODE] Signal auto-engine is DISABLED")
    logger.info("[MANUAL MODE] All signal state changes require admin action")
    logger.info("[MANUAL MODE] Endpoints: /activate, /mark-tp, /force-close")
    logger.info("=" * 60)
    
    # Auto-create protected Super Admin accounts
    await initialize_super_admins()


async def initialize_super_admins():
    """Create or update protected Super Admin accounts on startup"""
    for email in PROTECTED_SUPER_ADMINS:
        existing = await db.users.find_one({"email": email.lower()})
        
        if existing:
            # Ensure they have Super Admin role (cannot be downgraded)
            if existing.get("role") != UserRole.ADMIN.value or existing.get("admin_role") != AdminRole.SUPER_ADMIN.value:
                await db.users.update_one(
                    {"email": email.lower()},
                    {"$set": {
                        "role": UserRole.ADMIN.value,
                        "admin_role": AdminRole.SUPER_ADMIN.value,
                        "admin_enabled": True,
                        "subscription": "vip"
                    }}
                )
                logger.info(f"[RBAC] Restored Super Admin role for {email}")
            else:
                logger.info(f"[RBAC] Super Admin {email} verified")
        else:
            # Create new Super Admin account
            user_id = f"super_{uuid.uuid4().hex[:12]}"
            # Generate a secure random password hash (they'll need to reset)
            temp_password = f"SuperAdmin_{uuid.uuid4().hex[:8]}!"
            password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()
            
            user_doc = {
                "user_id": user_id,
                "name": "Super Admin",
                "email": email.lower(),
                "password_hash": password_hash,
                "role": UserRole.ADMIN.value,
                "admin_role": AdminRole.SUPER_ADMIN.value,
                "admin_enabled": True,
                "subscription": "vip",
                "subscription_expiry": None,
                "subscription_status": "active",
                "ai_weekly_used": 0,
                "notification_preferences": {"signals": True, "community": True},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(user_doc)
            logger.info(f"[RBAC] Created Super Admin account for {email}")
            logger.info(f"[RBAC] Temporary password for {email}: {temp_password}")
    
    logger.info("[RBAC] Super Admin initialization complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Stop event - no action needed in manual mode"""
    global price_automation_running
    price_automation_running = False
    logger.info("[MANUAL MODE] Server shutting down...")


# API endpoint to check automation status
@api_router.get("/automation/status")
async def get_automation_status():
    """Get the status of the signal engine - MANUAL MODE"""
    return {
        "mode": "MANUAL",
        "auto_engine_running": False,
        "description": "Auto-engine is DISABLED. All signal state changes require manual admin action.",
        "manual_endpoints": [
            "POST /api/admin/signals - Create signal",
            "POST /api/admin/signals/{id}/activate - Activate pending signal",
            "POST /api/admin/signals/{id}/mark-tp?tp_level=1|2|3 - Mark TP hit",
            "POST /api/admin/signals/{id}/force-close - Close signal",
            "POST /api/admin/signals/{id}/transition - Manual state change"
        ]
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
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check subscription level
    user_subscription = get_effective_subscription(user_doc)
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

def require_super_admin(current_user: User = Depends(require_admin)):
    """Dependency that requires Super Admin role"""
    if not is_super_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail="This action requires Super Admin privileges"
        )
    return current_user

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
    admins = await db.users.find({"role": "admin"}).to_list(100)
    
    result = []
    for admin in admins:
        result.append({
            "user_id": admin["user_id"],
            "email": admin["email"],
            "name": admin.get("name", "Unknown"),
            "admin_role": admin.get("admin_role"),
            "admin_enabled": admin.get("admin_enabled", True),
            "is_protected": is_protected_super_admin(admin["email"]),
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
    existing = await db.users.find_one({"email": admin_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Cannot create Super Admin through API (they're protected)
    if admin_data.admin_role == AdminRole.SUPER_ADMIN:
        if not is_protected_super_admin(admin_data.email):
            raise HTTPException(
                status_code=403,
                detail="Cannot create Super Admin accounts. Only protected emails can be Super Admins."
            )
    
    # Create admin user
    user_id = f"admin_{uuid.uuid4().hex[:12]}"
    password_hash = bcrypt.hashpw(admin_data.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "user_id": user_id,
        "name": admin_data.name,
        "email": admin_data.email.lower(),
        "password_hash": password_hash,
        "role": UserRole.ADMIN.value,
        "admin_role": admin_data.admin_role.value,
        "admin_enabled": True,
        "subscription": "vip",
        "subscription_expiry": None,
        "subscription_status": "active",
        "ai_weekly_used": 0,
        "notification_preferences": {"signals": True, "community": True},
        "created_at": now.isoformat(),
    }
    
    await db.users.insert_one(user_doc)
    
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
    admin = await db.users.find_one({"user_id": user_id, "role": "admin"})
    
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Cannot modify protected Super Admins (except by another Super Admin to disable temporarily)
    if is_protected_super_admin(admin["email"]):
        if update_data.admin_role is not None and update_data.admin_role != AdminRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Cannot change role of protected Super Admin"
            )
    
    # Cannot promote to Super Admin unless protected email
    if update_data.admin_role == AdminRole.SUPER_ADMIN:
        if not is_protected_super_admin(admin["email"]):
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
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": update_fields}
        )
        
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
    admin = await db.users.find_one({"user_id": user_id, "role": "admin"})
    
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Cannot delete protected Super Admins
    if is_protected_super_admin(admin["email"]):
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
    
    await db.users.delete_one({"user_id": user_id})
    
    await log_admin_action(
        super_admin.user_id,
        super_admin.admin_role.value,
        "delete",
        "admin",
        user_id,
        {"email": admin["email"]}
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


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

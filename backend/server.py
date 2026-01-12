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
    status: Optional[SignalStatus] = SignalStatus.PENDING  # Can be PENDING or ACTIVE at creation
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
    tp_hit: int = 0  # 0 = none, 1 = tp1, 2 = tp2, 3 = tp3
    risk_reward: float
    status: SignalStatus = SignalStatus.PENDING
    visibility: SignalVisibility
    analysis: Optional[str] = None
    final_pips: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

class SignalUpdate(BaseModel):
    """Admin signal update - for manual overrides"""
    status: Optional[SignalStatus] = None
    tp_hit: Optional[int] = None
    final_pips: Optional[float] = None
    close_price: Optional[float] = None  # For calculating final_pips on manual close

class PostCreate(BaseModel):
    content: str
    post_type: str = "analysis"  # analysis, results, question

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
    # Check if user is admin (for now, check if email contains 'admin')
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc or not user_doc.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
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

def get_ai_weekly_limit(role: UserRole) -> int:
    limits = {UserRole.FREE: 0, UserRole.PREMIUM: 5, UserRole.VIP: 20, UserRole.ADMIN: 999}
    return limits.get(role, 0)

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
    
    # Determine status from request (default: pending)
    initial_status = signal_data.status if signal_data.status else SignalStatus.PENDING
    activated_at = None
    
    # If created as active, set activated_at
    if initial_status == SignalStatus.ACTIVE:
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
        "tp_hit": 0,
        "risk_reward": risk_reward,
        "status": initial_status,
        "visibility": signal_data.visibility,
        "analysis": signal_data.analysis,
        "final_pips": None,
        "created_at": datetime.now(timezone.utc),
        "activated_at": activated_at,
        "closed_at": None
    }
    
    await db.signals.insert_one(signal_doc)
    
    # Queue push notification with visibility for role-based filtering
    background_tasks.add_task(send_signal_notification, signal_id, signal_data.pair, signal_data.signal_type, signal_data.visibility)
    
    return {"signal_id": signal_id, "message": f"Signal created as {initial_status.value}"}

def calculate_pips(entry: float, close: float, signal_type: str, pair: str) -> float:
    """Calculate pips based on price movement and pair type"""
    # Determine pip value based on pair
    if "JPY" in pair:
        pip_multiplier = 100  # JPY pairs have 2 decimal places
    elif "XAU" in pair or "GOLD" in pair:
        pip_multiplier = 10  # Gold is measured in $0.10
    elif "BTC" in pair or "ETH" in pair:
        pip_multiplier = 1  # Crypto measured in whole units
    else:
        pip_multiplier = 10000  # Standard forex pairs
    
    if signal_type == "buy":
        pips = (close - entry) * pip_multiplier
    else:  # sell
        pips = (entry - close) * pip_multiplier
    
    return round(pips, 1)

@api_router.put("/admin/signals/{signal_id}")
async def update_signal(
    signal_id: str, 
    status: Optional[SignalStatus] = None, 
    tp_hit: Optional[int] = None,
    final_pips: Optional[float] = None,
    close_price: Optional[float] = None,
    admin: User = Depends(require_admin)
):
    """Admin endpoint to manually update signal status, TP hit, or close signal"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {}
    
    # Update TP hit level
    if tp_hit is not None:
        if tp_hit < 0 or tp_hit > 3:
            raise HTTPException(status_code=400, detail="tp_hit must be 0, 1, 2, or 3")
        update_doc["tp_hit"] = tp_hit
    
    # Update status
    if status is not None:
        update_doc["status"] = status
        
        if status == SignalStatus.ACTIVE and signal.get("status") == "pending":
            update_doc["activated_at"] = datetime.now(timezone.utc)
        
        if status == SignalStatus.CLOSED:
            update_doc["closed_at"] = datetime.now(timezone.utc)
            
            # Calculate final_pips if close_price provided
            if close_price is not None:
                calculated_pips = calculate_pips(
                    signal["entry"], 
                    close_price, 
                    signal["signal_type"],
                    signal["pair"]
                )
                update_doc["final_pips"] = calculated_pips
            elif final_pips is not None:
                update_doc["final_pips"] = final_pips
    
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

@api_router.post("/admin/signals/{signal_id}/activate")
async def activate_signal(signal_id: str, admin: User = Depends(require_admin)):
    """Manually activate a pending signal"""
    result = await db.signals.update_one(
        {"signal_id": signal_id, "status": "pending"},
        {"$set": {
            "status": SignalStatus.ACTIVE,
            "activated_at": datetime.now(timezone.utc)
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Signal not found or not in pending status")
    return {"message": "Signal activated successfully"}

@api_router.post("/admin/signals/{signal_id}/close")
async def close_signal(
    signal_id: str, 
    background_tasks: BackgroundTasks,
    close_price: Optional[float] = None,
    final_pips: Optional[float] = None,
    tp_hit: Optional[int] = None,
    admin: User = Depends(require_admin)
):
    """Manually close a signal with optional final_pips or close_price"""
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {
        "status": SignalStatus.CLOSED,
        "closed_at": datetime.now(timezone.utc)
    }
    
    if tp_hit is not None:
        update_doc["tp_hit"] = tp_hit
    
    # Calculate final_pips
    computed_pips = 0.0
    if close_price is not None:
        computed_pips = calculate_pips(
            signal["entry"], 
            close_price, 
            signal["signal_type"],
            signal["pair"]
        )
        update_doc["final_pips"] = computed_pips
    elif final_pips is not None:
        computed_pips = final_pips
        update_doc["final_pips"] = computed_pips
    
    await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    # Queue push notification for signal close
    visibility = SignalVisibility(signal.get("visibility", "free"))
    background_tasks.add_task(
        send_signal_close_notification, 
        signal_id, 
        signal["pair"], 
        signal["signal_type"],
        computed_pips,
        visibility
    )
    
    return {"message": "Signal closed successfully", "final_pips": update_doc.get("final_pips")}

@api_router.post("/admin/signals/{signal_id}/mark-tp")
async def mark_tp_hit(signal_id: str, tp_level: int, background_tasks: BackgroundTasks, admin: User = Depends(require_admin)):
    """Mark a specific TP level as hit (1, 2, or 3)"""
    if tp_level not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="tp_level must be 1, 2, or 3")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {"tp_hit": tp_level}
    final_pips_value = 0.0
    
    # If TP3 is hit, auto-close the signal
    if tp_level == 3:
        tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
        update_doc["status"] = SignalStatus.CLOSED
        update_doc["closed_at"] = datetime.now(timezone.utc)
        final_pips_value = calculate_pips(
            signal["entry"],
            tp3_price,
            signal["signal_type"],
            signal["pair"]
        )
        update_doc["final_pips"] = final_pips_value
    
    await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    # Send push notification when signal is auto-closed (TP3 hit)
    if tp_level == 3:
        visibility = SignalVisibility(signal.get("visibility", "free"))
        background_tasks.add_task(
            send_signal_close_notification,
            signal_id,
            signal["pair"],
            signal["signal_type"],
            final_pips_value,
            visibility
        )
    
    return {"message": f"TP{tp_level} marked as hit", "auto_closed": tp_level == 3}

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
    
    # Check access - Free users cannot use AI analyzer
    if effective_subscription == "free":
        raise HTTPException(
            status_code=403, 
            detail="AI Chart Analyzer requires Premium or VIP subscription. Upgrade to unlock this feature!"
        )
    
    # Get weekly limit based on subscription (not role)
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
        if effective_subscription == "premium":
            raise HTTPException(
                status_code=403,
                detail=f"Weekly AI usage limit reached ({weekly_limit} analyses). Upgrade to VIP for unlimited analyses!"
            )
        else:
            raise HTTPException(
                status_code=403,
                detail=f"Weekly AI usage limit reached. Please wait until next week."
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
        "has_access": effective_subscription != "free",
        "subscription": effective_subscription
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
@api_router.post("/subscription/upgrade")
async def upgrade_subscription(sub_data: SubscriptionUpdate, current_user: User = Depends(require_auth)):
    # Mock payment - in production, integrate real payment provider
    
    # Calculate expiry based on billing cycle
    if sub_data.billing_cycle == BillingCycle.WEEKLY:
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
    elif sub_data.billing_cycle == BillingCycle.MONTHLY:
        expiry = datetime.now(timezone.utc) + timedelta(days=30)
    else:  # YEARLY
        expiry = datetime.now(timezone.utc) + timedelta(days=365)
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "role": sub_data.plan,
            "subscription_status": "active",
            "billing_cycle": sub_data.billing_cycle,
            "subscription_expiry": expiry
        }}
    )
    
    return {
        "message": "Subscription upgraded successfully",
        "plan": sub_data.plan,
        "billing_cycle": sub_data.billing_cycle,
        "expiry": expiry
    }

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
                    "Limited AI Chart Analyzer access",
                    "Ads removed"
                ],
                "pricing": {
                    "weekly": 10,
                    "monthly": 29,
                    "yearly": 279
                },
                "ai_limit_note": "Includes limited AI chart analysis. Usage caps apply."
            },
            {
                "id": "vip",
                "name": "VIP",
                "description": "For professional traders",
                "features": [
                    "Everything in Premium",
                    "20 AI chart analyses per week",
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
    """Check if user has access to Fund Management (VIP only)"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = get_effective_subscription(user_doc)
    has_access = effective_subscription == "vip"
    
    return {
        "feature": "fund_management",
        "has_access": has_access,
        "subscription": effective_subscription,
        "required_plan": "vip",
        "message": "Fund Management is available for VIP members only." if not has_access else "You have full access to Fund Management."
    }


@api_router.get("/features/academy/access")
async def check_academy_access(current_user: User = Depends(require_auth)):
    """Check if user has access to Academy (VIP only)"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = get_effective_subscription(user_doc)
    has_access = effective_subscription == "vip"
    
    return {
        "feature": "academy",
        "has_access": has_access,
        "subscription": effective_subscription,
        "required_plan": "vip",
        "message": "Academy is available for VIP members only." if not has_access else "You have full access to Academy."
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
            "ai_analyzer": effective_subscription != "free",
            "ai_limit": ai_limit if ai_limit < 100000 else "unlimited",
            "ai_used": ai_weekly_used,
            "ai_remaining": max(0, ai_limit - ai_weekly_used) if ai_limit < 100000 else "unlimited",
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


def check_price_condition(price: float, target: float, signal_type: str, condition: str) -> bool:
    """Check if price meets condition based on signal type
    
    For BUY signals:
        - Entry hit: price >= entry
        - TP hit: price >= TP
        - SL hit: price <= SL
    
    For SELL signals:
        - Entry hit: price <= entry
        - TP hit: price <= TP
        - SL hit: price >= SL
    """
    if condition == "entry":
        if signal_type == "buy":
            return price >= target
        else:  # sell
            return price <= target
    elif condition == "tp":
        if signal_type == "buy":
            return price >= target
        else:  # sell
            return price <= target
    elif condition == "sl":
        if signal_type == "buy":
            return price <= target
        else:  # sell
            return price >= target
    return False


async def process_pending_signal(signal: dict, current_price: float) -> bool:
    """Process a pending signal - activate if entry price is reached"""
    signal_id = signal["signal_id"]
    entry = signal.get("entry", 0)
    signal_type = signal.get("signal_type", "buy")
    pair = signal.get("pair", "")
    
    if not entry or not current_price:
        return False
    
    # Check if entry price is reached
    if check_price_condition(current_price, entry, signal_type, "entry"):
        logger.info(f"[AutoExec] Signal {signal_id} ({pair}): Entry hit at {current_price} (entry: {entry})")
        
        # Activate the signal
        await db.signals.update_one(
            {"signal_id": signal_id, "status": "pending"},
            {"$set": {
                "status": "active",
                "activated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Send push notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        asyncio.create_task(send_signal_notification(
            signal_id, pair, SignalType(signal_type), visibility
        ))
        
        return True
    
    return False


async def process_active_signal(signal: dict, current_price: float) -> bool:
    """Process an active signal - check TP levels and SL"""
    signal_id = signal["signal_id"]
    signal_type = signal.get("signal_type", "buy")
    pair = signal.get("pair", "")
    entry = signal.get("entry", 0)
    stop_loss = signal.get("stop_loss")
    tp1 = signal.get("tp1")
    tp2 = signal.get("tp2")
    tp3 = signal.get("tp3")
    current_tp_hit = signal.get("tp_hit", 0)
    
    if not current_price:
        return False
    
    # Check Stop Loss first (highest priority)
    if stop_loss and check_price_condition(current_price, stop_loss, signal_type, "sl"):
        logger.info(f"[AutoExec] Signal {signal_id} ({pair}): STOP LOSS hit at {current_price}")
        
        final_pips = calculate_pips(entry, current_price, signal_type, pair)
        
        await db.signals.update_one(
            {"signal_id": signal_id, "status": "active"},
            {"$set": {
                "status": "closed",
                "closed_at": datetime.now(timezone.utc),
                "final_pips": final_pips,
                "tp_hit": current_tp_hit
            }}
        )
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        asyncio.create_task(send_signal_close_notification(
            signal_id, pair, signal_type, final_pips, visibility
        ))
        
        return True
    
    # Check TP levels in order (TP1 → TP2 → TP3)
    # TP1
    if current_tp_hit < 1 and tp1 and check_price_condition(current_price, tp1, signal_type, "tp"):
        logger.info(f"[AutoExec] Signal {signal_id} ({pair}): TP1 hit at {current_price}")
        
        await db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": {"tp_hit": 1}}
        )
        
        # Notification for TP1 hit (not close yet)
        # Could add a specific notification here if needed
        return True
    
    # TP2
    if current_tp_hit < 2 and tp2 and check_price_condition(current_price, tp2, signal_type, "tp"):
        logger.info(f"[AutoExec] Signal {signal_id} ({pair}): TP2 hit at {current_price}")
        
        await db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": {"tp_hit": 2}}
        )
        return True
    
    # TP3 - This closes the signal as a WIN
    if current_tp_hit < 3 and tp3 and check_price_condition(current_price, tp3, signal_type, "tp"):
        logger.info(f"[AutoExec] Signal {signal_id} ({pair}): TP3 hit - CLOSING as WIN at {current_price}")
        
        final_pips = calculate_pips(entry, tp3, signal_type, pair)
        
        await db.signals.update_one(
            {"signal_id": signal_id, "status": "active"},
            {"$set": {
                "status": "closed",
                "closed_at": datetime.now(timezone.utc),
                "final_pips": final_pips,
                "tp_hit": 3
            }}
        )
        
        # Send close notification
        visibility = SignalVisibility(signal.get("visibility", "free"))
        asyncio.create_task(send_signal_close_notification(
            signal_id, pair, signal_type, final_pips, visibility
        ))
        
        return True
    
    return False


async def run_price_automation():
    """Main automation loop - runs every 30 seconds"""
    global price_automation_running
    
    logger.info("[AutoExec] Starting price-based signal automation...")
    price_automation_running = True
    
    while price_automation_running:
        try:
            # Get all pending and active signals
            pending_signals = await db.signals.find({"status": "pending"}).to_list(100)
            active_signals = await db.signals.find({"status": "active"}).to_list(100)
            
            all_signals = pending_signals + active_signals
            
            if not all_signals:
                logger.debug("[AutoExec] No pending/active signals to process")
                await asyncio.sleep(PRICE_POLL_INTERVAL)
                continue
            
            # Get unique symbols
            symbols = list(set([s.get("pair", "") for s in all_signals if s.get("pair")]))
            
            if not symbols:
                await asyncio.sleep(PRICE_POLL_INTERVAL)
                continue
            
            # Fetch live prices
            prices = await fetch_live_prices(symbols)
            logger.info(f"[AutoExec] Fetched prices for {len(prices)} symbols: {prices}")
            
            # Process pending signals
            for signal in pending_signals:
                pair = signal.get("pair", "")
                if pair in prices:
                    await process_pending_signal(signal, prices[pair])
            
            # Process active signals
            for signal in active_signals:
                pair = signal.get("pair", "")
                if pair in prices:
                    await process_active_signal(signal, prices[pair])
            
        except Exception as e:
            logger.error(f"[AutoExec] Error in automation loop: {e}")
        
        await asyncio.sleep(PRICE_POLL_INTERVAL)
    
    logger.info("[AutoExec] Price automation stopped")


# Start automation on app startup
@app.on_event("startup")
async def startup_event():
    """Start the price automation background task"""
    asyncio.create_task(run_price_automation())
    logger.info("[AutoExec] Background price automation task scheduled")


@app.on_event("shutdown")
async def shutdown_event():
    """Stop the price automation on shutdown"""
    global price_automation_running
    price_automation_running = False
    logger.info("[AutoExec] Stopping price automation...")


# API endpoint to check automation status
@api_router.get("/automation/status")
async def get_automation_status():
    """Get the status of the price automation system"""
    return {
        "running": price_automation_running,
        "poll_interval_seconds": PRICE_POLL_INTERVAL,
        "supported_symbols": list(SYMBOL_MAP.keys())
    }


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

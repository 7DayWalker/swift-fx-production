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
    subscription_status: str = "inactive"
    billing_cycle: Optional[BillingCycle] = None
    subscription_expiry: Optional[datetime] = None
    ai_usage_count: int = 0
    ai_usage_reset_date: Optional[datetime] = None
    notification_preferences: Dict[str, bool] = Field(default_factory=lambda: {"signals": True, "community": True})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    picture: Optional[str] = None

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
    
    user_role = current_user.role if current_user else UserRole.FREE
    
    result = []
    for signal in signals:
        signal_visibility = SignalVisibility(signal.get("visibility", "free"))
        can_view = can_access_signal(user_role, signal_visibility)
        
        if can_view:
            result.append(signal)
        else:
            # Return limited info for locked signals
            result.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "status": signal["status"],
                "visibility": signal["visibility"],
                "created_at": signal["created_at"],
                "locked": True
            })
    
    return result

@api_router.get("/signals/{signal_id}")
async def get_signal(signal_id: str, current_user: Optional[User] = Depends(get_current_user)):
    signal = await db.signals.find_one({"signal_id": signal_id}, {"_id": 0})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    user_role = current_user.role if current_user else UserRole.FREE
    signal_visibility = SignalVisibility(signal.get("visibility", "free"))
    
    if not can_access_signal(user_role, signal_visibility):
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
    
    return signal

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
    if close_price is not None:
        update_doc["final_pips"] = calculate_pips(
            signal["entry"], 
            close_price, 
            signal["signal_type"],
            signal["pair"]
        )
    elif final_pips is not None:
        update_doc["final_pips"] = final_pips
    
    await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
    )
    
    return {"message": "Signal closed successfully", "final_pips": update_doc.get("final_pips")}

@api_router.post("/admin/signals/{signal_id}/mark-tp")
async def mark_tp_hit(signal_id: str, tp_level: int, admin: User = Depends(require_admin)):
    """Mark a specific TP level as hit (1, 2, or 3)"""
    if tp_level not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="tp_level must be 1, 2, or 3")
    
    signal = await db.signals.find_one({"signal_id": signal_id})
    if not signal:
        raise HTTPException(status_code=404, detail="Signal not found")
    
    update_doc = {"tp_hit": tp_level}
    
    # If TP3 is hit, auto-close the signal
    if tp_level == 3:
        tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
        update_doc["status"] = SignalStatus.CLOSED
        update_doc["closed_at"] = datetime.now(timezone.utc)
        update_doc["final_pips"] = calculate_pips(
            signal["entry"],
            tp3_price,
            signal["signal_type"],
            signal["pair"]
        )
    
    await db.signals.update_one(
        {"signal_id": signal_id},
        {"$set": update_doc}
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

# ===================== AI CHART ANALYZER =====================
@api_router.post("/ai/analyze")
async def analyze_chart(
    image: UploadFile = File(...),
    pair: str = Form(...),
    timeframe: str = Form(...),
    current_user: User = Depends(require_auth)
):
    # Check access
    if current_user.role == UserRole.FREE:
        raise HTTPException(status_code=403, detail="AI Chart Analyzer requires Premium or VIP subscription")
    
    # Check usage limits
    weekly_limit = get_ai_weekly_limit(current_user.role)
    
    # Reset weekly counter if needed
    user_doc = await db.users.find_one({"user_id": current_user.user_id})
    reset_date = user_doc.get("ai_usage_reset_date")
    if reset_date:
        if reset_date.tzinfo is None:
            reset_date = reset_date.replace(tzinfo=timezone.utc)
        if reset_date < datetime.now(timezone.utc):
            await db.users.update_one(
                {"user_id": current_user.user_id},
                {"$set": {
                    "ai_usage_count": 0,
                    "ai_usage_reset_date": datetime.now(timezone.utc) + timedelta(days=7)
                }}
            )
            user_doc["ai_usage_count"] = 0
    
    current_usage = user_doc.get("ai_usage_count", 0)
    if current_usage >= weekly_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Weekly AI usage limit reached ({weekly_limit} analyses). Upgrade to VIP for more or wait until next week."
        )
    
    # Read and encode image
    image_content = await image.read()
    image_base64 = base64.b64encode(image_content).decode()
    
    # Analyze with Claude Vision
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"chart_analysis_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert forex and cryptocurrency technical analyst. 
Analyze trading charts and provide structured analysis. Be concise and professional.
Always include a risk disclaimer."""
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        image_attachment = ImageContent(image_base64=image_base64)
        
        user_message = UserMessage(
            text=f"""Analyze this {pair} chart on the {timeframe} timeframe. Provide:
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
        
        # Increment usage
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$inc": {"ai_usage_count": 1}}
        )
        
        return {
            **analysis_doc,
            "remaining_analyses": weekly_limit - current_usage - 1,
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
    weekly_limit = get_ai_weekly_limit(current_user.role)
    current_usage = user_doc.get("ai_usage_count", 0)
    reset_date = user_doc.get("ai_usage_reset_date")
    
    return {
        "current_usage": current_usage,
        "weekly_limit": weekly_limit,
        "remaining": max(0, weekly_limit - current_usage),
        "reset_date": reset_date,
        "has_access": current_user.role != UserRole.FREE
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
    winning_signals = len([s for s in closed_signals if s.get("result_pips", 0) > 0])
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    total_pips = sum([s.get("result_pips", 0) for s in closed_signals])
    
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

"""
models/schemas.py — All Pydantic models used across the application.
"""
from pydantic import BaseModel, Field, EmailStr
from pydantic import BaseModel as PydanticBaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone

from models.enums import (
    UserRole, AdminRole, BillingCycle, SignalVisibility, SignalStatus,
    SignalState, SignalType, FundApplicationStatus, InvestmentTier,
    TradingExperience, InvestorAccountStatus, WithdrawalStatus,
)


# ─── Auth ─────────────────────────────────────────────────────────────────────
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
    admin_role: Optional[AdminRole] = None
    admin_enabled: bool = True
    subscription: str = "free"
    subscription_expiry: Optional[datetime] = None
    subscription_status: str = "active"
    billing_cycle: Optional[BillingCycle] = None
    ai_weekly_used: int = 0
    ai_weekly_reset: Optional[datetime] = None
    ai_usage_count: int = 0
    ai_usage_reset_date: Optional[datetime] = None
    notification_preferences: Dict[str, bool] = Field(default_factory=lambda: {"signals": True, "community": True})
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    picture: Optional[str] = None


# ─── Signals ──────────────────────────────────────────────────────────────────
class SignalCreate(BaseModel):
    pair: str
    signal_type: SignalType
    entry: float
    stop_loss: float
    tp1: float
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    state: Optional[SignalState] = SignalState.PENDING
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
    state: SignalState = SignalState.PENDING
    status: SignalStatus = SignalStatus.PENDING
    tp_hit: int = 0
    visibility: SignalVisibility
    analysis: Optional[str] = None
    entry_price_actual: Optional[float] = None
    exit_price: Optional[float] = None
    final_pips: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    activated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

class SignalUpdate(BaseModel):
    state: Optional[SignalState] = None
    status: Optional[SignalStatus] = None
    tp_hit: Optional[int] = None
    final_pips: Optional[float] = None
    close_price: Optional[float] = None

class StateTransitionRequest(BaseModel):
    new_state: SignalState
    close_price: Optional[float] = None
    override_price: Optional[float] = None
    reason: Optional[str] = None
    tp_hit: Optional[int] = None
    final_pips: Optional[float] = None

class SignalFullUpdate(BaseModel):
    pair: Optional[str] = None
    signal_type: Optional[str] = None
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp3: Optional[float] = None
    visibility: Optional[str] = None
    analysis: Optional[str] = None
    state: Optional[str] = None
    tp_hit: Optional[int] = None
    final_pips: Optional[float] = None

class SignalStateUpdate(BaseModel):
    state: SignalState
    close_price: Optional[float] = None
    reason: Optional[str] = "Manual admin update"


# ─── Community ────────────────────────────────────────────────────────────────
class PostCreate(BaseModel):
    content: str

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


# ─── Subscriptions ────────────────────────────────────────────────────────────
class SubscriptionUpdate(BaseModel):
    plan: UserRole
    billing_cycle: BillingCycle

class OverrideSubscriptionRequest(BaseModel):
    user_id: str
    tier: str
    duration_days: int = 30

class RevokeOverrideRequest(BaseModel):
    user_id: str
    reason: Optional[str] = None

class AdminSubscriptionUpdate(BaseModel):
    subscription: str
    subscription_expiry: Optional[str] = None
    billing_cycle: Optional[str] = None


# ─── AI ───────────────────────────────────────────────────────────────────────
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

class AIAnalyzeRequest(PydanticBaseModel):
    prompt: str
    pair: str = "Unknown"
    timeframe: str = "Unknown"
    image_base64: Optional[str] = None

class AIAnalyzeResponse(PydanticBaseModel):
    analysis_id: str
    market_bias: str
    trade_bias: str
    confidence_score: int
    trend_structure: str
    support_levels: List[str]
    resistance_levels: List[str]
    trade_insight: str
    analysis_text: str
    detected_pattern: str
    confidence: str


# ─── Fund Management ─────────────────────────────────────────────────────────
class FundApplicationCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    country: str
    investment_tier: InvestmentTier
    intended_amount: float
    trading_experience: TradingExperience
    risk_agreement: bool = False
    source: str = "app"

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
    post_type: str = "analysis"

class InvestorPortfolioCreate(BaseModel):
    user_id: str
    application_id: str
    invested_capital: float
    current_equity: float
    investment_tier: str
    performance_fee: float = 20.0
    lockup_months: int = 3

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
    month: str
    return_percentage: float
    notes: Optional[str] = None

class FundNoticeCreate(BaseModel):
    title: str
    content: str
    notice_type: str = "general"


# ─── Notifications ────────────────────────────────────────────────────────────
class DeviceTokenRegister(BaseModel):
    token: str
    platform: str


# ─── IAP ──────────────────────────────────────────────────────────────────────
class AppleReceiptValidationRequest(BaseModel):
    receipt_data: str
    product_id: Optional[str] = None

class GooglePurchaseValidationRequest(BaseModel):
    purchase_token: str
    product_id: str
    package_name: Optional[str] = None

class IAPValidationResponse(BaseModel):
    valid: bool
    plan: Optional[str] = None
    expiry_date: Optional[str] = None
    transaction_id: Optional[str] = None
    message: str = ""
    is_trial: bool = False

class AppleNotificationPayload(BaseModel):
    signedPayload: str

class GoogleNotificationPayload(BaseModel):
    message: dict
    subscription: Optional[str] = None

class IAPTransaction(BaseModel):
    transaction_id: str
    user_id: str
    store: str
    product_id: str
    plan: str
    status: str
    purchase_date: Optional[str] = None
    expiry_date: Optional[str] = None
    original_transaction_id: Optional[str] = None
    environment: Optional[str] = None
    is_trial: bool = False
    raw_receipt: Optional[dict] = None
    verified_at: str
    updated_at: Optional[str] = None


# ─── Admin RBAC ───────────────────────────────────────────────────────────────
class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    admin_role: AdminRole = AdminRole.CUSTOMER_SUPPORT

class AdminUpdate(BaseModel):
    admin_role: Optional[AdminRole] = None
    admin_enabled: Optional[bool] = None


# ─── Support ──────────────────────────────────────────────────────────────────
class SupportTicketCreate(BaseModel):
    subject: str
    message: str
    category: str = "general"

class TicketReply(BaseModel):
    message: str

class TicketNote(BaseModel):
    note: str

class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str = "general"
    order: int = 0

class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = None
    order: Optional[int] = None


# ─── User Settings ───────────────────────────────────────────────────────────
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    picture: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class NotificationPreferencesUpdate(BaseModel):
    signals: Optional[bool] = None
    community: Optional[bool] = None
    promotions: Optional[bool] = None
    price_alerts: Optional[bool] = None
    academy: Optional[bool] = None

class AccountDeactivateRequest(BaseModel):
    reason: Optional[str] = None


# ─── App Announcements ─────────────────────────────────────────────────────
class AppAnnouncementCreate(BaseModel):
    title: str
    message: str
    version: str
    cta_url: Optional[str] = None
    active: bool = True


class AppAnnouncementRead(BaseModel):
    id: str
    title: str
    message: str
    version: str
    cta_url: Optional[str] = None
    active: bool
    created_at: datetime

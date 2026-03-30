"""
models/enums.py — All enumeration types used across the application.
"""
from enum import Enum


# ─── User & Admin Roles ──────────────────────────────────────────────────────
class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"
    FREE = "free"
    PREMIUM = "premium"
    VIP = "vip"


class AdminRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    SIGNAL_ADMIN = "signal_admin"
    FUND_ADMIN = "fund_admin"
    ACCOUNT_MANAGER = "account_manager"
    CUSTOMER_SUPPORT = "customer_support"


# ─── Billing ─────────────────────────────────────────────────────────────────
class BillingCycle(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


# ─── Signals ─────────────────────────────────────────────────────────────────
class SignalVisibility(str, Enum):
    FREE = "free"
    PREMIUM = "premium"
    VIP = "vip"


class SignalStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    CLOSED = "closed"


class SignalState(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    TP1 = "tp1"
    TP2 = "tp2"
    TP3 = "tp3"
    CLOSED = "closed"


class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"


VALID_STATE_TRANSITIONS = {
    SignalState.PENDING: [SignalState.ACTIVE],
    SignalState.ACTIVE: [SignalState.TP1, SignalState.CLOSED],
    SignalState.TP1: [SignalState.TP2, SignalState.CLOSED],
    SignalState.TP2: [SignalState.TP3, SignalState.CLOSED],
    SignalState.TP3: [SignalState.CLOSED],
    SignalState.CLOSED: [],
}


def is_valid_transition(current_state: str, new_state: str) -> bool:
    try:
        current = SignalState(current_state)
        new = SignalState(new_state)
        return new in VALID_STATE_TRANSITIONS.get(current, [])
    except ValueError:
        return False


def is_signal_closed(state: str) -> bool:
    return state == SignalState.CLOSED.value


# ─── Fund Management ─────────────────────────────────────────────────────────
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


# ─── Investor Dashboard ──────────────────────────────────────────────────────
class InvestorAccountStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"


class WithdrawalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    PAID = "paid"
    REJECTED = "rejected"


# ─── Referral Program ────────────────────────────────────────────────────────
class ReferralStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    EXPIRED = "expired"
    FLAGGED = "flagged"


class RewardStatus(str, Enum):
    LOCKED = "locked"
    PENDING = "pending"
    APPLIED = "applied"
    REVOKED = "revoked"


# ─── Support / Tickets ───────────────────────────────────────────────────────
class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketCategory(str, Enum):
    BILLING = "billing"
    SIGNALS = "signals"
    FUND = "fund"
    REFERRAL = "referral"
    TECHNICAL = "technical"
    OTHER = "other"


class FAQCategory(str, Enum):
    SUBSCRIPTION_BILLING = "subscription_billing"
    SIGNALS_TRADING = "signals_trading"
    FUND_MANAGEMENT = "fund_management"
    REFERRAL_PROGRAM = "referral_program"
    TECHNICAL_ISSUES = "technical_issues"


# ─── User Settings ───────────────────────────────────────────────────────────
class AccountStatus(str, Enum):
    ACTIVE = "active"
    DEACTIVATED = "deactivated"
    PENDING_DELETION = "pending_deletion"
    DELETED = "deleted"

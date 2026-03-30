"""
core/config.py — Environment variables, constants, and IAP configuration.
Single source of truth for all application configuration.
"""
import os
import logging
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env', override=False)

logger = logging.getLogger(__name__)

# ─── Emergent LLM Key ───────────────────────────────────────────────────────
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
if not EMERGENT_LLM_KEY:
    logger.warning("[Config] EMERGENT_LLM_KEY not set — AI features will be unavailable")

# ─── IAP Configuration — Apple App Store ─────────────────────────────────────
APPLE_SHARED_SECRET = os.environ.get('APPLE_SHARED_SECRET')
APPLE_BUNDLE_ID = os.environ.get('APPLE_BUNDLE_ID', 'com.swiftfx.signals')
APPLE_ENVIRONMENT = os.environ.get('APPLE_ENVIRONMENT')
if APPLE_ENVIRONMENT not in ('sandbox', 'production', None):
    raise ValueError(f"APPLE_ENVIRONMENT must be 'sandbox' or 'production', got '{APPLE_ENVIRONMENT}'")
APPLE_KEY_ID = os.environ.get('APPLE_KEY_ID', '')
APPLE_ISSUER_ID = os.environ.get('APPLE_ISSUER_ID', '')
APPLE_PRIVATE_KEY = os.environ.get('APPLE_PRIVATE_KEY', '')
APPLE_WEBHOOK_SECRET = os.environ.get('APPLE_WEBHOOK_SECRET', '')

# ─── IAP Configuration — Google Play Billing ─────────────────────────────────
GOOGLE_PACKAGE_NAME = os.environ.get('GOOGLE_PACKAGE_NAME', 'com.swiftfx.signals')
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
GOOGLE_PUBSUB_TOPIC = os.environ.get('GOOGLE_PUBSUB_TOPIC', '')
GOOGLE_WEBHOOK_TOKEN = os.environ.get('GOOGLE_WEBHOOK_TOKEN', '')

# ─── Official IAP Product IDs ────────────────────────────────────────────────
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


# ─── Protected Super Admins ──────────────────────────────────────────────────
PROTECTED_SUPER_ADMINS = [
    "ellapauledache@gmail.com",
    "ellaniswell@gmail.com"
]

# ─── Admin Role Permissions Map ──────────────────────────────────────────────
from models.enums import AdminRole

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

# ─── Signal Engine Config ────────────────────────────────────────────────────
PRICE_POLL_INTERVAL = int(os.environ.get('SIGNAL_POLL_INTERVAL', '5'))

SYMBOL_MAP = {
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
    "XAU/USD": {"type": "gold", "symbol": "XAUUSD", "pip_multiplier": 10, "pip_size": 0.1},
    "XAUUSD": {"type": "gold", "symbol": "XAUUSD", "pip_multiplier": 10, "pip_size": 0.1},
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

    if "JPY" in pair_upper:
        return {"pip_multiplier": 100, "pip_size": 0.01}
    elif "XAU" in pair_upper or "GOLD" in pair_upper:
        return {"pip_multiplier": 10, "pip_size": 0.1}
    elif "BTC" in pair_upper or "ETH" in pair_upper:
        return {"pip_multiplier": 1, "pip_size": 1.0}
    else:
        return {"pip_multiplier": 10000, "pip_size": 0.0001}


# ─── Economic Calendar Config ────────────────────────────────────────────────
ECONOMIC_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

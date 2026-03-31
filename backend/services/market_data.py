"""
services/market_data.py — Multi-asset market data service with provider fallback and TTL caching.

Architecture:
  get_price(symbol) → symbol router → provider chain → normalized response

Supported assets (initial):
  - XAUUSD (Gold): Metals-API → GoldAPI → TwelveData

Adding new symbols:
  1. Add a provider function (_get_<asset>_price)
  2. Register it in SYMBOL_PROVIDERS
  3. Done — get_price() handles routing, caching, and normalization automatically
"""
import os
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment-based API keys (no defaults — fail fast if missing at call time)
# ---------------------------------------------------------------------------
METALS_API_KEY = os.environ.get("METALS_API_KEY", "")
GOLDAPI_KEY = os.environ.get("GOLDAPI_KEY", "")
TWELVEDATA_KEY = os.environ.get("TWELVEDATA_KEY", "")

# ---------------------------------------------------------------------------
# In-memory price cache — keyed by symbol, TTL = 5 seconds
# ---------------------------------------------------------------------------
_price_cache: dict[str, dict] = {}
CACHE_TTL_SECONDS = 5


def _get_cached(symbol: str) -> Optional[dict]:
    entry = _price_cache.get(symbol)
    if entry and (time.monotonic() - entry["_ts"]) < CACHE_TTL_SECONDS:
        return entry
    return None


def _set_cache(symbol: str, data: dict) -> dict:
    data["_ts"] = time.monotonic()
    _price_cache[symbol] = data
    return data


# ---------------------------------------------------------------------------
# Normalized response builder
# ---------------------------------------------------------------------------
def _make_response(symbol: str, price: float, source: str) -> dict:
    return {
        "symbol": symbol,
        "price": price,
        "source": source,
        "timestamp": datetime.now(timezone.utc),
    }


# ===================================================================
# GOLD PRICE PROVIDERS  (Metals-API → GoldAPI → TwelveData)
# ===================================================================

async def _gold_metals_api(client: httpx.AsyncClient) -> Optional[dict]:
    """PRIMARY: Metals-API  —  returns USD per ounce of gold."""
    if not METALS_API_KEY or METALS_API_KEY == "test_key":
        logger.debug("[MarketData] Metals-API key not configured, skipping")
        return None
    try:
        resp = await client.get(
            "https://api.metals-api.com/v1/latest",
            params={"access_key": METALS_API_KEY, "base": "USD", "symbols": "XAU"},
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                rate = data.get("rates", {}).get("XAU")
                if rate and float(rate) > 0:
                    price = 1.0 / float(rate)  # Convert rate (USD→XAU) to XAUUSD
                    return _make_response("XAUUSD", round(price, 2), "metals-api")
            else:
                err = data.get("error", {})
                logger.warning(f"[MarketData] Metals-API error: {err.get('info', err)}")
        else:
            logger.warning(f"[MarketData] Metals-API HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"[MarketData] Metals-API exception: {e}")
    return None


async def _gold_goldapi(client: httpx.AsyncClient) -> Optional[dict]:
    """FALLBACK: GoldAPI  —  returns price directly."""
    if not GOLDAPI_KEY or GOLDAPI_KEY == "test_key":
        logger.debug("[MarketData] GoldAPI key not configured, skipping")
        return None
    try:
        resp = await client.get(
            "https://www.goldapi.io/api/XAU/USD",
            headers={"x-access-token": GOLDAPI_KEY},
        )
        if resp.status_code == 200:
            data = resp.json()
            price = data.get("price")
            if price and float(price) > 0:
                return _make_response("XAUUSD", float(price), "goldapi")
        elif resp.status_code == 401:
            logger.warning("[MarketData] GoldAPI: invalid or expired key")
        elif resp.status_code == 429:
            logger.warning("[MarketData] GoldAPI: rate limited")
        else:
            logger.warning(f"[MarketData] GoldAPI HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"[MarketData] GoldAPI exception: {e}")
    return None


async def _gold_twelvedata(client: httpx.AsyncClient) -> Optional[dict]:
    """BACKUP: TwelveData  —  returns price as string."""
    if not TWELVEDATA_KEY or TWELVEDATA_KEY == "test_key":
        logger.debug("[MarketData] TwelveData key not configured, skipping")
        return None
    try:
        resp = await client.get(
            "https://api.twelvedata.com/price",
            params={"symbol": "XAU/USD", "apikey": TWELVEDATA_KEY},
        )
        if resp.status_code == 200:
            data = resp.json()
            if "price" in data:
                price = float(data["price"])
                if price > 0:
                    return _make_response("XAUUSD", round(price, 2), "twelvedata")
            elif data.get("code") == 429:
                logger.warning("[MarketData] TwelveData: rate limited")
            else:
                logger.warning(f"[MarketData] TwelveData error: {data.get('message', data)}")
        else:
            logger.warning(f"[MarketData] TwelveData HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"[MarketData] TwelveData exception: {e}")
    return None


async def _get_gold_price() -> Optional[dict]:
    """
    Fetch XAUUSD price using the 3-provider fallback chain:
      Metals-API → GoldAPI → TwelveData
    Returns normalized dict or None if all providers fail.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Primary
        result = await _gold_metals_api(client)
        if result:
            return result

        # 2. Fallback
        result = await _gold_goldapi(client)
        if result:
            return result

        # 3. Backup
        result = await _gold_twelvedata(client)
        if result:
            return result

    logger.error("[MarketData] XAUUSD: ALL providers failed")
    return None


# ===================================================================
# SYMBOL PROVIDER REGISTRY  — add new assets here
# ===================================================================
# Maps normalized symbol → async provider function
# Each function returns Optional[dict] in the standard format

SYMBOL_PROVIDERS: dict[str, callable] = {
    "XAUUSD": _get_gold_price,
    # Future:
    # "EURUSD": _get_forex_price_eurusd,
    # "GBPUSD": _get_forex_price_gbpusd,
    # "BTCUSD": _get_crypto_price_btcusd,
}

# Symbol aliases (handle both "XAU/USD" and "XAUUSD" formats)
SYMBOL_ALIASES: dict[str, str] = {
    "XAU/USD": "XAUUSD",
    "GOLD":    "XAUUSD",
    # Future:
    # "EUR/USD": "EURUSD",
    # "GBP/USD": "GBPUSD",
    # "BTC/USD": "BTCUSD",
}


def _normalize_symbol(symbol: str) -> str:
    """Normalize symbol to canonical form (e.g., XAU/USD → XAUUSD)."""
    upper = symbol.upper().strip()
    return SYMBOL_ALIASES.get(upper, upper)


# ===================================================================
# PUBLIC API — main entry point
# ===================================================================

async def get_price(symbol: str) -> dict:
    """
    Fetch the current price for a given symbol.

    Uses in-memory cache (5s TTL) to prevent excessive API calls.
    Routes to the correct provider based on symbol.

    Returns:
        {"symbol": str, "price": float, "source": str, "timestamp": datetime}

    Raises:
        ValueError  — unknown symbol
        RuntimeError — all providers failed
    """
    normalized = _normalize_symbol(symbol)

    # Check cache first
    cached = _get_cached(normalized)
    if cached:
        return {k: v for k, v in cached.items() if k != "_ts"}

    # Route to provider
    provider = SYMBOL_PROVIDERS.get(normalized)
    if not provider:
        raise ValueError(
            f"Unsupported symbol: {symbol}. "
            f"Available: {', '.join(SYMBOL_PROVIDERS.keys())}"
        )

    result = await provider()
    if not result:
        raise RuntimeError(
            f"Failed to fetch price for {normalized}: all providers returned None"
        )

    # Cache and return (strip internal timestamp key)
    _set_cache(normalized, result)
    return {k: v for k, v in result.items() if k != "_ts"}


async def get_prices(symbols: list[str]) -> dict[str, dict]:
    """
    Batch-fetch prices for multiple symbols.
    Returns dict keyed by normalized symbol. Symbols that fail are omitted.
    """
    results = {}
    for sym in symbols:
        try:
            data = await get_price(sym)
            results[data["symbol"]] = data
        except (ValueError, RuntimeError) as e:
            logger.warning(f"[MarketData] Skipping {sym}: {e}")
    return results


def get_supported_symbols() -> list[str]:
    """Return list of symbols with configured providers."""
    return list(SYMBOL_PROVIDERS.keys())

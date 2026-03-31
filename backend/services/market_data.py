"""
services/market_data.py — Multi-asset market data service with provider fallback and TTL caching.

Architecture:
  get_price(symbol) → symbol router → provider chain → normalized response

Supported assets (initial):
  - XAUUSD (Gold): TwelveData (primary) → Metals-API → GoldAPI

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
# Environment-based API keys — read once at module load, never hardcoded
# ---------------------------------------------------------------------------
TWELVEDATA_KEY = os.environ.get("TWELVEDATA_KEY", "")
METALS_API_KEY = os.environ.get("METALS_API_KEY", "")
GOLDAPI_KEY = os.environ.get("GOLDAPI_KEY", "")

# ---------------------------------------------------------------------------
# In-memory price cache — keyed by symbol, TTL = 3 seconds
# ---------------------------------------------------------------------------
_price_cache: dict[str, dict] = {}
CACHE_TTL_SECONDS = 3


def _get_cached(symbol: str) -> Optional[dict]:
    entry = _price_cache.get(symbol)
    if entry and (time.monotonic() - entry["_ts"]) < CACHE_TTL_SECONDS:
        return entry
    return None


def _set_cache(symbol: str, data: dict) -> dict:
    data["_ts"] = time.monotonic()
    _price_cache[symbol] = data
    return data


def _make_response(symbol: str, price: float, source: str) -> dict:
    return {
        "symbol": symbol,
        "price": price,
        "source": source,
        "timestamp": datetime.now(timezone.utc),
    }


def _is_real_key(key: str) -> bool:
    """Check if an API key is configured and not a placeholder."""
    return bool(key) and key not in ("test_key", "")


# ===================================================================
# GOLD PRICE PROVIDERS  (TwelveData → Metals-API → GoldAPI)
# ===================================================================

async def _gold_twelvedata(client: httpx.AsyncClient) -> Optional[dict]:
    """PRIMARY: TwelveData — returns price as string, must convert to float."""
    if not _is_real_key(TWELVEDATA_KEY):
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
                try:
                    price = float(data["price"])
                except (ValueError, TypeError):
                    logger.warning(f"[MarketData] TwelveData: cannot parse price: {data['price']}")
                    return None
                if price > 0:
                    logger.info(f"[MarketData] TwelveData OK: XAUUSD = {price}")
                    return _make_response("XAUUSD", round(price, 2), "twelvedata")
                else:
                    logger.warning("[MarketData] TwelveData: price <= 0")
            elif data.get("code") == 429:
                logger.warning("[MarketData] TwelveData: rate limited (429)")
            elif data.get("status") == "error":
                logger.warning(f"[MarketData] TwelveData API error: {data.get('message', 'unknown')}")
            else:
                logger.warning(f"[MarketData] TwelveData: unexpected response: {str(data)[:200]}")
        elif resp.status_code == 429:
            logger.warning("[MarketData] TwelveData: HTTP 429 rate limited")
        elif resp.status_code == 401:
            logger.warning("[MarketData] TwelveData: HTTP 401 invalid key")
        else:
            logger.warning(f"[MarketData] TwelveData: HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("[MarketData] TwelveData: request timed out")
    except Exception as e:
        logger.warning(f"[MarketData] TwelveData exception: {e}")
    return None


async def _gold_metals_api(client: httpx.AsyncClient) -> Optional[dict]:
    """FALLBACK: Metals-API — returns USD per ounce of gold."""
    if not _is_real_key(METALS_API_KEY):
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
                    price = 1.0 / float(rate)
                    logger.info(f"[MarketData] Metals-API OK: XAUUSD = {round(price, 2)}")
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
    """BACKUP: GoldAPI — returns price directly."""
    if not _is_real_key(GOLDAPI_KEY):
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
                logger.info(f"[MarketData] GoldAPI OK: XAUUSD = {float(price)}")
                return _make_response("XAUUSD", float(price), "goldapi")
        elif resp.status_code == 429:
            logger.warning("[MarketData] GoldAPI: rate limited")
        else:
            logger.warning(f"[MarketData] GoldAPI HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"[MarketData] GoldAPI exception: {e}")
    return None


async def _get_gold_price() -> Optional[dict]:
    """
    Fetch XAUUSD price using the provider chain:
      TwelveData (primary) → Metals-API (fallback) → GoldAPI (backup)
    Returns normalized dict or None if all providers fail.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        result = await _gold_twelvedata(client)
        if result:
            return result

        result = await _gold_metals_api(client)
        if result:
            return result

        result = await _gold_goldapi(client)
        if result:
            return result

    logger.error("[MarketData] XAUUSD: ALL configured providers failed")
    return None


# ===================================================================
# SYMBOL PROVIDER REGISTRY
# ===================================================================
SYMBOL_PROVIDERS: dict[str, callable] = {
    "XAUUSD": _get_gold_price,
}

SYMBOL_ALIASES: dict[str, str] = {
    "XAU/USD": "XAUUSD",
    "GOLD":    "XAUUSD",
}


def _normalize_symbol(symbol: str) -> str:
    upper = symbol.upper().strip()
    return SYMBOL_ALIASES.get(upper, upper)


# ===================================================================
# PUBLIC API
# ===================================================================

async def get_price(symbol: str) -> dict:
    """
    Fetch the current price for a given symbol.
    Uses in-memory cache (5s TTL) to prevent excessive API calls.

    Returns:
        {"symbol": str, "price": float, "source": str, "timestamp": datetime}

    Raises:
        ValueError  — unknown symbol
        RuntimeError — all providers failed
    """
    normalized = _normalize_symbol(symbol)

    cached = _get_cached(normalized)
    if cached:
        return {k: v for k, v in cached.items() if k != "_ts"}

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

    _set_cache(normalized, result)
    return {k: v for k, v in result.items() if k != "_ts"}


async def get_prices(symbols: list[str]) -> dict[str, dict]:
    """Batch-fetch prices for multiple symbols. Failed symbols are omitted."""
    results = {}
    for sym in symbols:
        try:
            data = await get_price(sym)
            results[data["symbol"]] = data
        except (ValueError, RuntimeError) as e:
            logger.warning(f"[MarketData] Skipping {sym}: {e}")
    return results


def get_supported_symbols() -> list[str]:
    return list(SYMBOL_PROVIDERS.keys())

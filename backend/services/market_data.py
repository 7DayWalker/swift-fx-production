"""
services/market_data.py — Multi-provider market data service with fallback chain.

Provider priority (strict order):
  1. TwelveData  → PRIMARY (execution accuracy)
  2. Finnhub     → FALLBACK (high rate limit)
  3. Alpha Vantage → LAST RESORT
  4. Metals-API  → bonus (if key configured)
  5. GoldAPI     → bonus (if key configured)

Adding new symbols:
  1. Add provider functions per symbol
  2. Register in SYMBOL_PROVIDERS
  3. Done — get_price() handles routing, caching, and normalization
"""
import os
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API keys — os.getenv with fallback for preview, overridden in production
# ---------------------------------------------------------------------------
TWELVEDATA_KEY = os.environ.get("TWELVEDATA_KEY", "")
FINNHUB_KEY = os.getenv("FINNHUB_API_KEY") or "d76480pr01qm4b7st7e0d76480pr01qm4b7st7eg"
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_API_KEY") or "WPZNQ8BM1THQ0XXY"
METALS_API_KEY = os.environ.get("METALS_API_KEY", "")
GOLDAPI_KEY = os.environ.get("GOLDAPI_KEY", "")

# ---------------------------------------------------------------------------
# In-memory price cache — keyed by symbol, TTL = 3 seconds
# Used ONLY by HTTP API (get_price). Engine uses get_price_fresh (no cache).
# ---------------------------------------------------------------------------
_price_cache: dict[str, dict] = {}
CACHE_TTL_SECONDS = 3

# Provider request timeout (2 seconds per user spec)
PROVIDER_TIMEOUT = 2.0


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
    return bool(key) and key not in ("test_key", "")


# ===================================================================
# PROVIDER 1: TwelveData (PRIMARY)
# Symbol: XAU/USD
# ===================================================================

async def _gold_twelvedata(client: httpx.AsyncClient) -> Optional[dict]:
    if not _is_real_key(TWELVEDATA_KEY):
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
                    logger.warning(f"[PROVIDER] TwelveData: cannot parse price: {data['price']}")
                    return None
                if price > 0:
                    logger.info(f"[PROVIDER] twelvedata success price={price}")
                    return _make_response("XAUUSD", round(price, 2), "twelvedata")
            elif data.get("code") == 429:
                logger.warning("[PROVIDER] TwelveData: rate limited (429) → fallback")
            elif data.get("status") == "error":
                logger.warning(f"[PROVIDER] TwelveData API error: {data.get('message', 'unknown')}")
            else:
                logger.warning(f"[PROVIDER] TwelveData: unexpected response: {str(data)[:200]}")
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] TwelveData: HTTP 429 → fallback")
        elif resp.status_code == 401:
            logger.warning("[PROVIDER] TwelveData: HTTP 401 invalid key")
        else:
            logger.warning(f"[PROVIDER] TwelveData: HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] TwelveData: timeout → fallback")
    except Exception as e:
        logger.warning(f"[PROVIDER] TwelveData exception: {e}")
    return None


# ===================================================================
# PROVIDER 2: Finnhub (FALLBACK)
# Symbol: OANDA:XAU_USD
# ===================================================================

async def _gold_finnhub(client: httpx.AsyncClient) -> Optional[dict]:
    if not _is_real_key(FINNHUB_KEY):
        return None
    try:
        resp = await client.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": "OANDA:XAU_USD", "token": FINNHUB_KEY},
        )
        if resp.status_code == 200:
            data = resp.json()
            price = data.get("c")  # "c" = current price
            if price and float(price) > 0:
                logger.info(f"[PROVIDER] finnhub fallback used price={float(price)}")
                return _make_response("XAUUSD", round(float(price), 2), "finnhub")
            else:
                logger.warning(f"[PROVIDER] Finnhub: no valid price in response: {str(data)[:200]}")
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] Finnhub: rate limited (429) → fallback")
        elif resp.status_code == 401:
            logger.warning("[PROVIDER] Finnhub: HTTP 401 invalid key")
        else:
            logger.warning(f"[PROVIDER] Finnhub: HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] Finnhub: timeout → fallback")
    except Exception as e:
        logger.warning(f"[PROVIDER] Finnhub exception: {e}")
    return None


# ===================================================================
# PROVIDER 3: Alpha Vantage (LAST RESORT — requires premium for spot gold)
# Free tier: gold futures (GC) only, not spot XAU/USD
# ===================================================================

async def _gold_alphavantage(client: httpx.AsyncClient) -> Optional[dict]:
    if not _is_real_key(ALPHA_VANTAGE_KEY):
        return None
    try:
        resp = await client.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": "XAU",
                "to_currency": "USD",
                "apikey": ALPHA_VANTAGE_KEY,
            },
        )
        if resp.status_code == 200:
            data = resp.json()
            exchange = data.get("Realtime Currency Exchange Rate", {})
            rate_str = exchange.get("5. Exchange Rate")
            if rate_str:
                try:
                    price = float(rate_str)
                except (ValueError, TypeError):
                    logger.warning(f"[PROVIDER] AlphaVantage: cannot parse rate: {rate_str}")
                    return None
                if price > 0:
                    logger.info(f"[PROVIDER] alphavantage fallback used price={price}")
                    return _make_response("XAUUSD", round(price, 2), "alphavantage")
            if "Note" in data or "Information" in data:
                msg = data.get("Note") or data.get("Information", "")
                logger.warning(f"[PROVIDER] AlphaVantage: rate limited — {msg[:80]}")
            elif "Error Message" in data:
                logger.warning("[PROVIDER] AlphaVantage: endpoint not supported on free tier → fallback")
            elif not exchange:
                logger.warning(f"[PROVIDER] AlphaVantage: unexpected response: {str(data)[:150]}")
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] AlphaVantage: HTTP 429 → fallback")
        else:
            logger.warning(f"[PROVIDER] AlphaVantage: HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] AlphaVantage: timeout")
    except Exception as e:
        logger.warning(f"[PROVIDER] AlphaVantage exception: {e}")
    return None


# ===================================================================
# PROVIDER 4: Gold-API.com (FREE — no key required, live spot gold)
# ===================================================================

async def _gold_free_api(client: httpx.AsyncClient) -> Optional[dict]:
    try:
        resp = await client.get("https://api.gold-api.com/price/XAU")
        if resp.status_code == 200:
            data = resp.json()
            price = data.get("price")
            if price and float(price) > 0:
                logger.info(f"[PROVIDER] gold-api.com fallback used price={float(price)}")
                return _make_response("XAUUSD", round(float(price), 2), "gold-api.com")
            else:
                logger.warning(f"[PROVIDER] gold-api.com: no valid price: {str(data)[:150]}")
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] gold-api.com: rate limited (429)")
        else:
            logger.warning(f"[PROVIDER] gold-api.com: HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] gold-api.com: timeout")
    except Exception as e:
        logger.warning(f"[PROVIDER] gold-api.com exception: {e}")
    return None


# ===================================================================
# PROVIDER 5: Metals-API (bonus, if key configured)
# ===================================================================

async def _gold_metals_api(client: httpx.AsyncClient) -> Optional[dict]:
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
                    logger.info(f"[PROVIDER] metals-api fallback used price={round(price, 2)}")
                    return _make_response("XAUUSD", round(price, 2), "metals-api")
    except Exception as e:
        logger.warning(f"[PROVIDER] Metals-API exception: {e}")
    return None


# ===================================================================
# PROVIDER 5: GoldAPI (bonus, if key configured)
# ===================================================================

async def _gold_goldapi(client: httpx.AsyncClient) -> Optional[dict]:
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
                logger.info(f"[PROVIDER] goldapi fallback used price={float(price)}")
                return _make_response("XAUUSD", float(price), "goldapi")
    except Exception as e:
        logger.warning(f"[PROVIDER] GoldAPI exception: {e}")
    return None


# ===================================================================
# GOLD PRICE — Provider chain
# ===================================================================

async def _get_gold_price() -> Optional[dict]:
    """
    Fetch XAUUSD price using strict provider priority:
      1. TwelveData (primary — execution accuracy)
      2. Finnhub (fallback — requires premium for gold)
      3. Alpha Vantage (last resort — requires premium for spot gold)
      4. Gold-API.com (FREE — no key required, live spot gold)
      5. Metals-API (bonus, if key configured)
      6. GoldAPI.io (bonus, if key configured)
    
    Each provider has a 2-second timeout. No retries within same cycle.
    """
    async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
        result = await _gold_twelvedata(client)
        if result:
            return result

        result = await _gold_finnhub(client)
        if result:
            return result

        result = await _gold_alphavantage(client)
        if result:
            return result

        result = await _gold_free_api(client)
        if result:
            return result

        result = await _gold_metals_api(client)
        if result:
            return result

        result = await _gold_goldapi(client)
        if result:
            return result

    logger.error("[PROVIDER] ALL PROVIDERS FAILED for XAUUSD")
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

async def get_price_fresh(symbol: str) -> dict:
    """
    Fetch price directly from provider, BYPASSING the TTL cache.
    Used by the signal engine to guarantee fresh data every tick.
    Still updates the cache for other consumers (HTTP API).
    """
    normalized = _normalize_symbol(symbol)

    provider = SYMBOL_PROVIDERS.get(normalized)
    if not provider:
        raise ValueError(
            f"Unsupported symbol: {symbol}. "
            f"Available: {', '.join(SYMBOL_PROVIDERS.keys())}"
        )

    result = await provider()
    if not result:
        raise RuntimeError(
            f"Failed to fetch fresh price for {normalized}: all providers returned None"
        )

    _set_cache(normalized, result)
    return {k: v for k, v in result.items() if k != "_ts"}


async def get_price(symbol: str) -> dict:
    """
    Fetch current price with TTL cache (for HTTP API consumers).
    Engine uses get_price_fresh() instead.
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

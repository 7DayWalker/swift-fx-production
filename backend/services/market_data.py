"""
services/market_data.py — Multi-provider market data service with fallback chain.

Provider priority for XAUUSD (strict order):
  1. TwelveData   → PRIMARY when TWELVEDATA_KEY is configured (institutional spot feed)
  2. gold-api.com → SECONDARY (free, no key, live spot fallback)
  3. Metals-API   → TERTIARY (if key configured)
  4. GoldAPI      → QUATERNARY (if key configured)
  5. Finnhub      → fallback (if FINNHUB_API_KEY configured)
  6. Alpha Vantage → last resort (if ALPHA_VANTAGE_API_KEY configured)
"""
import os
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API keys — strictly from environment variables (never hardcoded in repo)
# ---------------------------------------------------------------------------
TWELVEDATA_KEY = os.environ.get("TWELVEDATA_KEY") or os.environ.get("TWELVEDATA_API_KEY", "")
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY", "")
METALS_API_KEY = os.environ.get("METALS_API_KEY", "")
GOLDAPI_KEY = os.environ.get("GOLDAPI_KEY", "")

# ---------------------------------------------------------------------------
# In-memory price cache — keyed by symbol, TTL = 3 seconds
# Used ONLY by HTTP API (get_price). Engine uses get_price_fresh (no cache).
# ---------------------------------------------------------------------------
_price_cache: dict[str, dict] = {}
CACHE_TTL_SECONDS = 3

# Provider request timeout (2 seconds)
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
# GOLD PROVIDERS (XAUUSD)
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
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] TwelveData: HTTP 429 → fallback")
        elif resp.status_code == 401:
            logger.warning("[PROVIDER] TwelveData: HTTP 401 invalid key")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] TwelveData: timeout → fallback")
    except Exception as e:
        logger.warning(f"[PROVIDER] TwelveData exception: {e}")
    return None


async def _gold_free_api(client: httpx.AsyncClient) -> Optional[dict]:
    try:
        resp = await client.get("https://api.gold-api.com/price/XAU")
        if resp.status_code == 200:
            data = resp.json()
            price = data.get("price")
            if price and float(price) > 0:
                logger.info(f"[PROVIDER] gold-api.com used price={float(price)}")
                return _make_response("XAUUSD", round(float(price), 2), "gold-api.com")
        elif resp.status_code == 429:
            logger.warning("[PROVIDER] gold-api.com: rate limited (429)")
    except httpx.TimeoutException:
        logger.warning("[PROVIDER] gold-api.com: timeout")
    except Exception as e:
        logger.warning(f"[PROVIDER] gold-api.com exception: {e}")
    return None


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
                    return _make_response("XAUUSD", round(price, 2), "metals-api")
    except Exception as e:
        logger.warning(f"[PROVIDER] Metals-API exception: {e}")
    return None


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
                return _make_response("XAUUSD", round(float(price), 2), "goldapi")
    except Exception as e:
        logger.warning(f"[PROVIDER] GoldAPI exception: {e}")
    return None


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
            price = data.get("c")
            if price and float(price) > 0:
                return _make_response("XAUUSD", round(float(price), 2), "finnhub")
    except Exception as e:
        logger.warning(f"[PROVIDER] Finnhub exception: {e}")
    return None


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
                price = float(rate_str)
                if price > 0:
                    return _make_response("XAUUSD", round(price, 2), "alphavantage")
    except Exception as e:
        logger.warning(f"[PROVIDER] AlphaVantage exception: {e}")
    return None


async def _get_gold_price() -> Optional[dict]:
    """
    Fetch XAUUSD price using strict provider priority:
      1. TwelveData   (PRIMARY when TWELVEDATA_KEY is set)
      2. gold-api.com (SECONDARY — free live spot fallback)
      3. Metals-API
      4. GoldAPI.io
      5. Finnhub
      6. Alpha Vantage
    """
    async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
        for provider_fn in (
            _gold_twelvedata,
            _gold_free_api,
            _gold_metals_api,
            _gold_goldapi,
            _gold_finnhub,
            _gold_alphavantage,
        ):
            result = await provider_fn(client)
            if result:
                return result

    logger.error("[PROVIDER] ALL PROVIDERS FAILED for XAUUSD")
    return None


# ===================================================================
# INTRADAY FOREX PAIRS (TwelveData → Finnhub OANDA → open.er-api fallback)
# ===================================================================

async def _get_forex_twelvedata(pair_slash: str, symbol_out: str, decimals: int = 5) -> Optional[dict]:
    if not _is_real_key(TWELVEDATA_KEY):
        return None
    try:
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
            r = await client.get(
                "https://api.twelvedata.com/price",
                params={"symbol": pair_slash, "apikey": TWELVEDATA_KEY},
            )
            if r.status_code == 200:
                data = r.json()
                price = data.get("price")
                if price and float(price) > 0:
                    return _make_response(symbol_out, round(float(price), decimals), "twelvedata")
    except Exception as e:
        logger.warning(f"[TwelveData] {symbol_out} failed: {e}")
    return None


async def _get_forex_finnhub(oanda_symbol: str, symbol_out: str, decimals: int = 5) -> Optional[dict]:
    if not _is_real_key(FINNHUB_KEY):
        return None
    try:
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": oanda_symbol, "token": FINNHUB_KEY},
            )
            if r.status_code == 200:
                data = r.json()
                price = data.get("c")
                if price and float(price) > 0:
                    return _make_response(symbol_out, round(float(price), decimals), "finnhub")
    except Exception as e:
        logger.warning(f"[Finnhub] {symbol_out} failed: {e}")
    return None


async def _get_forex_alphavantage(base_ccy: str, quote_ccy: str, symbol_out: str, decimals: int = 5) -> Optional[dict]:
    if not _is_real_key(ALPHA_VANTAGE_KEY):
        return None
    try:
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
            r = await client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "CURRENCY_EXCHANGE_RATE",
                    "from_currency": base_ccy,
                    "to_currency": quote_ccy,
                    "apikey": ALPHA_VANTAGE_KEY,
                },
            )
            if r.status_code == 200:
                data = r.json()
                rate_str = (data.get("Realtime Currency Exchange Rate") or {}).get("5. Exchange Rate")
                if rate_str and float(rate_str) > 0:
                    return _make_response(symbol_out, round(float(rate_str), decimals), "alphavantage")
    except Exception as e:
        logger.warning(f"[AlphaVantage] {symbol_out} failed: {e}")
    return None


async def _get_forex_er_api(base_ccy: str, quote_ccy: str, symbol_out: str, decimals: int = 5) -> Optional[dict]:
    """Keyless fallback forex rate provider."""
    try:
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
            r = await client.get(f"https://open.er-api.com/v6/latest/{base_ccy}")
            if r.status_code == 200:
                data = r.json()
                rate = (data.get("rates") or {}).get(quote_ccy)
                if rate and float(rate) > 0:
                    return _make_response(symbol_out, round(float(rate), decimals), "er-api")
    except Exception as e:
        logger.warning(f"[ER-API] {symbol_out} failed: {e}")
    return None


def _make_fx_provider(base_ccy: str, quote_ccy: str, decimals: int = 5) -> Callable:
    pair_slash = f"{base_ccy}/{quote_ccy}"
    oanda_sym = f"OANDA:{base_ccy}_{quote_ccy}"
    symbol_out = f"{base_ccy}{quote_ccy}"

    async def _provider() -> Optional[dict]:
        res = await _get_forex_twelvedata(pair_slash, symbol_out, decimals)
        if res:
            return res
        res = await _get_forex_finnhub(oanda_sym, symbol_out, decimals)
        if res:
            return res
        res = await _get_forex_alphavantage(base_ccy, quote_ccy, symbol_out, decimals)
        if res:
            return res
        res = await _get_forex_er_api(base_ccy, quote_ccy, symbol_out, decimals)
        if res:
            return res
        logger.error(f"[PROVIDER] ALL PROVIDERS FAILED for {symbol_out}")
        return None

    return _provider


# ===================================================================
# CRYPTO PROVIDERS (CoinGecko → TwelveData fallback)
# ===================================================================

def _make_crypto_provider(coingecko_id: str, td_pair: str, symbol_out: str) -> Callable:
    async def _provider() -> Optional[dict]:
        try:
            async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUT) as client:
                r = await client.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": coingecko_id, "vs_currencies": "usd"},
                )
                if r.status_code == 200:
                    data = r.json()
                    price = (data.get(coingecko_id) or {}).get("usd")
                    if price and float(price) > 0:
                        return _make_response(symbol_out, round(float(price), 2), "coingecko")
        except Exception as e:
            logger.warning(f"[CoinGecko] {symbol_out} failed: {e}")

        res = await _get_forex_twelvedata(td_pair, symbol_out, decimals=2)
        if res:
            return res
        logger.error(f"[PROVIDER] ALL PROVIDERS FAILED for {symbol_out}")
        return None

    return _provider


# ===================================================================
# SYMBOL PROVIDER REGISTRY
# ===================================================================
SYMBOL_PROVIDERS: dict[str, Callable] = {
    "XAUUSD": _get_gold_price,
    "EURUSD": _make_fx_provider("EUR", "USD", 5),
    "GBPUSD": _make_fx_provider("GBP", "USD", 5),
    "USDJPY": _make_fx_provider("USD", "JPY", 3),
    "GBPJPY": _make_fx_provider("GBP", "JPY", 3),
    "AUDUSD": _make_fx_provider("AUD", "USD", 5),
    "USDCAD": _make_fx_provider("USD", "CAD", 5),
    "USDCHF": _make_fx_provider("USD", "CHF", 5),
    "BTCUSD": _make_crypto_provider("bitcoin", "BTC/USD", "BTCUSD"),
    "ETHUSD": _make_crypto_provider("ethereum", "ETH/USD", "ETHUSD"),
}

SYMBOL_ALIASES: dict[str, str] = {
    "XAU/USD": "XAUUSD",
    "GOLD": "XAUUSD",
    "EUR/USD": "EURUSD",
    "GBP/USD": "GBPUSD",
    "USD/JPY": "USDJPY",
    "GBP/JPY": "GBPJPY",
    "AUD/USD": "AUDUSD",
    "USD/CAD": "USDCAD",
    "USD/CHF": "USDCHF",
    "BTC/USD": "BTCUSD",
    "BITCOIN": "BTCUSD",
    "ETH/USD": "ETHUSD",
    "ETHEREUM": "ETHUSD",
}


def _normalize_symbol(symbol: str) -> str:
    upper = symbol.upper().strip()
    return SYMBOL_ALIASES.get(upper, upper.replace("/", ""))


# ===================================================================
# PUBLIC API
# ===================================================================

async def get_price_fresh(symbol: str) -> dict:
    """
    Fetch price directly from provider, BYPASSING the TTL cache.
    Used by the signal engine to guarantee fresh data every tick.
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
    """Fetch current price with TTL cache (for HTTP API consumers)."""
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

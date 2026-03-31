"""
api/routes/market.py — Market data endpoints.
"""
import logging
from fastapi import APIRouter, HTTPException, Query

from services.market_data import get_price, get_supported_symbols

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/market/price")
async def market_price(symbol: str = Query(..., description="Trading symbol, e.g. XAUUSD")):
    """
    Get the current cached price for a symbol.
    Uses the multi-provider market data service with 5s TTL caching.
    """
    try:
        data = await get_price(symbol)
        return {
            "symbol": data["symbol"],
            "price": data["price"],
            "source": data["source"],
            "timestamp": data["timestamp"].isoformat() if hasattr(data["timestamp"], "isoformat") else str(data["timestamp"]),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/market/symbols")
async def market_symbols():
    """List all supported market symbols."""
    return {"symbols": get_supported_symbols()}

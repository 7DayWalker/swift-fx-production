"""
Insights API — serves short-form educational trading content (Swift Insights).
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from core.dependencies import get_current_user, get_db
from models.schemas import User

logger = logging.getLogger(__name__)
router = APIRouter()


# Seed content — in production, this would be fetched from a CMS or database collection.
SEED_INSIGHTS = [
    {
        "id": "ins_001",
        "title": "Why Most Traders Blow Their Accounts in the First Month",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80",
        "duration": 45,
        "category": "Psychology",
    },
    {
        "id": "ins_002",
        "title": "The Only 3 Entry Patterns You Need for Gold (XAU/USD)",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1624996379697-f01d168b1a52?w=400&q=80",
        "duration": 60,
        "category": "Entry",
    },
    {
        "id": "ins_003",
        "title": "Risk Management: How to Never Lose More Than 2% Per Trade",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80",
        "duration": 40,
        "category": "Risk",
    },
    {
        "id": "ins_004",
        "title": "NFP Week: What to Expect from USD Pairs This Friday",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&q=80",
        "duration": 30,
        "category": "News",
    },
    {
        "id": "ins_005",
        "title": "Supply and Demand Zones Explained in 60 Seconds",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=400&q=80",
        "duration": 55,
        "category": "Strategy",
    },
    {
        "id": "ins_006",
        "title": "How Institutional Traders Use Liquidity Sweeps",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=400&q=80",
        "duration": 50,
        "category": "Analysis",
    },
    {
        "id": "ins_007",
        "title": "The Psychology Behind Revenge Trading — And How to Stop",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&q=80",
        "duration": 35,
        "category": "Psychology",
    },
    {
        "id": "ins_008",
        "title": "Reading Candlestick Patterns Like a Pro: Engulfing Bars",
        "type": "image",
        "thumbnail": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80",
        "duration": 45,
        "category": "Entry",
    },
]


@router.get("/insights/feed")
async def get_insights_feed(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the Swift Insights feed.
    Inserts ads after every 4 content items.
    """
    db = await get_db()

    # Try database first, fall back to seed content
    try:
        cursor = db.insights.find(
            {"is_active": True},
            {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)
        items = await cursor.to_list(length=limit)
    except Exception:
        items = []

    # Fallback to seed if DB is empty
    if not items:
        items = SEED_INSIGHTS[offset:offset + limit]

    # Insert ad slots after every 4 content items
    feed = []
    content_count = 0
    for item in items:
        feed.append(item)
        content_count += 1
        if content_count % 4 == 0:
            feed.append({
                "id": f"ad_{content_count}",
                "title": "Sponsored Content",
                "type": "image",
                "thumbnail": "https://images.unsplash.com/photo-1553729459-uj3a0j7d0f1b?w=400&q=80",
                "duration": 0,
                "category": "Sponsored",
                "is_ad": True,
            })

    return feed

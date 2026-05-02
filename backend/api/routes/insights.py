"""
Insights API — serves short-form educational trading content (Swift Insights).
Includes feed, likes, comments, and admin CRUD endpoints.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from core.database import db
from core.dependencies import get_current_user, require_admin
from models.schemas import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# Seed content — in production, fetched from a CMS or database collection.
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


# ── Feed ──

@router.get("/insights/feed")
async def get_insights_feed(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """Returns the Swift Insights feed with like counts and user like state."""


    # Try database first, fall back to seed content
    try:
        cursor = db.insights.find(
            {"is_active": True},
            {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)
        items = await cursor.to_list(length=limit)
    except Exception:
        items = []

    if not items:
        items = SEED_INSIGHTS[offset:offset + limit]

    # Enrich with like counts and user's like state
    insight_ids = [item["id"] for item in items]

    # Get like counts
    like_counts = {}
    try:
        pipeline = [
            {"$match": {"insight_id": {"$in": insight_ids}}},
            {"$group": {"_id": "$insight_id", "count": {"$sum": 1}}},
        ]
        async for doc in db.insight_likes.aggregate(pipeline):
            like_counts[doc["_id"]] = doc["count"]
    except Exception:
        pass

    # Get user's likes
    user_likes = set()
    try:
        cursor = db.insight_likes.find(
            {"insight_id": {"$in": insight_ids}, "user_id": current_user.user_id},
            {"insight_id": 1, "_id": 0}
        )
        async for doc in cursor:
            user_likes.add(doc["insight_id"])
    except Exception:
        pass

    # Get comment counts
    comment_counts = {}
    try:
        pipeline = [
            {"$match": {"insight_id": {"$in": insight_ids}}},
            {"$group": {"_id": "$insight_id", "count": {"$sum": 1}}},
        ]
        async for doc in db.insight_comments.aggregate(pipeline):
            comment_counts[doc["_id"]] = doc["count"]
    except Exception:
        pass

    # Enrich items
    for item in items:
        item["like_count"] = like_counts.get(item["id"], 0)
        item["is_liked"] = item["id"] in user_likes
        item["comment_count"] = comment_counts.get(item["id"], 0)

    # Mix categories
    items = _mix_categories(items)

    # Insert ads after every 4 items (never first)
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
                "like_count": 0,
                "is_liked": False,
                "comment_count": 0,
            })

    return feed


# ── Likes ──

@router.post("/insights/{insight_id}/like")
async def toggle_like(
    insight_id: str = Path(...),
    current_user: User = Depends(get_current_user),
):
    """Toggle like on an insight. Returns new state."""

    existing = await db.insight_likes.find_one({
        "insight_id": insight_id,
        "user_id": current_user.user_id,
    })

    if existing:
        await db.insight_likes.delete_one({"_id": existing["_id"]})
        is_liked = False
    else:
        await db.insight_likes.insert_one({
            "insight_id": insight_id,
            "user_id": current_user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        is_liked = True

    count = await db.insight_likes.count_documents({"insight_id": insight_id})
    return {"is_liked": is_liked, "like_count": count}


# ── Comments ──

class CommentCreate(BaseModel):
    text: str


@router.get("/insights/{insight_id}/comments")
async def get_comments(
    insight_id: str = Path(...),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Get comments for an insight, newest first."""

    cursor = db.insight_comments.find(
        {"insight_id": insight_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    comments = await cursor.to_list(length=limit)
    return {"comments": comments}


@router.post("/insights/{insight_id}/comment")
async def add_comment(
    body: CommentCreate,
    insight_id: str = Path(...),
    current_user: User = Depends(get_current_user),
):
    """Add a comment to an insight."""
    text = body.text.strip()
    if not text or len(text) > 500:
        raise HTTPException(status_code=400, detail="Comment must be 1-500 characters")


    comment = {
        "insight_id": insight_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name or current_user.email.split("@")[0],
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.insight_comments.insert_one(comment)
    del comment["_id"]

    count = await db.insight_comments.count_documents({"insight_id": insight_id})
    return {"comment": comment, "comment_count": count}


# ── Helpers ──

def _mix_categories(items: list) -> list:
    """Reorder items so no two consecutive items share the same category."""
    if len(items) <= 2:
        return items

    result = [items[0]]
    remaining = items[1:]

    while remaining:
        last_category = result[-1].get("category")
        diff_idx = next(
            (i for i, item in enumerate(remaining) if item.get("category") != last_category),
            None,
        )
        if diff_idx is not None:
            result.append(remaining.pop(diff_idx))
        else:
            result.append(remaining.pop(0))

    return result


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN CRUD — Manage Insights Content
# ══════════════════════════════════════════════════════════════════════════════

class InsightCreate(BaseModel):
    title: str
    type: str = "image"  # "video" | "image"
    video_url: Optional[str] = None
    thumbnail: str
    duration: int = 30  # seconds
    category: str = "Strategy"
    is_active: bool = True


class InsightUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/admin/insights")
async def admin_list_insights(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    admin: User = Depends(require_admin),
):
    """List all insights (including inactive). Admin only."""
    query = {}
    if category:
        query["category"] = category

    total = await db.insights.count_documents(query)
    cursor = db.insights.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    items = await cursor.to_list(length=limit)

    return {
        "insights": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/admin/insights")
async def admin_create_insight(
    body: InsightCreate,
    admin: User = Depends(require_admin),
):
    """Create a new insight. Admin only."""
    insight = {
        "id": f"ins_{uuid.uuid4().hex[:12]}",
        "title": body.title,
        "type": body.type,
        "video_url": body.video_url,
        "thumbnail": body.thumbnail,
        "duration": body.duration,
        "category": body.category,
        "is_active": body.is_active,
        "created_by": admin.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.insights.insert_one(insight)
    del insight["_id"]

    logger.info(f"[Insights] Admin {admin.user_id} created insight: {insight['id']} — {body.title}")
    return {"success": True, "insight": insight}


@router.get("/admin/insights/{insight_id}")
async def admin_get_insight(
    insight_id: str = Path(...),
    admin: User = Depends(require_admin),
):
    """Get a single insight by ID. Admin only."""
    item = await db.insights.find_one({"id": insight_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Insight not found")
    return item


@router.put("/admin/insights/{insight_id}")
async def admin_update_insight(
    body: InsightUpdate,
    insight_id: str = Path(...),
    admin: User = Depends(require_admin),
):
    """Update an existing insight. Admin only."""
    existing = await db.insights.find_one({"id": insight_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Insight not found")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.insights.update_one({"id": insight_id}, {"$set": updates})
    logger.info(f"[Insights] Admin {admin.user_id} updated insight: {insight_id}")

    updated = await db.insights.find_one({"id": insight_id}, {"_id": 0})
    return {"success": True, "insight": updated}


@router.delete("/admin/insights/{insight_id}")
async def admin_delete_insight(
    insight_id: str = Path(...),
    admin: User = Depends(require_admin),
):
    """Delete an insight permanently. Admin only."""
    result = await db.insights.delete_one({"id": insight_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Insight not found")

    # Also clean up related likes and comments
    await db.insight_likes.delete_many({"insight_id": insight_id})
    await db.insight_comments.delete_many({"insight_id": insight_id})

    logger.info(f"[Insights] Admin {admin.user_id} deleted insight: {insight_id}")
    return {"success": True, "message": f"Insight {insight_id} deleted"}


@router.post("/admin/insights/bulk")
async def admin_bulk_create_insights(
    items: List[InsightCreate],
    admin: User = Depends(require_admin),
):
    """Bulk create multiple insights at once. Admin only."""
    if len(items) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 insights per bulk request")

    created = []
    for body in items:
        insight = {
            "id": f"ins_{uuid.uuid4().hex[:12]}",
            "title": body.title,
            "type": body.type,
            "video_url": body.video_url,
            "thumbnail": body.thumbnail,
            "duration": body.duration,
            "category": body.category,
            "is_active": body.is_active,
            "created_by": admin.user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.insights.insert_one(insight)
        del insight["_id"]
        created.append(insight)

    logger.info(f"[Insights] Admin {admin.user_id} bulk created {len(created)} insights")
    return {"success": True, "count": len(created), "insights": created}


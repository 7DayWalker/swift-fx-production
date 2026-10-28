"""
api/routes/dashboard.py — Dashboard endpoint.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends

from core.database import db
from core.dependencies import require_auth, get_current_user
from models.enums import UserRole, SignalVisibility
from models.schemas import User
from services.subscription import get_effective_subscription
from api.routes.signals import can_access_signal

router = APIRouter(prefix="/api")

@router.get("/dashboard")
async def get_dashboard(current_user: Optional[User] = Depends(get_current_user)):
    # Get recent signals
    signals = await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    # Calculate performance stats using aggregation for efficiency
    pipeline = [
        {"$match": {"state": "closed"}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "total_pips": {"$sum": {"$ifNull": ["$final_pips", {"$ifNull": ["$result_pips", 0]}]}},
            "wins": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$final_pips", {"$ifNull": ["$result_pips", 0]}]}, 0]}, 1, 0]}}
        }}
    ]
    stats_result = await db.signals.aggregate(pipeline).to_list(1)
    
    if stats_result:
        total_signals = stats_result[0]["total"]
        winning_signals = stats_result[0]["wins"]
        total_pips = stats_result[0]["total_pips"]
    else:
        total_signals = 0
        winning_signals = 0
        total_pips = 0
    
    win_rate = round((winning_signals / total_signals * 100) if total_signals > 0 else 0, 1)
    
    if current_user:
        if current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            user_role = current_user.role
        else:
            effective_tier = await get_effective_subscription(current_user)
            user_role = UserRole(effective_tier) if effective_tier in ("free", "premium", "vip") else UserRole.FREE
    else:
        user_role = UserRole.FREE
    
    # Filter signals based on role
    filtered_signals = []
    for signal in signals:
        signal_visibility = SignalVisibility(signal.get("visibility", "free"))
        if can_access_signal(user_role, signal_visibility):
            filtered_signals.append(signal)
        else:
            filtered_signals.append({
                "signal_id": signal["signal_id"],
                "pair": signal["pair"],
                "signal_type": signal["signal_type"],
                "status": signal["status"],
                "visibility": signal["visibility"],
                "created_at": signal["created_at"],
                "locked": True
            })
    
    return {
        "recent_signals": filtered_signals,
        "performance": {
            "win_rate": win_rate,
            "total_pips": round(total_pips, 1),
            "total_signals": total_signals
        },
        "watchlist": [
            {"pair": "EUR/USD", "category": "forex"},
            {"pair": "GBP/USD", "category": "forex"},
            {"pair": "XAU/USD", "category": "gold"},
            {"pair": "BTC/USD", "category": "crypto"},
            {"pair": "ETH/USD", "category": "crypto"}
        ]
    }


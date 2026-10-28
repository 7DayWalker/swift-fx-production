"""
services/streak_reminders.py — Background task to send push notifications
to users whose Academy streaks are at risk (haven't been active today).

Runs every 6 hours. Sends ONE personalized reminder per user per day max.
"""
import asyncio
import logging
from datetime import datetime, timezone

from core.database import db

logger = logging.getLogger(__name__)

REMINDER_INTERVAL_SECONDS = 6 * 60 * 60  # 6 hours


async def _check_and_send_streak_reminders():
    """
    Find users with active streaks who haven't been active today.
    Send each eligible user their own personalized streak push notification, max once per day.
    """
    from services.push_notifications import send_notification

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")

    try:
        at_risk = await db.academy_streaks.find(
            {
                "current_streak": {"$gt": 0},
                "last_activity_date": {"$ne": today_str},
            },
            {"_id": 0, "user_id": 1, "current_streak": 1, "last_reminder_date": 1},
        ).to_list(10000)

        if not at_risk:
            logger.info("[StreakReminder] No at-risk streaks found")
            return

        users_to_remind = [
            u for u in at_risk
            if u.get("last_reminder_date") != today_str and u.get("user_id")
        ]

        if not users_to_remind:
            logger.info("[StreakReminder] All at-risk users already reminded today")
            return

        user_ids = [u["user_id"] for u in users_to_remind]
        tokens = await db.device_tokens.find(
            {"user_id": {"$in": user_ids}, "is_active": True},
            {"_id": 0, "user_id": 1, "token": 1},
        ).to_list(10000)

        if not tokens:
            logger.info("[StreakReminder] No active tokens for at-risk users")
            return

        users_with_tokens = {
            t["user_id"]
            for t in tokens
            if t.get("user_id") and str(t.get("token", "")).startswith("ExponentPushToken")
        }

        streak_map = {u["user_id"]: u["current_streak"] for u in users_to_remind}
        sent_count = 0

        for uid in users_with_tokens:
            streak = streak_map.get(uid, 0)
            if streak <= 0:
                continue

            await send_notification(
                title="Your streak is at risk!",
                body=f"You have a {streak}-day streak. Complete a lesson today to keep it alive!",
                data={"type": "streak_reminder", "streak": streak},
                preference_key="streak_reminders",
                check_engine_config=False,
                user_ids=[uid],
            )

            await db.academy_streaks.update_one(
                {"user_id": uid},
                {"$set": {"last_reminder_date": today_str}},
            )
            sent_count += 1

        logger.info(f"[StreakReminder] Sent personalized streak reminders to {sent_count} at-risk users")

    except Exception as e:
        logger.error(f"[StreakReminder] Failed: {e}")


async def streak_reminder_loop():
    """Background loop — runs every 6 hours."""
    logger.info("[StreakReminder] Background task started (interval=6h)")
    while True:
        try:
            await _check_and_send_streak_reminders()
        except Exception as e:
            logger.error(f"[StreakReminder] Loop error: {e}")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)

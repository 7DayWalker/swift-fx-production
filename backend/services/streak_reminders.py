"""
services/streak_reminders.py — Background task to send push notifications
to users whose Academy streaks are at risk (haven't been active today).

Runs every 6 hours. Sends ONE reminder per user per day max.
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
    Send them a push notification, max once per day.
    """
    from services.push_notifications import send_notification

    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")

    try:
        # Find all users with streak > 0 who haven't been active today
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

        # Filter out users already reminded today
        users_to_remind = [
            u for u in at_risk
            if u.get("last_reminder_date") != today_str
        ]

        if not users_to_remind:
            logger.info("[StreakReminder] All at-risk users already reminded today")
            return

        # Get device tokens for these users
        user_ids = [u["user_id"] for u in users_to_remind]
        tokens = await db.device_tokens.find(
            {"user_id": {"$in": user_ids}, "is_active": True},
            {"_id": 0},
        ).to_list(10000)

        if not tokens:
            logger.info("[StreakReminder] No active tokens for at-risk users")
            return

        # Group tokens by user_id for per-user messages
        user_tokens: dict[str, list[str]] = {}
        for t in tokens:
            uid = t.get("user_id")
            tok = t.get("token", "")
            if uid and tok.startswith("ExponentPushToken"):
                user_tokens.setdefault(uid, []).append(tok)

        streak_map = {u["user_id"]: u["current_streak"] for u in users_to_remind}
        sent_count = 0

        for user_id, user_tok_list in user_tokens.items():
            streak = streak_map.get(user_id, 0)
            if streak <= 0:
                continue

            title = "Your streak is at risk!"
            body = f"You have a {streak}-day streak. Complete a lesson today to keep it alive!"

            # Send via centralized service (checks preferences)
            await send_notification(
                title=title,
                body=body,
                data={"type": "streak_reminder", "streak": streak},
                preference_key="streak_reminders",
                check_engine_config=False,
            )

            # Mark this user as reminded today
            await db.academy_streaks.update_one(
                {"user_id": user_id},
                {"$set": {"last_reminder_date": today_str}},
            )
            sent_count += 1
            break  # send_notification already sends to ALL eligible users, so one call is enough

        logger.info(f"[StreakReminder] Sent streak reminders for {len(users_to_remind)} at-risk users")

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

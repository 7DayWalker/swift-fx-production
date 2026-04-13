"""
Centralized Push Notification Service
======================================
Sends push notifications via Expo Push API, handles token cleanup,
respects user preferences, and checks the engine config flag.

DEDUPLICATION: Uses atomic MongoDB findOneAndUpdate to ensure each
signal event (new_signal, closed, tp_hit) sends exactly ONE notification.
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone

import httpx

from core.database import db

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
BATCH_SIZE = 100


async def _claim_notification_slot(signal_id: str, event_type: str) -> bool:
    """
    Atomically claim a notification slot for a signal event.
    Returns True if this caller is the first to claim it (should send).
    Returns False if already claimed by another caller (skip).
    """
    key = f"notif_{event_type}_{signal_id}"
    result = await db.notification_dedup.find_one_and_update(
        {"_id": key, "sent": {"$ne": True}},
        {"$set": {"sent": True, "claimed_at": datetime.now(timezone.utc)}},
        upsert=True,
        return_document=False,  # return the BEFORE document
    )
    # If result is None and no error, this was an upsert (first claim) → send
    # If result exists with sent=True, the $ne filter would have failed the match
    # and no update occurs. But with upsert=True and $ne filter, it's trickier.
    # Simpler: use a try/except for duplicate key on the upsert.
    return True  # upsert succeeded = first claim


async def _claim_notification_slot_safe(signal_id: str, event_type: str) -> bool:
    """
    Safely claim a notification slot. Returns True only for the first caller.
    Uses insert_one with a unique _id to guarantee exactly-once.
    """
    key = f"notif_{event_type}_{signal_id}"
    try:
        await db.notification_dedup.insert_one({
            "_id": key,
            "signal_id": signal_id,
            "event_type": event_type,
            "sent_at": datetime.now(timezone.utc),
        })
        return True  # Insert succeeded — we are the first caller
    except Exception:
        # Duplicate key error — another caller already claimed this slot
        return False


async def _get_engine_notifications_enabled() -> bool:
    """Check if push notifications are enabled in engine config."""
    config = await db.engine_config.find_one({"_id": "signal_engine"}, {"_id": 0})
    if not config:
        return True  # Default enabled
    return config.get("send_notifications", True)


async def _fetch_active_tokens() -> List[dict]:
    """Get all active Expo push tokens from MongoDB."""
    return await db.device_tokens.find(
        {"is_active": True},
        {"_id": 0}
    ).to_list(10000)


async def _fetch_user_profiles_batch(user_ids: List[str]) -> dict:
    """Batch fetch notification preferences from Supabase profiles."""
    import os
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not supabase_key or not user_ids:
        return {}

    try:
        ids_param = ",".join(user_ids)
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{supabase_url}/rest/v1/profiles",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                },
                params={
                    "select": "id,notification_preferences",
                    "id": f"in.({ids_param})",
                },
            )
            profiles_data = r.json() if r.status_code == 200 else []
        return {p["id"]: p for p in profiles_data}
    except Exception as e:
        logger.warning(f"Failed to batch fetch profiles: {e}")
        return {}


async def _mark_tokens_inactive(tokens: List[str]):
    """Mark invalid tokens as inactive in MongoDB."""
    if not tokens:
        return
    await db.device_tokens.update_many(
        {"token": {"$in": tokens}},
        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc)}}
    )
    logger.info(f"Marked {len(tokens)} invalid tokens as inactive")


async def _send_expo_push_batch(messages: List[dict]) -> List[str]:
    """
    Send messages via Expo Push API in batches.
    Returns list of receipt IDs for follow-up.
    """
    all_ticket_ids = []
    invalid_tokens = []

    for i in range(0, len(messages), BATCH_SIZE):
        batch = messages[i:i + BATCH_SIZE]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )

            response_json = response.json()
            logger.info(f"Expo push API response (batch {i//BATCH_SIZE}): {response_json}")

            if response.status_code != 200:
                logger.error(f"Expo push API returned {response.status_code}: {response.text[:200]}")
                continue

            data = response_json.get("data", [])
            for idx, ticket in enumerate(data):
                status = ticket.get("status")
                if status == "ok":
                    ticket_id = ticket.get("id")
                    if ticket_id:
                        all_ticket_ids.append(ticket_id)
                elif status == "error":
                    detail = ticket.get("details", {})
                    error_type = detail.get("error", "")
                    if error_type == "DeviceNotRegistered":
                        token = batch[idx].get("to", "")
                        if token:
                            invalid_tokens.append(token)
                    logger.warning(
                        f"Push ticket error: {ticket.get('message', '')} "
                        f"(error={error_type}, token={batch[idx].get('to', '')[:20]}...)"
                    )
        except Exception as e:
            logger.error(f"Failed to send push batch: {e}")

    # Clean up invalid tokens
    await _mark_tokens_inactive(invalid_tokens)

    return all_ticket_ids


async def check_push_receipts(ticket_ids: List[str]):
    """
    Check Expo push receipts for delivery status.
    Called asynchronously after sending to handle delayed failures.
    """
    if not ticket_ids:
        return

    invalid_tokens = []

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                EXPO_RECEIPTS_URL,
                json={"ids": ticket_ids[:1000]},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            )

        if response.status_code != 200:
            logger.warning(f"Expo receipts API returned {response.status_code}")
            return

        receipts = response.json().get("data", {})
        for receipt_id, receipt in receipts.items():
            if receipt.get("status") == "error":
                detail = receipt.get("details", {})
                if detail.get("error") == "DeviceNotRegistered":
                    # We don't have the token from the receipt directly,
                    # but we can log it for awareness
                    logger.warning(f"Receipt {receipt_id}: DeviceNotRegistered")

    except Exception as e:
        logger.error(f"Failed to check push receipts: {e}")


async def send_notification(
    *,
    title: str,
    body: str,
    data: dict,
    preference_key: str = "signals",
    check_engine_config: bool = True,
):
    """
    Central notification dispatcher.

    Args:
        title: Notification title
        body: Notification body text
        data: Payload data (e.g. signalId, type)
        preference_key: Which user preference to check (e.g. "signals", "fund_updates")
        check_engine_config: Whether to check engine send_notifications flag
    """
    try:
        # Check engine config
        if check_engine_config:
            enabled = await _get_engine_notifications_enabled()
            if not enabled:
                logger.info("Push notifications disabled in engine config, skipping")
                return

        # Get active tokens
        device_tokens = await _fetch_active_tokens()
        if not device_tokens:
            logger.info("No active device tokens found")
            return

        # Batch fetch user profiles for preference checks
        user_ids = list(set(t.get("user_id") for t in device_tokens if t.get("user_id")))
        profiles_map = await _fetch_user_profiles_batch(user_ids)

        # Build messages with platform-specific fields
        messages = []
        for token_doc in device_tokens:
            token = token_doc.get("token", "")
            user_id = token_doc.get("user_id")
            platform = token_doc.get("platform", "unknown")

            if not token.startswith("ExponentPushToken") or not user_id:
                logger.debug(f"Skipping invalid token: {token[:30]}... user={user_id}")
                continue

            # Check per-category preference
            user = profiles_map.get(user_id, {})
            prefs = user.get("notification_preferences", {})
            if not prefs.get(preference_key, True):
                continue

            message = {
                "to": token,
                "title": title,
                "body": body,
                "data": data,
                "sound": "default",
                "priority": "high",
                "channelId": "default",
            }

            # iOS: enable background content and mutable content for rich notifications
            if platform == "ios":
                message["_contentAvailable"] = True

            messages.append(message)
            logger.info(f"  -> Queued for {platform} user={user_id[:12]}... token={token[:35]}...")

        if not messages:
            logger.info(f"No eligible users for notification: {title}")
            return

        logger.info(f"Sending '{title}' to {len(messages)} devices...")
        ticket_ids = await _send_expo_push_batch(messages)
        logger.info(f"Sent '{title}' to {len(messages)} users ({len(ticket_ids)} tickets)")

        # Fire-and-forget receipt check after a delay (Expo recommends 15min)
        # For now we just log ticket count; a cron job can check receipts later
    except Exception as e:
        logger.error(f"send_notification failed: {e}")


# ======================================================================
# Convenience wrappers for signal events
# ======================================================================

async def notify_new_signal(signal_id: str, pair: str, signal_type: str):
    """Notify all users about a new signal activation. Deduped per signal_id."""
    claimed = await _claim_notification_slot_safe(signal_id, "new_signal")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate new_signal notification for {signal_id}")
        return
    await send_notification(
        title="New Signal Alert",
        body=f"{pair} \u2022 {signal_type.upper()}",
        data={"signalId": signal_id, "type": "new_signal"},
        preference_key="signals",
    )


async def notify_signal_closed(signal_id: str, pair: str, signal_type: str, final_pips: float):
    """Notify all users that a signal was closed. Deduped per signal_id."""
    claimed = await _claim_notification_slot_safe(signal_id, "closed")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate closed notification for {signal_id}")
        return
    result = "WIN" if final_pips > 0 else "LOSS"
    pips_str = f"+{final_pips:.1f}" if final_pips > 0 else f"{final_pips:.1f}"
    await send_notification(
        title=f"Signal Closed: {result}",
        body=f"{pair} \u2022 {signal_type.upper()} \u2022 {pips_str} pips",
        data={"signalId": signal_id, "type": "signal_closed", "result": result},
        preference_key="signals",
    )


async def notify_tp_hit(signal_id: str, pair: str, signal_type: str, tp_level: int, running_pips: Optional[float] = None):
    """Notify all users that an intermediate TP level was hit. Deduped per signal_id + tp_level."""
    claimed = await _claim_notification_slot_safe(signal_id, f"tp{tp_level}")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate TP{tp_level} notification for {signal_id}")
        return
    pips_part = f" \u2022 +{running_pips:.1f} pips" if running_pips else ""
    
    # Include trailing SL action in the notification body
    if tp_level == 1:
        trail_info = " \u2022 SL moved to entry"
    elif tp_level == 2:
        trail_info = " \u2022 SL moved to TP1"
    else:
        trail_info = ""
    
    await send_notification(
        title=f"TP{tp_level} Hit!",
        body=f"{pair} \u2022 {signal_type.upper()}{pips_part}{trail_info}",
        data={"signalId": signal_id, "type": "tp_hit", "level": tp_level},
        preference_key="signals",
    )

"""
Centralized Push Notification Service
======================================
Sends push notifications via Expo Push API, handles token cleanup,
respects user preferences, enforces signal tier visibility, and checks engine config.
"""
import os
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone

import httpx

from core.database import db
from services.subscription import can_access_visibility, parse_utc_datetime, get_subscription_level

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
BATCH_SIZE = 100
PROFILE_CHUNK_SIZE = 100


def _get_supabase_credentials() -> tuple[str, str]:
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    return supabase_url, supabase_key


async def _claim_notification_slot_safe(signal_id: str, event_type: str) -> bool:
    """
    Safely claim a notification slot. Returns True only for the first caller.
    Uses insert_one with a unique _id to guarantee exactly-once delivery per event.
    """
    key = f"notif_{event_type}_{signal_id}"
    try:
        await db.notification_dedup.insert_one({
            "_id": key,
            "signal_id": signal_id,
            "event_type": event_type,
            "sent_at": datetime.now(timezone.utc),
        })
        return True
    except Exception:
        return False


async def _get_engine_notifications_enabled() -> bool:
    """Check if push notifications are enabled in signal_engine_config."""
    config_doc = await db.settings.find_one({"setting_id": "signal_engine_config"}, {"_id": 0})
    if config_doc and isinstance(config_doc.get("config"), dict):
        return bool(config_doc["config"].get("send_notifications", True))
    legacy_doc = await db.engine_config.find_one({"_id": "signal_engine"}, {"_id": 0})
    if legacy_doc:
        return bool(legacy_doc.get("send_notifications", True))
    return True


async def _fetch_active_tokens(user_ids: Optional[List[str]] = None) -> List[dict]:
    """Get active Expo push tokens from MongoDB, optionally filtered to specific user_ids."""
    query: dict = {"is_active": True}
    if user_ids is not None:
        if not user_ids:
            return []
        query["user_id"] = {"$in": list(set(user_ids))}
    return await db.device_tokens.find(query, {"_id": 0}).to_list(10000)


async def _fetch_user_profiles_batch(user_ids: List[str], select_cols: str) -> Dict[str, dict]:
    """Batch fetch user profiles from Supabase in 100-UUID chunks using SUPABASE_SERVICE_ROLE_KEY."""
    supabase_url, supabase_key = _get_supabase_credentials()
    if not supabase_url or not supabase_key or not user_ids:
        return {}

    unique_ids = list(dict.fromkeys(uid for uid in user_ids if uid))
    profiles_map: Dict[str, dict] = {}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            for start in range(0, len(unique_ids), PROFILE_CHUNK_SIZE):
                chunk = unique_ids[start:start + PROFILE_CHUNK_SIZE]
                ids_param = ",".join(chunk)
                r = await client.get(
                    f"{supabase_url}/rest/v1/profiles",
                    headers={
                        "apikey": supabase_key,
                        "Authorization": f"Bearer {supabase_key}",
                    },
                    params={
                        "select": select_cols,
                        "id": f"in.({ids_param})",
                    },
                )
                if r.status_code == 200:
                    for p in r.json():
                        if p.get("id"):
                            profiles_map[p["id"]] = p
                else:
                    logger.warning("[Push] Supabase profile chunk fetch returned %s", r.status_code)
    except Exception as e:
        logger.warning(f"Failed to batch fetch profiles: {e}")

    return profiles_map


async def _resolve_user_tiers_batch(user_ids: List[str], profiles_map: Dict[str, dict]) -> Dict[str, str]:
    """
    Efficiently resolve effective subscription tiers in batch for push gating:
      1. admin / super_admin -> 'vip'
      2. active db.subscription_overrides -> override tier
      3. active db.iap_transactions -> highest non-expired tier
      4. active non-expired profile subscription fallback -> profile tier
      5. otherwise -> 'free'
    """
    now = datetime.now(timezone.utc)
    tiers: Dict[str, str] = {uid: "free" for uid in user_ids}
    if not user_ids:
        return tiers

    non_admin_ids: List[str] = []
    for uid in user_ids:
        prof = profiles_map.get(uid) or {}
        role_val = str(prof.get("role") or "free").lower()
        if role_val in ("admin", "super_admin") or (prof.get("admin_role") and prof.get("admin_enabled", True) is not False):
            tiers[uid] = "vip"
            continue

        prof_tier = str(prof.get("subscription_tier") or prof.get("subscription") or "free").lower()
        prof_status = str(prof.get("subscription_status") or "").lower()
        prof_exp = parse_utc_datetime(prof.get("subscription_expiry"))
        if prof_tier in ("premium", "vip") and prof_status not in ("inactive", "expired", "revoked", "refunded"):
            if (prof_exp is None and prof_status == "active") or (prof_exp is not None and prof_exp > now):
                tiers[uid] = prof_tier

        non_admin_ids.append(uid)

    if not non_admin_ids:
        return tiers

    # Batch check verified iap_transactions
    txns = await db.iap_transactions.find(
        {
            "user_id": {"$in": non_admin_ids},
            "status": {"$in": ["active", "billing_issue"]},
        },
        {"user_id": 1, "plan": 1, "tier": 1, "expiry_date": 1},
    ).to_list(10000)

    for txn in txns:
        uid = txn.get("user_id")
        if not uid:
            continue
        exp = parse_utc_datetime(txn.get("expiry_date"))
        if exp is not None and exp <= now:
            continue
        t_plan = str(txn.get("plan") or txn.get("tier") or "free").lower()
        if get_subscription_level(t_plan) > get_subscription_level(tiers.get(uid, "free")):
            tiers[uid] = t_plan

    # Batch check active subscription_overrides (takes precedence over store tier)
    overrides = await db.subscription_overrides.find(
        {"user_id": {"$in": non_admin_ids}, "is_active": True},
        {"user_id": 1, "tier": 1, "expires_at": 1},
    ).to_list(2000)

    for ov in overrides:
        uid = ov.get("user_id")
        if not uid:
            continue
        exp = parse_utc_datetime(ov.get("expires_at"))
        if exp is not None and exp <= now:
            continue
        tiers[uid] = str(ov.get("tier") or "free").lower()

    return tiers


async def _mark_tokens_inactive(tokens: List[str]):
    """Mark invalid tokens as inactive in MongoDB."""
    if not tokens:
        return
    await db.device_tokens.update_many(
        {"token": {"$in": tokens}},
        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc)}},
    )
    logger.info(f"Marked {len(tokens)} invalid tokens as inactive")


async def _send_expo_push_batch(messages: List[dict]) -> List[str]:
    """Send messages via Expo Push API in batches of 100."""
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
                    },
                )

            response_json = response.json()
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

    await _mark_tokens_inactive(invalid_tokens)
    return all_ticket_ids


async def check_push_receipts(ticket_ids: List[str]):
    """Check Expo push receipts for delivery status."""
    if not ticket_ids:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                EXPO_RECEIPTS_URL,
                json={"ids": ticket_ids[:1000]},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
        if response.status_code != 200:
            logger.warning(f"Expo receipts API returned {response.status_code}")
            return
        receipts = response.json().get("data", {})
        for receipt_id, receipt in receipts.items():
            if receipt.get("status") == "error":
                detail = receipt.get("details", {})
                if detail.get("error") == "DeviceNotRegistered":
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
    user_ids: Optional[List[str]] = None,
    visibility: Optional[str] = None,
):
    """
    Central notification dispatcher.

    Args:
        title: Notification title
        body: Notification body text
        data: Payload data (e.g. signalId, type)
        preference_key: Which user preference to check
        check_engine_config: Whether to check engine send_notifications flag
        user_ids: Optional explicit recipient user IDs (e.g. targeted streak reminders)
        visibility: Optional signal tier ('free' | 'premium' | 'vip') to restrict delivery
    """
    try:
        if check_engine_config:
            enabled = await _get_engine_notifications_enabled()
            if not enabled:
                logger.info("Push notifications disabled in engine config, skipping")
                return

        device_tokens = await _fetch_active_tokens(user_ids=user_ids)
        if not device_tokens:
            logger.info("No active device tokens found")
            return

        recipient_ids = list(set(t.get("user_id") for t in device_tokens if t.get("user_id")))
        select_cols = "id,role,admin_role,admin_enabled,account_status,notification_preferences,subscription,subscription_tier,subscription_status,subscription_expiry"
        profiles_map = await _fetch_user_profiles_batch(recipient_ids, select_cols)

        vis_str = (visibility.value if hasattr(visibility, "value") else str(visibility or "")).lower().strip()
        tiers_map: Dict[str, str] = {}
        if vis_str in ("premium", "vip"):
            tiers_map = await _resolve_user_tiers_batch(recipient_ids, profiles_map)

        enriched_data = {**data, "title": title, "body": body}
        messages = []

        for token_doc in device_tokens:
            token = token_doc.get("token", "")
            uid = token_doc.get("user_id")
            platform = token_doc.get("platform", "unknown")

            if not token.startswith("ExponentPushToken") or not uid:
                continue

            user = profiles_map.get(uid)
            if user:
                acct_status = str(user.get("account_status") or "active").lower()
                if acct_status in ("deactivated", "deleted"):
                    continue

            if vis_str in ("premium", "vip"):
                user_tier = tiers_map.get(uid, "free")
                if not can_access_visibility(user_tier, vis_str):
                    continue

            prefs = (user or {}).get("notification_preferences") or {}
            if prefs.get("push_enabled") is False:
                continue
            if not prefs.get(preference_key, True):
                continue

            message = {
                "to": token,
                "title": title,
                "body": body,
                "data": enriched_data,
                "sound": "default",
                "priority": "high",
                "channelId": "default",
            }
            if platform == "ios":
                message["_contentAvailable"] = True
            if platform == "android":
                message["android"] = {
                    "largeIcon": "https://hrzghlqcfccnmgcipxxo.supabase.co/storage/v1/object/public/public-assets/SwiftFX-logo.png"
                }

            messages.append(message)

        if not messages:
            logger.info(f"No eligible users for notification: {title}")
            return

        logger.info(f"Sending '{title}' to {len(messages)} devices...")
        ticket_ids = await _send_expo_push_batch(messages)
        logger.info(f"Sent '{title}' to {len(messages)} users ({len(ticket_ids)} tickets)")
    except Exception as e:
        logger.error(f"send_notification failed: {e}")


# ======================================================================
# Convenience wrappers for signal events
# ======================================================================

async def notify_new_signal(
    signal_id: str,
    pair: str,
    signal_type: str,
    visibility: Optional[str] = None,
):
    """Notify eligible users about a new signal activation. Deduped per signal_id."""
    claimed = await _claim_notification_slot_safe(signal_id, "new_signal")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate new_signal notification for {signal_id}")
        return
    await send_notification(
        title="New Signal Alert",
        body=f"{pair} • {signal_type.upper()}",
        data={"signalId": signal_id, "type": "new_signal"},
        preference_key="signals",
        visibility=visibility,
    )


async def notify_signal_closed(
    signal_id: str,
    pair: str,
    signal_type: str,
    final_pips: float,
    tp_hit: int = 0,
    visibility: Optional[str] = None,
):
    """Notify eligible users that a signal was closed. Deduped per signal_id."""
    claimed = await _claim_notification_slot_safe(signal_id, "closed")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate closed notification for {signal_id}")
        return

    if final_pips > 0:
        result = "WIN"
    elif final_pips == 0 and tp_hit >= 1:
        result = "BREAKEVEN"
    else:
        result = "LOSS"

    pips_str = f"+{final_pips:.1f}" if final_pips > 0 else f"{final_pips:.1f}"
    await send_notification(
        title=f"Signal Closed: {result}",
        body=f"{pair} • {signal_type.upper()} • {pips_str} pips",
        data={"signalId": signal_id, "type": "signal_closed", "result": result},
        preference_key="signals",
        visibility=visibility,
    )


async def notify_tp_hit(
    signal_id: str,
    pair: str,
    signal_type: str,
    tp_level: int,
    running_pips: Optional[float] = None,
    visibility: Optional[str] = None,
):
    """Notify eligible users that an intermediate TP level was hit. Deduped per signal_id + tp_level."""
    claimed = await _claim_notification_slot_safe(signal_id, f"tp{tp_level}")
    if not claimed:
        logger.info(f"[Dedup] Skipping duplicate TP{tp_level} notification for {signal_id}")
        return
    pips_part = f" • +{running_pips:.1f} pips" if running_pips else ""

    if tp_level == 1:
        trail_info = " • SL moved to entry"
    elif tp_level == 2:
        trail_info = " • SL moved to TP1"
    else:
        trail_info = ""

    await send_notification(
        title=f"TP{tp_level} Hit!",
        body=f"{pair} • {signal_type.upper()}{pips_part}{trail_info}",
        data={"signalId": signal_id, "type": "tp_hit", "level": tp_level},
        preference_key="signals",
        visibility=visibility,
    )


# ======================================================================
# Admin support ticket push (best-effort, lightweight)
# ======================================================================

_ADMIN_SUPPORT_TARGET_ROLES = {"super_admin", "customer_support"}


async def notify_admin_support_ticket(
    *,
    ticket_id: str,
    user_name: str,
    category: str,
    subject: str,
):
    """Best-effort admin-only Expo push notification for support tickets."""
    try:
        device_tokens = await _fetch_active_tokens()
        if not device_tokens:
            return

        user_ids = list(set(t.get("user_id") for t in device_tokens if t.get("user_id")))
        if not user_ids:
            return

        admin_flags_map = await _fetch_user_profiles_batch(
            user_ids,
            "id,admin_role,admin_enabled,account_status,notification_preferences",
        )
        enriched_data = {
            "type": "admin_support_ticket",
            "ticket_id": ticket_id,
            "category": category,
            "subject": (subject or "")[:120],
        }

        title = "New Support Ticket"
        body = f"New ticket from {user_name}"

        messages: List[dict] = []
        for token_doc in device_tokens:
            token = token_doc.get("token", "")
            user_id = token_doc.get("user_id")
            platform = token_doc.get("platform", "unknown")

            if not token.startswith("ExponentPushToken") or not user_id:
                continue

            profile = admin_flags_map.get(user_id) or {}
            if str(profile.get("account_status") or "active").lower() in ("deactivated", "deleted"):
                continue

            admin_role = profile.get("admin_role")
            admin_enabled = profile.get("admin_enabled", True)
            if not admin_enabled or admin_role not in _ADMIN_SUPPORT_TARGET_ROLES:
                continue

            prefs = profile.get("notification_preferences", {}) or {}
            if prefs.get("push_enabled") is False:
                continue
            if not prefs.get("admin_support_ticket", True):
                continue

            message = {
                "to": token,
                "title": title,
                "body": body,
                "data": {**enriched_data, "title": title, "body": body},
                "sound": "default",
                "priority": "high",
                "channelId": "default",
            }
            if platform == "ios":
                message["_contentAvailable"] = True
            if platform == "android":
                message["android"] = {
                    "largeIcon": "https://hrzghlqcfccnmgcipxxo.supabase.co/storage/v1/object/public/public-assets/SwiftFX-logo.png"
                }

            messages.append(message)

        if not messages:
            logger.info(f"[AdminTicketPush] No eligible admin devices for ticket {ticket_id}")
            return

        logger.info(f"[AdminTicketPush] Sending admin ticket alert to {len(messages)} devices (ticket={ticket_id})")
        await _send_expo_push_batch(messages)
    except Exception as e:
        logger.error(f"[AdminTicketPush] notify_admin_support_ticket failed: {e}")

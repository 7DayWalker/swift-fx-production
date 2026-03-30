"""
api/routes/calendar.py — Economic calendar endpoint.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar")

# Free economic calendar data source (Fair Economy Media - Forex Factory data)
ECONOMIC_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Cache for economic events (refresh every 30 minutes)
economic_calendar_cache = {
    "data": [],
    "last_fetch": None,
    "cache_duration": timedelta(minutes=30)
}


async def fetch_economic_calendar():
    """
    Fetch live economic calendar data from free API.
    Implements caching to reduce API calls.
    """
    global economic_calendar_cache
    now = datetime.now(timezone.utc)

    # Check if cache is valid
    if (economic_calendar_cache["last_fetch"] and
        now - economic_calendar_cache["last_fetch"] < economic_calendar_cache["cache_duration"] and
        economic_calendar_cache["data"]):
        logger.info("[Calendar] Returning cached data")
        return economic_calendar_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ECONOMIC_CALENDAR_URL)
            response.raise_for_status()
            data = response.json()

            # Process and normalize the data
            events = []
            for idx, item in enumerate(data):
                event_id = f"{item.get('country', 'UNK')}_{item.get('title', 'Event').replace(' ', '_')[:20]}_{idx}"
                events.append({
                    "id": event_id,
                    "title": item.get("title", "Unknown Event"),
                    "country": item.get("country", "UNK"),
                    "date": item.get("date", ""),
                    "impact": item.get("impact", "Low"),
                    "forecast": item.get("forecast", ""),
                    "previous": item.get("previous", ""),
                })

            # Update cache
            economic_calendar_cache["data"] = events
            economic_calendar_cache["last_fetch"] = now
            logger.info(f"[Calendar] Fetched {len(events)} events from API")
            return events

    except httpx.HTTPStatusError as e:
        logger.error(f"[Calendar] HTTP error fetching calendar: {e}")
        if economic_calendar_cache["data"]:
            logger.warning("[Calendar] Returning stale cached data due to API error")
            return economic_calendar_cache["data"]
        raise HTTPException(status_code=503, detail="Economic calendar service unavailable")
    except Exception as e:
        logger.error(f"[Calendar] Error fetching calendar: {e}")
        if economic_calendar_cache["data"]:
            return economic_calendar_cache["data"]
        raise HTTPException(status_code=500, detail="Failed to fetch economic calendar")


@router.get("/events")
async def get_economic_calendar(filter: str = "week"):
    """
    Get live economic calendar events.

    Filters:
    - today: Events for today only
    - week: All events for this week (default)
    - high: Only high impact events for this week
    """
    events = await fetch_economic_calendar()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    filtered_events = []

    for event in events:
        try:
            event_date = datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
            if filter == "today":
                if today_start <= event_date < today_end:
                    filtered_events.append(event)
            elif filter == "high":
                if event["impact"].lower() == "high":
                    filtered_events.append(event)
            else:
                filtered_events.append(event)
        except (ValueError, KeyError):
            logger.warning(f"[Calendar] Skipping event with invalid date: {event.get('title', 'Unknown')}")
            continue

    filtered_events.sort(key=lambda x: x.get("date", ""))

    return {
        "events": filtered_events,
        "total": len(filtered_events),
        "filter": filter,
        "source": "Fair Economy Media",
        "disclaimer": "For educational purposes only. Not financial advice.",
        "cached": economic_calendar_cache["last_fetch"].isoformat() if economic_calendar_cache["last_fetch"] else None
    }

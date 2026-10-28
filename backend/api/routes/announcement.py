from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from core.database import db
from core.dependencies import require_admin
from models.enums import AdminRole
from models.schemas import AppAnnouncementCreate, AppAnnouncementRead
from services.admin import create_admin_notification
from services.push_notifications import send_notification

router = APIRouter(prefix="/api", tags=["announcement"])

_COLLECTION_NAME = "app_announcements"


def _collection() -> Any:
    return db[_COLLECTION_NAME]


def _normalize_announcement(document: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not document:
        return None

    normalized = dict(document)
    normalized["id"] = str(normalized.pop("_id", normalized.get("id", "")))

    created_at = normalized.get("created_at")
    if isinstance(created_at, datetime) and created_at.tzinfo is None:
        normalized["created_at"] = created_at.replace(tzinfo=timezone.utc)

    return normalized


async def _ensure_indexes() -> None:
    collection = _collection()
    await collection.create_index([("active", 1)], name="idx_app_announcements_active")
    await collection.create_index([("created_at", -1)], name="idx_app_announcements_created_at")


@router.on_event("startup")
async def ensure_announcement_indexes() -> None:
    try:
        await _ensure_indexes()
    except Exception:
        return


@router.get("/announcements/active", response_model=Optional[AppAnnouncementRead])
async def get_active_announcement() -> Optional[dict[str, Any]]:
    document = await _collection().find_one({"active": True}, sort=[("created_at", -1)])
    return _normalize_announcement(document)


# Frontend contract: fetch latest active announcement (admin namespace requires admin auth)
@router.get("/admin/app-announcements/latest-active", response_model=Optional[AppAnnouncementRead])
async def get_latest_active_announcement(
    admin_user: Any = Depends(require_admin),
) -> Optional[dict[str, Any]]:
    return await get_active_announcement()


# Frontend contract: admin publish/save drafts via same handler
@router.post("/admin/app-announcements", response_model=AppAnnouncementRead)
async def admin_publish_app_announcement(
    payload: AppAnnouncementCreate,
    admin_user: Any = Depends(require_admin),
) -> dict[str, Any]:
    return await publish_announcement(payload=payload, admin_user=admin_user)


@router.post("/admin/announcements/publish", response_model=AppAnnouncementRead)
async def publish_announcement(
    payload: AppAnnouncementCreate,
    admin_user: Any = Depends(require_admin),
) -> dict[str, Any]:
    collection = _collection()
    now = datetime.now(timezone.utc)

    # Only deactivate older active announcements when publishing an ACTIVE update.
    # If this is a draft (active=False), we must not spam/interrupt users.
    if payload.active:
        await collection.update_many({"active": True}, {"$set": {"active": False}})

    announcement = {
        "title": payload.title,
        "message": payload.message,
        "version": payload.version,
        "cta_url": payload.cta_url,
        "active": payload.active,
        "created_at": now,
    }
    result = await collection.insert_one(announcement)
    saved = await collection.find_one({"_id": result.inserted_id})
    normalized = _normalize_announcement(saved)

    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to publish announcement",
        )

    if payload.active:
        try:
            await create_admin_notification(
                [AdminRole.SUPER_ADMIN],
                "app_announcement",
                f"App announcement published: {normalized['title']}",
                normalized["message"],
                normalized["id"],
            )
        except Exception:
            pass

        try:
            await send_notification(
                title=normalized["title"],
                body=normalized["message"],
                data={
                    "type": "app_announcement",
                    "cta_url": normalized.get("cta_url"),
                    "version": normalized["version"],
                    "announcement_id": normalized["id"],
                },
                preference_key="promotions",
                check_engine_config=False,
            )
        except Exception:
            pass

    return normalized

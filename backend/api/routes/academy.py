"""
api/routes/academy.py — Academy lessons, quizzes, streak, TTS, content generation.
"""
import os
import json
import logging
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pathlib import Path

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.dependencies import get_current_user, require_auth, require_admin
from core.config import EMERGENT_LLM_KEY
from models.schemas import User
from services.subscription import get_effective_subscription
from supabase_auth import fetch_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

@router.get("/features/academy/access")
async def check_academy_access(current_user: User = Depends(require_auth)):
    """
    Guard endpoint for Academy (VIP only).
    Returns 403 if user does not have VIP subscription.
    """
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    effective_subscription = await get_effective_subscription(user_doc)
    has_access = effective_subscription == "vip"
    
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="VIP subscription required"
        )
    
    return {
        "feature": "academy",
        "has_access": True,
        "subscription": effective_subscription,
        "message": "You have full access to Academy."
    }


# ==============================================================================

# ==============================================================================

async def _get_user_capability(user_id: str) -> str:
    profile = await fetch_profile(user_id)
    role = (profile or {}).get("role", "free")
    effective = await get_effective_subscription({"id": user_id, "role": role})
    is_admin = role in ("admin", "super_admin")
    if is_admin:
        return "vip"
    return effective


async def _update_streak_and_xp(user_id: str, base_xp: int) -> dict:
    """Core streak logic. Returns streak info and total XP awarded."""
    streaks = db["academy_streaks"]
    lb = db["academy_leaderboard"]
    weekly_lb = db["academy_weekly_leaderboard"]
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")
    week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")

    doc = await streaks.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        doc = {"user_id": user_id, "current_streak": 0, "longest_streak": 0,
               "last_activity_date": None, "streak_shield_used_this_week": False,
               "shield_week_start": None}

    last_date = doc.get("last_activity_date")
    current = doc.get("current_streak", 0)
    longest = doc.get("longest_streak", 0)
    streak_increased = False
    shield_used = False
    bonus_xp = 0
    milestone_7 = False

    cap = await _get_user_capability(user_id)
    is_vip = cap == "vip"

    if last_date == today_str:
        # Already active today — no streak change, just award base XP
        pass
    else:
        yesterday = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d")
        if last_date == yesterday:
            current += 1
            streak_increased = True
        elif last_date is not None:
            # Missed at least one day — check VIP streak shield
            days_missed = (now_utc.date() - datetime.strptime(last_date, "%Y-%m-%d").date()).days
            week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")
            shield_available = (is_vip and days_missed <= 2
                                and not doc.get("streak_shield_used_this_week", False))
            if shield_available and doc.get("shield_week_start") != week_start:
                doc["streak_shield_used_this_week"] = False

            if is_vip and days_missed <= 2 and not doc.get("streak_shield_used_this_week", False):
                current += 1
                shield_used = True
                streak_increased = True
                doc["streak_shield_used_this_week"] = True
                doc["shield_week_start"] = week_start
            else:
                current = 1
                streak_increased = True
        else:
            current = 1
            streak_increased = True

        if current > longest:
            longest = current

        # Daily streak XP bonus
        bonus_xp += 10

        # 7-day milestone
        if current > 0 and current % 7 == 0:
            bonus_xp += 50
            milestone_7 = True

    total_xp = base_xp + bonus_xp

    await streaks.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id, "current_streak": current,
            "longest_streak": longest, "last_activity_date": today_str,
            "streak_shield_used_this_week": doc.get("streak_shield_used_this_week", False),
            "shield_week_start": doc.get("shield_week_start"),
        }},
        upsert=True,
    )

    # Update leaderboard
    profile = await fetch_profile(user_id)
    display_name = (profile or {}).get("name") or (profile or {}).get("email", "User")[:20]
    await lb.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "display_name": display_name},
         "$inc": {"total_xp": total_xp}},
        upsert=True,
    )

    # Weekly leaderboard aggregation (write-time incremental; no backfill)
    await weekly_lb.update_one(
        {"user_id": user_id, "week_start": week_start},
        {"$set": {"user_id": user_id, "week_start": week_start, "display_name": display_name},
         "$inc": {"total_xp": total_xp}},
        upsert=True,
    )

    return {
        "current_streak": current, "longest_streak": longest,
        "streak_increased": streak_increased, "shield_used": shield_used,
        "base_xp": base_xp, "bonus_xp": bonus_xp, "total_xp_earned": total_xp,
        "milestone_7": milestone_7, "is_vip": is_vip,
    }


@router.post("/academy/lesson-complete")
async def mark_lesson_complete(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    if not course_id or lesson_id is None:
        raise HTTPException(status_code=400, detail="course_id and lesson_id required")

    col = db["academy_progress"]
    existing = await col.find_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": lesson_id, "completed": True}
    )
    already_done = existing is not None

    await col.update_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": lesson_id},
        {"$set": {
            "user_id": current_user.user_id, "course_id": course_id,
            "lesson_id": lesson_id, "completed": True,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    base_xp = 0 if already_done else 20
    streak_info = await _update_streak_and_xp(current_user.user_id, base_xp)
    return {"success": True, "xp": streak_info}


@router.post("/academy/quiz-submit")
async def submit_quiz(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    score = body.get("score", 0)
    if not course_id:
        raise HTTPException(status_code=400, detail="course_id required")

    quiz_lesson_key = lesson_id or "quiz"
    col = db["academy_progress"]

    # Detect whether this user already has a COMPLETED+PASSED quiz for this key.
    existing = await col.find_one(
        {
            "user_id": current_user.user_id,
            "course_id": course_id,
            "lesson_id": quiz_lesson_key,
            "completed": True,
        },
        {"_id": 0},
    )
    existing_passed = (existing or {}).get("score", 0) >= 60

    # Persist attempt (even if we skip XP awarding)
    await col.update_one(
        {"user_id": current_user.user_id, "course_id": course_id, "lesson_id": quiz_lesson_key},
        {"$set": {
            "user_id": current_user.user_id, "course_id": course_id,
            "lesson_id": quiz_lesson_key, "completed": True,
            "score": score, "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    passed = score >= 60

    # XP awarding rule (anti-farming):
    # Only award XP once, on the first transition to "passed" for this quiz key.
    award_xp = passed and not existing_passed
    if not award_xp:
        streaks = db["academy_streaks"]
        streak_doc = await streaks.find_one({"user_id": current_user.user_id}, {"_id": 0})
        cap = await _get_user_capability(current_user.user_id)
        is_vip = cap == "vip"

        return {
            "success": True,
            "score": score,
            "passed": passed,
            "xp": {
                "current_streak": (streak_doc or {}).get("current_streak", 0),
                "longest_streak": (streak_doc or {}).get("longest_streak", 0),
                "streak_increased": False,
                "shield_used": False,
                "base_xp": 0,
                "bonus_xp": 0,
                "total_xp_earned": 0,
                "milestone_7": False,
                "is_vip": is_vip,
            },
        }

    # passed==True here, existing_passed==False
    base_xp = 60 if score == 100 else 40
    streak_info = await _update_streak_and_xp(current_user.user_id, base_xp)
    return {"success": True, "score": score, "passed": passed, "xp": streak_info}


@router.get("/academy/streak-status")
async def get_streak_status(current_user: User = Depends(require_auth)):
    streaks = db["academy_streaks"]
    doc = await streaks.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not doc:
        return {
            "current_streak": 0, "longest_streak": 0,
            "last_activity_date": None, "streak_at_risk": False,
            "has_streak_shield": False, "shield_available": False,
        }
    now_utc = datetime.now(timezone.utc)
    today_str = now_utc.strftime("%Y-%m-%d")
    last_date = doc.get("last_activity_date")
    active_today = last_date == today_str
    streak_at_risk = not active_today and doc.get("current_streak", 0) > 0

    cap = await _get_user_capability(current_user.user_id)
    is_vip = cap == "vip"
    week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")
    shield_available = is_vip and not (
        doc.get("streak_shield_used_this_week", False)
        and doc.get("shield_week_start") == week_start
    )

    return {
        "current_streak": doc.get("current_streak", 0),
        "longest_streak": doc.get("longest_streak", 0),
        "last_activity_date": last_date,
        "active_today": active_today,
        "streak_at_risk": streak_at_risk,
        "has_streak_shield": is_vip,
        "shield_available": shield_available,
    }


@router.get("/academy/lesson-content/{course_id}/{lesson_id}")
async def get_lesson_content(course_id: str, lesson_id: int):
    col = db["academy_lesson_content"]
    doc = await col.find_one(
        {"course_id": course_id, "lesson_id": lesson_id}, {"_id": 0}
    )
    if doc:
        return doc
    return {"course_id": course_id, "lesson_id": lesson_id, "generated": False}


@router.post("/academy/generate-content-batch")
async def generate_content_batch(current_user: User = Depends(require_auth)):
    profile = await fetch_profile(current_user.user_id)
    if not profile or profile.get("admin_role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    import asyncio
    asyncio.create_task(_run_batch_content_generation())
    return {"status": "started", "message": "Batch content generation started in background"}


async def _generate_single_lesson(course_id: str, course_title: str, lesson_id: int, lesson_title: str, tier: str) -> dict:
    """Generate enriched content for a single lesson using GPT-4o."""
    from emergentintegrations.llm.openai import LlmChat, UserMessage
    import uuid

    tier_guidance = {
        "beginner": "Write as if explaining to someone who has never traded before. Use simple language, everyday analogies, and step-by-step reasoning. Make the reader feel confident and capable of learning.",
        "intermediate": "Write with strategic depth. Assume the reader knows basic trading concepts like candlesticks, support/resistance, and risk management. Focus on edge-finding, pattern recognition, and building a systematic approach.",
        "advanced": "Write at institutional and professional level. Assume the reader is experienced with technical and fundamental analysis. Focus on advanced techniques, market microstructure, professional-grade execution, and institutional thinking."
    }

    prompt = f"""You are a professional trading mentor writing educational content for the "{course_title}" course ({tier} level).

Write a comprehensive lesson titled: "{lesson_title}"

REQUIREMENTS:
- Minimum 500 words, target 600-700 words for the overview
- Professional trading mentor tone — authoritative yet approachable
- NOT motivational quotes, NOT generic finance blog style
- Include at least one REAL trading example with specific price action scenario
- Include psychological insight on why this concept matters for traders
- {tier_guidance.get(tier, tier_guidance["beginner"])}

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "overview": "Main lesson content. 500-700 words. Include real trading examples woven naturally into the explanation. Include psychological dimension.",
  "how_to_apply": "Practical step-by-step guidance titled 'How to Apply This'. 100-150 words. Concrete, actionable steps.",
  "mini_action_task": "A specific exercise the student should complete right now. 50-80 words. Be precise about what to do.",
  "key_takeaways": ["takeaway 1", "takeaway 2", "takeaway 3", "takeaway 4"]
}}"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="You are an expert trading educator. Return only valid JSON. No markdown formatting.",
        )
        chat = chat.with_model("openai", "gpt-4o")
        response = await chat.send_message(UserMessage(text=prompt))
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
        import json as json_module
        content = json_module.loads(text)
        content["course_id"] = course_id
        content["lesson_id"] = lesson_id
        content["course_title"] = course_title
        content["lesson_title"] = lesson_title
        content["tier"] = tier
        content["generated"] = True
        content["generated_at"] = datetime.now(timezone.utc).isoformat()
        content["word_count"] = len(content.get("overview", "").split())
        return content
    except Exception as e:
        print(f"[Academy Content] Failed to generate for {course_id}/{lesson_id}: {e}")
        return None


async def _run_batch_content_generation():
    """Background task: generate content for all lessons."""
    import json as json_module
    try:
        with open("/app/backend/academy_metadata.json") as f:
            courses = json_module.load(f)
    except Exception as e:
        print(f"[Academy Content] Failed to load metadata: {e}")
        return

    col = db["academy_lesson_content"]
    total = sum(len(c["lessons"]) for c in courses)
    done = 0
    skipped = 0
    failed = 0

    print(f"[Academy Content] Starting batch generation for {total} lessons across {len(courses)} courses", flush=True)

    for course in courses:
        cid = course["course_id"]
        ctitle = course["course_title"]
        tier = course["category"]

        for lesson in course["lessons"]:
            lid = lesson["lesson_id"]
            ltitle = lesson["title"]

            try:
                existing = await col.find_one({"course_id": cid, "lesson_id": lid})
                if existing and existing.get("generated"):
                    done += 1
                    skipped += 1
                    print(f"[Academy Content] [{done}/{total}] Skipped {cid}/{lid} (already exists)", flush=True)
                    continue

                content = await _generate_single_lesson(cid, ctitle, lid, ltitle, tier)
                if content:
                    await col.update_one(
                        {"course_id": cid, "lesson_id": lid},
                        {"$set": content},
                        upsert=True,
                    )
                    done += 1
                    print(f"[Academy Content] [{done}/{total}] Generated {cid}/{lid}: {content.get('word_count', 0)} words", flush=True)
                else:
                    done += 1
                    failed += 1
                    print(f"[Academy Content] [{done}/{total}] FAILED {cid}/{lid}", flush=True)
            except Exception as e:
                done += 1
                failed += 1
                print(f"[Academy Content] [{done}/{total}] ERROR {cid}/{lid}: {e}", flush=True)

            import asyncio
            await asyncio.sleep(0.5)

    print(f"[Academy Content] Batch complete: {done} total, {skipped} skipped, {failed} failed", flush=True)


@router.get("/academy/progress")
async def get_academy_progress(current_user: User = Depends(require_auth)):
    col = db["academy_progress"]
    try:
        records = await col.find(
            {"user_id": current_user.user_id, "completed": True},
            {"_id": 0, "course_id": 1, "lesson_id": 1, "score": 1, "completed_at": 1},
        ).to_list(length=500)
    except Exception as e:
        logger.error(f"[Academy] progress query failed for {current_user.user_id}: {e}")
        records = []

    completed_lessons = len(records) if isinstance(records, list) else 0
    by_course: dict = {}
    for r in (records or []):
        cid = r.get("course_id")
        if cid:
            by_course.setdefault(cid, []).append(r.get("lesson_id"))

    total_lessons = 150

    return {
        "completed_lessons": completed_lessons,
        "total_lessons": total_lessons,
        "progress_pct": round(completed_lessons / total_lessons * 100, 1) if total_lessons > 0 else 0,
        "completed_courses": len(by_course),
        "by_course": by_course,
        "records": records if isinstance(records, list) else [],
    }


@router.get("/academy/leaderboard")
async def get_academy_leaderboard(current_user: User = Depends(require_auth)):
    weekly_lb = db["academy_weekly_leaderboard"]
    now_utc = datetime.now(timezone.utc)
    week_start = (now_utc - timedelta(days=now_utc.weekday())).strftime("%Y-%m-%d")

    top = await weekly_lb.find({"week_start": week_start}, {"_id": 0}).sort("total_xp", -1).to_list(length=50)

    # Add rank
    for i, entry in enumerate(top):
        entry["rank"] = i + 1

    # Find current user rank (within this week)
    my_entry = await weekly_lb.find_one(
        {"user_id": current_user.user_id, "week_start": week_start},
        {"_id": 0},
    )
    my_rank = None
    if my_entry:
        higher = await weekly_lb.count_documents(
            {"week_start": week_start, "total_xp": {"$gt": my_entry.get("total_xp", 0)}}
        )
        my_rank = higher + 1

    return {"leaderboard": top, "my_rank": my_rank, "my_xp": (my_entry or {}).get("total_xp", 0)}


@router.post("/academy/tts")
async def generate_academy_tts(body: dict, current_user: User = Depends(require_auth)):
    course_id = body.get("course_id")
    lesson_id = body.get("lesson_id")
    text = body.get("text", "")
    if not course_id or lesson_id is None or not text:
        raise HTTPException(status_code=400, detail="course_id, lesson_id and text required")

    profile = await fetch_profile(current_user.user_id)
    role = (profile or {}).get("role", "free")
    effective = await get_effective_subscription({"id": current_user.user_id, "role": role})
    is_admin = role in ("admin", "super_admin")
    if effective != "vip" and not is_admin:
        raise HTTPException(status_code=403, detail="VIP feature only")

    cache_col = db["academy_tts_cache"]
    cached = await cache_col.find_one(
        {"course_id": course_id, "lesson_id": lesson_id}, {"_id": 0}
    )
    if cached and cached.get("audio_base64"):
        return {"audio_base64": cached["audio_base64"], "cached": True}

    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        truncated = text[:4096]
        audio_base64 = await tts_client.generate_speech_base64(
            text=truncated, model="tts-1", voice="nova"
        )
        await cache_col.update_one(
            {"course_id": course_id, "lesson_id": lesson_id},
            {"$set": {
                "course_id": course_id, "lesson_id": lesson_id,
                "audio_base64": audio_base64,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        return {"audio_base64": audio_base64, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


# ===================== USER SUBSCRIPTION INFO ENDPOINT =====================

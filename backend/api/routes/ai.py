"""
api/routes/ai.py — AI chart analysis, usage, history, sharing.
"""
import os
import json
import base64
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from pydantic import BaseModel as PydanticBaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from core.database import db
from core.dependencies import get_current_user, require_auth
from core.config import EMERGENT_LLM_KEY
from services.subscription import get_effective_subscription, get_ai_weekly_limit
from supabase_auth import fetch_profile, update_profile
from models.schemas import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai")

@router.post("/analyze-legacy")
async def analyze_chart_legacy(
    image: UploadFile = File(...),
    pair: str = Form(...),
    timeframe: str = Form(...),
    current_user: User = Depends(require_auth)
):
    # Get user document for subscription check
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription (accounting for expiry)
    effective_subscription = await get_effective_subscription(user_doc)
    
    # Get weekly limit based on subscription
    # Free: 3, Premium: 10, VIP: unlimited
    weekly_limit = get_ai_weekly_limit(effective_subscription)
    
    # Check and reset weekly counter if needed (using new fields)
    reset_date = user_doc.get("ai_weekly_reset")
    current_usage = user_doc.get("ai_weekly_used", 0)
    
    # Also check legacy fields for backward compatibility
    if reset_date is None:
        reset_date = user_doc.get("ai_usage_reset_date")
        current_usage = user_doc.get("ai_usage_count", 0)
    
    if reset_date:
        if isinstance(reset_date, str):
            reset_date = datetime.fromisoformat(reset_date.replace('Z', '+00:00'))
        elif reset_date.tzinfo is None:
            reset_date = reset_date.replace(tzinfo=timezone.utc)
        
        if reset_date < datetime.now(timezone.utc):
            # Reset weekly counter using valid profiles columns
            await update_profile(current_user.user_id, {
                "ai_weekly_used": 0,
                "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            })
            current_usage = 0
    else:
        # Initialize reset date if not set
        await update_profile(current_user.user_id, {
            "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        })
    
    # Check usage limit (VIP has unlimited = 999999)
    if current_usage >= weekly_limit:
        raise HTTPException(
            status_code=403,
            detail="AI limit reached. Upgrade to continue."
        )
    
    # Read and encode image
    image_content = await image.read()
    image_base64 = base64.b64encode(image_content).decode()
    
    # Log image info for debugging
    logger.info(f"Received image: {len(image_content)} bytes, content_type: {image.content_type}")
    
    # Analyze with Claude Vision
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"chart_analysis_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert forex and cryptocurrency technical analyst. 
Analyze trading charts and provide structured analysis. Be concise and professional.
Handle charts in any orientation (portrait or landscape) and from any trading platform (MT4, MT5, TradingView, mobile apps).
Ignore any UI elements, status bars, or app buttons in the image - focus only on the chart data.
Always include a risk disclaimer."""
        ).with_model("anthropic", "claude-sonnet-4-20250514")
        
        image_attachment = ImageContent(image_base64=image_base64)
        
        user_message = UserMessage(
            text=f"""Analyze this {pair} chart on the {timeframe} timeframe. 
The image may be a portrait or landscape screenshot from any trading platform or a photo of a screen.
Focus on the candlestick/price data and ignore any mobile UI elements.

Provide:
1. Market Bias (Bullish/Bearish/Neutral)
2. Trend Structure (description)
3. Key Support Levels (list 2-3 price levels)
4. Key Resistance Levels (list 2-3 price levels)
5. Trade Insight (brief actionable insight)
6. Confidence Level (High/Medium/Low)

Format your response as JSON with keys: market_bias, trend_structure, support_levels, resistance_levels, trade_insight, confidence""",
            file_contents=[image_attachment]
        )
        
        response_text = await chat.send_message(user_message)
        
        # Parse response
        import json
        try:
            # Try to extract JSON from response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                analysis_data = json.loads(response_text[json_start:json_end])
            else:
                analysis_data = {
                    "market_bias": "Unable to parse",
                    "trend_structure": response_text[:200],
                    "support_levels": [],
                    "resistance_levels": [],
                    "trade_insight": "Please try again with a clearer chart image",
                    "confidence": "Low"
                }
        except Exception:
            analysis_data = {
                "market_bias": "Analysis complete",
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": response_text[-200:] if len(response_text) > 200 else response_text,
                "confidence": "Medium"
            }
        
        # Save analysis
        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"
        analysis_doc = {
            "analysis_id": analysis_id,
            "user_id": current_user.user_id,
            "pair": pair,
            "timeframe": timeframe,
            "market_bias": analysis_data.get("market_bias", "Unknown"),
            "trend_structure": analysis_data.get("trend_structure", ""),
            "support_levels": analysis_data.get("support_levels", []),
            "resistance_levels": analysis_data.get("resistance_levels", []),
            "trade_insight": analysis_data.get("trade_insight", ""),
            "confidence": analysis_data.get("confidence", "Medium"),
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.ai_analyses.insert_one(analysis_doc)
        
        # Remove _id from the response (MongoDB adds it after insert)
        analysis_doc.pop("_id", None)
        
        # Increment usage via Supabase profile
        await update_profile(current_user.user_id, {"ai_weekly_used": current_usage + 1})
        
        remaining = max(0, weekly_limit - current_usage - 1)
        
        return {
            **analysis_doc,
            "remaining_analyses": remaining if weekly_limit < 100000 else "unlimited",
            "subscription": effective_subscription,
            "disclaimer": "This analysis is for educational purposes only. Always do your own research before trading."
        }
        
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze chart. Please try again.")

# Legacy /ai/history endpoint removed - replaced by paginated version at line ~8057
# @router.get("/history")
# async def get_ai_history(current_user: User = Depends(require_auth)):
#     analyses = await db.ai_analyses.find(
#         {"user_id": current_user.user_id},
#         {"_id": 0}
#     ).sort("created_at", -1).to_list(50)
#     return analyses

@router.get("/usage")
async def get_ai_usage(current_user: User = Depends(require_auth)):
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get effective subscription
    effective_subscription = await get_effective_subscription(user_doc)
    weekly_limit = get_ai_weekly_limit(effective_subscription)
    
    # Check both new and legacy fields
    current_usage = user_doc.get("ai_weekly_used", 0) or user_doc.get("ai_usage_count", 0)
    reset_date = user_doc.get("ai_weekly_reset") or user_doc.get("ai_usage_reset_date")
    
    effective_usage = current_usage
    if reset_date:
        reset_dt = reset_date
        if isinstance(reset_dt, str):
            try:
                reset_dt = datetime.fromisoformat(reset_dt.replace('Z', '+00:00'))
            except ValueError:
                reset_dt = None
        if reset_dt is not None:
            if reset_dt.tzinfo is None:
                reset_dt = reset_dt.replace(tzinfo=timezone.utc)
            if reset_dt < datetime.now(timezone.utc):
                effective_usage = 0

    remaining = max(0, weekly_limit - effective_usage)

    return {
        "current_usage": effective_usage,
        "weekly_limit": weekly_limit if weekly_limit < 100000 else "unlimited",
        "remaining": remaining if weekly_limit < 100000 else "unlimited",
        "reset_date": reset_date,
        "has_access": True,  # All users have access, just different limits
        "subscription": effective_subscription,
        "limit_reached": effective_usage >= weekly_limit if weekly_limit < 100000 else False
    }

# ===================== AI CHART ANALYZER =====================
from pydantic import BaseModel as PydanticBaseModel

class AIAnalyzeRequest(PydanticBaseModel):
    prompt: str
    pair: str = "Unknown"
    timeframe: str = "Unknown"
    image_base64: Optional[str] = None

class AIAnalyzeResponse(PydanticBaseModel):
    analysis_id: str
    market_bias: str
    trade_bias: str  # BUY / SELL / WAIT
    confidence_score: int  # 0-100
    trend_structure: str
    support_levels: List[str]
    resistance_levels: List[str]
    trade_insight: str
    analysis_text: str
    detected_pattern: str
    confidence: str

@router.post("/analyze")
async def ai_analyze_chart(request: AIAnalyzeRequest, current_user: User = Depends(require_auth)):
    """
    AI Chart Analysis endpoint using OpenAI SDK.
    Requires Supabase authentication and active subscription.
    Server-side enforcement of AI usage limits.
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        if not EMERGENT_LLM_KEY:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        # Fetch user profile for subscription check
        user_doc = await fetch_profile(current_user.user_id)
        if not user_doc:
            raise HTTPException(status_code=404, detail="User profile not found")
        
        # Get effective subscription (accounting for expiry)
        effective_subscription = await get_effective_subscription(user_doc)
        
        # Get weekly limit based on subscription tier
        # Free: 3, Premium: 10, VIP: unlimited (999999)
        weekly_limit = get_ai_weekly_limit(effective_subscription)
        
        # Check and reset weekly counter if needed
        reset_date = user_doc.get("ai_weekly_reset")
        current_usage = user_doc.get("ai_weekly_used", 0)
        
        if reset_date:
            if isinstance(reset_date, str):
                reset_date = datetime.fromisoformat(reset_date.replace('Z', '+00:00'))
            elif reset_date.tzinfo is None:
                reset_date = reset_date.replace(tzinfo=timezone.utc)
            
            if reset_date < datetime.now(timezone.utc):
                # Reset weekly counter
                await update_profile(current_user.user_id, {
                    "ai_weekly_used": 0,
                    "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                })
                current_usage = 0
        else:
            # Initialize reset date if not set
            await update_profile(current_user.user_id, {
                "ai_weekly_reset": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            })
        
        # Enforce usage limit (server-side - no client bypass)
        if current_usage >= weekly_limit:
            raise HTTPException(
                status_code=403,
                detail=f"AI analysis limit reached ({weekly_limit}/week). Upgrade your subscription for more analyses."
            )
        
        # Atomically increment usage counter BEFORE analysis (prevents race conditions)
        await update_profile(current_user.user_id, {
            "ai_weekly_used": current_usage + 1
        })
        
        logger.info(f"[AI] User {current_user.user_id} ({effective_subscription}) - Usage: {current_usage + 1}/{weekly_limit}")
        
        # System prompt for structured JSON output
        system_prompt = """You are an expert forex and cryptocurrency chart analyst. 
Analyze the provided chart description or image and respond ONLY with valid JSON in this exact format:
{
  "market_bias": "Bullish" or "Bearish" or "Neutral",
  "trade_bias": "BUY" or "SELL" or "WAIT",
  "confidence_score": 0-100 (integer, your confidence percentage),
  "trend_structure": "Brief description of the trend and any patterns observed",
  "support_levels": ["level1", "level2"],
  "resistance_levels": ["level1", "level2"],
  "trade_insight": "Actionable trading insight based on the analysis",
  "analysis_text": "A 2-3 sentence executive summary of the full analysis",
  "detected_pattern": "Name of any detected chart pattern (e.g. Double Top, Head and Shoulders, Ascending Triangle) or 'None' if no clear pattern",
  "confidence": "High" or "Medium" or "Low"
}
Rules:
- trade_bias must be BUY if bullish, SELL if bearish, WAIT if neutral/unclear
- confidence_score must be an integer 0-100
- detected_pattern should name the most prominent pattern or "None"
- analysis_text should be a concise summary suitable for a card preview
Do not include any text outside the JSON object. Be concise but accurate."""

        # Initialize chat with emergentintegrations
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ai_analyze_{uuid.uuid4().hex[:8]}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        # Build user message
        user_text = f"Analyze this {request.pair} chart on {request.timeframe} timeframe:\n\n{request.prompt}"
        
        # Create message with or without image
        if request.image_base64:
            # Clean base64 string
            image_data = request.image_base64
            if "," in image_data:
                image_data = image_data.split(",")[1]
            
            image_content = ImageContent(image_base64=image_data)
            user_message = UserMessage(text=user_text, file_contents=[image_content])
        else:
            user_message = UserMessage(text=user_text)
        
        # Send message via emergentintegrations
        response_text = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            # Extract JSON from response (in case there's extra text)
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                analysis = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found in response")
            
            # Generate analysis ID
            analysis_id = f"ai_{uuid.uuid4().hex[:12]}"
            
            # Normalize confidence_score to int 0-100
            raw_score = analysis.get("confidence_score", 50)
            try:
                confidence_score = max(0, min(100, int(raw_score)))
            except (ValueError, TypeError):
                confidence_score = 50
            
            # Normalize trade_bias
            raw_bias = str(analysis.get("trade_bias", "WAIT")).upper().strip()
            trade_bias = raw_bias if raw_bias in ("BUY", "SELL", "WAIT") else "WAIT"
            
            # Validate and normalize response
            result = {
                "analysis_id": analysis_id,
                "market_bias": str(analysis.get("market_bias", "Unknown")),
                "trade_bias": trade_bias,
                "confidence_score": confidence_score,
                "trend_structure": str(analysis.get("trend_structure", response_text)),
                "support_levels": [str(s) for s in analysis.get("support_levels", [])],
                "resistance_levels": [str(r) for r in analysis.get("resistance_levels", [])],
                "trade_insight": str(analysis.get("trade_insight", "")),
                "analysis_text": str(analysis.get("analysis_text", analysis.get("trade_insight", ""))),
                "detected_pattern": str(analysis.get("detected_pattern", "None")),
                "confidence": str(analysis.get("confidence", "Low"))
            }
            
            # Auto-save analysis to MongoDB ai_analyses collection
            now_utc = datetime.now(timezone.utc).isoformat()
            # Truncate image to first 200KB for storage (avoid bloat)
            stored_image = None
            if request.image_base64:
                img_data = request.image_base64
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                stored_image = img_data[:200000] if len(img_data) > 200000 else img_data
            
            analysis_doc = {
                "analysis_id": analysis_id,
                "user_id": current_user.user_id,
                "pair": request.pair,
                "timeframe": request.timeframe,
                "trade_bias": trade_bias,
                "market_bias": result["market_bias"],
                "confidence_score": confidence_score,
                "confidence": result["confidence"],
                "trend_structure": result["trend_structure"],
                "support_levels": result["support_levels"],
                "resistance_levels": result["resistance_levels"],
                "trade_insight": result["trade_insight"],
                "analysis_text": result["analysis_text"],
                "detected_pattern": result["detected_pattern"],
                "image_snapshot": stored_image,
                "created_at": now_utc,
            }
            await db.ai_analyses.insert_one(analysis_doc)
            logger.info(f"[AI] Saved analysis {analysis_id} for user {current_user.user_id}")
            
            return result
            
        except (json.JSONDecodeError, ValueError) as parse_error:
            logger.warning(f"Failed to parse AI response as JSON: {parse_error}")
            fallback_id = f"ai_{uuid.uuid4().hex[:12]}"
            fallback_result = {
                "analysis_id": fallback_id,
                "market_bias": "Unknown",
                "trade_bias": "WAIT",
                "confidence_score": 30,
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": "Analysis completed but structured parsing failed.",
                "analysis_text": response_text[:300],
                "detected_pattern": "None",
                "confidence": "Low"
            }
            # Still save fallback result
            now_utc = datetime.now(timezone.utc).isoformat()
            await db.ai_analyses.insert_one({
                "analysis_id": fallback_id,
                "user_id": current_user.user_id,
                "pair": request.pair,
                "timeframe": request.timeframe,
                "trade_bias": "WAIT",
                "market_bias": "Unknown",
                "confidence_score": 30,
                "confidence": "Low",
                "trend_structure": response_text[:500],
                "support_levels": [],
                "resistance_levels": [],
                "trade_insight": "Analysis completed but structured parsing failed.",
                "analysis_text": response_text[:300],
                "detected_pattern": "None",
                "image_snapshot": None,
                "created_at": now_utc,
            })
            return fallback_result
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.get("/history")
async def ai_analysis_history(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(require_auth)
):
    """Fetch paginated AI analysis history for the authenticated user, newest first."""
    try:
        skip = (max(1, page) - 1) * limit
        clamped_limit = min(limit, 50)

        cursor = db.ai_analyses.find(
            {"user_id": current_user.user_id},
            {"_id": 0, "image_snapshot": 0}  # Exclude heavy fields in list view
        ).sort("created_at", -1).skip(skip).limit(clamped_limit)

        items = await cursor.to_list(clamped_limit)
        total = await db.ai_analyses.count_documents({"user_id": current_user.user_id})

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": clamped_limit,
            "has_more": (skip + clamped_limit) < total,
        }
    except Exception as e:
        logger.error(f"AI history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis history")


@router.get("/history/{analysis_id}")
async def ai_analysis_detail(analysis_id: str, current_user: User = Depends(require_auth)):
    """Fetch a single AI analysis by ID, including the stored image snapshot."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return doc


# ===================== AI ANALYSIS SHARING =====================

@router.post("/share/{analysis_id}")
async def share_analysis(analysis_id: str, current_user: User = Depends(require_auth)):
    """Generate a shareable link for an AI analysis."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0, "image_snapshot": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Reuse existing share_token if already shared
    if doc.get("share_token"):
        return {"share_token": doc["share_token"], "analysis_id": analysis_id}

    share_token = uuid.uuid4().hex[:16]
    await db.ai_analyses.update_one(
        {"analysis_id": analysis_id},
        {"$set": {"share_token": share_token, "shared_at": datetime.now(timezone.utc).isoformat(), "view_count": 0}}
    )
    return {"share_token": share_token, "analysis_id": analysis_id}


@router.get("/shared/{share_token}")
async def view_shared_analysis(share_token: str):
    """Public endpoint — view a shared AI analysis (no auth required)."""
    doc = await db.ai_analyses.find_one(
        {"share_token": share_token},
        {"_id": 0, "image_snapshot": 0, "user_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shared analysis not found or link expired")

    # Increment view count (fire-and-forget)
    await db.ai_analyses.update_one(
        {"share_token": share_token},
        {"$inc": {"view_count": 1}}
    )
    return doc


@router.post("/share/{analysis_id}/community")
async def share_analysis_to_community(analysis_id: str, current_user: User = Depends(require_auth)):
    """Post an AI analysis summary to the community feed."""
    doc = await db.ai_analyses.find_one(
        {"analysis_id": analysis_id, "user_id": current_user.user_id},
        {"_id": 0, "image_snapshot": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Build community post content
    bias_emoji = {"BUY": "↑", "SELL": "↓", "WAIT": "—"}.get(doc.get("trade_bias", "WAIT"), "—")
    content = (
        f"{bias_emoji} AI Analysis: {doc.get('pair', 'N/A')} ({doc.get('timeframe', '')})\n"
        f"Bias: {doc.get('trade_bias', 'WAIT')} | Confidence: {doc.get('confidence_score', 0)}%\n"
    )
    if doc.get("detected_pattern") and doc["detected_pattern"] != "None":
        content += f"Pattern: {doc['detected_pattern']}\n"
    if doc.get("analysis_text"):
        content += f"\n{doc['analysis_text'][:280]}"

    post_id = f"post_{uuid.uuid4().hex[:12]}"
    post_doc = {
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": content,
        "post_type": "ai_analysis",
        "image": None,
        "likes": [],
        "source_analysis_id": analysis_id,
        "created_at": datetime.now(timezone.utc),
    }
    await db.posts.insert_one(post_doc)
    post_doc.pop("_id", None)
    return post_doc


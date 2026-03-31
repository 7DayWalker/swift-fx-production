"""
api/routes/community.py — Community posts and comments.
"""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from core.database import db
from core.dependencies import get_current_user, require_auth
from models.schemas import User, PostCreate, CommentCreate
from models.enums import UserRole
from supabase_auth import fetch_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/community")

@router.get("/posts")
async def get_posts(current_user: Optional[User] = Depends(get_current_user)):
    posts = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return posts

@router.post("/posts")
async def create_post(
    content: str = Form(...),
    post_type: str = Form("general"),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_auth)
):
    post_id = f"post_{uuid.uuid4().hex[:12]}"
    
    # Handle image upload (only for premium/vip users)
    image_base64 = None
    if image:
        # Check if user can upload images (premium or vip only)
        if current_user.role == UserRole.FREE:
            raise HTTPException(status_code=403, detail="Image uploads require Premium or VIP subscription")
        
        # Validate file type
        allowed_types = ["image/jpeg", "image/jpg", "image/png"]
        if image.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Only JPG and PNG images are allowed")
        
        # Read and encode image
        image_data = await image.read()
        
        # Limit image size to 5MB
        if len(image_data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image size must be less than 5MB")
        
        image_base64 = base64.b64encode(image_data).decode()
    
    post_doc = {
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": content,
        "post_type": post_type,
        "image": image_base64,
        "likes": [],
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.posts.insert_one(post_doc)
    # Remove _id before returning (MongoDB adds it after insert)
    post_doc.pop("_id", None)
    return post_doc

@router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, current_user: User = Depends(require_auth)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    likes = post.get("likes", [])
    if current_user.user_id in likes:
        likes.remove(current_user.user_id)
        liked = False
    else:
        likes.append(current_user.user_id)
        liked = True
    
    await db.posts.update_one({"post_id": post_id}, {"$set": {"likes": likes}})
    
    return {"liked": liked, "likes_count": len(likes)}

@router.get("/posts/{post_id}/comments")
async def get_comments(post_id: str):
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return comments

@router.post("/posts/{post_id}/comments")
async def create_comment(post_id: str, comment_data: CommentCreate, current_user: User = Depends(require_auth)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comment_id = f"comment_{uuid.uuid4().hex[:12]}"
    comment_doc = {
        "comment_id": comment_id,
        "post_id": post_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "content": comment_data.content,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.comments.insert_one(comment_doc)
    # Remove _id before returning (MongoDB adds it after insert)
    comment_doc.pop("_id", None)
    return comment_doc


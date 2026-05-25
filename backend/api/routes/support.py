"""
api/routes/support.py — Support tickets, FAQs, admin ticket management.
"""
import logging
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from urllib.parse import quote

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.dependencies import require_auth, require_admin, get_current_user
from models.schemas import User
from services.admin import create_admin_notification, log_admin_action
from services.push_notifications import notify_admin_support_ticket
from supabase_auth import fetch_profile
from models.enums import AdminRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"

# Support Ticket Categories
class TicketCategory(str, Enum):
    BILLING = "billing"
    SIGNALS = "signals"
    FUND = "fund"
    REFERRAL = "referral"
    TECHNICAL = "technical"
    OTHER = "other"

# FAQ Categories
class FAQCategory(str, Enum):
    SUBSCRIPTION_BILLING = "subscription_billing"
    SIGNALS_TRADING = "signals_trading"
    FUND_MANAGEMENT = "fund_management"
    REFERRAL_PROGRAM = "referral_program"
    TECHNICAL_ISSUES = "technical_issues"

# Models
class SupportTicketCreate(BaseModel):
    category: TicketCategory
    subject: str
    message: str

class TicketReply(BaseModel):
    message: str

class TicketNote(BaseModel):
    note: str

class FAQCreate(BaseModel):
    category: FAQCategory
    question: str
    answer: str
    order: int = 0

class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None

# WhatsApp Support Number
SUPPORT_WHATSAPP = "+2348169427440"
SUPPORT_EMAIL = "support@swiftfx.online"

# Pre-populated FAQs
DEFAULT_FAQS = [
    # Subscription & Billing
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "What subscription plans are available?",
        "answer": "Swift FX offers three tiers: Free (limited signals), Premium (full signals access + AI analysis), and VIP (everything + priority support + fund management access). Each tier is designed to match your trading needs.",
        "order": 1
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "How do I upgrade my subscription?",
        "answer": "Go to the Subscription page from the More menu. Select your desired plan and billing cycle (weekly, monthly, or yearly). Follow the payment instructions to complete your upgrade.",
        "order": 2
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "Can I cancel my subscription anytime?",
        "answer": "Yes, you can cancel anytime. Your premium features will remain active until your current billing period ends. No partial refunds are provided for unused time.",
        "order": 3
    },
    {
        "category": FAQCategory.SUBSCRIPTION_BILLING.value,
        "question": "What payment methods are accepted?",
        "answer": "We currently accept payments via our secure payment gateway. Contact support for specific payment method inquiries in your region.",
        "order": 4
    },
    # Signals & Trading
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "How do trading signals work?",
        "answer": "Our expert analysts provide real-time trading signals with entry price, stop loss (SL), and three take profit levels (TP1, TP2, TP3). Signals cover Forex pairs, Gold, and Crypto markets. You'll receive notifications when new signals are posted.",
        "order": 1
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "What is the difference between Free and Premium signals?",
        "answer": "Free users see limited signals with delayed access. Premium and VIP members get instant access to all signals, including exclusive high-probability setups and detailed market analysis.",
        "order": 2
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "How accurate are the trading signals?",
        "answer": "Our signals are provided by experienced analysts with a strong track record. However, trading involves risk. We recommend proper risk management and never trading more than you can afford to lose.",
        "order": 3
    },
    {
        "category": FAQCategory.SIGNALS_TRADING.value,
        "question": "Can I use signals on any broker?",
        "answer": "Yes! Our signals can be used with any Forex/CFD broker. Check our Brokers section for recommended brokers that offer competitive spreads and reliable execution.",
        "order": 4
    },
    # Fund Management
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "What is Fund Management?",
        "answer": "Fund Management allows VIP members to have their capital professionally managed by our expert traders. You maintain full control of your funds in your own broker account while our team executes trades on your behalf.",
        "order": 1
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "How do I apply for Fund Management?",
        "answer": "VIP members can apply through the Fund Management section. Fill out the application form with your investment details, and our team will contact you via WhatsApp to discuss the next steps.",
        "order": 2
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "What is the minimum investment amount?",
        "answer": "The minimum investment varies based on your goals and our current capacity. Contact our team through the Fund Management application for current requirements.",
        "order": 3
    },
    {
        "category": FAQCategory.FUND_MANAGEMENT.value,
        "question": "How do I withdraw from my managed fund?",
        "answer": "Withdrawals can be requested through the Investor Dashboard. Submit a withdrawal request, and our team will process it within 2-5 business days after verification.",
        "order": 4
    },
    # Referral Program
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "How does the referral program work?",
        "answer": "Share your unique referral code with friends. When they sign up and subscribe, you earn rewards! Premium referrals earn you 7 extra days, and VIP referrals earn you 14 extra days of premium access.",
        "order": 1
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "Where do I find my referral code?",
        "answer": "Go to the Referral Program page from the More menu. Your unique referral code and shareable link are displayed there, along with easy share buttons for WhatsApp and other platforms.",
        "order": 2
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "When do I receive my referral rewards?",
        "answer": "Referral rewards are unlocked 7 days after your referred friend subscribes to a paid plan. This ensures legitimate referrals and prevents abuse.",
        "order": 3
    },
    {
        "category": FAQCategory.REFERRAL_PROGRAM.value,
        "question": "Is there a limit to how many people I can refer?",
        "answer": "No limit! Refer as many friends as you want. The more successful referrals, the more free premium days you earn.",
        "order": 4
    },
    # Technical Issues
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "The app is not loading properly. What should I do?",
        "answer": "Try these steps: 1) Close and reopen the app, 2) Check your internet connection, 3) Clear the app cache in settings, 4) Update to the latest version. If issues persist, contact support.",
        "order": 1
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "I'm not receiving notifications for new signals.",
        "answer": "Ensure notifications are enabled: 1) Check app notification settings, 2) Check your device notification permissions for Swift FX, 3) Make sure 'Do Not Disturb' mode is off.",
        "order": 2
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "I forgot my password. How do I reset it?",
        "answer": "On the login screen, tap 'Forgot Password' and enter your email. You'll receive a reset link. If you don't receive it, check your spam folder or contact support.",
        "order": 3
    },
    {
        "category": FAQCategory.TECHNICAL_ISSUES.value,
        "question": "How do I update my profile information?",
        "answer": "Go to Settings from the More menu. You can update your name, profile picture, and notification preferences. Email changes require verification for security.",
        "order": 4
    },
]

# Initialize FAQs on startup
async def initialize_faqs():
    """Populate default FAQs if none exist"""
    faq_count = await db.faqs.count_documents({})
    if faq_count == 0:
        for faq in DEFAULT_FAQS:
            faq["faq_id"] = f"faq_{uuid.uuid4().hex[:12]}"
            faq["is_active"] = True
            faq["created_at"] = datetime.now(timezone.utc).isoformat()
            faq["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.faqs.insert_many(DEFAULT_FAQS)
        logger.info(f"[FAQs] Initialized {len(DEFAULT_FAQS)} default FAQs")

# ==================== USER SUPPORT ENDPOINTS ====================

@router.get("/support/faqs")
async def get_faqs(category: Optional[str] = None):
    """Get all active FAQs, optionally filtered by category"""
    query = {"is_active": True}
    if category:
        query["category"] = category
    
    faqs = await db.faqs.find(query).sort("order", 1).to_list(100)
    
    # Group by category
    grouped = {}
    for faq in faqs:
        faq["_id"] = str(faq["_id"])
        cat = faq["category"]
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(faq)
    
    return {
        "faqs": faqs,
        "grouped": grouped,
        "categories": [
            {"id": FAQCategory.SUBSCRIPTION_BILLING.value, "name": "Subscription & Billing"},
            {"id": FAQCategory.SIGNALS_TRADING.value, "name": "Signals & Trading"},
            {"id": FAQCategory.FUND_MANAGEMENT.value, "name": "Fund Management"},
            {"id": FAQCategory.REFERRAL_PROGRAM.value, "name": "Referral Program"},
            {"id": FAQCategory.TECHNICAL_ISSUES.value, "name": "Technical Issues"},
        ]
    }

@router.post("/support/tickets")
async def create_support_ticket(
    ticket: SupportTicketCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new support ticket"""
    ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"
    
    ticket_doc = {
        "ticket_id": ticket_id,
        "user_id": current_user.user_id,
        "user_name": current_user.name,
        "user_email": current_user.email,
        "category": ticket.category.value,
        "subject": ticket.subject,
        "message": ticket.message,
        "status": TicketStatus.OPEN.value,
        "replies": [],
        "admin_notes": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "closed_at": None,
    }
    
    await db.support_tickets.insert_one(ticket_doc)
    
    # Create notification for Customer Support and Super Admin
    await create_admin_notification(
        target_roles=[AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT],
        notification_type="new_support_ticket",
        title="New Support Ticket",
        message=f"New ticket from {current_user.name}: {ticket.subject}",
        resource_id=ticket_id
    )

    # Best-effort real-time admin push (never block ticket creation).
    # If push fails, in-app admin_notifications still exist.
    asyncio.create_task(
        notify_admin_support_ticket(
            ticket_id=ticket_id,
            user_name=current_user.name,
            category=ticket.category.value,
            subject=ticket.subject,
        )
    )

    logger.info(f"[Support] New ticket {ticket_id} from user {current_user.user_id}")
    
    return {
        "success": True,
        "ticket_id": ticket_id,
        "message": "Support ticket created successfully. Our team will respond shortly.",
        "status": TicketStatus.OPEN.value
    }

@router.get("/support/tickets")
async def get_user_tickets(current_user: User = Depends(get_current_user)):
    """Get all support tickets for the current user"""
    tickets = await db.support_tickets.find(
        {"user_id": current_user.user_id}
    ).sort("created_at", -1).to_list(50)
    
    for ticket in tickets:
        ticket["_id"] = str(ticket["_id"])
        # Remove admin notes from user view
        ticket.pop("admin_notes", None)
    
    return {"tickets": tickets}

@router.get("/support/tickets/{ticket_id}")
async def get_ticket_details(
    ticket_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific support ticket"""
    ticket = await db.support_tickets.find_one({
        "ticket_id": ticket_id,
        "user_id": current_user.user_id
    })
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    ticket["_id"] = str(ticket["_id"])
    # Remove admin notes from user view
    ticket.pop("admin_notes", None)
    
    return {"ticket": ticket}

@router.get("/support/info")
async def get_support_info(current_user: Optional[User] = Depends(get_current_user)):
    """Get support contact information"""
    user_email = current_user.email if current_user else "user"
    whatsapp_message = f"Hello Swift FX Support, I need help with an issue. My email is {user_email}."
    whatsapp_url = f"https://wa.me/{SUPPORT_WHATSAPP.replace('+', '')}?text={quote(whatsapp_message)}"
    
    return {
        "whatsapp_number": SUPPORT_WHATSAPP,
        "whatsapp_url": whatsapp_url,
        "email": SUPPORT_EMAIL,
        "email_subject": f"Support Request - {user_email}"
    }

# ==================== ADMIN SUPPORT ENDPOINTS ====================

@router.get("/admin/support/tickets")
async def admin_get_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all support tickets. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to view support tickets")
    
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    
    tickets = await db.support_tickets.find(query).sort("created_at", -1).to_list(100)
    
    for ticket in tickets:
        ticket["_id"] = str(ticket["_id"])
    
    # Get stats
    stats = {
        "total": await db.support_tickets.count_documents({}),
        "open": await db.support_tickets.count_documents({"status": TicketStatus.OPEN.value}),
        "in_progress": await db.support_tickets.count_documents({"status": TicketStatus.IN_PROGRESS.value}),
        "resolved": await db.support_tickets.count_documents({"status": TicketStatus.RESOLVED.value}),
        "closed": await db.support_tickets.count_documents({"status": TicketStatus.CLOSED.value}),
    }
    
    return {"tickets": tickets, "stats": stats}

@router.get("/admin/support/tickets/{ticket_id}")
async def admin_get_ticket_details(
    ticket_id: str,
    admin: User = Depends(require_admin)
):
    """Get detailed view of a support ticket. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to view support tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    ticket["_id"] = str(ticket["_id"])
    
    # Get user details
    user = await fetch_profile(ticket["user_id"])
    user_info = {
        "name": user.get("name", "Unknown") if user else "Unknown",
        "email": user.get("email", "Unknown") if user else "Unknown",
        "subscription": user.get("subscription", "free") if user else "free",
        "created_at": user.get("created_at") if user else None,
    }
    
    return {"ticket": ticket, "user_info": user_info}

@router.put("/admin/support/tickets/{ticket_id}/status")
async def admin_update_ticket_status(
    ticket_id: str,
    new_status: TicketStatus,
    admin: User = Depends(require_admin)
):
    """Update ticket status. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to update tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    old_status = ticket["status"]
    
    update_data = {
        "status": new_status.value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if new_status == TicketStatus.RESOLVED:
        update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == TicketStatus.CLOSED:
        update_data["closed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": update_data}
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "update_status",
        "support_ticket",
        ticket_id,
        {"old_status": old_status, "new_status": new_status.value}
    )
    
    # Create user notification for status change
    # (In a real app, you'd send push notification here)
    logger.info(f"[Support] Ticket {ticket_id} status changed: {old_status} -> {new_status.value}")
    
    return {
        "success": True,
        "message": f"Ticket status updated to {new_status.value}",
        "ticket_id": ticket_id,
        "new_status": new_status.value
    }

@router.post("/admin/support/tickets/{ticket_id}/note")
async def admin_add_note(
    ticket_id: str,
    note: TicketNote,
    admin: User = Depends(require_admin)
):
    """Add internal admin note to ticket. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to add notes")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    note_entry = {
        "note_id": f"note_{uuid.uuid4().hex[:8]}",
        "admin_id": admin.user_id,
        "admin_name": admin.name,
        "admin_role": admin.admin_role.value if admin.admin_role else "admin",
        "note": note.note,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {
            "$push": {"admin_notes": note_entry},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "add_note",
        "support_ticket",
        ticket_id,
        {"note_preview": note.note[:50] + "..." if len(note.note) > 50 else note.note}
    )
    
    return {"success": True, "message": "Note added successfully", "note_id": note_entry["note_id"]}

@router.post("/admin/support/tickets/{ticket_id}/reply")
async def admin_add_reply(
    ticket_id: str,
    reply: TicketReply,
    admin: User = Depends(require_admin)
):
    """Add reply to ticket (visible to user). Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to reply to tickets")
    
    ticket = await db.support_tickets.find_one({"ticket_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    reply_entry = {
        "reply_id": f"reply_{uuid.uuid4().hex[:8]}",
        "admin_id": admin.user_id,
        "admin_name": admin.name,
        "message": reply.message,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Auto-update status to in_progress if currently open
    update_data = {
        "$push": {"replies": reply_entry},
        "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
    }
    
    if ticket["status"] == TicketStatus.OPEN.value:
        update_data["$set"]["status"] = TicketStatus.IN_PROGRESS.value
    
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        update_data
    )
    
    # Log admin action
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value if admin.admin_role else "admin",
        "add_reply",
        "support_ticket",
        ticket_id,
        {"reply_preview": reply.message[:50] + "..." if len(reply.message) > 50 else reply.message}
    )
    
    logger.info(f"[Support] Admin {admin.user_id} replied to ticket {ticket_id}")
    
    return {"success": True, "message": "Reply added successfully", "reply_id": reply_entry["reply_id"]}

# ==================== ADMIN FAQ MANAGEMENT ====================

@router.get("/admin/faqs")
async def admin_get_faqs(admin: User = Depends(require_admin)):
    """Get all FAQs including inactive ones. Super Admin, Customer Support only."""
    allowed_roles = [AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]
    if admin.admin_role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to manage FAQs")
    
    faqs = await db.faqs.find({}).sort([("category", 1), ("order", 1)]).to_list(100)
    for faq in faqs:
        faq["_id"] = str(faq["_id"])
    
    return {"faqs": faqs}

@router.post("/admin/faqs")
async def admin_create_faq(
    faq: FAQCreate,
    admin: User = Depends(require_admin)
):
    """Create a new FAQ. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can create FAQs")
    
    faq_id = f"faq_{uuid.uuid4().hex[:12]}"
    faq_doc = {
        "faq_id": faq_id,
        "category": faq.category.value,
        "question": faq.question,
        "answer": faq.answer,
        "order": faq.order,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.faqs.insert_one(faq_doc)
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "create",
        "faq",
        faq_id,
        {"question": faq.question[:50]}
    )
    
    return {"success": True, "faq_id": faq_id, "message": "FAQ created successfully"}

@router.put("/admin/faqs/{faq_id}")
async def admin_update_faq(
    faq_id: str,
    update: FAQUpdate,
    admin: User = Depends(require_admin)
):
    """Update an FAQ. Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update FAQs")
    
    faq = await db.faqs.find_one({"faq_id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if update.question is not None:
        update_data["question"] = update.question
    if update.answer is not None:
        update_data["answer"] = update.answer
    if update.order is not None:
        update_data["order"] = update.order
    if update.is_active is not None:
        update_data["is_active"] = update.is_active
    
    await db.faqs.update_one({"faq_id": faq_id}, {"$set": update_data})
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "update",
        "faq",
        faq_id,
        {"fields_updated": list(update_data.keys())}
    )
    
    return {"success": True, "message": "FAQ updated successfully"}

@router.delete("/admin/faqs/{faq_id}")
async def admin_delete_faq(
    faq_id: str,
    admin: User = Depends(require_admin)
):
    """Delete an FAQ (soft delete - sets is_active=False). Super Admin only."""
    if admin.admin_role != AdminRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete FAQs")
    
    faq = await db.faqs.find_one({"faq_id": faq_id})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    
    # Soft delete - just deactivate
    await db.faqs.update_one(
        {"faq_id": faq_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_admin_action(
        admin.user_id,
        admin.admin_role.value,
        "delete",
        "faq",
        faq_id,
        {"soft_delete": True}
    )
    
    return {"success": True, "message": "FAQ deleted successfully"}


# ==============================================================================

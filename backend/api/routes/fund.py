"""
api/routes/fund.py — Fund applications, investor dashboard, admin fund management.
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from enum import Enum
from urllib.parse import quote

from pydantic import BaseModel, Field, EmailStr
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.dependencies import require_auth, require_admin
from models.schemas import (
    User, FundApplicationCreate, InvestorPortfolioUpdate,
    WithdrawalRequest, FundPerformanceEntry, FundNoticeCreate,
)
from models.enums import FundApplicationStatus, InvestorAccountStatus, WithdrawalStatus, AdminRole
from services.subscription import get_effective_subscription
from services.auth import has_permission
from services.admin import log_admin_action, create_admin_notification
from supabase_auth import fetch_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

@router.get("/features/fund-management/access")
async def check_fund_management_access(current_user: User = Depends(require_auth)):
    """
    Guard endpoint for Fund Management (VIP only).
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
        "feature": "fund_management",
        "has_access": True,
        "subscription": effective_subscription,
        "message": "You have full access to Fund Management."
    }



@router.post("/fund/apply")
async def submit_fund_application(
    application: FundApplicationCreate,
    current_user: User = Depends(require_auth)
):
    """
    Submit a fund management application.
    Requires Premium or VIP subscription.
    """
    # Get user document for subscription check
    user_doc = await fetch_profile(current_user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check subscription level
    user_subscription = await get_effective_subscription(user_doc)
    if user_subscription not in ["premium", "vip"]:
        raise HTTPException(
            status_code=403, 
            detail="Fund Management applications require Premium or VIP subscription"
        )
    
    # Validate risk agreement
    if not application.risk_agreement:
        raise HTTPException(
            status_code=400,
            detail="You must agree to the risk disclaimer to submit an application"
        )
    
    # Check if user already has a pending/contacted application for this tier
    # User cannot resubmit same tier while status ≠ Rejected
    existing = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "investment_tier": application.investment_tier.value,
        "status": {"$in": ["pending_review", "contacted", "approved"]}
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"You already have an active application for the {application.investment_tier.value} tier. Status: {existing['status']}"
        )
    
    # Create application
    application_id = f"fund_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    application_doc = {
        "application_id": application_id,
        "user_id": current_user.user_id,
        "full_name": application.full_name,
        "email": application.email,
        "phone": application.phone,
        "country": application.country,
        "investment_tier": application.investment_tier.value,
        "intended_amount": application.intended_amount,
        "trading_experience": application.trading_experience.value,
        "risk_agreement": application.risk_agreement,
        "source": application.source,
        "status": FundApplicationStatus.PENDING_REVIEW.value,
        "admin_notes": None,
        "created_at": now.isoformat(),
        "updated_at": None,
    }
    
    await db.fund_applications.insert_one(application_doc)
    logger.info(f"[Fund] New application {application_id} from user {current_user.user_id}")
    
    return {
        "success": True,
        "application_id": application_id,
        "message": "Application received. Our team will contact you within 48 hours.",
        "status": "pending_review"
    }


@router.get("/fund/my-application")
async def get_my_fund_application(current_user: User = Depends(require_auth)):
    """Get the current user's fund management application status."""
    application = await db.fund_applications.find_one(
        {"user_id": current_user.user_id},
        sort=[("created_at", -1)]  # Get most recent
    )
    
    if not application:
        return {"has_application": False, "application": None}
    
    return {
        "has_application": True,
        "application_id": application["application_id"],
        "status": application["status"],
        "investment_tier": application["investment_tier"],
        "intended_amount": application["intended_amount"],
        "created_at": application["created_at"],
    }


@router.get("/admin/fund/applications")
async def get_all_fund_applications(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all fund management applications. Admin only."""
    # Check permission: fund_admin, account_manager, customer_support can read; signal_admin cannot
    if not has_permission(admin, "fund_applications", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view fund applications")
    
    query = {}
    if status:
        query["status"] = status
    
    applications = await db.fund_applications.find(query).sort("created_at", -1).to_list(100)
    
    # Remove MongoDB _id field
    for app in applications:
        app.pop("_id", None)
    
    return {"applications": applications, "total": len(applications)}


@router.put("/admin/fund/applications/{application_id}")
async def update_fund_application(
    application_id: str,
    status: str,
    admin_notes: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Update fund application status. Admin only."""
    # Check permission: only fund_admin and super_admin can update
    if not has_permission(admin, "fund_applications", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update fund applications")
    
    # Validate status
    valid_statuses = ["pending_review", "contacted", "approved", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    # Find application
    application = await db.fund_applications.find_one({"application_id": application_id})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    
    # Update application
    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if admin_notes is not None:
        update_data["admin_notes"] = admin_notes
    
    await db.fund_applications.update_one(
        {"application_id": application_id},
        {"$set": update_data}
    )
    
    # When approved, auto-create investor portfolio if it doesn't exist yet
    if status == "approved":
        existing_portfolio = await db.investor_portfolios.find_one({
            "user_id": application["user_id"]
        })
        if not existing_portfolio:
            portfolio_id = f"portfolio_{uuid.uuid4().hex[:12]}"
            now = datetime.now(timezone.utc)
            portfolio = {
                "portfolio_id": portfolio_id,
                "user_id": application["user_id"],
                "application_id": application["application_id"],
                "full_name": application.get("full_name", ""),
                "email": application.get("email", ""),
                "invested_capital": application.get("intended_amount", 0),
                "current_equity": application.get("intended_amount", 0),
                "total_return_pct": 0.0,
                "investment_tier": application.get("investment_tier", "standard"),
                "performance_fee": 20.0,
                "lockup_months": 3,
                "account_status": "active",
                "start_date": now.isoformat(),
                "created_at": now.isoformat(),
                "updated_at": None,
            }
            await db.investor_portfolios.insert_one(portfolio)
            logger.info(f"[Fund] Auto-created portfolio {portfolio_id} for user {application['user_id']} on approval")
    
    logger.info(f"[Fund] Admin {admin.user_id} updated application {application_id} to {status}")
    
    return {
        "success": True,
        "application_id": application_id,
        "new_status": status,
        "message": f"Application {status}"
    }


# ==============================================================================
# INVESTOR DASHBOARD ENDPOINTS
# ==============================================================================

ADMIN_WHATSAPP_PHONE = "2348169427440"

@router.get("/investor/status")
async def get_investor_status(current_user: User = Depends(require_auth)):
    """Check if user is an approved investor."""
    # Check for approved fund application
    approved_app = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "status": "approved"
    })
    
    if not approved_app:
        return {
            "is_investor": False,
            "message": "No approved fund application found"
        }
    
    # Check for investor portfolio
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    return {
        "is_investor": True,
        "application_id": approved_app["application_id"],
        "has_portfolio": portfolio is not None,
        "portfolio_id": portfolio["portfolio_id"] if portfolio else None
    }


@router.get("/investor/dashboard")
async def get_investor_dashboard(current_user: User = Depends(require_auth)):
    """Get investor dashboard data. Only for approved investors."""
    # Check for approved fund application
    approved_app = await db.fund_applications.find_one({
        "user_id": current_user.user_id,
        "status": "approved"
    })
    
    if not approved_app:
        raise HTTPException(
            status_code=403,
            detail="Access denied. You must have an approved fund application to view the investor dashboard."
        )
    
    # Get or create investor portfolio
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    if not portfolio:
        # Auto-create portfolio from approved application
        portfolio_id = f"portfolio_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        
        portfolio = {
            "portfolio_id": portfolio_id,
            "user_id": current_user.user_id,
            "application_id": approved_app["application_id"],
            "full_name": approved_app["full_name"],
            "email": approved_app["email"],
            "invested_capital": approved_app["intended_amount"],
            "current_equity": approved_app["intended_amount"],
            "total_return_pct": 0.0,
            "investment_tier": approved_app["investment_tier"],
            "performance_fee": 20.0,
            "lockup_months": 3,
            "account_status": "active",
            "start_date": now.isoformat(),
            "created_at": now.isoformat(),
            "updated_at": None
        }
        
        await db.investor_portfolios.insert_one(portfolio)
        logger.info(f"[Investor] Auto-created portfolio {portfolio_id} for user {current_user.user_id}")
    
    portfolio.pop("_id", None)
    
    # Calculate total return percentage
    if portfolio["invested_capital"] > 0:
        portfolio["total_return_pct"] = round(
            ((portfolio["current_equity"] - portfolio["invested_capital"]) / portfolio["invested_capital"]) * 100,
            2
        )
    
    # Get performance history
    performance = await db.fund_performance.find({
        "portfolio_id": portfolio["portfolio_id"]
    }).sort("month", -1).to_list(12)
    
    for p in performance:
        p.pop("_id", None)
    
    # Get withdrawal history
    withdrawals = await db.withdrawal_requests.find({
        "user_id": current_user.user_id
    }).sort("created_at", -1).to_list(20)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    # Get fund notices
    notices = await db.fund_notices.find({}).sort("created_at", -1).to_list(10)
    
    for n in notices:
        n.pop("_id", None)
    
    return {
        "portfolio": portfolio,
        "performance_history": performance,
        "withdrawals": withdrawals,
        "notices": notices
    }


@router.post("/investor/withdraw")
async def request_withdrawal(
    request: WithdrawalRequest,
    current_user: User = Depends(require_auth)
):
    """Request a withdrawal. Triggers WhatsApp notification to admin."""
    # Check for approved investor
    portfolio = await db.investor_portfolios.find_one({
        "user_id": current_user.user_id
    })
    
    if not portfolio:
        raise HTTPException(
            status_code=403,
            detail="You must be an approved investor to request withdrawals"
        )
    
    if portfolio["account_status"] != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Your account is currently {portfolio['account_status']}. Cannot process withdrawals."
        )
    
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be positive")
    
    if request.amount > portfolio["current_equity"]:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient equity. Your current equity is ${portfolio['current_equity']:,.2f}"
        )
    
    # Check for pending withdrawals
    pending = await db.withdrawal_requests.find_one({
        "user_id": current_user.user_id,
        "status": "pending"
    })
    
    if pending:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending withdrawal request"
        )
    
    # Create withdrawal request
    withdrawal_id = f"withdraw_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    withdrawal_doc = {
        "withdrawal_id": withdrawal_id,
        "user_id": current_user.user_id,
        "portfolio_id": portfolio["portfolio_id"],
        "full_name": portfolio["full_name"],
        "email": portfolio["email"],
        "amount": request.amount,
        "notes": request.notes,
        "status": "pending",
        "admin_notes": None,
        "created_at": now.isoformat(),
        "processed_at": None
    }
    
    await db.withdrawal_requests.insert_one(withdrawal_doc)
    logger.info(f"[Investor] Withdrawal request {withdrawal_id} from user {current_user.user_id} for ${request.amount}")
    
    # Generate WhatsApp notification URL for admin
    whatsapp_message = f"🔔 WITHDRAWAL REQUEST\n\nInvestor: {portfolio['full_name']}\nAmount: ${request.amount:,.2f}\nPortfolio: {portfolio['portfolio_id']}\nRequest ID: {withdrawal_id}\n\nPlease review in Admin Dashboard."
    whatsapp_url = f"https://wa.me/{ADMIN_WHATSAPP_PHONE}?text={quote(whatsapp_message)}"
    
    return {
        "success": True,
        "withdrawal_id": withdrawal_id,
        "amount": request.amount,
        "status": "pending",
        "message": "Withdrawal request submitted. Admin will review within 24-48 hours.",
        "whatsapp_notify_url": whatsapp_url
    }


@router.get("/investor/withdrawals")
async def get_withdrawal_history(current_user: User = Depends(require_auth)):
    """Get user's withdrawal history."""
    withdrawals = await db.withdrawal_requests.find({
        "user_id": current_user.user_id
    }).sort("created_at", -1).to_list(50)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {"withdrawals": withdrawals, "total": len(withdrawals)}


# ==============================================================================
# ADMIN - INVESTOR MANAGEMENT ENDPOINTS
# ==============================================================================

@router.get("/admin/investor/portfolios")
async def get_all_investor_portfolios(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all investor portfolios. Admin only."""
    if not has_permission(admin, "investor_portfolios", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view investor portfolios")
    query = {}
    if status:
        query["account_status"] = status
    
    portfolios = await db.investor_portfolios.find(query).sort("created_at", -1).to_list(100)
    
    for p in portfolios:
        p.pop("_id", None)
        # Calculate return percentage
        if p["invested_capital"] > 0:
            p["total_return_pct"] = round(
                ((p["current_equity"] - p["invested_capital"]) / p["invested_capital"]) * 100,
                2
            )
    
    return {"portfolios": portfolios, "total": len(portfolios)}


@router.get("/admin/investor/portfolio/{portfolio_id}")
async def get_investor_portfolio_detail(
    portfolio_id: str,
    admin: User = Depends(require_admin)
):
    """Get detailed investor portfolio. Admin only."""
    if not has_permission(admin, "investor_portfolios", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view investor portfolios")
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    portfolio.pop("_id", None)
    
    # Get performance history
    performance = await db.fund_performance.find({
        "portfolio_id": portfolio_id
    }).sort("month", -1).to_list(24)
    
    for p in performance:
        p.pop("_id", None)
    
    # Get withdrawal history
    withdrawals = await db.withdrawal_requests.find({
        "portfolio_id": portfolio_id
    }).sort("created_at", -1).to_list(50)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {
        "portfolio": portfolio,
        "performance_history": performance,
        "withdrawals": withdrawals
    }


@router.put("/admin/investor/portfolio/{portfolio_id}")
async def update_investor_portfolio(
    portfolio_id: str,
    update: InvestorPortfolioUpdate,
    admin: User = Depends(require_admin)
):
    """Update investor portfolio. Admin only."""
    if not has_permission(admin, "investor_portfolios", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update investor portfolios")
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if update.invested_capital is not None:
        update_data["invested_capital"] = update.invested_capital
    if update.current_equity is not None:
        update_data["current_equity"] = update.current_equity
    if update.account_status is not None:
        update_data["account_status"] = update.account_status.value
    if update.performance_fee is not None:
        update_data["performance_fee"] = update.performance_fee
    if update.lockup_months is not None:
        update_data["lockup_months"] = update.lockup_months
    
    await db.investor_portfolios.update_one(
        {"portfolio_id": portfolio_id},
        {"$set": update_data}
    )
    
    logger.info(f"[Investor] Admin {admin.user_id} updated portfolio {portfolio_id}")
    
    return {"success": True, "message": "Portfolio updated successfully"}


@router.post("/admin/investor/portfolio/{portfolio_id}/performance")
async def add_performance_entry(
    portfolio_id: str,
    entry: FundPerformanceEntry,
    admin: User = Depends(require_admin)
):
    """Add monthly performance entry for an investor. Admin only."""
    if not has_permission(admin, "investor_portfolios", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to update investor portfolios")
    portfolio = await db.investor_portfolios.find_one({"portfolio_id": portfolio_id})
    
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    # Check for existing entry for this month
    existing = await db.fund_performance.find_one({
        "portfolio_id": portfolio_id,
        "month": entry.month
    })
    
    if existing:
        now_iso = datetime.now(timezone.utc).isoformat()
        eq_before = existing.get("equity_before", portfolio["current_equity"])
        recalculated_equity = eq_before * (1 + entry.return_percentage / 100)
        await db.fund_performance.update_one(
            {"portfolio_id": portfolio_id, "month": entry.month},
            {"$set": {
                "return_percentage": entry.return_percentage,
                "equity_after": recalculated_equity,
                "notes": entry.notes,
                "updated_at": now_iso,
            }}
        )
        await db.investor_portfolios.update_one(
            {"portfolio_id": portfolio_id},
            {"$set": {"current_equity": recalculated_equity, "updated_at": now_iso}}
        )
        logger.info(f"[Investor] Admin updated performance for {portfolio_id} month {entry.month}")
        return {"success": True, "message": f"Performance updated for {entry.month}", "new_equity": recalculated_equity}
    
    # Create new entry
    performance_id = f"perf_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    # Calculate new equity based on return
    new_equity = portfolio["current_equity"] * (1 + entry.return_percentage / 100)
    
    performance_doc = {
        "performance_id": performance_id,
        "portfolio_id": portfolio_id,
        "user_id": portfolio["user_id"],
        "month": entry.month,
        "return_percentage": entry.return_percentage,
        "equity_before": portfolio["current_equity"],
        "equity_after": new_equity,
        "notes": entry.notes,
        "created_at": now.isoformat(),
        "updated_at": None
    }
    
    await db.fund_performance.insert_one(performance_doc)
    
    # Update portfolio equity
    await db.investor_portfolios.update_one(
        {"portfolio_id": portfolio_id},
        {"$set": {
            "current_equity": new_equity,
            "updated_at": now.isoformat()
        }}
    )
    
    logger.info(f"[Investor] Admin added performance for {portfolio_id} month {entry.month}: {entry.return_percentage}%")
    
    return {
        "success": True,
        "message": f"Performance entry added for {entry.month}",
        "new_equity": new_equity
    }


@router.get("/admin/investor/withdrawals")
async def get_all_withdrawal_requests(
    status: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Get all withdrawal requests. Admin only."""
    if not has_permission(admin, "withdrawals", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view withdrawal requests")
    query = {}
    if status:
        query["status"] = status
    
    withdrawals = await db.withdrawal_requests.find(query).sort("created_at", -1).to_list(100)
    
    for w in withdrawals:
        w.pop("_id", None)
    
    return {"withdrawals": withdrawals, "total": len(withdrawals)}


@router.put("/admin/investor/withdrawal/{withdrawal_id}")
async def process_withdrawal(
    withdrawal_id: str,
    status: str,
    admin_notes: Optional[str] = None,
    admin: User = Depends(require_admin)
):
    """Process a withdrawal request idempotently. Admin only."""
    if not has_permission(admin, "withdrawals", "update"):
        raise HTTPException(status_code=403, detail="You don't have permission to process withdrawal requests")
    valid_statuses = ["approved", "paid", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    withdrawal = await db.withdrawal_requests.find_one({"withdrawal_id": withdrawal_id})
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")
    
    previous_status = withdrawal.get("status")
    now = datetime.now(timezone.utc)
    
    update_data = {
        "status": status,
        "admin_notes": admin_notes,
        "processed_at": now.isoformat()
    }
    
    transition = await db.withdrawal_requests.update_one(
        {"withdrawal_id": withdrawal_id, "status": previous_status},
        {"$set": update_data}
    )
    
    # Deduct from portfolio equity ONLY on the first transition into 'paid'
    if status == "paid" and previous_status != "paid" and transition.modified_count > 0:
        await db.investor_portfolios.update_one(
            {"portfolio_id": withdrawal["portfolio_id"]},
            {"$inc": {"current_equity": -withdrawal["amount"]}}
        )
        logger.info(f"[Investor] Deducted ${withdrawal['amount']} from portfolio {withdrawal['portfolio_id']}")
    
    logger.info(f"[Investor] Admin {admin.user_id} {status} withdrawal {withdrawal_id}")
    
    return {"success": True, "message": f"Withdrawal {status}"}


@router.get("/admin/investor/notices")
async def get_all_notices(admin: User = Depends(require_admin)):
    """Get all fund notices. Admin only."""
    if not has_permission(admin, "notices", "read"):
        raise HTTPException(status_code=403, detail="You don't have permission to view notices")
    notices = await db.fund_notices.find({}).sort("created_at", -1).to_list(50)
    
    for n in notices:
        n.pop("_id", None)
    
    return {"notices": notices, "total": len(notices)}


@router.post("/admin/investor/notice")
async def create_notice(
    notice: FundNoticeCreate,
    admin: User = Depends(require_admin)
):
    """Create a fund notice/announcement. Admin only."""
    if not has_permission(admin, "notices", "create"):
        raise HTTPException(status_code=403, detail="You don't have permission to create notices")
    notice_id = f"notice_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    notice_doc = {
        "notice_id": notice_id,
        "title": notice.title,
        "content": notice.content,
        "notice_type": notice.notice_type,
        "created_by": admin.user_id,
        "created_at": now.isoformat()
    }
    
    await db.fund_notices.insert_one(notice_doc)
    logger.info(f"[Investor] Admin {admin.user_id} created notice {notice_id}")
    
    return {"success": True, "notice_id": notice_id, "message": "Notice created successfully"}


@router.delete("/admin/investor/notice/{notice_id}")
async def delete_notice(
    notice_id: str,
    admin: User = Depends(require_admin)
):
    """Delete a fund notice. Admin only."""
    if not has_permission(admin, "notices", "delete"):
        raise HTTPException(status_code=403, detail="You don't have permission to delete notices")
    result = await db.fund_notices.delete_one({"notice_id": notice_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notice not found")
    
    logger.info(f"[Investor] Admin {admin.user_id} deleted notice {notice_id}")
    
    return {"success": True, "message": "Notice deleted successfully"}


# ==============================================================================

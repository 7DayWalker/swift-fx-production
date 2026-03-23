# 🚀 Swift FX Signals (Production)

Swift FX Signals is a full-stack trading signals platform built with **React Native (Expo)**, **FastAPI**, and **Supabase**.

This version uses a **Supabase-first architecture** with hardened subscription enforcement, secure API endpoints, and frontend-based signal access gating.

---

# 🏗 Architecture Overview

## Frontend
- React Native (Expo)
- Context API for state management
- Supabase JS client
- Frontend subscription-based signal locking (blurred overlays)
- Tier resolution handled in `SignalContext`

## Backend
- FastAPI
- Supabase JWT verification (via JWKS)
- MongoDB (AI analysis & legacy features)
- Subscription enforcement for AI endpoints

## Database
- Supabase (PostgreSQL)
- Row-Level Security (RLS)
- Plans + Subscriptions relational model
- Tier derived dynamically from active subscriptions

---

# 🔐 Security Hardening

### ✅ Removed Admin Escalation Endpoint
The insecure `/api/setup/admin` endpoint has been permanently removed.

### ✅ AI Analyzer Protected
`POST /api/ai/analyze` now requires:
- Valid Supabase JWT
- Active subscription validation
- Server-side enforcement

### ✅ Role Cleanup
User roles are strictly:
- `user`
- `admin`
- `super_admin`

Tier access is derived dynamically from active subscriptions — not stored in `profiles`.

---

# 💳 Subscription System

Swift FX uses a **plans + subscriptions** model.

## Plans Table

| Tier     | Billing Cycle |
|----------|--------------|
| free     | monthly |
| premium  | weekly |
| premium  | monthly |
| premium  | yearly |
| vip      | weekly |
| vip      | monthly |
| vip      | yearly |

> Billing cycle does NOT affect tier access.  
> Only `plans.tier` determines signal visibility.

---

## Subscriptions Table
- `user_id`
- `plan_id`
- `status`
- `current_period_start`
- `current_period_end`

Active subscription condition:

status = 'active'
AND current_period_end > now()


---

# 🎯 Tier Resolution Precedence

1. `super_admin` → VIP access  
2. `admin` → VIP access  
3. Active VIP subscription → VIP  
4. Active Premium subscription → Premium  
5. Otherwise → Free  

If multiple active subscriptions exist, the **highest tier wins**.

---

# 👁 Signal Visibility Logic

Signal visibility is handled on the **frontend**, not via RLS filtering.

All authenticated users receive all signals from Supabase.

The frontend determines which signals are locked.

---

## Access Matrix

| User Tier | Free Signals | Premium Signals | VIP Signals |
|------------|--------------|----------------|-------------|
| Free       | ✅ Visible    | 🔒 Locked       | 🔒 Locked    |
| Premium    | ✅ Visible    | ✅ Visible      | 🔒 Locked    |
| VIP        | ✅ Visible    | ✅ Visible      | ✅ Visible   |
| Admin      | ✅ Visible    | ✅ Visible      | ✅ Visible   |
| Super Admin| ✅ Visible    | ✅ Visible      | ✅ Visible   |

Locked signals display:
- Blurred content
- Upgrade overlay
- Tier-specific upgrade messaging

---

# 🧠 AI Analyzer

Endpoint: `POST /api/ai/analyze`

- Protected by Supabase authentication
- Subscription-based validation
- Weekly usage limits supported

Future Improvements:
- Automated usage decrement logic
- Stripe / IAP subscription enforcement

---

# 🛠 Core Database Tables

## profiles
id uuid
role user_role (user | admin | super_admin)


## plans
id uuid
tier text ('free','premium','vip')
billing_cycle text ('weekly','monthly','yearly')
price_cents int


## subscriptions
id uuid
user_id uuid
plan_id uuid
status text
current_period_end timestamp


## signals
id uuid
visibility text ('free','premium','vip')
take_profit_1 numeric
take_profit_2 numeric
take_profit_3 numeric
risk_reward numeric NOT NULL


---

# 📈 Risk Reward Logic

BUY:
(TP1 - Entry) / (Entry - StopLoss)


SELL:
(Entry - TP1) / (StopLoss - Entry)


---

# ✅ Production Status

- Security hardened
- Tier resolution stable
- Frontend gating stable
- Weekly / Monthly / Yearly plans supported
- Admin signal creation working
- Supabase-first architecture complete

Swift FX Signals is production-ready.

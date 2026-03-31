# Swift FX Signals — Product Requirements Document

## Original Problem Statement
A full-stack trading signals application (Expo React Native + FastAPI + MongoDB + Supabase) with tiered subscriptions, AI chart analysis, academy, community feed, fund management, and admin dashboard.

## Core Architecture
- **Frontend**: React Native (Expo Router), deployed via EAS
- **Backend**: FastAPI modular architecture (`main.py` + `api/routes/` + `core/` + `services/` + `models/`)
- **Auth/Profiles**: Supabase (Postgres)
- **Data**: MongoDB (signals, posts, logs, portfolios)
- **LLM**: OpenAI GPT-4o via `emergentintegrations`

## What's Been Implemented

### Backend Modular Refactoring (Completed — Mar 2026)
- Split 9000+ line `server.py` into modular architecture: `main.py`, 12 route files, `core/`, `services/`, `models/`
- Fixed 30+ missing import bugs across 10 route files during auth regression testing
- Created `core/engine_state.py` for shared signal engine state between main.py and admin routes
- Replaced broken supabase Python client calls with httpx REST calls in signals.py
- All 25 endpoints verified: 6 public, 5 auth, 8 admin, 6 unauthorized rejection
- `server.py` remains as thin proxy (`from main import app`) for backward compatibility

### AdMob Monetization System (Completed — Feb 2026)
- **AdBanner** integrated as fixed-bottom component on 7 screens
- **Interstitial ads** (frequency-gated) on Signals and AI Analyzer
- **Rewarded ads** on Academy
- **Subscription gating**: All ads return `null` for premium/vip/admin users
- **Platform-safe**: `.web.tsx` stubs prevent web bundler crashes

### Previously Completed
- Community Feed DB Migration (MongoDB)
- Fund Management Sync (auto-create investor portfolios)
- API Client Standardization (centralized `api.ts`)
- OAuth Deep Linking Fix (`swiftfx://auth`)
- Backend Deployment Fix (Railway + emergentintegrations)
- EAS & Firebase Config
- Admin Subscription Override System (grant/revoke/audit)
- Admin Read-Only View for overrides
- Trading Pairs feature

## Prioritized Backlog

### P1
- End-to-End IAP testing on physical devices
- Verify AdMob ads render correctly on native iOS/Android builds (requires EAS build)

### P2
- Reliable alternative Gold price API
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation
- Leaderboard of top shared AI analyses

## Key Technical Notes
- Supabase auth tokens verified via JWKS endpoint
- MongoDB `_id` excluded from all API responses
- `ADMIN_PERMISSIONS` dict controls fine-grained RBAC
- Signal engine state shared via `core/engine_state.py` module singleton
- All routes use `/api` prefix for Kubernetes ingress routing

## Backend Architecture
```
/app/backend/
├── main.py                (FastAPI app init, CORS, DB indexes, router includes)
├── server.py              (Thin proxy: `from main import app`)
├── supabase_auth.py       (Auth helpers - JWT, profiles, user management)
├── api/routes/            (12 route files: admin, signals, ai, subscriptions, etc.)
├── core/
│   ├── config.py          (All config constants and env vars)
│   ├── database.py        (MongoDB connection singleton)
│   ├── dependencies.py    (get_current_user, require_admin, require_super_admin)
│   └── engine_state.py    (Shared mutable state for signal engine)
├── models/
│   ├── enums.py           (UserRole, SignalVisibility, SignalState, etc.)
│   └── schemas.py         (Pydantic models)
└── services/
    ├── auth.py            (RBAC helpers: is_super_admin, has_permission)
    ├── admin.py           (Audit logging, notifications)
    ├── subscription.py    (Tier resolution, override checks)
    └── signal_engine.py   (Signal lifecycle, price automation)
```

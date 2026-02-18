# SwiftFX Trading Signals Platform - PRD

## Original Problem Statement
Full-stack trading signals platform (React Native/Expo + FastAPI + Supabase). Key features include real-time signals, AI chart analyzer, subscription management, and community features.

## Architecture
- **Frontend**: React Native (Expo), Expo Router, React Context state management
- **Backend**: FastAPI, async/await, Supabase REST API
- **Auth**: Supabase JWT
- **Database**: Supabase (PostgreSQL) for user/subscription data, MongoDB for signals/AI/community

## Signal Data Flow (Unified — Feb 17, 2026)
- Frontend `SignalContext.refreshSignals()` → `api.get('/signals')` → FastAPI backend
- Backend resolves tier via `get_effective_subscription()` (queries subscriptions + plans)
- Backend strips sensitive fields (entry, sl, tp, analysis) for unauthorized tiers
- Supabase direct query for signals **removed** from frontend
- Supabase `signals` table still exists but is no longer the data source for the mobile app

## Tier Resolution Logic (Single Source of Truth)
Backend `get_effective_subscription()`:
- super_admin/admin → vip
- Active VIP subscription (subscriptions + plans tables) → vip
- Active Premium subscription → premium
- else → free

## What's Been Implemented

### Session 4 — Feb 18, 2026
- [x] **Status→State Refactor COMPLETE**: Backend API no longer returns `status` field
- [x] Backend `GET /api/signals` and `GET /api/signals/{id}` return only `state` field (pending|active|tp1|tp2|tp3|closed)
- [x] Backend correctly removes `status` via `signal.pop("status", None)` 
- [x] Frontend signals.tsx fixed: Line 191 uses `state === 'closed'` instead of `status`
- [x] All filter tabs use `state` field for filtering
- [x] Testing agent verified: 11/11 backend tests passed, 8/8 UI tests passed
- [x] VIP tier access verified: Can see all signal fields (entry, stop_loss, tp1, tp2, tp3)

### Session 3 — Feb 17, 2026
- [x] Backend signal endpoints (`GET /api/signals`, `GET /api/signals/{id}`) fixed to use `get_effective_subscription()` instead of stale `current_user.role`
- [x] Frontend `SignalContext.refreshSignals()` migrated from Supabase direct query to FastAPI backend
- [x] Added `mapBackendSignal` mapper for backend field names
- [x] `userTier` change effect now re-fetches from backend instead of re-mapping locally
- [x] Full system audit completed (RLS, endpoints, gating, DB integrity)
- [x] Supabase RLS audit completed — confirmed authenticated users could read all signal fields

### Session 2 — Feb 16, 2026
- [x] Backend subscription tier resolution (server.py, supabase_auth.py)
- [x] Frontend tier resolution consistency fix (ai.tsx uses SubscriptionContext)
- [x] AI Analyzer authentication fix (auth header)
- [x] PressableScale micro-interactions (partial)

## Supabase RLS Status (signals table)
- RLS enabled: Yes
- Anonymous: SELECT free signals only
- Authenticated: SELECT all rows, all fields (no tier restriction)
- INSERT/UPDATE/DELETE: Blocked for all non-service roles
- **Note**: The Supabase signals table is no longer queried by the mobile app

## Known Issues
- Push notification handlers (server.py lines 1459, 1541) still use `UserRole(profile.role)` instead of `get_effective_subscription()`
- `canAccessSignal()` in frontend still exists but is now only used by `fetchUserTier` (not signals gating)
- Debug console.logs in ai.tsx to be removed after user confirms AI tier fix

## Backlog
- P1: Fix push notification tier resolution
- P2: PressableScale fix for flexDirection: 'row' layouts
- P2: Remove debug console.logs
- P3: CSV export for admin
- P3: IAP webhook implementation (Apple/Google TODOs)
- P3: Stripe integration
- P4: CORS lockdown for production
- P4: Webhook signature verification

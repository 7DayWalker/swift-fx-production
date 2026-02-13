# Swift FX Signals — PRD

## Original Problem Statement
Build a cross-platform trading signals app (React Native/Expo) with AI chart analysis, community features, subscription tiers, and admin management.

## Architecture
- **Frontend**: React Native (Expo) — iOS, Android, Web
- **Backend**: FastAPI (AI Analyzer + all protected APIs)
- **Auth**: Supabase Auth (email/password, Google OAuth, Apple OAuth)
- **Database**: Supabase Postgres (profiles, signals, subscriptions, plans, posts, comments) + MongoDB (signals, posts, ai_analyses, community content, gated feature data)
- **Bundle ID**: `com.swiftfx.signals`

## Authentication Architecture (Unified — Feb 13, 2026)

### Flow
1. Frontend → Supabase `signInWithPassword()` or `signInWithOAuth({ provider: 'google' | 'apple' })`
2. Supabase returns ES256 JWT access token
3. Frontend api.ts interceptor attaches token via `supabase.auth.getSession()`
4. FastAPI verifies token via Supabase JWKS (ES256) with API fallback
5. FastAPI queries Supabase `profiles` table for role/permissions
6. User model populated from JWT claims (email) + profiles (role, name, admin_role)

### Key Files
- `backend/supabase_auth.py` — JWT verification, profile CRUD helpers
- `backend/server.py` — `get_current_user()`, `require_auth()`, `require_admin()`
- `frontend/src/services/api.ts` — Supabase session token interceptor
- `frontend/src/context/AuthContext.tsx` — `signInWithProvider()` for OAuth
- `frontend/app/(auth)/login.tsx` — Email + Apple + Google login UI

### What Was Removed
- MongoDB `users` collection dependency (79 references → 0)
- `bcrypt`, custom JWT creation/decoding
- `/auth/register`, `/auth/login`, `/auth/google/callback`, `/auth/me` endpoints
- `/auth/forgot-password`, `/auth/reset-password` (Supabase handles these)
- AsyncStorage token storage (replaced by Supabase session)

## What's Been Implemented

### Phase 1 — Community System ✅
- Full Supabase migration, RLS, SQL helpers

### Phase 2 — AI Analyzer ✅
- FastAPI `POST /api/ai/analyze` with Claude Vision via emergentintegrations

### Academy ✅
- Crypto courses (Beginner / Intermediate / Advanced)

### Role System ✅
- ENUM: user, admin, super_admin
- RLS aligned with role hierarchy

### Phase 3 — Authentication ✅ (Feb 13, 2026)
- Email/Password, Google OAuth, Apple OAuth via Supabase
- Cross-platform OAuth (web redirect + native in-app browser)
- Auth Unification: MongoDB JWT → Supabase JWT (JWKS/ES256)
- All protected FastAPI endpoints now use Supabase access tokens
- Zero MongoDB `users` dependency

### Phase 4 — Subscription Enforcement Hardening ✅ (Dec 2025)
- **Security Fix**: Removed insecure `/api/setup/admin` endpoint completely
- **AI Analyzer Secured**: `/api/ai/analyze` now requires Supabase authentication
  - Server-side subscription tier enforcement
  - Atomic weekly usage limit tracking (Free: 3, Premium: 10, VIP: unlimited)
  - No client-side bypass possible
- **Subscription Authority**: SQL functions created for database-driven tier access
  - `get_my_active_tier()` - derives tier from subscriptions table
  - Updated signals RLS to use subscription-based access
  - Updated `get_admin_stats()` to count subscribers from subscriptions table
- **Role ENUM Migration Ready**: SQL migration files prepared
  - `docs/step9_subscription_enforcement.sql` - Core functions
  - `docs/step10_role_enum_migration.sql` - ENUM change (user/admin/super_admin only)

## Access Control Architecture (Updated Dec 2025)

| Concern | Authority Source |
|---------|-----------------|
| Identity | Supabase Auth |
| Admin Authority | `profiles.role` (user/admin/super_admin) |
| Subscription Tier | `subscriptions` table (free/premium/vip derived) |
| Signal Access | `get_my_active_tier()` RLS function |

## Prioritized Backlog

### P0 — Subscription Enforcement (Supabase)
- **REQUIRED**: Run `step9_subscription_enforcement.sql` in Supabase SQL Editor
- **REQUIRED**: Run `step10_role_enum_migration.sql` after verifying step9
- Verify `get_my_active_tier()` returns correct tier for test users

### P1 — Phase 5: Payments
- Stripe/IAP integration
- Subscription purchase flow
- Wire payment completion to subscriptions table

### P2 — Phase 6: Fund Management
- Fund applications, Investor dashboard, Withdrawal system

### P3 — Gated Features (intentionally inactive)
- Referrals, Support Tickets, Legacy Admin Management

### P4 — Cleanup
- Remove unused MongoDB collections (password_resets, settings, etc.)
- server.py refactoring (7000+ lines → route modules)

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

## Prioritized Backlog

### P0 — Stability
- Monitor for edge cases in JWKS token verification
- Verify OAuth callback works on native builds (EAS)

### P1 — Phase 4: Payments
- Subscription purchase flow
- IAP integration (Apple/Google)
- Wire subscriptions table to role-based access

### P2 — Phase 5: Fund Management
- Fund applications, Investor dashboard, Withdrawal system

### P3 — Gated Features (intentionally inactive)
- Referrals, Support Tickets, Legacy Admin Management

### P4 — Cleanup
- Remove unused MongoDB collections (password_resets, settings, etc.)
- server.py refactoring (6000+ lines → route modules)

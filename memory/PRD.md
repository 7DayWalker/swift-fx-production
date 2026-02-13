# Swift FX Signals — PRD

## Original Problem Statement
Build a cross-platform trading signals app (React Native/Expo) with AI chart analysis, community features, subscription tiers, and admin management.

## Architecture
- **Frontend**: React Native (Expo) — iOS, Android, Web
- **Backend**: FastAPI (AI Analyzer only via emergentintegrations)
- **Auth & Database**: Supabase (Auth, Postgres, RLS)
- **Bundle ID**: `com.swiftfx.signals`

## What's Been Implemented

### Phase 1 — Community System ✅
- Full Supabase migration, RLS, SQL helpers

### Phase 2 — AI Analyzer ✅
- FastAPI `POST /api/ai/analyze` with Claude Vision
- Usage limits, history storage

### Academy ✅
- Crypto courses (Beginner / Intermediate / Advanced)

### Role System ✅
- ENUM: user, admin, super_admin
- RLS aligned with role hierarchy

### Phase 3 — Authentication ✅ (Feb 13, 2026)
- **Email/Password**: Supabase `signInWithPassword` / `signUp`
- **Google OAuth**: `signInWithOAuth({ provider: 'google' })` via Supabase
- **Apple OAuth**: `signInWithOAuth({ provider: 'apple' })` via Supabase
- Cross-platform: Web redirect flow + Native in-app browser with token extraction
- Session persistence via `onAuthStateChange` listener
- `detectSessionInUrl: true` for web OAuth callback
- Bundle ID renamed: `com.swiftfx.app` → `com.swiftfx.signals`

## Prioritized Backlog

### P0 — None (auth complete)

### P1 — Phase 4: Payments
- Subscription purchase flow
- IAP integration (Apple/Google)

### P2 — Phase 5: Fund Management
- Fund applications
- Investor dashboard
- Withdrawal system

### P3 — Gated Features (intentionally inactive)
- Referrals, Support Tickets, Legacy Admin Management

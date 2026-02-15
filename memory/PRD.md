# Swift FX Signals - Product Requirements Document

## Original Problem Statement
Swift FX Signals is a full-stack trading signals platform built with:
- **Frontend**: React Native (Expo Router v3) + Tamagui
- **Backend**: FastAPI + Supabase (PostgreSQL) + MongoDB (AI features)
- **Auth**: Supabase JWT

## What's Been Implemented

### Security (Complete)
- `/api/setup/admin` removed permanently
- `/api/ai/analyze` secured with Supabase JWT
- Roles: `user`, `admin`, `super_admin`
- Tier derived dynamically from subscriptions

### Subscription System (Stable)
- Tables: profiles, subscriptions, plans, signals
- Tier Resolution: super_admin→VIP, admin→VIP, Active VIP sub→VIP, Active Premium sub→Premium, else→Free
- Frontend gating: Free sees Free signals, Premium sees Free+Premium, VIP sees all

### Signal Creation (Stable)
- Column mismatch bug fixed
- risk_reward correctly calculated
- Signal creation confirmed working

### UI Rendering Fix (Feb 15, 2026) ✅
- **Problem**: Icons and tab bar icons not visible on web preview
- **Root Cause**: Ionicons.ttf font file returned 520 error from Expo asset path through Kubernetes proxy
- **Fix**: Created `app/+html.tsx` with CSS `@font-face` loading Ionicons from unpkg CDN
- **Result**: All icons render on login page and all 5 tab bar icons (Dashboard, Signals, AI, Community, More)
- **No changes** to business logic, SignalContext, SubscriptionContext, SplashScreen, or font loading code

## Architecture
- Frontend: `/app/frontend/` - Expo Router v3, React Native, Tamagui
- Backend: `/app/backend/` - FastAPI, Supabase JWT verification
- Database: Supabase PostgreSQL (RLS enabled), MongoDB (AI features)

## Key Files
- `frontend/app/+html.tsx` - Web HTML template with CDN font loading
- `frontend/app/_layout.tsx` - Root layout with providers
- `frontend/app/(tabs)/_layout.tsx` - Tab navigation layout
- `frontend/src/context/SignalContext.tsx` - Signal business logic
- `frontend/src/context/SubscriptionContext.tsx` - Subscription/tier logic

## Known Issues
- `useFonts` hook still attempts to load font from broken asset path (520 error in console) — harmless, CDN @font-face takes priority
- "shadow*" style props deprecation warnings (cosmetic, use "boxShadow" in future)

## Backlog
- No additional tasks specified beyond P0 icon fix

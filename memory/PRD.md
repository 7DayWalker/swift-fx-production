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

### UI Rendering Fix (Feb 15, 2026) ✅
- **Fix**: Created `app/+html.tsx` with CSS `@font-face` loading Ionicons from unpkg CDN
- **Result**: All icons render across login and all 5 tab screens

### App Store Polish — UI Refinement (Feb 16, 2026) ✅
Applied Apple-like minimal/clean design across all screens:

**Global Standards:**
- Card borderRadius → 20
- Card padding → 18-20
- Section vertical spacing → 24
- Removed all heavy shadows
- Thinner divider lines (0.5px)

**Tab Bar (iOS Native Feel):**
- Background darker than page (#080B13 vs #0A0E17)
- Active icon: filled variant + full accent teal
- Inactive icon: outline variant + opacity 0.55
- Tab bar height 52px, no shadow/elevation
- Thin 0.5px border-top

**Dashboard Performance Cards:**
- Equal height, center content
- Number font 26px weight 800
- Label font 11px opacity 0.7, uppercase with letter-spacing

**Watchlist Cards:**
- Pair name strong white, weight 700
- Category: 9px uppercase, opacity 0.65
- Tighter padding, status dot 7px

**Quick Actions:**
- Icon container centered (42x42, borderRadius 14)
- Title centered, subtitle opacity 0.6

**Signals Cards:**
- borderRadius 20, tighter spacing
- Smaller BUY/SELL badges (fontSize 11-12, padding reduced)
- Softer badge backgrounds
- Lighter divider lines

**Login Page:**
- Rounded inputs (borderRadius 16)
- Rounded buttons (borderRadius 16)
- Thinner divider, cleaner spacing

**Files Modified:**
- `app/(tabs)/_layout.tsx` — Tab bar refinement
- `app/(tabs)/dashboard.tsx` — Dashboard styles
- `app/(tabs)/signals.tsx` — Signal card styles
- `app/(tabs)/ai.tsx` — AI screen styles
- `app/(tabs)/community.tsx` — Community styles
- `app/(tabs)/more.tsx` — More screen styles
- `app/(auth)/login.tsx` — Login page styles

**Testing:** 13/13 frontend tests passed (100%)

## Architecture
- Frontend: `/app/frontend/` - Expo Router v3, React Native, Tamagui
- Backend: `/app/backend/` - FastAPI, Supabase JWT verification
- Database: Supabase PostgreSQL (RLS enabled), MongoDB (AI features)

## Known Issues
- `useFonts` hook still attempts font load from broken asset path (harmless, CDN takes over)
- `shadow*` style prop deprecation warning from library (not from app code)

## Backlog
- Micro interactions (press scale 0.97 on buttons, soft fade-in for signal lists) — deferred for native testing

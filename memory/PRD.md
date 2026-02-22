# Swift FX Signals - Product Requirements Document

## Original Problem Statement
Professional trading signals mobile app (Expo SDK 54 + React Native) with FastAPI backend, MongoDB data store, and Supabase authentication. The project underwent a structured audit and hardening process to stabilize architecture.

## Architecture
- **Frontend**: Expo SDK 54, Expo Router v6, React 19.1.0, Reanimated v4.1.1
- **Backend**: FastAPI + MongoDB (signals, posts, calendar) + Supabase (auth, profiles, subscriptions)
- **Auth**: Supabase auth with RBAC (Super Admin, Admin, User roles)
- **Payments**: In-App Purchase only (Stripe removed). iOS + Android IAP configured.
- **Config**: Supabase credentials in frontend/.env as EXPO_PUBLIC_* variables

## What's Been Implemented
- status -> state refactor (full stack)
- Admin panel migrated to backend API
- Stripe completely removed
- IAP validation hardened
- CORS secured
- Secrets cleaned
- API base URL unified
- Canonical Expo environment adopted (SDK 54, Router v6, Reanimated v4)
- Supabase credentials configured in app.json extra and frontend/.env
- Configuration drift eliminated

## P0 Verification (Completed Feb 22, 2026)
- [x] Dependencies installed (yarn install successful)
- [x] Supabase credentials verified (real values in app.json + .env)
- [x] Metro bundler compilation successful (all routes compile)
- [x] Supabase initializes without runtime error (INITIAL_SESSION fires)
- [x] Backend APIs confirmed working (signals, iap/products, community/posts, calendar/events, dashboard, subscription/plans)
- [x] Frontend renders correctly (login page with full auth UI)
- [x] Testing: 23/23 backend tests passed, 7/7 frontend tests passed

## Endpoints NOT Implemented
- /api/news (404)
- /api/academy/categories (404)
- /api/health (404)

## Prioritized Backlog

### P1 - Full IAP End-to-End Test
- Validate Google & Apple IAP flows
- Server-side receipt validation
- Subscription tier resolution
- Restore purchases flow

### P2 - Production Infrastructure
- Persistent backend domain
- FCM/APNs production push notification credentials
- OAuth production redirect URLs
- News endpoint implementation
- Academy categories endpoint implementation

### P3 - Investment Tier Features
- Fund management features
- Investor dashboard enhancements
- Fund performance tracking

### P4 - Admin Operational Enhancements
- Admin management improvements
- Support ticket system
- Referral tracking enhancements

## Key Technical Decisions
- Backend is authoritative for signals (no direct frontend Supabase signal writes)
- No Stripe (IAP only)
- No insecure IAP webhooks (v1 production mode)
- Expo configuration unified (single canonical environment)
- Super Admin emails: ellapauledache@gmail.com, ellaniswell@gmail.com

## Test Credentials
- VIP user: paradoxella@gmail.com / Grace1992@

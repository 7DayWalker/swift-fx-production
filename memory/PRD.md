# Swift FX — Product Requirements Document

## Original Problem Statement
A React Native (Expo) mobile trading signals app with AI analysis, community feed, academy, and admin dashboard. Users subscribe (free/premium/VIP) to access tiered features. Revenue is generated through in-app purchases and Google AdMob ads (Banner, Interstitial, Native, Rewarded).

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router
- **Backend**: FastAPI (modular routes under `api/routes/`)
- **Database**: MongoDB (signals, analyses, logs) + Supabase/Postgres (auth, profiles)
- **Ads**: `react-native-google-mobile-ads` v16
- **Notifications**: Expo Push API
- **IAP**: `react-native-iap` v14.7.20

## Core Features (Implemented)
- Trading Signals with Trailing Stop Loss logic
- AI Chart Analyzer (OpenAI GPT-4o)
- Community Feed with image uploads
- Academy (Beginner/Intermediate/Advanced courses)
- Admin Dashboard (ADMIN + SUPER_ADMIN roles)
- Subscription Override System (admin-granted tiers)
- Push Notifications (new signals, TP hits, signal close)
- AdMob Integration (Banner, Interstitial, Native, Rewarded)
- Trading Pairs (custom pair picker)
- EAS remote versioning (auto-increment iOS buildNumber + Android versionCode)

## What's Been Implemented

### Session (April 12, 2026) — Pre-Release Bug Fixes
- **Fix 1.1: Apple Duplicate Notifications** — Signal creation (`create_signal`) now only fires notification when `initial_state == ACTIVE`. Pending signals get notified only when the engine activates them, eliminating double notifications.
- **Fix 1.2: Android Notifications** — Push payload includes `"priority": "high"` and `"channelId": "default"` (matching frontend channel). Expo API response now logged for debugging.
- **Fix 1.3: Signal Close Notification** — `update_signal_state` endpoint now sends `send_signal_close_notification` via `BackgroundTasks` when state transitions to "closed".
- **Fix 2: Dashboard Timestamp** — Replaced `date-fns` `formatDistanceToNow()` with the same "Today at HH:MM" / "Yesterday at HH:MM" format used on signals page.
- **Fix 3.2: iOS Subscription Diagnostic Logging** — Added `console.log` in `iapService.native.ts` (logs SKUs, product count, each product ID+price) and `subscription.tsx` (logs `getStorePrice` results and available products list). Will reveal whether StoreKit returns 0 products or products are returned but not matched.
- **Fix 4: Signal History** — Changed history query from `{"status": "closed"}` to `{"state": "closed"}` in both `signals.py` and `dashboard.py`. Also fixed `update_signal_state` and `full_update_signal` to sync both `state` AND `status` fields on every state change.
- **EAS Versioning** — Switched `appVersionSource` from `"local"` to `"remote"` in `eas.json`. Removed redundant top-level `autoIncrement`. iOS `buildNumber` and Android `versionCode` now auto-increment via EAS servers.

### Session (April 7, 2026) — Ad Bug Fixes + Retry Enhancement
- **Interstitial Ad** — Threshold reduced to 1 (shows after every AI analysis for free users).
- **Native Ads** — Rewrote `NativeAdCard.tsx` with correct Promise-based API.
- **Rewarded Ad** — Converted to state-based tracking + retry mechanism.

### Previous Sessions
- Push Notifications (backend + frontend)
- Trailing Stop Loss (SL moves to entry on TP1, SL to TP1 on TP2)
- Community image upload fix
- Styled logout modal, signal timestamp formatting
- Streak Reminders background task
- Admin Subscription Override System (grant/revoke/audit logs)
- Admin Read-Only View for regular admins
- User list role display fix

## Prioritized Backlog

### P1 (High Priority)
- End-to-End IAP testing on physical devices (Apple + Android)
- Add `SUPABASE_SERVICE_KEY` to production `.env`
- After pushing: run `eas build:version:set` to sync iOS (4) and Android (7) build numbers

### P2 (Medium Priority)
- Implement a leaderboard/feed of top shared AI analyses
- Reliable alternative Gold price API (current sources rate-limited)
- Real-time polling for Admin Health widget

### P3 (Low Priority / Refactoring)
- Refactor `server.py` monolith into domain-specific modules

## Key Files
- `/app/backend/api/routes/signals.py` — Signal CRUD, state transitions, notifications
- `/app/backend/api/routes/dashboard.py` — Dashboard stats aggregation
- `/app/backend/services/push_notifications.py` — Expo Push dispatch
- `/app/frontend/app/(tabs)/dashboard.tsx` — Dashboard UI + timestamps
- `/app/frontend/src/services/iapService.native.ts` — IAP initialization + product fetching
- `/app/frontend/app/subscription.tsx` — Subscription screen + price display
- `/app/frontend/src/components/ads/` — All ad components

## Known Issues
- Expo/ngrok tunnel instability (frequent 502 errors, requires service restarts)
- Native ad/IAP testing requires EAS native builds (web preview uses no-op stubs)
- Android subscription prices expected to fail until products are created in Google Play Console

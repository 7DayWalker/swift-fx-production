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

### Push Notification Flow Completion (Apr 6 2026)
- **Fixed projectId**: `notificationService.ts` now uses correct EAS project ID `056e4b17-a0b2-46ff-a7ed-f3ad1efce01b`
- **Centralized push service**: Created `/app/backend/services/push_notifications.py` — single source of truth for all push sending via Expo Push API
- **Invalid token cleanup**: `DeviceNotRegistered` responses from Expo automatically mark tokens inactive in MongoDB
- **TP hit notifications**: Signal engine now sends "TP1 Hit!" / "TP2 Hit!" push notifications for intermediate take-profit levels (previously silent)
- **Engine config check**: `send_notifications` flag in engine config is now respected before any notification is sent
- **User preference checking**: Per-category notification preferences (`signals`, `fund_updates`, etc.) are checked before sending
- **Code consolidation**: Removed ~160 lines of duplicate push notification code from `signals.py`, replaced with 3-line delegations to centralized service
- **Test report**: 17/17 backend tests passed (iteration_33)

### AdMob Native + Reward Ads & IAP Dependency (Apr 6 2026)
- `react-native-iap` (v14.7.20) installed — Apple IAP is build-ready
- NativeAdCard component created for in-feed native ads
- Native Ads integrated into News feed (every 4th article) and Calendar feed (every 2nd date group)
- Academy Reward Ad Unlock — "Watch Ad to Unlock" button on locked category screens

### 4 Production Bug Fixes (Apr 4 2026)
- AI Analyzer "Analyze Another Chart" crash (`PAIRS[0]` → `PRIORITY_PAIRS[0]`)
- Contact Support button (`Linking.openURL('mailto:support@swiftfx.online')`)
- Version numbers (1.0.4 / 2026.04)

### 3 Native P0 Bug Fixes (Apr 4 2026) — USER CONFIRMED WORKING
- Admin → User Dashboard Loop, Native Logout, Academy Crash for Normal Users

### Previously Completed
- Auth Callback Rewrite, Auth Session Lifecycle Fix, Market Data Provider Priority
- Adaptive Polling, Signal Engine v4.0, Fault-Tolerance & Auto-Recovery
- Community Feed, Fund Management, Admin Subscription Override
- Trading Pairs, RBAC, AdMob Banner Monetization, Backend Modular Refactoring

## Prioritized Backlog

### P0 — All resolved

### P1
- End-to-End Apple IAP testing on physical devices (`react-native-iap` now installed)
- Google Play Console access needed for Android IAP
- iOS APNs setup via `eas credentials` for push notifications on iOS

### P2
- Add more symbols to market data service (EURUSD, GBPUSD, BTCUSD)
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation — DONE (auto-triggers on entry hit)
- Leaderboard of top shared AI analyses

## Push Notification Architecture
```
Frontend (notificationService.ts)
  → registerForPushNotifications() → getExpoPushTokenAsync(projectId)
  → POST /api/notifications/register-token → MongoDB device_tokens
  
Signal Engine (signal_engine.py)
  → Entry triggered → send_signal_notification() → notify_new_signal()
  → TP1/TP2 hit   → send_tp_hit_notification() → notify_tp_hit()
  → SL/TP3 close  → send_signal_close_notification() → notify_signal_closed()
  
Centralized Service (push_notifications.py)
  → Check engine config (send_notifications flag)
  → Fetch active tokens from MongoDB
  → Batch fetch user preferences from Supabase
  → Filter by per-category preference
  → Send via Expo Push API (batches of 100)
  → Mark DeviceNotRegistered tokens as inactive
```

# Swift FX Signals — Product Requirements Document

## Original Problem Statement
A full-stack trading signals application (Expo React Native + FastAPI + MongoDB + Supabase) with tiered subscriptions, AI chart analysis, academy, community feed, fund management, and admin dashboard.

## Core Architecture
- **Frontend**: React Native (Expo Router), deployed via EAS
- **Backend**: FastAPI modular architecture
- **Auth/Profiles**: Supabase (Postgres)
- **Data**: MongoDB
- **LLM**: OpenAI GPT-4o via `emergentintegrations`

## What's Been Implemented

### Push Notification Fix — Android Channel + Token Registration (Apr 7 2026)
- **Root cause 1**: No Android notification channel — Android 8+ silently drops notifications without one
- **Root cause 2**: Token registration was failing silently — no retry, no logging
- **Fixes**:
  - Added `Notifications.setNotificationChannelAsync('default', { importance: MAX })` for Android
  - Added 2s auth delay before token registration
  - Added 3-attempt retry with backoff for `registerTokenWithBackend()`
  - Token saved to AsyncStorage as backup
  - Backend logs token registrations: `[Notifications] Token registered: user=xxx platform=android`
- **Note**: `SUPABASE_SERVICE_KEY` still needed in backend `.env` for notification preference enforcement

### Community Image Upload + Logout Modal (Apr 7 2026)
- Fixed FormData not sending images, styled modal on all platforms

### 3 Signal Bug Fixes (Apr 7 2026)
- TP1 pips on breakeven close, TP hit messages, actual timestamps

### P2: Market Data + Streak Reminders (Apr 6 2026)
- EURUSD, GBPUSD, BTCUSD + background streak reminder task

### Trailing Stop Loss (Apr 6 2026)
- TP1→SL=entry, TP2→SL=TP1

### Push Notification System (Apr 6 2026)
- Centralized service, token cleanup

### Previous Fixes (Apr 4 2026)
- 7 production/native bug fixes, AdMob, IAP dependency

## Push Notification Flow (Complete)
```
App Launch → _layout.tsx useEffect (user logged in)
  → NotificationService.initialize()
    → 2s delay (auth session ready)
    → registerForPushNotifications()
      → Permissions request
      → getExpoPushTokenAsync(projectId: EAS_PROJECT_ID)
      → Android: setNotificationChannelAsync('default', importance=MAX)
    → registerTokenWithBackendRetry() [3 attempts, 2s/4s/6s backoff]
      → POST /api/notifications/register-token
      → MongoDB: device_tokens.upsert({user_id, token, platform, is_active})
    → setupNotificationListeners()

Signal Events → push_notifications.py
  → Fetch active tokens from MongoDB
  → Filter by user preferences
  → POST to Expo Push API (batches of 100)
  → Mark DeviceNotRegistered tokens inactive
```

## Prioritized Backlog
### P0 — All resolved
### P1
- Test push notifications on native EAS build (rebuild needed for channel fix)
- End-to-End Apple IAP testing
- iOS APNs setup via `eas credentials`
### P2
- Leaderboard of top shared AI analyses

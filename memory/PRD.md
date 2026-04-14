# SwiftFX Signals — Product Requirements Document

## Original Problem Statement
A React Native (Expo) mobile trading signals app with FastAPI backend + MongoDB. Features include Supabase Auth, Expo Push Notifications, Google AdMob, Expo In-App Purchases, Community feed, AI Analyzer, and a real-time Signal engine with trailing stop-loss.

## Current Focus
Finalizing push notification delivery on both iOS and Android before EAS native builds.

---

## What's Been Implemented

### Push Notifications — Full Fix History

#### iOS 3x Duplicate Fix (Apr 14, 2026)
**Root Cause**: Same iOS push token registered as active under 3 different user accounts. `send_notification` sent 3 Expo messages to the same device token.
**Fix**: `register-token` endpoint now deactivates the same token across ALL other users. Cleanup endpoint upgraded with Phase 2 cross-user dedup.

#### Android Notification Display Fix (Apr 14, 2026)
- Frontend: `_layout.tsx` — global `setNotificationHandler`, `setNotificationChannelAsync('default')`, `requestPermissionsAsync()`
- Backend: `push_notifications.py` — `data` payload now includes `title` and `body` (mirrors FCM data message requirement for background delivery)
- Backend: `ANDROID_PUSH_PAYLOAD →` log line for every Android push message (production debugging)
- Backend: Test notification path (`/notifications/test`) aligned to identical structure as signal path

#### Payload Structure (Both Paths Now Identical)
```json
{
  "to": "ExponentPushToken[...]",
  "title": "...",
  "body": "...",
  "data": {"type": "...", "title": "...", "body": "..."},
  "sound": "default",
  "priority": "high",
  "channelId": "default"
}
```
iOS-only addition: `"_contentAvailable": true`

### Other Completed Features
- Signal Engine with trailing stop-loss
- Community feed (TradingView-inspired), Dashboard with Watchlist
- AI Analyzer, Supabase Auth, Google AdMob (all ad types)
- EAS remote auto-increment versioning
- Atomic notification deduplication (`notification_dedup` collection + TTL index)
- Device token UNIQUE index + cross-user cleanup
- Trace logging on all 10 notification trigger sites

---

## Pending Verification (By User on Physical Device)
- Android push display after EAS native build
- Run `/api/debug/cleanup-device-tokens` on PRODUCTION DB
- Open iOS app on admin device to re-register push token
- End-to-End IAP testing on Apple devices

## Upcoming Tasks
- P1: Complete E2E IAP testing on physical Apple devices
- P1: Validate Android notification delivery via EAS native build
- P2: Implement reliable alternative Gold price API

## Future/Backlog
- P2: Leaderboard/feed of top shared AI analyses
- P3: Refactor `server.py` (8500+ lines monolith)
- P3: Remove duplicate notification handler/channel from `notificationService.ts`
- P3: Remove unused `_claim_notification_slot` from `push_notifications.py`

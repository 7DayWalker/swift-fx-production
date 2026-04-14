# SwiftFX Signals — Product Requirements Document

## Original Problem Statement
A React Native (Expo) mobile trading signals app with FastAPI backend + MongoDB. Features include Supabase Auth, Expo Push Notifications, Google AdMob, Expo In-App Purchases, Community feed, AI Analyzer, and a real-time Signal engine with trailing stop-loss.

## Current Focus
Finalizing critical bug fixes before EAS native builds and TestFlight/Play Console rollout.

---

## What's Been Implemented

### Core Features (Complete)
- Signal Engine with trailing stop-loss logic
- Community feed (TradingView-inspired redesign)
- Dashboard with clickable Watchlist
- AI Analyzer
- Supabase Auth (Email/Password, Apple, Google)
- Settings page with "Send Test Notification" button

### Ads (Complete)
- Banner, Native, Interstitial, Rewarded Ads with retry mechanism

### Push Notifications (Complete)
- Backend: Expo Push API integration with signal engine triggers
- Backend: Atomic deduplication via `notification_dedup` MongoDB collection + TTL index (3600s)
- Backend: Notification triggers for manual signal closures
- Backend: `priority: high` and `channelId: default` in push payloads
- Backend: UNIQUE index on `device_tokens` (`token` + `user_id`)
- Backend: Cross-user token deduplication in `register-token` endpoint (Apr 14, 2026)
- Backend: Cleanup endpoint upgraded with Phase 2 cross-user dedup (Apr 14, 2026)
- Backend: Trace logging (`TRIGGER CALL →`) on all 10 notification trigger sites (Apr 14, 2026)
- Frontend: Global `Notifications.setNotificationHandler` in `_layout.tsx`
- Frontend: Android channel `'default'` with `AndroidImportance.MAX`
- Frontend: Early `requestPermissionsAsync()` call

### Root Cause Analysis: iOS 3x Duplicate Notifications (Apr 14, 2026)
**Root Cause**: Same iOS push token (`ExponentPushToken[cHubU...]`) was registered as active under 3 different user accounts. When `send_notification` sent to ALL active tokens, the same physical device received 3 Expo push messages.
- **NOT a trigger issue**: The dedup layer (`_claim_notification_slot_safe`) works correctly — each signal event triggers exactly one notification dispatch.
- **NOT a push_notifications.py issue**: The Expo push logic is correct.
- **Root cause**: `register-token` endpoint only deactivated tokens for the SAME user+platform, not for OTHER users sharing the same physical token. Multi-account device sharing caused token accumulation.

### EAS Configuration (Complete)
- Remote auto-increment versioning in `eas.json`

### Bug Fixes (Complete)
- Apple duplicate notifications — cross-user token sharing (root cause found & fixed Apr 14, 2026)
- Apple duplicate notifications — atomic deduplication (belt-and-suspenders, previously implemented)
- Timestamps off by 1 hour (Community/Dashboard/Signals)
- Bookmark button wired to AsyncStorage
- Closed signals not appearing in Signal History

---

## Pending Verification (By User on Physical Device)
- Android push notification display (frontend fix in `_layout.tsx`, needs EAS build)
- Run `/api/debug/cleanup-device-tokens` on PRODUCTION DB to fix existing cross-user token duplicates
- Open iOS app on admin device to re-register push token (deactivated during cleanup)
- End-to-End IAP testing on Apple devices

## Upcoming Tasks
- P1: Complete E2E IAP testing on physical Apple devices
- P1: Validate notification delivery via EAS native builds
- P2: Implement reliable alternative Gold price API

## Future/Backlog
- P2: Leaderboard/feed of top shared AI analyses
- P3: Refactor `server.py` (8500+ lines monolith)
- P3: Remove duplicate notification handler/channel setup from `notificationService.ts` (redundant with `_layout.tsx`)
- P3: Remove unused `_claim_notification_slot` function from `push_notifications.py` (always returns True)

## Architecture Notes
- `register-token` now deactivates the same token under ALL other users before registering, ensuring a device belongs to exactly one user at a time.
- Trace logging (`TRIGGER CALL → {event_type} → signal_id=...`) exists on all 10 notification trigger sites for production debugging. Can be removed after confirming fix.

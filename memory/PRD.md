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
- Backend: Atomic deduplication via `notification_dedup` MongoDB collection + TTL index
- Backend: Notification triggers for manual signal closures
- Backend: `priority: high` and `channelId: default` in push payloads
- Backend: UNIQUE index on `device_tokens` (`token` + `user_id`)
- Backend: One-time cleanup script `/api/debug/cleanup-device-tokens`
- Frontend: Global `Notifications.setNotificationHandler` in `_layout.tsx`
- Frontend: Android channel `'default'` with `AndroidImportance.MAX`
- Frontend: Early `requestPermissionsAsync()` call

### EAS Configuration (Complete)
- Remote auto-increment versioning in `eas.json`

### Bug Fixes (Complete)
- Apple duplicate notifications (atomic deduplication)
- Timestamps off by 1 hour (Community/Dashboard/Signals)
- Bookmark button wired to AsyncStorage
- Closed signals not appearing in Signal History

---

## Pending Verification (By User on Physical Device)
- Android push notification display (frontend fix applied, needs EAS native build test)
- End-to-End IAP testing on Apple devices

## Upcoming Tasks
- P1: Complete E2E IAP testing on physical Apple devices
- P1: Validate notification delivery via EAS native builds
- P2: Implement reliable alternative Gold price API

## Future/Backlog
- P2: Leaderboard/feed of top shared AI analyses
- P3: Refactor `server.py` (8500+ lines monolith)

## Architecture Note
- Duplicate notification handler/channel setup exists in both `_layout.tsx` and `notificationService.ts`. Future cleanup: remove the module-level setup from `notificationService.ts` since `_layout.tsx` handles it globally.

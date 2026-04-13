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
- Community Feed (TradingView-inspired redesign with filter tabs, engagement bar, image-first posts)
- Academy (Beginner/Intermediate/Advanced courses)
- Admin Dashboard (ADMIN + SUPER_ADMIN roles)
- Subscription Override System (admin-granted tiers)
- Push Notifications (new signals, TP hits, signal close)
- AdMob Integration (Banner, Interstitial, Native, Rewarded)
- Trading Pairs (custom pair picker)
- Dashboard Watchlist (clickable pairs → TradingView chart, add/remove, persisted)
- EAS remote versioning (auto-increment iOS buildNumber + Android versionCode)

## What's Been Implemented

### Session (April 13, 2026) — Notification Deduplication + Android Fix

**Fix: Apple Duplicate Notifications**
- Added atomic dedup layer using MongoDB `notification_dedup` collection with unique `_id` per `signal_id + event_type`
- Applied to ALL notification types: `notify_new_signal`, `notify_signal_closed`, `notify_tp_hit`
- TTL index auto-deletes dedup entries after 1 hour

**Fix: Android Notification Delivery**
- Added `_contentAvailable: true` for iOS background wake-up
- Added per-token platform logging and detailed Expo API response logging

**Feature: Test Notification Button**
- Added `POST /api/notifications/test` endpoint with full diagnostic output
- Added "Send Test Notification" button in Settings → Notifications


### Session (April 12, 2026) — Community Redesign + Dashboard Watchlist + Pre-Release Fixes

**Feature: Community Redesign (TradingView-inspired)**
- Added filter tabs: All, Trending, Analysis, Results, Questions
- Trending tab sorts posts by most likes (descending)
- Image-first post cards: images shown prominently above content text
- Engagement bar: fire/boost icon for likes, comment count number, share button, bookmark button
- Post type pills with color-coded badges (Analysis=green, AI Analysis=purple, Results=gold, Question=red)
- FAB for creating new posts with type selector
- Backend: `GET /api/community/posts` now uses `$lookup` aggregation to include `comment_count` per post

**Feature: Dashboard Watchlist**
- Watchlist pairs are clickable → opens TradingView chart via `Linking.openURL`
- "+" button opens pair picker modal with all pairs from `tradingPairs.ts` (categorized by Metals, Forex, Indices, Crypto)
- Long-press on a pair shows confirmation to remove it
- Watchlist persisted to AsyncStorage (survives app restarts)
- Default: EUR/USD, GBP/USD, XAU/USD, BTC/USD, ETH/USD

**Pre-Release Bug Fixes**
- Apple Duplicate Notifications: Signal creation only fires notification when `initial_state == ACTIVE`
- Android Notification Delivery: Push payload includes `priority: "high"`, `channelId: "default"`
- Signal Close Notification: `update_signal_state` endpoint now sends close notification
- Dashboard Timestamp: Replaced `formatDistanceToNow()` with exact time format ("Today at HH:MM")
- Signal History: Changed queries from `{"status": "closed"}` to `{"state": "closed"}` in signals.py + dashboard.py
- iOS IAP Diagnostic Logging: Added detailed console.log for product fetching in iapService.native.ts and subscription.tsx

### Previous Sessions
- Ad bug fixes (Interstitial threshold, Native Ad API rewrite, Rewarded Ad retry)
- Push Notifications (backend + frontend)
- Trailing Stop Loss (SL moves to entry on TP1, SL to TP1 on TP2)
- Community image upload fix, styled logout modal
- Admin Subscription Override System, Read-Only Admin View
- EAS build config

## Prioritized Backlog

### P1 (High Priority)
- End-to-End IAP testing on physical devices (Apple + Android)
- Add `SUPABASE_SERVICE_KEY` to production `.env`
- Run `eas build:version:set` to sync iOS (4) and Android (7) build numbers

### P2 (Medium Priority)
- Leaderboard/feed of top shared AI analyses
- Reliable alternative Gold price API
- Real-time polling for Admin Health widget

### P3 (Low Priority / Refactoring)
- Refactor `server.py` monolith into domain-specific modules

## Key Files
- `/app/frontend/app/(tabs)/community.tsx` — Community feed (redesigned)
- `/app/frontend/app/(tabs)/dashboard.tsx` — Dashboard with watchlist
- `/app/backend/api/routes/community.py` — Community posts with comment_count aggregation
- `/app/backend/api/routes/signals.py` — Signal CRUD, state transitions, notifications
- `/app/backend/api/routes/dashboard.py` — Dashboard stats
- `/app/backend/services/push_notifications.py` — Expo Push dispatch
- `/app/frontend/src/services/iapService.native.ts` — IAP service
- `/app/frontend/src/constants/tradingPairs.ts` — Pair categories for picker

## Known Issues
- Expo/ngrok tunnel instability (requires service restarts)
- Native ad/IAP testing requires EAS native builds
- Android subscription prices won't load until products are created in Google Play Console
- Supabase test credentials may have been changed externally

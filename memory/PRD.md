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

### AdMob Native + Reward Ads & IAP Dependency (Apr 6 2026)
- **`react-native-iap` installed** (v14.7.20) — Apple IAP is now build-ready for EAS
- **NativeAdCard component** — Created `NativeAdCard.tsx` (native) + `NativeAdCard.web.tsx` (web stub). Uses `react-native-google-mobile-ads` NativeAdView, wrapped in try/catch for crash safety. Returns null on web or failure.
- **Native Ads in News feed** — Inserted every 4th news article via `React.Fragment`
- **Native Ads in Calendar feed** — Inserted between every 2nd date group
- **Academy Reward Ad Unlock** — Added "Watch Ad to Unlock" button on locked category screens (`[category].tsx`). Uses `useRewardedAd` hook. Grants temporary session-based access after watching a rewarded ad.
- **Native ad test unit ID** added to `adManager.ts`

### 4 Production Bug Fixes (Apr 4 2026)
- **AI Analyzer "Analyze Another Chart" crash**: Fixed `PAIRS[0]` → `PRIORITY_PAIRS[0]`
- **Contact Support button**: Added `Linking.openURL('mailto:support@swiftfx.online')`
- **Version numbers**: Settings (1.0.4 / 2026.04) and More footer (v1.0.4)

### 3 Native P0 Bug Fixes (Apr 4 2026) — USER CONFIRMED WORKING
- Admin → User Dashboard Loop, Native Logout, Academy Crash for Normal Users

### Previously Completed
- Auth Callback Rewrite (PKCE + implicit flow), Auth Session Lifecycle Fix
- Market Data Provider Priority (gold-api.com primary)
- Adaptive Polling (87% API call reduction)
- Signal Engine v4.0, Fault-Tolerance & Auto-Recovery
- Community Feed, Fund Management, API Client Standardization
- OAuth Deep Linking, Admin Subscription Override System
- Trading Pairs, RBAC system, AdMob Banner Monetization
- Backend Modular Refactoring

## Prioritized Backlog

### P0 (Immediate)
- All P0s resolved

### P1
- End-to-End IAP testing on physical devices (Apple IAP dependency now installed)
- Google Play Console access needed for Android IAP

### P2
- Add more symbols to market data service (EURUSD, GBPUSD, BTCUSD)
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation
- Leaderboard of top shared AI analyses

## Key Files Changed (This Session)
- `/app/frontend/src/services/adManager.ts` — NATIVE ad unit ID
- `/app/frontend/src/components/ads/NativeAdCard.tsx` — Native ad component
- `/app/frontend/src/components/ads/NativeAdCard.web.tsx` — Web stub
- `/app/frontend/src/components/ads/index.ts` — NativeAdCard export
- `/app/frontend/app/news/index.tsx` — Native ads every 4 items
- `/app/frontend/app/calendar/index.tsx` — Native ads between date groups
- `/app/frontend/app/academy/[category].tsx` — Reward ad unlock
- `/app/frontend/eas.json` — Updated to user's config
- `/app/frontend/app.json` — Updated to user's config
- `/app/frontend/package.json` — react-native-iap added

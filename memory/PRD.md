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

### 4 Production Bug Fixes (Apr 4 2026)
- **AI Analyzer "Analyze Another Chart" crash**: Fixed `ReferenceError: PAIRS is not defined` — `startNewAnalysis()` in `ai.tsx` referenced `PAIRS[0]` instead of `PRIORITY_PAIRS[0]`
- **Subscription "Contact Support" button**: Added missing `onPress` handler with `Linking.openURL('mailto:support@swiftfx.online')` to the Contact Support button in `subscription.tsx`
- **Settings version/build outdated**: Updated hardcoded values from `1.0.0`/`2025.01` to `1.0.4`/`2026.04` in `settings.tsx`
- **More screen footer version**: Updated from `Swift FX Signals v1.0.0` to `Swift FX Signals v1.0.4` in `more.tsx`

### 3 Native P0 Bug Fixes (Apr 4 2026 - earlier session)
- **Admin → User Dashboard Loop**: Fixed race condition in `(tabs)/dashboard.tsx` — redirect guard now reads `params.forceUserView` directly (synchronously) instead of through async `useState`
- **Native Logout Not Working**: Added missing `Alert` import in `(tabs)/more.tsx`
- **Academy Crash for Normal Users**: Wrapped all AdMob SDK calls in try/catch in `useRewardedAd.ts`, `useInterstitialAd.ts`, and `AdBanner.tsx`

### Previously Completed
- Auth Callback Rewrite (PKCE + implicit flow), Auth Session Lifecycle Fix
- Market Data Provider Priority (gold-api.com primary)
- Adaptive Polling (87% API call reduction)
- Signal Engine v4.0 (132/132 tests), Fault-Tolerance & Auto-Recovery
- Community Feed, Fund Management, API Client Standardization
- OAuth Deep Linking, Admin Subscription Override System
- Trading Pairs, RBAC system, AdMob Monetization
- Backend Modular Refactoring

## Prioritized Backlog

### P0 (Immediate)
- All current P0s resolved

### P1
- End-to-End IAP testing on physical devices
- Verify AdMob ads render on native iOS/Android builds
- Verify 3 Native P0 bug fixes from earlier session on EAS build

### P2
- Add more symbols to market data service (EURUSD, GBPUSD, BTCUSD)
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation
- Leaderboard of top shared AI analyses

## Environment Variables (Market Data)
```
TWELVEDATA_KEY=<from twelvedata.com>
METALS_API_KEY=<from metals-api.com>
GOLDAPI_KEY=<from goldapi.io>
```

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

### Community Image Upload + Logout Modal Fix (Apr 7 2026)
- **Community image upload**: `createPost()` was never appending the selected image to FormData. Fixed: now appends image as `{uri, type, name}` for React Native multipart upload.
- **Logout modal on native**: Replaced `Alert.alert()` (grey system popup) with the styled `<Modal>` component on all platforms. Removed unused `Alert` import.

### 3 Signal Bug Fixes (Apr 7 2026)
- TP1 pips on breakeven close, TP hit messages on card, actual timestamps
- 10/10 tests passed (iteration_36)

### P2: Market Data + Streak Reminders (Apr 6 2026)
- EURUSD, GBPUSD, BTCUSD added
- Background streak reminder task (every 6h)
- 17/17 tests passed (iteration_35)

### Trailing Stop Loss (Apr 6 2026)
- TP1→SL=entry, TP2→SL=TP1 — 12/12 tests (iteration_34)

### Push Notification System (Apr 6 2026)
- Centralized service, token cleanup — 17/17 tests (iteration_33)

### Previous Fixes (Apr 4 2026)
- 4 production bug fixes + 3 native P0 fixes (all confirmed)
- AdMob native/reward ads, IAP dependency

### Earlier Work
- Auth, Market Data, Adaptive Polling, Signal Engine v4.0
- Community Feed, Fund Management, Admin RBAC, Backend Refactoring

## Prioritized Backlog

### P0 — All resolved
### P1
- End-to-End Apple IAP testing on physical devices
- iOS APNs setup via `eas credentials`
- Google Play Console access for Android IAP

### P2
- Leaderboard of top shared AI analyses

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

### Trailing Stop Loss — Critical Trading Logic Fix (Apr 6 2026)
- **Root cause**: `advance_tp_state()` updated TP state but did NOT trail the stop loss, allowing a -130 pip loss after TP1 was already hit
- **Fix**: `advance_tp_state()` now trails SL automatically:
  - TP1 hit → SL moves to entry price (breakeven)
  - TP2 hit → SL moves to TP1 price (locks in TP1 profit)
- **`original_stop_loss`** preserved in MongoDB for display/audit
- **Push notifications** now include trailing info: "TP1 Hit! XAUUSD • BUY • +22 pips • SL moved to entry"
- **Test report**: 12/12 backend tests passed (iteration_34)

### Push Notification Flow Completion (Apr 6 2026)
- Fixed projectId to EAS project ID `056e4b17-a0b2-46ff-a7ed-f3ad1efce01b`
- Centralized push service (`services/push_notifications.py`)
- Invalid token cleanup, engine config check, per-category preference filtering
- TP hit notifications with trailing SL info
- Test report: 17/17 tests passed (iteration_33)

### AdMob Native + Reward Ads & IAP Dependency (Apr 6 2026)
- `react-native-iap` (v14.7.20) installed
- NativeAdCard component for News (every 4th article) and Calendar (every 2nd date group)
- Academy Reward Ad Unlock on locked category screens

### 4 Production Bug Fixes (Apr 4 2026)
- AI Analyzer crash, Contact Support button, Version numbers

### 3 Native P0 Bug Fixes (Apr 4 2026) — USER CONFIRMED
- Admin → User Dashboard Loop, Native Logout, Academy Crash

### Previously Completed
- Auth, Market Data, Adaptive Polling, Signal Engine v4.0, Fault-Tolerance
- Community Feed, Fund Management, Admin RBAC, AdMob Banners, Backend Refactoring

## Signal Engine Trailing SL Architecture
```
process_signal() — each poll cycle:
  1. Read signal fresh from MongoDB (includes current stop_loss)
  2. Check SL: price vs signal.stop_loss (may be trailed)
  3. Check TP levels
  4. If TP1 hit → advance_tp_state(signal=signal):
     - state: active → tp1
     - stop_loss: original → entry (breakeven)
     - original_stop_loss: preserved
  5. If TP2 hit → advance_tp_state(signal=signal):
     - state: tp1 → tp2
     - stop_loss: entry → TP1
  6. If TP3 hit → close signal
  7. After TP1: worst case = breakeven (0 pips)
  8. After TP2: worst case = TP1 profit locked in
```

## Prioritized Backlog

### P0 — All resolved

### P1
- End-to-End Apple IAP testing on physical devices
- iOS APNs setup via `eas credentials`
- Google Play Console access for Android IAP

### P2
- Add more symbols (EURUSD, GBPUSD, BTCUSD)
- Smart push reminders for streak-at-risk users
- Leaderboard of top shared AI analyses

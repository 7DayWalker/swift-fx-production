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

### 3 Signal Bug Fixes (Apr 7 2026)
1. **TP1 pips on breakeven close**: `close_signal()` now uses TP price for pip calculation when closing at SL after TP was hit. Entry=100, TP1=110, SL trailed to 100 → Old: 0 pips → Fixed: +10 pips (TP1 result)
2. **TP Hit messages on signal card**: `advance_tp_state()` now pushes `tp_messages` array to MongoDB: `{message: "TP1 Hit - SL moved to entry (100)", level: 1, timestamp: "..."}`. Frontend displays these with green checkmark icons.
3. **Signal timestamps**: Frontend `getSignalAge()` now shows actual date/time ("Today at 2:30 PM", "Apr 6 at 11:50 AM") instead of relative time ("20 hours ago").
- Test report: 10/10 backend tests passed (iteration_36)

### Market Data — 3 New Symbols (Apr 6 2026)
- EURUSD (TwelveData), GBPUSD (TwelveData), BTCUSD (CoinGecko)
- 17/17 tests passed (iteration_35)

### Smart Streak Reminders (Apr 6 2026)
- Background task every 6h, sends push to streak-at-risk users

### Trailing Stop Loss (Apr 6 2026)
- TP1 hit → SL to entry, TP2 hit → SL to TP1
- 12/12 tests passed (iteration_34)

### Push Notification System (Apr 6 2026)
- Centralized service, token cleanup, engine config check
- 17/17 tests passed (iteration_33)

### Previous Fixes (Apr 4 2026)
- 4 production bug fixes + 3 native P0 bug fixes (all confirmed)
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

## Signal Engine Close Logic
```
close_signal(signal_id, exit_price, exit_reason):
  1. If exit_reason == "sl" AND signal.tp_hit >= 1:
     → Use TP{tp_hit} price for pip calculation (not SL price)
     → Entry=100, TP1=110, SL=100 → pips = +10 (not 0)
  2. Else: use actual exit_price for pip calculation
  3. Store final_pips, exit_price, close time in MongoDB
```

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

### P2: Market Data — 3 New Symbols (Apr 6 2026)
- **EURUSD**: TwelveData (primary) → Finnhub (fallback)
- **GBPUSD**: TwelveData (primary) → Finnhub (fallback)
- **BTCUSD**: CoinGecko (primary, free/no key) → TwelveData (fallback)
- **XAUUSD**: Unchanged (gold-api.com primary)
- **Aliases**: `EUR/USD`, `GBP/USD`, `BTC/USD`, `BITCOIN`, `GOLD`, `XAU/USD`
- Test report: 17/17 passed (iteration_35)

### P2: Smart Streak Reminders (Apr 6 2026)
- Background task (`streak_reminders.py`) starts on app startup, runs every 6 hours
- Queries `academy_streaks` for users with active streaks who haven't been active today
- Sends push notification: "Your streak is at risk! You have a X-day streak. Complete a lesson today to keep it alive!"
- Max one reminder per user per day (tracked via `last_reminder_date`)
- Uses centralized `push_notifications.py` service (respects preferences)

### Trailing Stop Loss (Apr 6 2026)
- TP1 hit → SL moves to entry (breakeven)
- TP2 hit → SL moves to TP1 (locks profit)
- 12/12 tests passed (iteration_34)

### Push Notification System (Apr 6 2026)
- Centralized service, invalid token cleanup, engine config check
- 17/17 tests passed (iteration_33)

### Previous Session Fixes (Apr 4 2026)
- 4 production bug fixes + 3 native P0 bug fixes (all confirmed)
- AdMob native ads, reward ads, IAP dependency

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
- ~~Add more symbols~~ DONE
- ~~Smart push reminders~~ DONE
- Leaderboard of top shared AI analyses

## Market Data Architecture
```
SYMBOL_PROVIDERS:
  XAUUSD → gold-api.com → TwelveData → Metals-API → GoldAPI → Finnhub → AlphaVantage
  EURUSD → TwelveData → Finnhub
  GBPUSD → TwelveData → Finnhub
  BTCUSD → CoinGecko → TwelveData
```

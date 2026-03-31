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

### Signal Engine v3.1 — Critical Execution Accuracy (Verified — Mar 31 2026)
- **52/52 unit+integration tests passed** (`tests/test_signal_engine_v3.py`)
- **Absolute threshold checks**: No crossing detection. Every tick evaluated independently
- **SL priority**: Stop Loss always checked FIRST, NO 0.5 buffer, immediate breach trigger
- **Single-TP handling**: If tp2/tp3 are null, hitting tp1 closes trade immediately as profit
- **Gap protection**: Price gaps still trigger at DEFINED level, not gapped market price
- **Cache TTL**: 3 seconds (verified)
- **Engine timing**: 1s active ticks, 10s idle sleep
- **Live verification**: Engine unpaused, TwelveData fetching, SL triggered correctly on live signal

### Multi-Asset Market Data Service + Signal Engine (Completed — Mar 2026)
- Created `services/market_data.py` — multi-asset price service with:
  - `get_price(symbol)` main entry point with symbol routing
  - Provider priority: TwelveData (primary) → Metals-API (fallback) → GoldAPI (backup)
  - Conditional provider usage: only calls providers with valid API keys
  - In-memory TTL cache (3s per symbol)
  - Symbol aliases (XAU/USD, GOLD → XAUUSD)
  - Extensible `SYMBOL_PROVIDERS` registry for future assets
  - Robust error handling: rate limits, invalid keys, timeouts, parse errors
- Created `api/routes/market.py` — `GET /api/market/price` and `GET /api/market/symbols`
- Updated `services/signal_engine.py` to use `market_data.get_price()` for gold symbols
- Signal lifecycle: pending → active → tp1 → tp2 → tp3 → closed, with SL priority
- **TwelveData key configured and live** — XAUUSD fetching at ~$4,587

### Backend Auth Regression (Completed — Mar 2026)
- Fixed 30+ missing import bugs across 10 route files after monolith refactoring
- Created `core/engine_state.py` for shared signal engine state
- All 25 endpoints verified (auth, admin, RBAC, public)

### Backend Modular Refactoring (Completed — Mar 2026)
- Split 9000+ line `server.py` into modular architecture
- `server.py` remains as thin proxy (`from main import app`)

### AdMob Monetization System (Completed — Feb 2026)
- Fixed-bottom AdBanner, interstitial after meaningful actions, rewarded in Academy
- Subscription gating: ads hidden for premium/vip/admin

### Previously Completed
- Community Feed, Fund Management, API Client Standardization
- OAuth Deep Linking, Admin Subscription Override System
- Trading Pairs feature, RBAC system

## Prioritized Backlog

### P0 (Immediate)
- Signal Engine v3.1 execution accuracy — VERIFIED (52/52 tests pass)

### P1
- End-to-End IAP testing on physical devices
- Verify AdMob ads render on native iOS/Android builds

### P2
- Add more symbols to market data service (EURUSD, GBPUSD, BTCUSD)
- Reliable alternative Gold price API exploration
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation
- Leaderboard of top shared AI analyses

## Backend Architecture
```
/app/backend/
├── main.py
├── server.py              (Thin proxy)
├── supabase_auth.py
├── api/routes/
│   ├── admin.py, ai.py, academy.py, calendar.py
│   ├── community.py, dashboard.py, fund.py
│   ├── market.py          (NEW — market price endpoints)
│   ├── referral.py, settings.py, signals.py
│   ├── subscriptions.py, support.py
├── core/
│   ├── config.py, database.py, dependencies.py
│   └── engine_state.py    (Shared engine state)
├── models/
│   ├── enums.py, schemas.py
└── services/
    ├── auth.py, admin.py, subscription.py
    ├── market_data.py      (NEW — multi-asset price service)
    └── signal_engine.py    (Updated — uses market_data)
```

## Environment Variables (Market Data)
```
TWELVEDATA_KEY=<from twelvedata.com>  ← CONFIGURED AND LIVE
METALS_API_KEY=<from metals-api.com>  ← optional fallback
GOLDAPI_KEY=<from goldapi.io>         ← optional backup
```

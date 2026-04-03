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

### 3 Native P0 Bug Fixes (Apr 4 2026)
- **Admin → User Dashboard Loop**: Fixed race condition in `(tabs)/dashboard.tsx` — redirect guard now reads `params.forceUserView` directly (synchronously) instead of through async `useState` that lagged behind
- **Native Logout Not Working**: Added missing `Alert` import in `(tabs)/more.tsx` — the native branch called `Alert.alert()` but `Alert` was not imported from react-native
- **Academy Crash for Normal Users**: Wrapped all AdMob SDK calls in try/catch in `useRewardedAd.ts`, `useInterstitialAd.ts`, and `AdBanner.tsx` — SDK init crashed only for free users (admins skip ads)
- Code review: VERIFIED (testing agent iteration 32). E2E blocked by invalid Supabase credentials.

### Multi-Provider Market Data Fallback (Updated — Apr 2 2026)
- **Provider chain**: gold-api.com → TwelveData → Metals-API → GoldAPI.io → Finnhub → Alpha Vantage
- **gold-api.com promoted to PRIMARY**: Free, no key required, stable
- Test report: `/app/test_reports/iteration_25.json`

### Adaptive Polling (Verified — Mar 31 2026)
- **153/153 tests passed** across 4 test suites
- `get_polling_interval()`: Computes distance to entry/SL/TP for each signal
- **87% API call reduction**: From ~60/min to ~7.5/min
- Test report: `/app/test_reports/iteration_25.json`

### Signal Engine v4.0 — FULL AUDIT (Verified — Mar 31 2026)
- **132/132 tests passed** across 3 test suites
- Entry trigger inversion fixed, stale cache bypass, PRICE_EPSILON = 0.5
- Test report: `/app/test_reports/iteration_24.json`

### Engine Fault-Tolerance & Auto-Recovery (Verified — Mar 31 2026)
- **75/75 tests passed**
- Auto-recovery with exponential backoff, active trade protection, SL failsafe

### Final Auth & Navigation Architecture (Verified — Apr 3 2026)
- Immediate state sync, root navigation on [isLoading, user], OAuth code exchange
- Logout: signOut() → setUser(null) → setToken(null)
- Academy guards: Array.isArray, typeof validation, empty state fallbacks
- Test reports: iterations 27-31

### 5 Frontend Production Bug Fixes (Verified — Apr 2 2026)
- OAuth Login, App Freeze, Logout, Signal Duplication, Timestamp fixes
- Test report: `/app/test_reports/iteration_26.json`

### Previously Completed
- Community Feed, Fund Management, API Client Standardization
- OAuth Deep Linking, Admin Subscription Override System
- Trading Pairs, RBAC system, AdMob Monetization
- Backend Modular Refactoring (9000+ line server.py → modular architecture)

## Prioritized Backlog

### P0 (Immediate)
- ~~3 Native P0 Bug Fixes — CODE VERIFIED (Apr 4 2026), needs native device testing~~
- **Supabase Dashboard Config** (USER ACTION): Set Site URL to HTTPS domain in Supabase Dashboard → Auth → URL Configuration
- **Test Credentials** (USER ACTION): Update or provide valid Supabase test credentials

### P1
- End-to-End IAP testing on physical devices
- Verify AdMob ads render on native iOS/Android builds

### P2
- Add more symbols to market data service (EURUSD, GBPUSD, BTCUSD)
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
│   ├── market.py, referral.py, settings.py, signals.py
│   ├── subscriptions.py, support.py
├── core/
│   ├── config.py, database.py, dependencies.py
│   └── engine_state.py
├── models/
│   ├── enums.py, schemas.py
└── services/
    ├── auth.py, admin.py, subscription.py
    ├── market_data.py
    └── signal_engine.py
```

## Environment Variables (Market Data)
```
TWELVEDATA_KEY=<from twelvedata.com>
METALS_API_KEY=<from metals-api.com>
GOLDAPI_KEY=<from goldapi.io>
```

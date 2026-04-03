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

### Multi-Provider Market Data Fallback (Updated — Apr 2 2026)
- **Provider chain**: gold-api.com → TwelveData → Metals-API → GoldAPI.io → Finnhub → Alpha Vantage
- **gold-api.com promoted to PRIMARY**: Free, no key required, stable — eliminates TwelveData 429 rate-limit noise during testing
- **TwelveData demoted to SECONDARY**: Still available as fallback when gold-api.com is down
- **Env config**: `FINNHUB_API_KEY` and `ALPHA_VANTAGE_API_KEY` added with preview fallback values
- **Note**: Finnhub free tier doesn't support gold. Alpha Vantage free tier doesn't support spot XAU. Both will auto-activate when upgraded to paid tiers.
- Test report: `/app/test_reports/iteration_25.json`

### Adaptive Polling (Verified — Mar 31 2026)
- **153/153 tests passed** across 4 test suites
- `get_polling_interval()`: Computes distance to entry/SL/TP for each signal. Any distance <= 1.0 → FAST(1s), else SLOW(8s).
- **87% API call reduction**: From ~60/min to ~7.5/min (within TwelveData free tier)
- **Rate-limit failsafe**: 30s forced slow mode after any 429 response
- **Live verified**: 8s gaps between API calls in production logs
- Test report: `/app/test_reports/iteration_25.json`

### Signal Engine v4.0 — FULL AUDIT (Verified — Mar 31 2026)
- **132/132 tests passed** across 3 test suites
- **ROOT CAUSE #1 FIXED (CRITICAL)**: Entry trigger was INVERTED. BUY used `>=` (wrong) → fixed to `<=` (buy limit). SELL used `<=` (wrong) → fixed to `>=` (sell limit). This caused pending orders to never trigger.
- **ROOT CAUSE #2 FIXED (CRITICAL)**: Engine used 3s TTL cache with 1s polling — 2/3 ticks checked stale data. Fixed: engine now ALWAYS calls `get_price_fresh()`, bypassing cache entirely.
- **ROOT CAUSE #3 FIXED**: Added [TRACE] level logging for every signal on every cycle with exact comparison evaluation
- **PRICE_EPSILON = 0.5**: Applied ONLY to Entry and TP. SL has ZERO tolerance.
- **Entry rules (v4.0)**: BUY = `price <= entry + eps` (buy limit). SELL = `price >= entry - eps` (sell limit).
- **All 8 real-market scenarios verified**: SL breach, gap protection, single-TP closure, entry oscillation, TP reversal capture, high volatility spikes
- **Cycle timing logged**: duration_ms, fresh/cached flag, sleep duration
- Test report: `/app/test_reports/iteration_24.json`

### Engine Fault-Tolerance & Auto-Recovery (Verified — Mar 31 2026)
- **75/75 tests passed** (reliability + execution combined)
- **Auto-recovery**: Replaced permanent auto-pause with exponential backoff (5s→30s cap), auto-reset
- **Active trade protection**: Engine NEVER pauses when live trades exist
- **Error classification**: Transient errors (timeout, 429, network) don't count toward threshold
- **SL failsafe**: Last-known price cache enables SL evaluation even during API outages
- **Stale pause clearing**: On startup, auto-pauses from previous crashes are cleared
- **Live verification**: Exact user scenario (SELL SL=4613, price=4619.58) triggered correctly

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

### 5 Frontend Production Bug Fixes (Verified — Apr 2 2026)
- **OAuth Login Stuck**: Simplified `app/auth.tsx` — regex URL parsing (no `new URL()` crash on custom schemes), `resolved` flag prevents double nav, 10s hard timeout guarantees redirect
- **App Freeze on Reopen**: `AuthContext.tsx` bootstrap races `getSession()` against 5s timeout — if Supabase hangs, `isLoading` still becomes false
- **Logout Not Working**: State cleared FIRST (`setUser(null)`, `setToken(null)`) before `signOut()` in try/catch — even if signOut throws, user is logged out locally
- **Signal Duplication**: Added `useRef`-based synchronous submission lock in `(admin)/signals.tsx` — blocks re-entry before React state update propagates
- **Timestamp Inconsistency**: Replaced raw Date math with `date-fns` v4 (`formatDistanceToNow` in signals tab, `format` in signal-history)
- Test report: `/app/test_reports/iteration_26.json` — 8/8 tests pass

### Immediate Auth State Sync Architecture (Verified — Apr 3 2026)
- **Root cause fixed**: Previous `onAuthStateChange` called `await fetchProfile()` (Supabase DB query) — blocked `setUser`, UI never updated after OAuth
- **New pattern**: `setUser(buildUserFromSession(session.user))` — IMMEDIATE, synchronous, no API call
- **Background enrichment**: `enrichProfile()` runs AFTER state update, not awaited — loads admin role, name from profiles table without blocking UI
- **Logout**: `signOut()` → `setUser(null)` → `setToken(null)` → `setIsLoading(false)`. No navigation — `_layout.tsx` reacts.
- **Navigation**: ONLY in `_layout.tsx` useEffect `[isLoading, user, isAdmin]`
- Test report: `/app/test_reports/iteration_31.json` — 9/9 tests pass (100%)
- **Auth Lifecycle**: Logout now clears local state (`setUser(null)`, `setToken(null)`) BEFORE calling `supabase.auth.signOut()` — deterministic even if signOut hangs
- **API Consistency**: Verified all 26+ files use `@/services/api` axios instance. Only 1 raw `fetch()` exists for external RSS feeds — correct behavior.
- **Academy Crash (Role-Based)**: All 3 academy screens (`index.tsx`, `[category].tsx`, `lesson.tsx`) now validate data shape (`typeof completed_lessons === 'number'`, `typeof data.by_course === 'object'`, `Array.isArray(done)`) before setting state — prevents crash when backend returns error objects or restricted data for non-admin users
- **Dashboard Consistency**: Admin dashboard = global stats (`/admin/stats`), User dashboard = personal stats (SignalContext). Intentionally different — documented.
- **App Stability**: Auth bootstrap blocks rendering until `getSession()` resolves; no unhandled promise rejections in academy or auth flows
- Test report: `/app/test_reports/iteration_28.json` — 5/7 PASS, 2 BLOCKED by invalid Supabase credentials (not code bugs)
- **Supabase credential issue**: All 3 test accounts (`ellapauledache@`, `ellaniswell@`, `paradoxella@`) returning "Invalid login credentials" — user must verify Supabase auth settings

## Prioritized Backlog

### P0 (Immediate)
- ~~Signal Engine v3.1 execution accuracy — VERIFIED (52/52 tests pass)~~
- ~~5 Frontend Production Bug Fixes — VERIFIED (8/8 tests pass, Apr 2 2026)~~
- ~~7 Frontend Architectural Fixes — VERIFIED (7/7 tests pass, Apr 2 2026)~~
- **Supabase Dashboard Config** (USER ACTION): Set Site URL to HTTPS domain in Supabase Dashboard → Auth → URL Configuration

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

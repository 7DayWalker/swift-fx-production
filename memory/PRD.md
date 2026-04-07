# Swift FX — Product Requirements Document

## Original Problem Statement
A React Native (Expo) mobile trading signals app with AI analysis, community feed, academy, and admin dashboard. Users subscribe (free/premium/VIP) to access tiered features. Revenue is generated through in-app purchases and Google AdMob ads (Banner, Interstitial, Native, Rewarded).

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router
- **Backend**: FastAPI (monolith `server.py`)
- **Database**: MongoDB (signals, analyses, logs) + Supabase/Postgres (auth, profiles)
- **Ads**: `react-native-google-mobile-ads` v16
- **Notifications**: Expo Push API
- **IAP**: `react-native-iap` v14.7.20

## Core Features (Implemented)
- Trading Signals with Trailing Stop Loss logic
- AI Chart Analyzer (OpenAI GPT-4o)
- Community Feed with image uploads
- Academy (Beginner/Intermediate/Advanced courses)
- Admin Dashboard (ADMIN + SUPER_ADMIN roles)
- Subscription Override System (admin-granted tiers)
- Push Notifications (new signals, TP hits, signal close)
- AdMob Integration (Banner, Interstitial, Native, Rewarded)
- Trading Pairs (custom pair picker)

## What's Been Implemented

### Session (April 7, 2026) — Ad Bug Fixes
- **Fix 1: Interstitial Ad** — Changed `INTERSTITIAL_ACTION_THRESHOLD` from 4 to 1 and `INTERSTITIAL_COOLDOWN_MS` from 120000 to 0 in `adManager.ts`. Interstitial now shows after every AI analysis for free users.
- **Fix 2: Native Ads** — Rewrote `NativeAdCard.tsx` to use the correct Promise-based API (`NativeAd.createForAdRequest().then(setNativeAd)`) instead of the broken imperative `.load()` pattern. Now renders actual ad data from resolved NativeAd object.
- **Fix 3: Rewarded Ad** — Converted `useRewardedAd.ts` from ref-based (`useRef`) to state-based (`useState`) ad load tracking. This triggers re-renders when the ad loads, allowing the "Watch Ad to Unlock" button in Academy to properly reflect ad readiness state. Button is now disabled with "Ad Loading..." text until the ad is ready.

### Previous Sessions
- Push Notifications (backend + frontend)
- Trailing Stop Loss (SL moves to entry on TP1, SL to TP1 on TP2)
- Community image upload fix
- Styled logout modal
- Signal timestamp formatting
- Streak Reminders background task
- Admin Subscription Override System (grant/revoke/audit logs)
- Admin Read-Only View for regular admins
- User list role display fix
- EAS build config (auto-increment versions, AdMob IDs)

## Prioritized Backlog

### P1 (High Priority)
- End-to-End IAP testing on physical devices (Apple)
- Add `SUPABASE_SERVICE_KEY` to production `.env` for notification preferences

### P2 (Medium Priority)
- Implement a leaderboard/feed of top shared AI analyses
- Reliable alternative Gold price API (current sources rate-limited)
- Push notifications on new signal creation with confidence score
- Real-time polling for Admin Health widget

### P3 (Low Priority / Refactoring)
- **Refactor `server.py`** — file exceeds 8,500 lines, must be split into domain-specific modules using FastAPI `APIRouter`

## Key Files
- `/app/frontend/src/services/adManager.ts` — Ad unit IDs and frequency gate
- `/app/frontend/src/components/ads/` — AdBanner, NativeAdCard, useInterstitialAd, useRewardedAd (+ web stubs)
- `/app/frontend/app/(tabs)/ai.tsx` — AI Analyzer screen
- `/app/frontend/app/news/index.tsx` — Market News feed
- `/app/frontend/app/academy/[category].tsx` — Academy course list
- `/app/backend/server.py` — Monolith backend

## Known Issues
- Expo/ngrok tunnel instability (frequent 502 errors, requires service restarts)
- Native ad testing requires EAS native builds (web preview uses no-op stubs)

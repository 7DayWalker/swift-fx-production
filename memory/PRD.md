# Swift FX Signals — Product Requirements Document

## Original Problem Statement
A full-stack trading signals application (Expo React Native + FastAPI + MongoDB + Supabase) with tiered subscriptions, AI chart analysis, academy, community feed, fund management, and admin dashboard.

## Core Architecture
- **Frontend**: React Native (Expo Router), deployed via EAS
- **Backend**: FastAPI monolith (`server.py` ~9000 lines)
- **Auth/Profiles**: Supabase (Postgres)
- **Data**: MongoDB (signals, posts, logs, portfolios)
- **LLM**: OpenAI GPT-4o via `emergentintegrations`

## What's Been Implemented

### AdMob Monetization System (Completed — Feb 2026)
- **AdBanner** integrated as fixed-bottom component on 7 screens: Dashboard, Signals, AI Analyzer, More/Settings, Academy, Calendar, News
- **Interstitial ads** (frequency-gated: 4 actions + 2-min cooldown) on Signals (pull-to-refresh) and AI Analyzer (after analysis completes)
- **Rewarded ads** on Academy ("Watch Ad to Preview" unlocks locked content for free users)
- **Subscription gating**: All ads return `null` for `premium`, `vip`, and `admin` users — ad-free experience guaranteed
- **Platform-safe**: `.web.tsx` stubs prevent `react-native-google-mobile-ads` from crashing web bundler; `adManager.ts` uses hardcoded Google test IDs (no native SDK import at module level)
- **UX rules followed**: Banners fixed at bottom (no scroll), no layout shifts, interstitials only after meaningful completed actions
- Removed deprecated `MockAdBanner` component

### Previously Completed
- Community Feed DB Migration (MongoDB)
- Fund Management Sync (auto-create investor portfolios)
- API Client Standardization (centralized `api.ts`)
- OAuth Deep Linking Fix (`swiftfx://auth`)
- Backend Deployment Fix (Railway + emergentintegrations)
- EAS & Firebase Config
- Admin Subscription Override System (grant/revoke/audit)
- Admin Read-Only View for overrides
- Trading Pairs feature

## Prioritized Backlog

### P1
- End-to-End IAP testing on physical devices
- Verify AdMob ads render correctly on native iOS/Android builds (requires EAS build)

### P2
- Reliable alternative Gold price API
- Smart push reminders for streak-at-risk users
- Push notifications on new signal creation
- Leaderboard of top shared AI analyses

### P3
- Refactor `server.py` (9000+ lines) into modular FastAPI routers

## Key Technical Notes
- AdMob uses Google well-known TEST IDs — swap to production IDs before App Store submission
- `react-native-google-mobile-ads` is native-only; web preview always shows null for ads
- Ad frequency gate: `adManager.ts` tracks action count + cooldown timer
- All frontend API calls must use centralized `api.ts` client
- Backend `requirements.txt` first line must be `--extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/`

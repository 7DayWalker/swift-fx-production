# SwiftFX Trading Signals Platform - PRD

## Original Problem Statement
Full-stack trading signals platform (React Native/Expo + FastAPI + Supabase). Key features include real-time signals, AI chart analyzer, subscription management, and community features.

## Core Requirements
- Signal visibility gating by subscription tier (Free/Premium/VIP)
- AI Chart Analyzer with tier-based weekly usage limits
- Subscription management with IAP support
- Admin/Super Admin role system

## Architecture
- **Frontend**: React Native (Expo), Expo Router, Tamagui, React Context state management
- **Backend**: FastAPI, async/await, Supabase REST API
- **Auth**: Supabase JWT
- **Database**: Supabase (PostgreSQL) for primary data, MongoDB for secondary AI features

## DB Schema (Key Tables)
- `profiles`: {id, role, ai_weekly_used, ai_weekly_reset, ...}
- `subscriptions`: {id, user_id, plan_id, status, current_period_end, ...}
- `plans`: {id, tier ('free'|'premium'|'vip'), ...}

## Tier Resolution Logic (Source of Truth)
Precedence: super_admin → vip, admin → vip, Active VIP subscription → vip, Active Premium subscription → premium, else → free

## What's Been Implemented

### Completed (Feb 2026)
- [x] Backend subscription tier resolution (server.py, supabase_auth.py) - queries subscriptions + plans tables
- [x] AI Analyzer authentication fix (auth header in ai.tsx)
- [x] PressableScale micro-interactions (partial - reverted on More screen)
- [x] **Frontend tier resolution consistency fix** (ai.tsx) - uses SubscriptionContext instead of stale profiles.role
  - Fixed `user.id` → `user.user_id` bug in profiles query
  - Unlimited display handling for VIP users
  - Debug console.logs added (to be removed after user verification)

### Contexts Verified Correct
- SubscriptionContext.tsx - queries subscriptions + plans tables
- SignalContext.tsx - queries subscriptions + plans tables
- SubscriptionBadge.tsx - uses SubscriptionContext

## Pending
- [ ] User verification of frontend tier fix
- [ ] Remove debug console.logs after verification confirmed
- [ ] PressableScale: Fix for flexDirection: 'row' layouts (reverted on More screen)

## Tier Limits
- VIP: unlimited AI analyses/week
- Premium: 10 AI analyses/week
- Free: 3 AI analyses/week

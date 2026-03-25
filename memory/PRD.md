# Swift FX Signals - Product Requirements Document

## Overview
A full-stack trading signals application built with Expo (React Native) frontend and FastAPI backend. Features trading signals, AI analysis, community feed, multi-level admin dashboard, and a gamified Academy learning system.

## Tech Stack
- **Frontend**: Expo (React Native) with TypeScript
- **Backend**: FastAPI (Python) — monolith in `server.py`
- **Auth**: Supabase (Postgres)
- **DB**: MongoDB (signals, analyses, academy, audit logs)
- **AI**: OpenAI GPT-4o via Emergent LLM Key
- **TTS**: OpenAI TTS via Emergent LLM Key (VIP), expo-speech (Free/Premium)

## User Tiers
- **Free**: Basic signals, beginner academy courses
- **Premium**: Advanced signals, intermediate academy
- **VIP**: All features, advanced academy, AI TTS narration
- **Admin**: Full VIP access + admin panel

## Core Features

### 1. Trading Signals System
- Signal creation/management (admin)
- Real-time signal display
- Trading pairs selector

### 2. AI Analyzer
- GPT-4o powered market analysis
- Community sharing

### 3. Admin Dashboard
- RBAC: ADMIN and SUPER_ADMIN roles
- User management with subscription override
- Read-only view for regular admins
- Audit logging for sensitive actions

### 4. Academy System (COMPLETED - Feb 25, 2026)
Full premium gamified learning engine:

**Backend Endpoints:**
- `POST /api/academy/lesson-complete` — Mark lesson complete
- `GET /api/academy/progress` — Get user's academy progress
- `POST /api/academy/quiz-submit` — Submit quiz with scoring
- `GET /api/academy/leaderboard` — XP-based rankings
- `POST /api/academy/tts` — VIP OpenAI TTS with MongoDB caching

**Frontend Screens:**
- `academy/index.tsx` — Progress widget + category list
- `academy/[category].tsx` — Course list with progress bars
- `academy/lesson.tsx` — Full learning engine with:
  - Sequential lesson locking (N requires N-1 complete)
  - Lesson completion tracking
  - Coming Soon video banner (premium placeholder)
  - Dual-tier TTS (expo-speech free, OpenAI VIP)
  - Quiz system with randomization, scoring, XP
  - Key Takeaways cards
  - Success animations + haptic feedback
- `academy/leaderboard.tsx` — XP rankings with podium

**Data:**
- `academyContent.ts` — 24 courses, 150 lessons across 3 tiers
- `academy_progress` MongoDB collection
- `academy_tts_cache` MongoDB collection

### 5. Subscription System
- IAP integration (Apple App Store)
- Subscription override system for admins

## Key DB Collections (MongoDB)
- `signals`, `analyses`, `community_posts`
- `academy_progress` — lesson completions, quiz scores, XP
- `academy_tts_cache` — cached TTS audio (base64)
- `subscription_override_logs` — audit trail

## Testing
- Backend: 24/24 academy tests passing (iteration_16)
- Frontend: All screens verified via screenshots
- Test file: `/app/backend/tests/test_academy_endpoints.py`

---

## Completed Work

### Session 1-3 (Previous)
- Trading signals system
- AI analyzer with GPT-4o
- Community feed
- Admin dashboard with RBAC
- Subscription override system
- Trading pairs feature

### Session 4 (Feb 25, 2026)
- Fixed "Create Admin" infinite spinner
- Enhanced Admin capability tier UI labeling
- Updated support email to support@swiftfx.online
- **Academy Backend**: Progress tracking, lesson completion, quiz scoring, leaderboard, TTS endpoints

### Session 5 (Feb 25, 2026) — Current
- **Academy Frontend Complete**: All 4 screens implemented
- Category page with per-course progress bars
- Lesson page with sequential locking, completion tracking
- Coming Soon video banner component
- Dual-tier TTS (expo-speech + OpenAI VIP)
- Quiz system with scoring, XP, animated results
- Leaderboard screen with podium + rankings
- Admin privilege access fix across all academy screens
- Testing: 24/24 backend tests, frontend verified

---

## Upcoming Tasks (Prioritized)

### P1
- End-to-End IAP testing on physical devices

### P2
- Reliable alternative Gold price API
- Push notifications on new signals
- Leaderboard/feed of top shared AI analyses
- Real-time polling for Admin Health widget

### P3
- **Refactor server.py** (8500+ lines) into modular FastAPI routers

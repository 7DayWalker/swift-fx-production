# Swift FX Signals - Product Requirements Document

## Overview
A full-stack trading signals application built with Expo (React Native) frontend and FastAPI backend. Features trading signals, AI analysis, community feed, multi-level admin dashboard, and a gamified Academy learning system with streak-based engagement.

## Tech Stack
- **Frontend**: Expo (React Native) with TypeScript
- **Backend**: FastAPI (Python) — monolith in `server.py`
- **Auth**: Supabase (Postgres)
- **DB**: MongoDB (signals, analyses, academy, streaks, audit logs)
- **AI**: OpenAI GPT-4o via Emergent LLM Key
- **TTS**: OpenAI TTS via Emergent LLM Key (VIP), expo-speech (Free/Premium)

## Core Features

### 1. Academy System (Full Premium Learning Engine)

**Backend Endpoints:**
- `POST /api/academy/lesson-complete` — Mark lesson complete, returns XP breakdown
- `GET /api/academy/progress` — User's course-by-course progress
- `POST /api/academy/quiz-submit` — Quiz scoring with XP rewards
- `GET /api/academy/leaderboard` — XP-based global rankings
- `POST /api/academy/tts` — VIP OpenAI TTS with MongoDB caching
- `GET /api/academy/streak-status` — Current streak, shield, risk status

**XP Economy:**
- Lesson completion: +20 XP
- Quiz pass (60-99%): +40 XP
- Perfect quiz (100%): +60 XP
- Daily streak bonus: +10 XP
- 7-day streak milestone: +50 XP bonus
- Farming prevention: 0 XP for duplicate completions

**Streak System:**
- +1 streak on daily lesson/quiz completion
- 24h inactivity resets streak
- VIP Streak Shield: 1 missed day protection per week
- Tracks current_streak, longest_streak, last_activity_date

**Frontend Screens:**
- `academy/index.tsx` — Progress widget + streak badge + XP rewards card + categories
- `academy/[category].tsx` — Course list with progress bars
- `academy/lesson.tsx` — Full learning engine (completion, TTS, quiz, animations)
- `academy/leaderboard.tsx` — XP rankings with podium
- `academy/_layout.tsx` — Route definitions

**MongoDB Collections:**
- `academy_progress` — lesson completions, quiz scores
- `academy_streaks` — streak data per user
- `academy_leaderboard` — XP rankings
- `academy_tts_cache` — cached TTS audio

### 2. Trading Signals System
- Signal creation/management (admin)
- Real-time signal display
- Trading pairs selector

### 3. AI Analyzer
- GPT-4o powered market analysis
- Community sharing

### 4. Admin Dashboard
- RBAC: ADMIN and SUPER_ADMIN roles
- User management with subscription override
- Read-only view for regular admins
- Audit logging for sensitive actions

### 5. Subscription System
- IAP integration (Apple App Store)
- Capability tier gating (Free/Premium/VIP)
- Admin privilege auto-grants VIP access

---

## Completed Work

### Sessions 1-3 (Previous)
- Trading signals, AI analyzer, community feed
- Admin dashboard with RBAC, subscription override

### Session 4 (Feb 25, 2026)
- Fixed "Create Admin" infinite spinner
- Admin capability tier UI labeling
- Support email update

### Session 5 (Feb 25, 2026)
- Academy Backend: progress, completion, quiz, leaderboard, TTS endpoints
- Academy Frontend: All 4 screens with sequential locking, dual-tier TTS, quiz scoring

### Session 6 (Feb 25, 2026) — Current
- **Daily Streak System**: Backend streak tracking with 24h reset, VIP Shield
- **XP Economy**: Lesson +20, Quiz +40/+60, Streak +10, 7-day milestone +50
- **Farming Prevention**: 0 XP for re-completed lessons
- **Streak UI**: Animated fire badge on Academy home, XP reward display on completion
- **Testing**: 20/20 backend tests passed, frontend 100% verified

---

## Upcoming Tasks

### P1
- End-to-End IAP testing on physical devices

### P2
- Reliable alternative Gold price API
- Push notifications on new signals
- Leaderboard/feed of top shared AI analyses
- Real-time polling for Admin Health widget

### P3
- **Refactor server.py** (8500+ lines) into modular FastAPI routers

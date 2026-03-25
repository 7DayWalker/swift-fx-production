# Swift FX Signals - Product Requirements Document

## Overview
A full-stack trading signals application built with Expo (React Native) frontend and FastAPI backend. Features trading signals, AI analysis, community feed, multi-level admin dashboard, and a gamified Academy learning system with streak-based engagement and AI-generated enriched content.

## Tech Stack
- **Frontend**: Expo (React Native) with TypeScript
- **Backend**: FastAPI (Python) — monolith in `server.py`
- **Auth**: Supabase (Postgres)
- **DB**: MongoDB Atlas (signals, analyses, academy, streaks, content, audit logs)
- **AI**: OpenAI GPT-4o via Emergent LLM Key (content generation + analysis)
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
- `GET /api/academy/lesson-content/{course_id}/{lesson_id}` — Enriched AI-generated content
- `POST /api/academy/generate-content-batch` — Super admin batch content generation

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

**Enriched Content (COMPLETED - Feb 25, 2026):**
- 132 non-quiz lessons regenerated with GPT-4o
- Structured sections: Overview (400-700 words), How to Apply This, Mini Action Task, Key Takeaways
- Tier-appropriate tone: Beginner=foundational, Intermediate=strategic, Advanced=institutional
- Real trading examples and psychological insights in every lesson
- Stored permanently in MongoDB `academy_lesson_content` collection
- Frontend fetches and displays all sections with themed UI

**Frontend Screens:**
- `academy/index.tsx` — Progress widget + streak badge + XP rewards card + categories
- `academy/[category].tsx` — Course list with progress bars
- `academy/lesson.tsx` — Full learning engine with enriched content, TTS, quiz, animations
- `academy/leaderboard.tsx` — XP rankings with podium

**UI Components (Verified Feb 25, 2026):**
- `FormattedContent` — Justified text, paragraph breaks, auto-detected Trading Example callouts
- `ConceptDiagram` — Dynamic diagrams (Risk/Reward, Candlestick, Support/Resistance, Trend, Psychology)
- `TTSPlayerBasic` — Built-in expo-speech for Free/Premium users
- `TTSPlayerVIP` — OpenAI TTS for VIP users on Advanced courses

**MongoDB Collections:**
- `academy_progress` — lesson completions, quiz scores
- `academy_streaks` — streak data per user
- `academy_leaderboard` — XP rankings
- `academy_tts_cache` — cached TTS audio (base64)
- `academy_lesson_content` — 132 enriched lesson documents

### 2. Trading Signals System
- Signal creation/management (admin)
- Real-time signal display, Trading pairs selector

### 3. AI Analyzer
- GPT-4o powered market analysis, Community sharing

### 4. Admin Dashboard
- RBAC: ADMIN and SUPER_ADMIN roles
- User management with subscription override
- Audit logging for sensitive actions

### 5. Subscription System
- IAP integration (Apple App Store)
- Capability tier gating (Free/Premium/VIP)
- Admin privilege auto-grants VIP access

---

## Completed Work

### Sessions 1-4 (Previous)
- Trading signals, AI analyzer, community feed
- Admin dashboard with RBAC, subscription override
- Create Admin fix, Admin capability tier UI

### Session 5 (Feb 25, 2026)
- Academy Backend + Frontend: All screens, sequential locking, dual-tier TTS, quiz scoring

### Session 6 (Feb 25, 2026)
- Daily Streak System + XP Economy with farming prevention
- Streak UI with animated fire badge

### Session 7 (Feb 25, 2026)
- **Enriched Content Generation**: GPT-4o generated 132 lessons with structured content
- **New Sections**: "How to Apply This" (practical steps), "Mini Action Task" (exercises)
- **Content Quality**: 400-700 words average, real trading examples, psychological insights
- **Tier Differentiation**: Beginner=foundational, Intermediate=strategic, Advanced=institutional
- **Backend**: Content retrieval endpoint + admin batch generation endpoint
- **Frontend**: Enriched content display with themed section cards
- **Testing**: 15/15 backend, 100% frontend (iteration_18)

### Session 8 (Feb 25, 2026)
- **UI Formatting**: FormattedContent component (justified text, paragraph breaks, Trading Example callouts)
- **Concept Diagrams**: ConceptDiagram component (Risk/Reward, Candlestick, Support/Resistance, Trend, Psychology)
- **Verification**: All UI components visually verified via screenshots - rendering correctly

---

## Upcoming Tasks

### P1
- End-to-End IAP testing on physical devices

### P2
- Reliable alternative Gold price API
- Push notifications on new signals
- Smart push reminders for streak-at-risk users
- Leaderboard/feed of top shared AI analyses
- Real-time polling for Admin Health widget

### P3
- **Refactor server.py** (9000+ lines) into modular FastAPI routers

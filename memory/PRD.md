# SwiftFX Signals — Product Requirements Document

## Original Problem Statement
A React Native (Expo) mobile trading signals app with FastAPI backend + MongoDB. Features include Supabase Auth, Expo Push Notifications, Google AdMob, Expo In-App Purchases, Community feed, AI Analyzer, and a real-time Signal engine with trailing stop-loss.

## Current Focus
Android push notification delivery — root cause identified as Firebase project misconfiguration.

---

## ROOT CAUSE: Android Push Notifications (Apr 14, 2026)

**Traced via `/api/debug/android-push-trace` endpoint.**

### Evidence Chain
1. Backend sends push to Expo API → Expo returns `status: ok`, ticket ID assigned ✅
2. Expo forwards to FCM (Google) → FCM returns **HTTP 403 PERMISSION_DENIED** ❌
3. Android device receives NOTHING

### FCM Error (verbatim)
```
"code": 403,
"message": "Permission denied on resource project swift-fx-signals.",
"status": "PERMISSION_DENIED",
"reason": "CONSUMER_INVALID",
"service": "fcm.googleapis.com"
```

### What This Means
- Token is VALID (Expo accepted it)
- Token is FRESH (last_seen today)
- projectId IS present in frontend code
- Payload structure is correct
- **The Firebase Cloud Messaging API (V1) is disabled or misconfigured on Firebase project `swift-fx-signals`**

### Required Fix (User Action)
1. Go to https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=swift-fx-signals
2. **Enable** "Firebase Cloud Messaging API (V1)"
3. Verify at Firebase Console → Project Settings → Cloud Messaging → server key not disabled
4. Re-run trace: `POST /api/debug/android-push-trace` → receipt should show `status: ok`

---

## iOS 3x Duplicate Fix (Apr 14, 2026) — RESOLVED
Root cause: Same iOS push token registered under 3 different user accounts.
Fix: `register-token` deactivates token across all other users. Cleanup endpoint Phase 2 added.

## Completed Features
- Signal Engine, Community feed, Dashboard, AI Analyzer, Supabase Auth, AdMob
- EAS remote versioning, notification deduplication, trailing stop-loss
- Trace logging on all notification trigger sites
- `ANDROID_PUSH_PAYLOAD` and `ANDROID_TRACE_*` logging

## Diagnostic Endpoints
- `POST /api/debug/android-push-trace` — Isolated single-device Android push test with full Expo receipt
- `POST /api/debug/cleanup-device-tokens` — Phase 1+2 token deduplication

## Upcoming Tasks
- P0: Enable FCM API V1 on Firebase project (user action)
- P1: E2E IAP testing on physical Apple devices
- P2: Alternative Gold price API
- P3: Refactor server.py (8500+ lines)

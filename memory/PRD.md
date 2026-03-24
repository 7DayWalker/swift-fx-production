# Swift FX Signals - Product Requirements Document

## Original Problem Statement
Professional trading signals mobile app (Expo SDK 54 + React Native) with FastAPI backend, MongoDB data store, and Supabase authentication. Production-grade cross-platform subscription system with iOS/Android In-App Purchases.

## Architecture
- **Frontend**: Expo SDK 54, Expo Router v6, React 19.1.0, Reanimated v4.1.1, react-native-iap
- **Backend**: FastAPI + MongoDB (signals, iap_transactions) + Supabase (auth, profiles)
- **Auth**: Supabase auth with RBAC (Super Admin, Admin, User roles)
- **Payments**: In-App Purchase only (Stripe removed). iOS + Android IAP configured.

## Signal Lifecycle Engine v3.0 (Feb 26, 2026)

### Major Redesign - Deterministic Auditable Mode

**Architecture:**
- SNAPSHOT-BASED, POLLING-DRIVEN signal lifecycle engine
- NOT tick-level real-time execution, NOT broker execution
- Deterministic: Same inputs always produce same outputs
- Gap-protected: Price gaps use defined SL/TP/Entry, not jumped prices
- Auditable: Every closure stores full price trace and source

**Configuration:**
- Poll interval: 5 seconds (configurable via `SIGNAL_POLL_INTERVAL` env var)
- Min poll interval: 3 seconds
- Max poll interval: 300 seconds
- Single instance enforcement via distributed lock

**Price Sources (NO HARDCODED FALLBACKS):**
- Forex: frankfurter.app (free API, mid-rate)
- Gold: goldapi.io → CoinGecko PAX Gold fallback
- Crypto: CoinGecko
- If ALL APIs fail for a symbol → symbol is SKIPPED (no fake prices)

**Gap Protection Rules:**
- Pending activation: Uses DEFINED entry price, not gapped market price
- SL closure: Uses DEFINED SL price, not gapped market price
- TP closure: Uses DEFINED TP price, not gapped market price
- Example: If BUY SL=4111 and price gaps 4200→4100, closes at 4111 (not 4100)

**Audit Trail Fields Stored at Closure:**
- exit_price, exit_reason
- pip_size, pip_multiplier, pip_math_trace
- price_source, poll_timestamp
- closure_last_price, closure_current_price
- For activations: activation_price_source, activation_poll_timestamp

**Test Simulation Endpoint:**
- POST /api/admin/automation/test-simulation
- Simulates gap scenarios to verify deterministic behavior

## Monetization Model (LOCKED)
- **PREMIUM**: Premium Forex Signals, Advanced insights, 10 AI analyses/week
- **VIP**: VIP Signals + Premium included, Unlimited AI, Academy, Fund Management
- VIP > Premium. VIP inherits all Premium access.

## Official Product IDs
```
com.swiftfx.signals.premium.weekly
com.swiftfx.signals.premium.monthly
com.swiftfx.signals.premium.yearly
com.swiftfx.signals.vip.weekly
com.swiftfx.signals.vip.monthly
com.swiftfx.signals.vip.yearly
```

## Entitlement Authority
- Backend `/api/subscription/status` is the ONLY authority
- Entitlement derived strictly from MongoDB `iap_transactions`
- `get_effective_subscription()` unified to use MongoDB (same source)
- No Supabase profile.role fallback for subscription tier
- `is_admin` grants feature access, does NOT inflate tier
- Frontend must NOT unlock content based on local purchase state

## Production Readiness (Completed Feb 22, 2026)

### Production Fixes Applied
- [x] Fix 1: Google mock expiry removed — rejects if no expiryTimeMillis
- [x] Fix 2: APPLE_ENVIRONMENT has no default — fails fast if not set
- [x] Fix 3: Unified MongoDB entitlement resolution across ALL endpoints
- [x] Fix 4: MongoDB indexes created on startup (10 indexes across 6 collections)
- [x] Fix 5: CORS cleaned — env-var-driven, no localhost/preview/regex
- [x] Fix 6: Critical env vars fail fast (SUPABASE_URL, SERVICE_KEY, EMERGENT_LLM_KEY)
- [x] Fix 7: /api/health endpoint added
- [x] Testing: 17/17 backend tests passed (iteration_8)

### Required Production Environment Variables
```
MONGO_URL=<production_mongo_uri>
DB_NAME=swiftfx_db
SUPABASE_URL=<supabase_project_url>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_key>
EMERGENT_LLM_KEY=<llm_key>
APPLE_SHARED_SECRET=<app_store_shared_secret>
APPLE_BUNDLE_ID=com.swiftfx.signals
APPLE_ENVIRONMENT=production
GOOGLE_SERVICE_ACCOUNT_JSON=<service_account_json>
GOOGLE_PACKAGE_NAME=com.swiftfx.signals
CORS_ORIGINS=<production_frontend_url>
```

## Pricing Authority
- Store (Apple/Google) is the ONLY pricing authority
- Backend `/api/subscription/plans` returns metadata only (no pricing fields)
- Frontend uses `react-native-iap.getSubscriptions()` → `localizedPrice`
- Loading spinner shown when store products unavailable

## Prioritized Backlog

### P1 — Full IAP End-to-End Test
- Build native APK via EAS
- Test purchase flow on Android internal testing + iOS TestFlight
- Verify receipt validation with Apple/Google
- Test restore purchases + subscription expiry

### P2 — Production Infrastructure
- Persistent backend domain
- FCM/APNs production push notification credentials
- OAuth production redirect URLs

### P3 — Investment Tier Features
- Fund management, investor dashboard, fund performance tracking

### P4 — Admin Enhancements
- Support ticket system, referral tracking

## Production Hardening (Completed Feb 26, 2026)

### Security & Performance Fixes Applied
- [x] Removed legacy `/api/iap/status` endpoint (use `/api/subscription/status`)
- [x] Removed disabled webhook endpoints (`/webhooks/apple`, `/webhooks/google`)
- [x] Fixed unbounded MongoDB queries: `to_list(None)` → `to_list(10000)` for device_tokens
- [x] Optimized dashboard stats: Replaced in-memory loop with MongoDB aggregation pipeline
- [x] CORS validation: Origins must be valid URLs (http:// or https://), logged at startup
- [x] Fixed `/api/support/info` endpoint crash for unauthenticated users

### Admin & User Features Verified
All 11 screens are functional with no ComingSoonGate blocks:
- Admin Fund Applications (`/admin/fund-applications.tsx`)
- Admin Referrals (`/admin/referrals.tsx`)
- Fund Management (`/fund-management.tsx`)
- Help & Support (`/help-support.tsx`)

## Legal Links — External Browser (March 2026)
- All Privacy Policy / Terms / Risk Disclaimer links now open `https://swiftfx.online/{privacy-policy,terms,risk-disclaimer}` via `Linking.openURL`
- Replaced inline modal (settings.tsx) with direct Linking call
- Files changed: `settings.tsx`, `app/(auth)/register.tsx`, `subscription.tsx`

## Apple Server Notifications V2 Webhook (Completed Mar 2026)

### Endpoint: POST /api/webhooks/apple

**Security Model (V2 — JWS-based, NO shared secret):**
- Apple V2 notifications are JWS compact serializations: `header.payload.signature`
- Header contains `x5c` certificate chain (Apple-signed)
- Algorithm: ES256 (ECDSA with P-256 + SHA-256)
- Server verifies: cert chain integrity + JWS signature against leaf cert public key
- Root cert CN must contain "Apple" (basic chain pinning)
- Tampered/forged notifications return HTTP 401

**Notification types handled:**
- SUBSCRIBED → upgrades user role in MongoDB + Supabase
- DID_RENEW → same as SUBSCRIBED (re-activates)
- DID_CHANGE_RENEWAL_STATUS → updates auto_renew flag in MongoDB
- DID_FAIL_TO_RENEW → sets billing_issue status in MongoDB
- EXPIRED / GRACE_PERIOD_EXPIRED → downgrades user to free tier
- REFUND → revokes access, downgrades to free tier
- REVOKE → same as REFUND (family sharing)
- DID_CHANGE_RENEWAL_PREF → records plan change in MongoDB

**Supabase update:** Only `role` field is updated (only column that exists in profiles table).
**MongoDB:** `iap_transactions` is the entitlement authority — all state stored there.
**Audit trail:** Every notification stored in `audit_logs` collection with payload hash.

**Tested:** 7/7 tests passed (missing field → 400, tampered JWS → 401, all notification types → 200 + Supabase 204)

**App Store Connect Configuration:**
- Webhook URL: `https://<railway-domain>/api/webhooks/apple`
- Version: V2
- No shared secret needed (pure JWS cryptographic verification)


- Fixed expo-router/internal module resolution issues for web preview
- Created shims in `node_modules/expo-router/internal/` for:
  - `routing.js` → redirects to matchers, getRoutesCore, sortRoutes
  - `testing.js` → redirects to testing-library/context-stubs
  - `utils.js` → redirects to utils/url
- Web preview now working at https://locked-signals-ui.preview.emergentagent.com

## Premium/VIP Upgrade UX (Completed Mar 24, 2026)

### UpgradeKit.tsx — Shared Premium UI Components
- `LockedSignalBody`: Blurred price preview + benefit checklist + pulsing CTA (used in locked signal cards)
- `UpgradeBanner`: Compact gold-accented banner (used on dashboard for free users)
- `BenefitChecklist`, `UrgencyLine`, `CtaButton`, `BlurredPricePreview`: Composable sub-components
- Pulsing CTA animation via `useCtaPulse()` (6s interval, native driver)

### Files Updated
- `app/(tabs)/signals.tsx`: Locked cards now use `<LockedSignalBody>` with blurred preview + animated CTA → routes to `/subscription`
- `app/(tabs)/dashboard.tsx`: Premium card layout with category chips, state badges, left accent stripes + `<UpgradeBanner>`
- `src/components/UpgradeKit.tsx`: New shared component library

## Test Credentials
- VIP user: paradoxella@gmail.com / Grace1992@
- Admin: ellapauledache@gmail.com / Grace1992@

## AI Chart Analyzer Upgrade (Completed Mar 24, 2026)

### Backend Enhancements
- `/api/ai/analyze` now returns: `analysis_id`, `trade_bias` (BUY/SELL/WAIT), `confidence_score` (0-100), `analysis_text`, `detected_pattern`, plus original fields
- Every analysis auto-saved to MongoDB `ai_analyses` collection with: user_id, pair, timeframe, trade_bias, confidence_score, analysis_text, image_snapshot (truncated 200KB), created_at
- New `/api/ai/history` — paginated, sorted newest-first, excludes heavy image_snapshot in list view
- New `/api/ai/history/{analysis_id}` — full detail including image_snapshot for reopening past analyses
- Usage enforcement: weekly counter + 7-day auto-reset (stored in Supabase profiles)

### Frontend Enhancements (`app/(tabs)/ai.tsx`)
- **TradeBiasBadge**: Prominent BUY (green) / SELL (red) / WAIT (amber) badge with directional icon
- **ConfidenceMeter**: Animated horizontal bar (0-100%) with color gradient (green/amber/red)
- **AnalyzingProgress**: 4-step progress (Uploading → Analyzing → Generating Insight → Completed) with animated pulse
- **SuccessFlash**: Spring scale-in checkmark animation on analysis completion
- **Recent Analyses**: Collapsible history section showing past analyses with pair, bias, confidence, pattern, time ago
- **Tap-to-reopen**: Tapping history card fetches full saved result (including chart image) and displays it
- **UpgradeNudge**: Conversion card ("Upgrade to VIP for unlimited AI analyses") shown to non-VIP users after results
- **Detected Pattern**: Shows chart pattern name (Double Top, Head and Shoulders, etc.) when identified

### Testing
- 10/10 backend tests passed (auth, pagination, field validation, persistence, detail endpoint)
- Legacy duplicate `/api/ai/history` endpoint removed (was conflicting with new paginated version)
- Test file: `/app/backend/tests/test_ai_analyzer_upgrade.py`

## AI Analysis Sharing (Completed Mar 24, 2026)

### Backend
- `POST /api/ai/share/{analysis_id}` — generates a 16-char `share_token`, stores in doc, idempotent (reuses existing token)
- `GET /api/ai/shared/{share_token}` — public endpoint (no auth), returns analysis without user_id/image_snapshot, increments view_count
- `POST /api/ai/share/{analysis_id}/community` — creates community post with `post_type: "ai_analysis"`, includes pair, bias, confidence, pattern

### Frontend (`ai.tsx`)
- **Share button** in result header (share-outline icon) opens bottom sheet modal
- **ShareModal**: slide-up sheet with 3 options:
  - Copy Link — generates public URL via share endpoint, copies to clipboard with success feedback
  - Native Share — uses RN Share API for Twitter/WhatsApp/Telegram with formatted message
  - Post to Community — publishes analysis summary to community feed with confirmation state
- Modal styled as dark bottom sheet with smooth spring animation

### Testing
- 13/13 backend tests passed (auth, token generation, idempotency, public view, data exclusion, view_count, community post, content validation)
- Test file: `/app/backend/tests/test_ai_share_endpoints.py`

## Signal History Screen Fix + Enhancements (Completed Mar 24, 2026)

### Bug Fixed
- **Root cause**: `SignalContext.refreshHistory()` used mismatched property names (`winning_trades` vs `winning_signals`, `average_pips` vs `avg_pips_per_trade`, hardcoded `best_trade: 0`, `worst_trade: 0`, missing `breakeven_signals`). Frontend read the correct keys but context stored wrong ones, so all breakdown stats showed 0.
- **Fix**: Rewrote `signal-history.tsx` to fetch directly from backend `/api/signals/history/stats` endpoint which returns all correct data.

### Backend Enhancements
- `winning_streak`: Consecutive wins from most recent closed signal
- `monthly_performance`: Array of { month, pips, wins, losses } for last 6 months

### Frontend Enhancements
- **Winning Streak Badge**: Animated pulse badge when streak >= 3 ("3 Wins in a Row - On Fire!")
- **Mini Monthly Bar Chart**: Animated bar chart showing monthly pips, wins/losses per month
- **Last 5 Trades Quick Summary**: Compact list with pair, direction, date, pip result, color-coded dots
- **Green/Red Gradient Signal Cards**: Left border stripe colored by outcome, subtle gradient overlay

### Testing
- 26/26 backend tests passed (all stats fields, winning_streak, monthly_performance, access control, data integrity)
- Test file: `/app/backend/tests/test_signal_history_stats.py`


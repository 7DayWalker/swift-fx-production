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

## Web Preview Fix (Feb 26, 2026)
- Fixed expo-router/internal module resolution issues for web preview
- Created shims in `node_modules/expo-router/internal/` for:
  - `routing.js` → redirects to matchers, getRoutesCore, sortRoutes
  - `testing.js` → redirects to testing-library/context-stubs
  - `utils.js` → redirects to utils/url
- Web preview now working at https://signal-webhook-test.preview.emergentagent.com

## Test Credentials
- VIP user: paradoxella@gmail.com / Grace1992@
- Admin: ellapauledache@gmail.com / Grace1992@

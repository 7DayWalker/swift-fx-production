# Swift FX Production Readiness & Release Checklist

This checklist tracks the post-audit remediation completed in code and live Supabase infrastructure, alongside the remaining **operator-only external dashboard actions** (secret rotations, Render environment variables, and App Store / Google Play webhook wiring) required before cutting the production release from `main`.

---

## 1. Completed Code & Live Database Hardening Summary

### Live Supabase (`hrzghlqcfccnmgcipxxo`) — Applied & Verified
- **Migration `20261028130000_production_security_hardening.sql`**:
  - Revoked `PUBLIC` / `anon` table and RPC grants across `profiles`, `signals`, `plans`, `subscriptions`, `ai_analyses`, `audit_logs`, `community_posts`, `community_comments`, `community_likes`, and `notifications`.
  - Replaced overly permissive RLS policies on `public.profiles` and installed `BEFORE UPDATE` trigger `trg_guard_profile_sensitive_columns` blocking client-side self-escalation of `role`, `admin_role`, `admin_enabled`, `subscription*`, `ai_weekly_*`, and `account_status`.
  - Hardened `SECURITY DEFINER` RPCs (`get_all_users`, `get_admin_stats`, `handle_new_user`) with explicit `SET search_path = public` and caller `admin`/`super_admin` verification.
- **Migration `20261028140000_admin_role_enum_and_super_admin_guard.sql`**:
  - Extended `public.admin_role` enum with `fund_admin` and `account_manager` to match backend RBAC definitions.
  - Hardened `guard_profile_sensitive_columns()` so standard admins cannot self-escalate to `super_admin` or mutate protected super-admin accounts.
- **Edge Function `ai-analyze` (v9 `ACTIVE`)**:
  - Replaced unverified base64 JWT payload decoding with cryptographic `supabaseAuth.auth.getUser(token)` verification, blocked deactivated/deleted accounts, enforced unified tier limits, and restricted CORS origins.

### Backend (`backend/`)
- Removed unauthenticated/insecure legacy routes (`backend/server.py` excluded from startup; CORS restricted via `CORS_ORIGINS`; `/docs`, `/redoc`, `/openapi.json` disabled in production unless `ENABLE_API_DOCS=true`).
- Hardened authentication (`supabase_auth.py`, `core/dependencies.py`, `services/auth.py`): ES256 JWKS verification, deactivated/deleted account rejection (`403`), `admin_enabled` enforcement, `super_admin` role recognition, and password re-verification on `PUT /api/settings/password`.
- Unified subscription entitlement resolution (`services/subscription.py`): consistent tier resolution across Apple IAP, Google Play Billing, Flutterwave web checkout, Referral rewards, and Super Admin overrides, mirrored onto `public.profiles` via `sync_profile_subscription`.
- Hardened billing & webhooks (`subscriptions.py`, `payments_flutterwave.py`, `referral.py`):
  - Pinned Apple App Store Server Notifications v2 X.509 certificate chains against official Apple Root CA SHA-256 DER fingerprints + OIDs + leaf public-key signature verification.
  - Enforced `GOOGLE_WEBHOOK_TOKEN` verification on Google Play RTDN webhooks.
  - Enforced `APPLE_ENVIRONMENT=production` in production unless sandbox fallback is explicitly opted in.
  - Prevented subscription shortening on same-tier renewals and prevented silent drops of valid lower-tier backup records.
  - Made referral reward claims atomic (`find_one_and_update`) and synced referral rewards into `db.iap_transactions` + `public.profiles`.
- Hardened Signal Engine, Market Data, Notifications, Journal, Fund Management, Academy, Community, and Support routes.
- Added instant self-serve account deletion (`DELETE /api/settings/account`) satisfying Apple App Store Guideline 5.1.1(v) and Google Play User Data deletion requirements.

### Frontend & Repository Hygiene (`frontend/`, root)
- Removed `frontend/dump/` (2,380+ committed build artifacts), `frontend/.metro-cache/`, and `model.patch` from git tracking; hardened `.gitignore`, `frontend/.gitignore`, and `frontend/.easignore`; scrubbed hardcoded secrets from docs and test scripts.
- Unified subscription & entitlement state across `AuthContext.tsx`, `SignalContext.tsx`, `more.tsx`, `community.tsx`, `ai.tsx`, `settings.tsx`, `(admin)/users.tsx`, and `(admin)/analytics.tsx`.
- Eliminated `(admin)/_layout.tsx` profile-enrichment redirect race via `isProfileLoading`.
- Resolved Expo Router route collision by moving referral landing screen `app/register.tsx` -> `app/invite.tsx` (`/invite?ref=CODE`).
- Fixed `NativeAdCard.tsx` React Rules-of-Hooks crash, gated all AdMob components (`AdBanner`, `NativeAdCard`, `useInterstitialAd`, `useRewardedAd`) on `!isLoading && !isAdmin && tier === 'free'`, and switched `adManager.ts` to official Google test ad unit IDs when `__DEV__` is true.

---

## 2. Mandatory Coordinated Secret Rotations (DO BEFORE PUBLIC LAUNCH)

Because this repository (`7DayWalker/swift-fx-production`) is public (`isPrivate: false`), any secret that ever appeared in git history must be rotated in a coordinated maintenance window:

- [ ] **0. Protected Super Admin Account Passwords**:
  - Immediately reset/rotate passwords for `ellapauledache@gmail.com` and `ellaniswell@gmail.com` via Supabase Auth (as test credentials previously appeared in historical QA test scripts/reports).
- [ ] **1. Supabase Service Role Key (`hrzghlqcfccnmgcipxxo`)**:
  1. Open **Supabase Dashboard -> Project Settings -> API**.
  2. Generate/roll a new `service_role` secret key.
  3. Immediately update `SUPABASE_SERVICE_ROLE_KEY` on **Render** (Backend Web Service environment variables) and redeploy. *(Do not revoke the old key until Render has redeployed with the new key.)*
- [ ] **2. Market Data Provider Keys**:
  - Rotate Finnhub API key and set `FINNHUB_API_KEY` in Render.
  - Rotate Alpha Vantage API key and set `ALPHA_VANTAGE_API_KEY` in Render.
  - Verify `TWELVEDATA_KEY` is set in Render (primary institutional feed for `XAUUSD` and intraday FX).
- [ ] **3. Flutterwave Keys**:
  - Rotate `FLW_SECRET_KEY` and `FLW_WEBHOOK_SECRET_HASH` in the Flutterwave Dashboard if previously shared in docs/screenshots, and update both in Render.
- [ ] **4. Git History Purge (Optional Recommended Follow-Up)**:
  - Once keys above are rotated, exposed historical tokens become inert. Optionally run `git filter-repo` during a scheduled freeze if you wish to scrub historical blobs.

---

## 3. Render Backend Environment Variables Checklist

Verify the following environment variables are configured on the Render FastAPI service before merging the PR to `main`:

| Variable | Required | Production Value / Notes |
|---|---|---|
| `ENVIRONMENT` | Yes | `production` (disables `/docs` & `/openapi.json`, enforces strict webhook checks) |
| `CORS_ORIGINS` | Yes | `https://swiftfx.online,https://www.swiftfx.online` |
| `SUPABASE_URL` | Yes | `https://hrzghlqcfccnmgcipxxo.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Project anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Rotated `service_role` secret key |
| `MONGO_URL` / `DB_NAME` | Yes | Production MongoDB Atlas connection string & database name |
| `APPLE_SHARED_SECRET` | Yes (iOS) | App-Specific Shared Secret from App Store Connect |
| `APPLE_BUNDLE_ID` | Yes (iOS) | `com.swiftfx.signals` |
| `APPLE_ENVIRONMENT` | Yes (iOS) | `production` (set `APPLE_ALLOW_SANDBOX_FALLBACK=true` during App Review so Apple's sandbox review environment validates cleanly) |
| `GOOGLE_PACKAGE_NAME` | Yes (Android) | `com.swiftfx.signals` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes (Android) | Google Play Android Publisher service account JSON |
| `GOOGLE_WEBHOOK_TOKEN` | Yes (Android) | Strong random token (32+ hex chars); append `?token=<GOOGLE_WEBHOOK_TOKEN>` to the Google Cloud Pub/Sub push endpoint URL |
| `FLW_SECRET_KEY` | Yes (Web) | Live Flutterwave secret key |
| `FLW_WEBHOOK_SECRET_HASH` | Yes (Web) | Matches Flutterwave Dashboard `verif-hash` |
| `TWELVEDATA_KEY` | Recommended | Live TwelveData API key for primary XAUUSD & FX pricing |
| `EMERGENT_LLM_KEY` | Yes (AI) | API key for `/api/ai/analyze` |

> **Important for Apple App Review**: Keep `APPLE_ENVIRONMENT=production` AND set `APPLE_ALLOW_SANDBOX_FALLBACK=true` in Render so Apple's guideline 2.1 sandbox receipt testers automatically fall back from `buy.itunes.apple.com` (`status 21007`) to `sandbox.itunes.apple.com`.

---

## 4. External Webhook & Store Console Wiring

- [ ] **App Store Connect**:
  - Set App Store Server Notifications **Version 2** Production & Sandbox URLs to `https://<your-render-backend-domain>/api/webhooks/apple`.
- [ ] **Google Play Console & Google Cloud Pub/Sub**:
  - Configure Real-Time Developer Notifications (RTDN) Pub/Sub push subscription URL to `https://<your-render-backend-domain>/api/webhooks/google?token=<GOOGLE_WEBHOOK_TOKEN>`.
- [ ] **Flutterwave Dashboard**:
  - Set Webhook URL to `https://<your-render-backend-domain>/api/payments/flutterwave/webhook` with matching Secret Hash (`FLW_WEBHOOK_SECRET_HASH`).
- [ ] **Supabase Auth Settings**:
  - In **Supabase Dashboard -> Authentication -> URL Configuration**, ensure `https://swiftfx.online/**` and `swiftfx://auth` are in Redirect URLs.
  - Enable **Leaked Password Protection** under **Authentication -> Providers -> Email / Security** (if on Supabase Pro plan).
- [ ] **AdMob Production Readiness**:
  - Publish `app-ads.txt` at `https://swiftfx.online/app-ads.txt` with your Google AdMob publisher line (`google.com, pub-3249620629100588, DIRECT, f08c47fec0942fa0`).
- [ ] **EAS Build & Store Submission**:
  - Build release binaries from clean git state (`eas build --platform all --profile production`).
  - Smoke-test login, signal tier unlocking, AI chart analysis, purchase + restore flows, `/invite?ref=` referral link attribution, and **Settings -> Delete Account** before submitting for review.

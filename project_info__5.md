# Swift FX Referral System — Codebase Investigation (Observation Mode)

## Summary
Swift FX implements a referral program across the Expo frontend and a FastAPI backend backed by MongoDB (via `core.database.db`). Users can generate a unique referral code, share a web link (`https://swiftfx.app/register?ref=...`), and the app captures/stores that code to apply attribution during signup. Reward entitlement is intended to unlock after the referred user subscribes and waits a time window, and is then claimable by the referrer via a dedicated API endpoint.

## Architecture
**Pattern:** Thin client with centralized API client + Mongo-backed domain routes. The referral feature is implemented as a backend “resource” module (`backend/api/routes/referral.py`) plus frontend deep-link capture/persistence (`frontend/src/services/referralService.ts`) and signup attribution (`frontend/src/context/AuthContext.tsx`).

**Major subsystems**
- **Referral deep link capture & persistence (frontend):**
  - `frontend/app/register.tsx` (web/app landing for `register?ref=CODE`)
  - `frontend/src/services/referralService.ts` (store/get/validate referral codes, URL parsing, deep link listeners)
  - `frontend/src/context/AuthContext.tsx` (email/password signup calls backend `record-signup`)
- **Referral program backend (fastapi):**
  - `backend/api/routes/referral.py` (generate codes, validate codes, record signup, claim rewards, admin APIs)
  - **Reward tracking is driven by subscription changes** via `on_user_subscription_change` (invoked from subscription/payment routes).
- **Subscription lifecycle integration (backend):**
  - `backend/api/routes/subscriptions.py` triggers `on_user_subscription_change(user_id, plan)` after verified subscription updates.
  - `backend/api/routes/payments_flutterwave.py` triggers the same hook after payment activation.

**Technology stack**
- Frontend: Expo Router + React Native; Supabase Auth for identity; AsyncStorage for referral persistence; Axios for API calls.
- Backend: FastAPI; MongoDB; Supabase profile helper functions; Flutterwave for non-Play Android; Apple/Google IAP for subscriptions.

**Execution start points (relevant to referrals)**
1. User opens referral link (`swiftfx.app/register?...`) → frontend route `frontend/app/register.tsx` parses query params.
2. On native (non-web), landing screen stores referral code in AsyncStorage and navigates to `/(auth)/register`.
3. Signup on `/(auth)/register` → calls `AuthContext.register(...)`.
4. `AuthContext.register` records referral attribution in backend via `POST /api/referral/record-signup`.
5. Backend reward eligibility progresses based on subscription change hooks; referrer claims via `POST /api/referral/claim-reward/{referral_id}`.

## Directory Structure (annotated)
```
project-root/
├── backend/
│   ├── main.py                        — FastAPI entry; registers routers
│   └── api/
│       └── routes/
│           ├── referral.py          — referral domain + reward claim + admin
│           ├── subscriptions.py    — subscription verification; triggers referral hook
│           └── payments_flutterwave.py — Flutterwave activation; triggers referral hook
├── frontend/
│   ├── app/
│   │   ├── register.tsx             — referral landing for swiftfx.app/register?ref=...
│   │   └── (auth)/
│   │       └── register.tsx        — signup form; consumes stored referral
│   └── src/
│       ├── context/
│       │   └── AuthContext.tsx      — signup/login/OAuth; referral attribution only in register()
│       ├── services/
│       │   ├── api.ts              — centralized axios client (baseURL includes /api)
│       │   └── referralService.ts — referral validation/capture/persistence/deep-link listeners
│       └── ... (other contexts/UI)
```

## Key Abstractions

### Referral code generation & referral resource (backend)
- **File**: `backend/api/routes/referral.py`
- **Responsibility**: Owns the referral domain:
  - generate/store referral codes in Supabase profile (`referral_code`)
  - validate codes (`GET /referral/validate/{code}`)
  - record signup attribution (`POST /referral/record-signup`)
  - claim rewards (`POST /referral/claim-reward/{referral_id}`)
  - admin inspection/actions
- **Key endpoints**
  - `GET /api/referral/my-code`: returns `referral_code`, `referral_link`, and stats/referral list
  - `GET /api/referral/validate/{code}`: verifies code exists, returns `referrer_name`
  - `POST /api/referral/record-signup`: creates referral document linking `referrer_id -> referred_user_id`
  - `POST /api/referral/claim-reward/{referral_id}`: extends referrer’s subscription expiry
- **Lifecycle**: referral docs live in MongoDB collection `db.referrals`. Their state transitions are:
  - `status=PENDING` at signup record time
  - `reward_status=LOCKED` initially
  - Intended to become `reward_status=PENDING` after time gating (7 days), then `APPLIED` after claim

### Deep-link referral capture & persistence (frontend)
- **File**: `frontend/src/services/referralService.ts`
- **Responsibility**:
  - Normalize and store the incoming code into `AsyncStorage`
  - Validate code against backend before storing
  - Provide retrieval/clearing for signup
  - Listen for incoming URLs while app runs
  - Provide URL extraction utilities
- **Key functions**
  - `validateReferralCode(code)` → `GET /referral/validate/{code}`
  - `storeReferralCode(code, source)` → stores:
    - `pending_referral_code`
    - `referral_source` (`deeplink|manual|qr`)
    - `referral_timestamp`
  - `getStoredReferralCode()` → loads + expires after 30 days
  - `clearStoredReferralCode()`
  - `initDeepLinkListener(...)` → `Linking.addEventListener('url', ...)`
- **Why it matters**: referral context survival across navigation/OAuth depends on whether the referral code was persisted in AsyncStorage *before* the user enters an external browser/OAuth flow.

### Referral landing page (web + native entry)
- **File**: `frontend/app/register.tsx`
- **Responsibility**: Handles the shared referral link and routes users into signup.
- **Observed flow**
  1. Reads URL params via `useLocalSearchParams` with keys `{ ref?, referral? }`
  2. If `ref` exists:
     - validates via backend
     - stores referral into AsyncStorage (only if valid)
  3. If platform is native (`Platform.OS !== 'web'`) and there is a code:
     - `router.replace('/(auth)/register')`
  4. If platform is web: renders store-download UI rather than onboarding.

### Signup attribution transport
- **File**: `frontend/app/(auth)/register.tsx` + `frontend/src/context/AuthContext.tsx`
- **Responsibility**:
  - Signup screen loads stored referral from AsyncStorage on mount (`getStoredReferralCode`)
  - Validates it again and locks the referral field if source is `deeplink`
  - Passes referral code to auth registration
  - `AuthContext.register(...)` records the referral signup in backend
- **Critical transport detail**
  - Referral code is sent to backend only from `AuthContext.register(...)` (email/password signup):
    - `api.post('/referral/record-signup', { referral_code, user_id })`

### Subscription-change hook driving referral updates (backend)
- **File**: `backend/api/routes/referral.py` (`on_user_subscription_change`)
- **Responsibility**: When a referred user subscribes, this hook updates their referral record with:
  - `subscription_tier` = `new_subscription` (premium/vip)
  - `subscribed_at` = now
- **How it’s triggered**
  - `backend/api/routes/subscriptions.py` calls `on_user_subscription_change(user_id, plan)` after `update_profile`
  - `backend/api/routes/payments_flutterwave.py` calls the same after activating subscription

### Reward claim flow (frontend + backend)
- **Frontend**:
  - **File**: `frontend/app/referrals.tsx`
  - **Responsibility**: Fetches referral list via `api.get('/referral/my-code')` and shows claim CTA only when `reward_status === 'pending'`.
  - **Claim call**: `api.post('/referral/claim-reward/{referralId}')`
- **Backend**:
  - **File**: `backend/api/routes/referral.py`
  - **Responsibility**: On claim:
    - verifies referral exists and belongs to current user
    - only allows `reward_status=PENDING`
    - computes days to add (VIP → 14 days, otherwise 7)
    - updates referrer’s subscription expiry in Supabase (`update_profile`)
    - marks `reward_status=APPLIED`

## Data Flow (referral-focused)

### 1) Referral link generation
1. Referrer opens app → Referral tab loads `GET /api/referral/my-code` (`frontend/app/referrals.tsx`)
2. Backend reads/creates referrer’s `referral_code` in Supabase profile (`backend/api/routes/referral.py`)
3. Backend generates share link:
   - `referral_link = https://swiftfx.app/register?ref={referral_code}`

### 2) Referral deep-link handling & code extraction
1. User opens `https://swiftfx.app/register?ref=REF...`
2. Frontend route `frontend/app/register.tsx` parses:
   - `params.ref || params.referral`
3. If a code exists:
   - `validateReferralCode(code)` → backend `GET /api/referral/validate/{code}`
   - if valid: `storeReferralCode(code, 'deeplink')`

### 3) Referral code persistence (before signup)
1. Landing screen on native (`Platform.OS !== 'web'`) redirects to `/(auth)/register`
2. Signup screen (`frontend/app/(auth)/register.tsx`) reads AsyncStorage:
   - `getStoredReferralCode()`
   - sets local state and re-validates with `validateReferralCode(stored.code)`
   - if stored.source === `deeplink`, referral field becomes locked

### 4) Signup attribution transport (who gets credited)
1. On successful signup, `/(auth)/register.tsx` calls:
   - `AuthContext.register(name, email, password, validReferralCode)`
2. `AuthContext.register`:
   - signs up via Supabase Auth
   - then calls backend:
     - `POST /api/referral/record-signup` with `{ referral_code, user_id: data.user.id }`
3. Backend `record-signup`:
   - validates referral code exists via Supabase `profiles.referral_code`
   - writes Mongo `db.referrals` document containing:
     - `referrer_id`
     - `referred_user_id`
     - `reward_status=LOCKED`
     - `status=PENDING`

### 5) Referred user subscription → referral reward eligibility
1. Referred user subscribes (Apple/Google/IAP or Flutterwave)
2. Verified subscription update occurs in:
   - `backend/api/routes/subscriptions.py` (Apple/Google verify endpoints)
   - `backend/api/routes/payments_flutterwave.py` (Flutterwave activation)
3. After subscription profile update, each invokes:
   - `on_user_subscription_change(user_id, plan)`
4. `on_user_subscription_change` updates the referral doc:
   - sets `subscription_tier`
   - sets `subscribed_at=now`
   - **does NOT update `reward_status` at this moment** (it remains `LOCKED`)

### 6) Reward unlock & claim
1. Frontend claims reward only when backend returns:
   - `reward_status === 'pending'`
2. Backend claim endpoint:
   - `POST /api/referral/claim-reward/{referral_id}`
   - requires `reward_status=PENDING`
   - updates referrer subscription expiry and sets `reward_status=APPLIED`

## Non-Obvious Behaviors & Design Decisions (and likely failure points)

### 1) DNS/transport failure likely blocks the entire referral onboarding entry point
- The observed `DNS_PROBE_FINISHED_NXDOMAIN` for `swiftfx.app` means the shared referral link cannot reach the app at all.
- In this state, the referral backend may be fully healthy, but users can’t load `/register?ref=...`.

**Why this matters:** If the domain doesn’t resolve, you never reach any frontend referral code extraction/persistence logic.

### 2) Email/password signup records referral attribution; OAuth signup path appears not to
- Backend attribution transport occurs only in `AuthContext.register(...)`:
  - `POST /api/referral/record-signup`
- OAuth flows (`signInWithProvider`) do not call any referral-recording endpoint in the code shown.
- Therefore, **referred users who sign up via Google/Apple may not be credited**, unless there is an external mechanism (not found yet) that reads OAuth metadata or triggers backend attribution automatically.

**Why it’s risky:** This is a common “partial” referral failure: deep link is captured, but attribution never reaches `/referral/record-signup`.

### 3) Reward unlocking after the 7-day wait may never happen in production runtime
- `backend/api/routes/referral.py` contains:
  - `check_and_process_referral_rewards()` which:
    - finds referrals with `status=PENDING` and `reward_status=LOCKED` and `subscribed_at!=None`
    - if `now - subscribed_at >= 7 days`, it updates:
      - `status=COMPLETED`
      - `reward_status=PENDING`
- However, across the searches performed so far, there was **no evidence of `check_and_process_referral_rewards()` being invoked** anywhere else in the backend.
- The referrer claim endpoint requires `reward_status=PENDING`.

**Interpretation:** If there is no scheduler/cron/worker calling `check_and_process_referral_rewards()`, referrals can remain `reward_status=LOCKED` forever, making claim impossible.

### 4) Deep link persistence design is AsyncStorage-based (good), but only if the app reaches the landing screen first
- Native flow stores referral code immediately on entry (`frontend/app/register.tsx`), before redirecting to signup.
- Runtime deep links are also handled by `initDeepLinkListener` registered in `frontend/app/_layout.tsx`.
- This approach is resilient to in-app navigation as long as AsyncStorage isn’t cleared.

**Main risk is entry point reachability** (DNS issue) and missing attribution transport for OAuth.

### 5) `swiftfx://register?ref=...` is implemented, but the backend referral link is HTTPS-only
- `frontend/src/services/referralService.ts` defines:
  - universal scheme base: `https://swiftfx.app`
  - custom scheme: `swiftfx://`
- Backend generates HTTPS link only:
  - `https://swiftfx.app/register?ref=...`
- If the universal domain is misconfigured (NXDOMAIN), only native deep link usage could work, but users are being sent the HTTPS link.

## Observed Failure Points (what likely breaks first)

1. **First failure: transport / domain resolution**
   - `swiftfx.app` doesn’t resolve publicly → referral landing never loads.

2. **Second likely failure: OAuth attribution survival**
   - The code currently records referrals only for email/password signup via `/referral/record-signup`.
   - OAuth signup likely misses referral recording unless some other mechanism exists.

3. **Third likely failure: reward unlock scheduling**
   - `check_and_process_referral_rewards()` exists but appears uninvoked.
   - Without it, `reward_status` may not become `pending`, preventing claims.

## Which systems appear healthy
- **Centralized API client behavior**: `frontend/src/services/api.ts` uses `EXPO_PUBLIC_BACKEND_URL` and prefixes `/api` consistently.
- **Referral code validation endpoint** exists and is called from the landing and signup screens.
- **Subscription verification + referral hook wiring**: both IAP (`subscriptions.py`) and Flutterwave (`payments_flutterwave.py`) call `on_user_subscription_change`.

## Which systems appear incomplete / risky
- **OAuth referral survival**: no referral recording endpoint call in OAuth sign-in path is apparent.
- **Reward unlocking orchestration**: `check_and_process_referral_rewards()` may lack a scheduler invocation.
- **Referral link domain reachability**: NXDOMAIN for `swiftfx.app` is an external entry-point failure irrespective of backend correctness.

## Minimal-risk observations (non-fixing)
- Referral ownership model:
  - backend creates/returns referral codes based on Supabase profiles `referral_code`
  - prevents duplicates by checking existing `db.referrals` for `referred_user_id`
- Referral context persistence:
  - uses AsyncStorage keys `pending_referral_code`, `referral_source`, `referral_timestamp`
  - expires after 30 days
- Reward state model:
  - initial `reward_status=LOCKED`
  - claim requires `reward_status=PENDING`
  - claim then marks `reward_status=APPLIED`

## Suggested Reading Order
1. `frontend/app/register.tsx` — how referral link becomes AsyncStorage + redirect into signup
2. `frontend/app/(auth)/register.tsx` — how stored referral is consumed and validated during signup
3. `frontend/src/context/AuthContext.tsx` — where referral attribution is sent to backend (and where it’s absent for OAuth)
4. `backend/api/routes/referral.py` — full referral lifecycle state machine + claim logic + reward unlock function
5. `backend/api/routes/subscriptions.py` — subscription verification and referral hook call site
6. `backend/api/routes/payments_flutterwave.py` — non-Play Android activation and referral hook call site
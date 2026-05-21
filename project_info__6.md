# Swift FX Referral Lifecycle — Full System Mapping (Investigation Only)

## 1) A. Referral Transport Layer (where links/messages come from)

### Referral code generation + link generation (backend)
**File:** `backend/api/routes/referral.py`  
- `GET /api/referral/my-code`
  - Ensures the current user has a `profiles.referral_code` in Supabase (generates if missing)
  - Returns `referral_link`:
    - **Hardcoded domain:** `https://swiftfx.app/register?ref={referral_code}`
    - **File evidence:** `referral_link": f"https://swiftfx.app/register?ref={referral_code}"`

### Share message formats (frontend)
**File:** `frontend/app/referrals.tsx`
- Fetches backend data via `api.get('/referral/my-code')`
- Builds/share messages using returned `referralLink`:
  - WhatsApp: `https://wa.me/?text=${encodeURIComponent(message)}`
  - Telegram: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`
  - Native share: message includes `referralLink` and the referral code
- **Important:** These share flows do **not** substitute domains; they embed whatever backend returns (currently `swiftfx.app`).

### Referral deep-link entry (frontend landing page)
**File:** `frontend/app/register.tsx`
- **Only implemented for:** `swiftfx.app/register?ref=CODE` (via `useLocalSearchParams` keys `ref` / `referral`)
- **Hard dependency on reaching this route**:
  - If the domain doesn’t resolve, the referral code never gets extracted/stored.

### Transport assumptions currently baked in
**Files:**  
- `backend/api/routes/referral.py` (hardcoded `swiftfx.app`)
- `frontend/src/services/referralService.ts`
  - `DEEP_LINK_SCHEMES.universal = 'https://swiftfx.app'`
- `frontend/app/register.tsx`
  - expects query params `ref` or `referral`

✅ **Conclusion (Transport):** The referral system is operationally coupled to the `swiftfx.app` domain for both:
1) the generated share link, and  
2) the frontend landing route parsing.

---

## 2) B. Referral Context Persistence (AsyncStorage lifecycle map)

### Stored keys and meaning
**File:** `frontend/src/services/referralService.ts`
- Storage keys:
  - `pending_referral_code`
  - `referral_source` (deeplink/manual/qr)
  - `referral_timestamp`

### When the referral code is stored
**File:** `frontend/app/register.tsx`
- On landing:
  - extracts `code = params.ref || params.referral`
  - validates via backend: `validateReferralCode(code)`
  - **if valid:** calls `storeReferralCode(code, 'deeplink')`
- After storing, on native it redirects into:
  - `router.replace('/(auth)/register')`

### When the referral code is hydrated for signup
**File:** `frontend/app/(auth)/register.tsx`
- On mount: `checkForReferralCode()`
  - calls `getStoredReferralCode()`
  - if present:
    - sets `referralCode`
    - validates again via backend `validateReferralCode(stored.code)`
    - if `stored.source === 'deeplink'`, locks referral input (`isReferralLocked`)

### When it is cleared
**File:** `frontend/app/(auth)/register.tsx`
- After successful email/password registration (`performRegistration()`):
  - calls `clearStoredReferralCode()`
  - then routes to dashboard

### Cold-start / navigation survival characteristics (from code)
- **Persistence mechanism:** AsyncStorage (survives app navigation and most cold starts).
- **However, if the app never reaches `frontend/app/register.tsx`, storage never happens.**
- **Deep-link runtime listener:** exists globally:
  - **File:** `frontend/app/_layout.tsx`
  - `initDeepLinkListener(...)` registers a runtime URL listener,
  - but it still relies on getting a URL containing a referral code while the app is running.

✅ **Conclusion (Persistence):**
- Referral context survives as long as the app hits the referral landing screen first.
- The strongest “context loss” failure mode is upstream: **not reaching the entry route** (DNS/transport), rather than AsyncStorage itself.

---

## 3) C. OAuth Attribution Survival (High Priority)

### What email/password signup does (attribution transport exists)
**File:** `frontend/src/context/AuthContext.tsx`
- `register(name, email, password, referralCode?)`
  - After Supabase `signUp` succeeds:
  - Calls backend attribution:
    - `api.post('/referral/record-signup', { referral_code: referralCode, user_id: data.user.id })`
- So **email/password signup has a complete referral attribution transport**.

### What OAuth sign-in does (referral transport absent)
**File:** `frontend/src/context/AuthContext.tsx`
- `signInWithProvider(provider)`
  - performs Supabase OAuth flow (native PKCE with `redirectTo = 'swiftfx://auth'`)
  - exchanges code / sets session
  - **does not call** `/referral/record-signup`
- There is no visible logic that:
  - reads `pending_referral_code` from AsyncStorage after OAuth success, or
  - injects referral_code into any backend attribution call after OAuth success.

### OAuth callback handling location
**File:** `frontend/app/auth.tsx`
- This screen is only a loading UI for the `swiftfx://auth` scheme route.
- The real deep-link handling is performed in:
  - **File:** `frontend/src/context/AuthContext.tsx`
  - inside `useEffect` where `handleAuthDeepLink`:
    - checks for `swiftfx://auth`
    - runs recovery/OAuth exchange or setSession
    - updates user state via Supabase listeners

### Does OAuth “restore referral state” after `exchangeCodeForSession(url)`?
**From code shown:**
- OAuth deep-link handling in `AuthContext` only manages Supabase auth/session state.
- It does not interact with referral AsyncStorage or `/referral/record-signup`.

### Exact failure point (OAuth)
**Attribution stops here:**
- Referred user starts OAuth on the login screen
- OAuth completes → Supabase session exists
- But backend referral recording is never triggered because:
  - `/referral/record-signup` is only called from `AuthContext.register(...)` (email/password flow), not from `signInWithProvider(...)`.

✅ **Conclusion (OAuth survival):**
- Referral context may be stored in AsyncStorage, but **OAuth flows never transport attribution to backend**, so referred OAuth-created users may never receive a Mongo referral document.

---

## 4) D. Reward Unlock Orchestration (can LOCKED ever become PENDING?)

### Referral state model in backend
**File:** `backend/api/routes/referral.py`
- On `POST /api/referral/record-signup`
  - sets:
    - `status = PENDING`
    - `reward_status = LOCKED`

### Subscription change hook sets subscription facts only
**File:** `backend/api/routes/referral.py`
- `on_user_subscription_change(user_id, new_subscription)`
  - if referred user exists + `subscription_tier` set + `subscribed_at` set:
    - updates referral doc fields:
      - `subscription_tier`
      - `subscribed_at`
  - **does not change `reward_status`** (it remains `LOCKED`)

### Reward unlock function exists but may be disconnected
**File:** `backend/api/routes/referral.py`
- `check_and_process_referral_rewards()`
  - queries for:
    - `status=PENDING`
    - `reward_status=LOCKED`
    - `subscribed_at != None`
  - if `now - subscribed_at >= 7 days`:
    - sets:
      - `status=COMPLETED`
      - `reward_status=PENDING`
  - expiration logic exists too

### Claim requires PENDING
**File:** `backend/api/routes/referral.py`
- `POST /referral/claim-reward/{referral_id}`
  - requires referral with:
    - `reward_status = PENDING`
- It then marks:
  - `reward_status = APPLIED`

### Invocation evidence
- In the codebase searched so far, `check_and_process_referral_rewards()` exists only as a function definition in `backend/api/routes/referral.py`.
- There is **no confirmed runtime/scheduler/worker invocation** in the traced areas (Railway startup hooks/routers we inspected did not call it).

✅ **Conclusion (Reward unlock):**
- Subscription hook alone does not unlock rewards (LOCKED remains LOCKED).
- Unlock requires `check_and_process_referral_rewards()` to run later.
- If no scheduler/worker calls it, then **LOCKED → PENDING may never happen**, making claim impossible.

---

## 5) E. End-to-End Referral Health (what’s production-ready vs disconnected)

### Production-ready / logically complete (within code boundaries)
1. **Referral code existence + validation**
   - backend validates referral codes and returns referrer_name  
2. **Referral code persistence for deep-link entry**
   - AsyncStorage capture exists and signup UI consumes it
3. **Referral attribution for email/password signup**
   - `/referral/record-signup` is called only in email/password `AuthContext.register(...)` and appears correctly wired
4. **Reward claim endpoint and UI gating**
   - claim is restricted to backend `reward_status=PENDING`
   - UI only shows claim when `pending`

### Partially implemented / risky
1. **OAuth referral attribution**
   - OAuth sign-in path does not call `/referral/record-signup`
   - Therefore backend attribution likely fails for “referred users who sign up via Google/Apple”
2. **Reward unlock orchestration**
   - unlock function exists, but (so far) appears operationally disconnected from any scheduler/background invocation

### Dead/unreachable / release-blocking
1. **Transport hard-coupled to `swiftfx.app`**
   - backend generates `swiftfx.app/register?ref=...`
   - frontend landing expects `swiftfx.app/register?...`
   - user-confirmed: `swiftfx.app` fails publicly with NXDOMAIN
   - This can stop referral onboarding before app lifecycle begins.

---

## Summary: Exact Failure Points (in priority order)

1. **Referral transport reachability fails first**
   - Hardcoded `swiftfx.app` in backend share link + frontend landing route
   - If NXDOMAIN persists, referral onboarding never reaches code that stores/persists referral context.

2. **OAuth attribution survival fails**
   - `signInWithProvider(...)` does not record referral to backend.
   - Referral code persistence alone does not matter if backend `/referral/record-signup` is never called.

3. **Rewards likely never unlock without scheduler**
   - Subscription hook sets `subscribed_at` but keeps `reward_status=LOCKED`
   - `check_and_process_referral_rewards()` is not confirmed as invoked anywhere
   - Claim requires `reward_status=PENDING`

---

## Files Involved (complete set identified so far)

**Backend**
- `backend/api/routes/referral.py`
  - referral code generation/link
  - validate endpoint
  - record-signup endpoint
  - claim endpoint
  - unlock function (`check_and_process_referral_rewards`)
  - subscription-change hook (`on_user_subscription_change`)
- `backend/api/routes/subscriptions.py`
  - calls `on_user_subscription_change(user_id, plan)`
- `backend/api/routes/payments_flutterwave.py`
  - calls `on_user_subscription_change(user_id, tier)`

**Frontend**
- `frontend/app/referrals.tsx`
  - share messages + claim UI
- `frontend/app/register.tsx`
  - referral landing (`register?ref=...`)
- `frontend/app/(auth)/register.tsx`
  - signup form consuming stored referral
- `frontend/src/services/referralService.ts`
  - extraction/validation/storage in AsyncStorage
- `frontend/src/context/AuthContext.tsx`
  - email/password attribution (`/referral/record-signup`)
  - OAuth sign-in flow (no referral recording)
- `frontend/app/_layout.tsx`
  - runtime deep-link listener initialization

---

If you want the next investigation pass, the most important missing confirmations are:
1) whether **any** backend startup/cron/worker calls `check_and_process_referral_rewards()`, and  
2) whether there is any hidden OAuth-referral bridge elsewhere (not yet evidenced in the traced OAuth path).
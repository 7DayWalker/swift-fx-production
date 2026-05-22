# Swift FX — MONETIZATION OPTIMIZATION Audit (AdMob Android → Production Transition)

> **Mission fit:** This is a **monetization stabilization audit** only: mapping + placements + health + policy/performance risk + safest Android production rollout strategy.  
> **No refactors / no new ad architecture / no mediation / no UI redesign / no implementation changes.**

---

## 1) Current ad architecture map (what exists & how it works)

### 1.1 Central ad unit inventory (single source of truth)
**File:** `frontend/src/services/adManager.ts`

- Exports a single **AD_UNITS** object for:
  - `BANNER`
  - `INTERSTITIAL`
  - `REWARDED`
  - `NATIVE`
- Android uses **well-known Google TEST IDs** in this file.
- iOS uses **LIVE production IDs** in this file.
- Web is isolated via `frontend/src/services/adManager.web.ts` (no real ads; no-op interstitial gating; stub ad unit ids).

**Key implication for your Android transition:** Android production readiness is primarily “replace Android unit IDs in `adManager.ts`”.

### 1.2 UI primitives (where each ad type renders)
**Banner (bottom anchored)**
- **File:** `frontend/src/components/ads/AdBanner.tsx`
- Uses `BannerAd` with `size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}`.
- **Only renders for free users** using `useSubscription()` tier checks.
- **No-ops on web** (SDK guarded by `Platform.OS !== 'web'` and component returns null).

**Native in-feed**
- **File:** `frontend/src/components/ads/NativeAdCard.tsx`
- Loads a native ad via `NativeAdClass.createForAdRequest(...)` and renders headline/body/media/CTA.
- **No tier gating** inside the component (it does not consult `useSubscription()`), so placement screens determine whether ads appear for premium/VIP.

**Interstitial (full-screen)**
- **File:** `frontend/src/components/ads/useInterstitialAd.ts`
- On mount, preloads an interstitial (free users only).
- Exposes `recordAndMaybeShow()` which:
  - increments an action counter (`recordAction()`)
  - if frequency gate says “yes” and the ad is loaded → calls `adRef.current.show()`
- Silently no-ops on web.

**Frequency gate**
- **File:** `frontend/src/services/adManager.ts`
- `INTERSTITIAL_ACTION_THRESHOLD = 1`
- `INTERSTITIAL_COOLDOWN_MS = 0`
- Net effect: interstitial will show after **each** meaningful `recordAction()` call (as long as the ad is loaded).

**Rewarded (full-screen with reward callback)**
- **File:** `frontend/src/components/ads/useRewardedAd.ts`
- Preloads rewarded ad on mount for free users only.
- Exposes `showRewardedAd(): Promise<boolean>`
  - returns `false` if ad not loaded
  - resolves `true` on `EARNED_REWARD`
  - resolves `false` on `CLOSED` (if resolver still pending) or `ERROR`
- Silently no-ops on web (callers are expected to skip or accept `true` behavior depending on their UX).

### 1.3 Ad placements & triggers are embedded in screen code
There is **no separate “ad controller”** for placement. Instead, each screen imports the relevant ad primitive/hook.

---

## 2) Existing placement inventory (where ads appear today)

### 2.1 Banner placements (AdBanner)
**Component:** `frontend/src/components/ads/AdBanner.tsx`  
**Shown in these screens (direct imports observed):**
- `frontend/app/(tabs)/ai.tsx` → `<AdBanner />` (free only)
- `frontend/app/(tabs)/signals.tsx` → `<AdBanner />` (free only)
- `frontend/app/(tabs)/dashboard.tsx` → `<AdBanner />` (free only)
- `frontend/app/(tabs)/more.tsx` → `<AdBanner />` (free only)
- `frontend/app/calendar/index.tsx` → `<AdBanner />` (free only)
- `frontend/app/news/index.tsx` → `<AdBanner />` (free only)

**Not observed in the files read:** community screen does not show a banner.

**Purpose:** bottom monetization presence with minimal layout disruption.

**Frequency:** depends on screen visibility; there is no additional throttling beyond “renders when component is mounted”.

---

### 2.2 Interstitial placements (useInterstitialAd recordAndMaybeShow)
**Hook:** `frontend/src/components/ads/useInterstitialAd.ts`

**Observed usage sites:**
- `frontend/app/(tabs)/ai.tsx`
  - After AI analysis completes: `recordAndMaybeShow();`
- `frontend/app/(tabs)/signals.tsx`
  - On pull-to-refresh: `refreshSignals(); recordAndMaybeShow();`

**Not observed in the files read:**
- interstitial on explicit filter tab change (though there is a comment suggesting refresh / filter change).

**Purpose:** gate the next piece of value/action for free-tier users.

**Frequency reality (very important):**
- Because interstitial gate has threshold=1 and cooldown=0, the design is essentially **“show after every triggering event if ad is loaded.”**
- Therefore UX/policy risk is primarily tied to how often `recordAndMaybeShow()` is called.

---

### 2.3 Rewarded placements (useRewardedAd showRewardedAd)
**Hook:** `frontend/src/components/ads/useRewardedAd.ts`

**Observed usage sites:**
- `frontend/app/academy/index.tsx`
  - “Watch Ad to Preview” button (free-tier, non-admin)
  - calls `const rewarded = await showRewardedAd();` then `router.push('/academy/intermediate')` if true
- `frontend/app/academy/[category].tsx`
  - When content is locked, it shows a “Watch Ad to Unlock” CTA
  - uses `isAdReady` / `adFailed` / `retryLoadAd()` to control UX
  - calls `showRewardedAd()` and sets `adUnlocked` for **session access** if rewarded

**Purpose:** monetized preview/unlock mechanic in Academy.

**Frequency:** user-driven CTA; not auto-interstitial.

---

### 2.4 Native ad placements (NativeAdCard)
**Component:** `frontend/src/components/ads/NativeAdCard.tsx`  
**Observed usage sites:**
- `frontend/app/calendar/index.tsx`
  - native card inserted between date groups:
  - `(groupIndex + 1) % 2 === 0 && <NativeAdCard />`
- `frontend/app/news/index.tsx`
  - native card inserted every 4 items:
  - `(index + 1) % 4 === 0 && <NativeAdCard />`

**Tier gating gap:**
- `NativeAdCard` itself does **not** consult `useSubscription()`.
- Therefore, unless the screens gate it elsewhere (they don’t in the code read), **premium/VIP users may also see native ads**.

**Purpose:** mid-feed monetization without blocking user flows.

---

## 3) iOS live placement sanity audit (sanity only)

### 3.1 Ad unit IDs used on iOS
**File:** `frontend/src/services/adManager.ts`
- iOS banner uses `ca-app-pub-3249620629100588/3292403004`
- iOS interstitial uses `ca-app-pub-3249620629100588/1155370427`
- iOS rewarded uses `ca-app-pub-3249620629100588/5016548217`
- iOS native uses `ca-app-pub-3249620629100588/5343851273`

**Implication:** iOS is already set up for production IDs, so the question is whether the placement frequency/UX patterns look abusive.

### 3.2 UX/policy sanity indicators (based on current placement triggers)
- **Rewarded** appears to be user-initiated (“Watch Ad …”), which is generally safe when not forced.
- **Banner** is bottom anchored and only for free users.
- **Native ads** may be shown on premium because `NativeAdCard` has no tier gating.
- **Interstitial** is the riskiest pattern:
  - the gate has no cooldown, and action threshold is 1
  - interstitial shows after AI analysis completes and after signals refresh

**Sanity conclusion for iOS:** Rewarded + banners are reasonable. Interstitial is likely compliant only if the user actions triggering it are not too frequent in practice; the code is currently configured to be “aggressive” from a frequency standpoint.

---

## 4) Android test/live findings (and what transition surface is needed)

### 4.1 Android unit IDs are test IDs today
**File:** `frontend/src/services/adManager.ts`

Android entries in `AD_UNITS` are:
- Banner: `ca-app-pub-3940256099942544/6300978111`  (well-known test banner)
- Interstitial: `ca-app-pub-3940256099942544/1033173712`
- Rewarded: `ca-app-pub-3940256099942544/5224354917`
- Native: `ca-app-pub-3940256099942544/2247696110`

The module comment explicitly says Android still uses test IDs and they must be swapped when going live.

### 4.2 Android transition surface (lowest-risk)
There is **no env/config based switching** found in the places investigated so far (no `MobileAds.initialize` / no EXPO_PUBLIC ad unit overrides found via regex search, and adManager uses hardcoded IDs via `Platform.select`).

So the safest “implementation scope” (future engineer action) is:
- Update `frontend/src/services/adManager.ts` **Android IDs only**
- Ensure release build doesn’t inadvertently still ship test IDs

### 4.3 Release safeguards
- The ad system has **no build-time guard** or remote config switch.
- That increases risk: if you change `adManager.ts`, *both debug and release* will pick the new IDs immediately.

**Safest rollout strategy will therefore need an explicit guard mechanism** (remote config, build flag, or phased config), but such a mechanism does not currently exist in the files we’ve inspected.

---

## 5) Rewarded ad implementation health check (reliability & reward correctness)

**File:** `frontend/src/components/ads/useRewardedAd.ts`

### 5.1 Lifecycle behavior
- Preloads rewarded ad on mount with event listeners:
  - `AdEventType.LOADED` → sets `isLoaded=true`
  - `RewardedAdEventType.EARNED_REWARD` → resolves promise `true` and clears resolverRef
  - `AdEventType.CLOSED` → if resolverRef pending, resolves `false`, clears resolverRef, sets `isLoaded=false`, then calls `ad.load()` to preload again
  - `AdEventType.ERROR` → sets `adFailed=true`, resolves pending resolverRef `false`, sets `isLoaded=false`

### 5.2 Reward callback correctness
- It resolves `true` on `EARNED_REWARD`.
- It clears `resolverRef.current` after reward.
- On `CLOSED`, it resolves `false` **only if** `resolverRef.current` still exists.
- Therefore, after earning, CLOSED should not “double resolve”.

**Observed call-site expectations:**
- Academy locked courses use `isAdReady` / disabled states to prevent “not ready” calls.
- The academy index “watch to preview” button does not fully gate on `isAdReady`; it relies on `showRewardedAd()` returning `false` if not loaded.

### 5.3 Potential fragility (risk notes)
- `showRewardedAd()` returns `false` if not loaded; some UX paths may then show “nothing” rather than “try again”, depending on screen.
- The rewarded ad is reloaded on CLOSED; that is good for session continuity.
- No explicit cleanup issues were observed beyond normal event listener removal on initAd cleanup (initAd is recreated and effect cleanup returns unsub functions).

**Rewarded ad health conclusion:** reward callback handling is logically sound (no obvious double-reward/duplicate resolution pattern), with some minor UX inconsistency in the “preview” CTA when ad is not ready.

---

## 6) Exact Android AdMob unit inventory required (min set)

From `frontend/src/services/adManager.ts`, the app references exactly these Ad types on native:

1. **Android Banner** (`AD_UNITS.BANNER`)
   - Used by: `AdBanner.tsx` (anchored adaptive banner)
2. **Android Interstitial** (`AD_UNITS.INTERSTITIAL`)
   - Used by: `useInterstitialAd.ts`
3. **Android Rewarded** (`AD_UNITS.REWARDED`)
   - Used by: `useRewardedAd.ts`
4. **Android Native** (`AD_UNITS.NATIVE`)
   - Used by: `NativeAdCard.tsx`

✅ **Therefore the AdMob Android production unit inventory needed is exactly 4 units**:
- 1 Banner unit id
- 1 Interstitial unit id
- 1 Rewarded unit id
- 1 Native unit id

No other ad unit ids appear in the ad primitives we read.

---

## 7) Policy-risk analysis (AdMob compliance & UX abuse risks)

### 7.1 Interstitial aggressiveness risk (highest)
**Why:** `frontend/src/services/adManager.ts`
- `INTERSTITIAL_ACTION_THRESHOLD = 1`
- `INTERSTITIAL_COOLDOWN_MS = 0`
- Interstitial shows essentially after every `recordAction()` trigger, with no time-based rate limiting.

**Where triggered:**
- AI analysis completion (likely occasional but still frequent for active users)
- Signals refresh (pull-to-refresh frequency can be high)

**Policy risk:** excessive interstitial frequency is a common compliance issue.

**Mitigating observation:** interstitials only trigger for free-tier users (`isFree` gating in `useInterstitialAd.ts`).

---

### 7.2 Native ads appear on premium/VIP (product expectation risk)
- `NativeAdCard.tsx` does not check subscription status.
- Placement screens (`news`, `calendar`) do not gate around tier for native ads in the code read.
- This may contradict monetization strategy (premium should be ad-free) and can also create unexpected ad density.

---

### 7.3 Rewarded ad “abuse” risk
- Rewarded ad usage is CTA-based (“Watch Ad to Unlock/Preview”), which is typically safe.
- The rewarded implementation uses non-personalized ads request options:
  - `requestNonPersonalizedAdsOnly: true`
- It does not appear to attempt reward spoofing; reward is based on AdMob callback.

---

### 7.4 Click/navigation interruption risk
- Interstitial is shown immediately after trigger if loaded.
- No explicit “post-navigation” timing or user disengagement is built in.
- Banner is anchored; native cards are in-feed.

**Net policy-risk ranking:**  
1) Interstitial frequency (code-level “aggressive” configuration)  
2) Native ads shown to premium  
3) Rewarded is comparatively safer due to user-initiated CTA

---

## 8) Performance / lifecycle analysis (rerenders, leaks, reload storms)

### 8.1 Interstitial lifecycle
- Preloads on mount of component `useInterstitialAd()` usage site (screen-level).
- Event listeners are registered once per mount and cleaned up on effect cleanup.
- On CLOSED, it calls `ad.load()` inside listener to keep it ready.

**Potential issue:** if the screen mounts/unmounts frequently, you can end up re-preloading repeatedly. But listener cleanup mitigates memory leaks.

### 8.2 Rewarded lifecycle
- Preloads and re-preloads on CLOSED.
- Uses resolverRef to coordinate promise resolution.
- Event listeners are removed in initAd cleanup.

**Potential reload storm risk:** depends on how often CLOSED happens; but rewarded is user-triggered, not automatic.

### 8.3 NativeAdCard lifecycle
- Uses `createForAdRequest(...).then(ad => setNativeAd(ad))`
- Has two cleanup paths:
  - destroyed flag to avoid setting state post-unmount
  - destroys nativeAd on unmount
- Risk of duplicate destroy exists but is minor.

### 8.4 Banner lifecycle
- Banner is rendered as a component; it sets adError on load failure and then returns null on error.
- No explicit refresh strategy; that’s generally fine.

---

## 9) Exact files involved (Android transition + monetization safety)

### Core ad inventory / ID switching
- `frontend/src/services/adManager.ts`
  - **Android → production switch happens here**
- `frontend/src/services/adManager.web.ts`
  - Web stubs only (no production impact)

### Ad primitives / logic
- `frontend/src/components/ads/AdBanner.tsx` (free-tier gated banner)
- `frontend/src/components/ads/NativeAdCard.tsx` (native feed)
- `frontend/src/components/ads/useInterstitialAd.ts` (interstitial preloading + show)
- `frontend/src/components/ads/useRewardedAd.ts` (rewarded preload + promise reward resolution)

### Placement surfaces (screens that render/trigger ads)
- Banner:
  - `frontend/app/(tabs)/ai.tsx`
  - `frontend/app/(tabs)/signals.tsx`
  - `frontend/app/(tabs)/dashboard.tsx`
  - `frontend/app/(tabs)/more.tsx`
  - `frontend/app/calendar/index.tsx`
  - `frontend/app/news/index.tsx`
- Interstitial triggers:
  - `frontend/app/(tabs)/ai.tsx`
  - `frontend/app/(tabs)/signals.tsx`
- Rewarded triggers:
  - `frontend/app/academy/index.tsx`
  - `frontend/app/academy/[category].tsx`
- Native feed:
  - `frontend/app/calendar/index.tsx`
  - `frontend/app/news/index.tsx`

---

## 10) Safest Android production rollout strategy (no architecture rewrite)

Because Android unit ids are hardcoded and there is no existing environment switching/flag system:

### Step 1 — Create the exact 4 production ad units in AdMob
Create production units:
- Banner
- Interstitial
- Rewarded
- Native

Ensure they are available in the correct AdMob app and linked to the Android app.

### Step 2 — Make Android IDs the only changes (min scope)
- Update only the `android:` values in `frontend/src/services/adManager.ts` for those 4 types.
- Keep iOS unchanged (it already uses production IDs).

### Step 3 — Prevent “test IDs in release”
Since there is no guard in code, the rollout plan should be operationally safe:
- Verify that the release build that ships to production APK/AAB contains updated IDs
- Consider internal testing tracks first (internal/closed testing) to verify:
  - rewarded unlock works
  - interstitial loads & shows
  - banner renders and does not crash
  - native cards load and render without exceptions

### Step 4 — Compliance safeguard via frequency tuning (optional, but risk-linked)
Even though the user request forbids redesign, it’s still a **policy risk note**:
- interstitial gate currently shows after every action with no cooldown.
- If you see compliance/UX warnings during internal testing, a safer adjustment would be to add a cooldown or reduce triggers.
- This is code behavior, so treat it as “only if needed” based on policy feedback.

### Step 5 — Validate tier expectations for native ads
Because native ads are not tier-gated in `NativeAdCard.tsx`, internal test should confirm:
- Do premium/VIP users see native ads?  
If yes and that’s unintended, that becomes a product/monetization policy concern (not necessarily an AdMob policy breach, but can be undesirable).

---

# Bottom line
- **Android currently uses TEST ad units** for banner/interstitial/rewarded/native (`adManager.ts`).
- The codebase’s ad system is small and centralized: **only 4 Android units** are needed to go live.
- The biggest compliance/UX risk is **interstitial frequency gate configuration** (threshold=1, cooldown=0 → aggressive).
- Secondary risk: **native ads likely show for premium/VIP** because native rendering has no tier gating.

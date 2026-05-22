# Final Production Audit Pass — Android AdMob Monetization Activation (Explore Mode)

## 1) Final production-readiness assessment

### A) ADMOB production readiness (IDs + wiring)

**What we changed (surgical, Android-only):**
- **Android AdMob APP ID** updated in Expo’s `react-native-google-mobile-ads` plugin config:
  - `frontend/app.json`
  - from Google well-known **TEST** app id `ca-app-pub-3940256099942544~3347511713`
  - to **production** Android app id `ca-app-pub-3249620629100588~2801585435` (as provided)

- **Android Ad unit IDs** updated in the centralized ad unit map:
  - `frontend/src/services/adManager.ts`
  - only the `Platform.select({ android: ... })` values for:
    - **Banner**: `ca-app-pub-3249620629100588/7634484992`
    - **Interstitial**: `ca-app-pub-3249620629100588/1327033881`
    - **Rewarded**: `ca-app-pub-3249620629100588/8822380527`
    - **Native**: `ca-app-pub-3249620629100588/4182325141`

**What we did NOT change:**
- iOS ad unit IDs remain **exactly** as before (verified by re-reading `frontend/src/services/adManager.ts`):
  - iOS banner: `ca-app-pub-3249620629100588/3292403004`
  - iOS interstitial: `ca-app-pub-3249620629100588/1155370427`
  - iOS rewarded: `ca-app-pub-3249620629100588/5016548217`
  - iOS native: `ca-app-pub-3249620629100588/5343851273`
- Web behavior remains no-op because:
  - `frontend/src/services/adManager.web.ts` remains unchanged (web stub returns `test-*` ids and disables gating by returning `false` for interstitial gating).

**Confirmation: no remaining Android TEST IDs**
- A repo search for the old Google well-known TEST app id prefix `ca-app-pub-3940256099942544` returned **0 results** under `frontend/`.
- A repo search for the new provided Android production ids returned expected matches in:
  - `frontend/app.json` (androidAppId)
  - `frontend/src/services/adManager.ts` (android unit ids)

**Ad policy risk posture (important)**
- All shown ads (banner/interstitial/rewarded/native) use:
  - `requestNonPersonalizedAdsOnly: true`
  - This is consistent with a conservative policy posture for production readiness.

### B) Subscription monetization isolation

From the ad components/hooks we inspected:
- **Banner**: `frontend/src/components/ads/AdBanner.tsx`
  - renders only when the subscription tier resolves to `free`
  - returns `null` when premium/vip/admin (anything where computed `tier !== 'free'`)
- **Interstitial**: `frontend/src/components/ads/useInterstitialAd.ts`
  - preloads and shows only when computed `tier === 'free'`
- **Rewarded**: `frontend/src/components/ads/useRewardedAd.ts`
  - preloads and shows only when computed `tier === 'free'` and `Platform.OS !== 'web'`
- **Native**: `frontend/src/components/ads/NativeAdCard.tsx`
  - hard gate for Premium/VIP/Admin:
    - `isFreeTier = !status?.is_admin && tier === 'free'`
  - returns `null` if not free tier

**Implication:** Ad loading and display are isolated to the free tier in multiple independent places (not just one UI gate), reducing leak/regression risk.

### C) Rewarded flow integrity (callback handling + unlock behavior)

We inspected the rewarded implementation and its call sites:

- **Rewarded ad hook**: `frontend/src/components/ads/useRewardedAd.ts`
  - Loads a rewarded ad using `AD_UNITS.REWARDED` (Android now points to production)
  - Uses:
    - `LOADED` to set `isLoaded=true`
    - `EARNED_REWARD` to resolve the pending promise with `true`
    - `CLOSED` to resolve pending promise with `false` (if still pending) and reload ad
    - `ERROR` to set `adFailed=true` and resolve pending promise with `false`
  - **Duplicate reward prevention:**
    - After `EARNED_REWARD`, it calls `resolverRef.current?.(true)` and immediately sets `resolverRef.current = null`.
    - Subsequent close/error events will not re-resolve because `resolverRef.current` is null.
  - **Reload behavior:**
    - On `CLOSED`, it calls `ad.load()` to prepare the next rewarded ad.

- **Academy rewarded call sites**
  - `frontend/app/academy/index.tsx`
    - on rewarded success, navigates to `/academy/intermediate`
    - reward is only obtainable from the “Watch Ad to Preview” button which is only rendered for `userTier === 'free'`
  - `frontend/app/academy/[category].tsx`
    - uses `showRewardedAd()`
    - on success, sets `adUnlocked=true` (unlocks on that screen/session)
    - does not modify any rewarded callback logic beyond awaiting the hook result

**Implication:** Rewarded unlock behavior is driven by a single boolean result returned from the hook, and the hook ensures “exactly once” resolution per show via `resolverRef`.

### D) Runtime stability review (observed ad listener lifecycle)

Based on inspected code:
- Hooks/components consistently wrap SDK imports in `try/catch` when `Platform.OS !== 'web`, preventing bundling crashes.
- Listener unsubscribes exist for rewarded and interstitial hooks.

**However, there is a SHOULD-FIX memory/stability observation:**
- In `useRewardedAd` and `useInterstitialAd`, cleanup unsubscribes event listeners but does **not** explicitly call `ad.destroy()` (unlike NativeAdCard which calls `nativeAd.destroy()` on unmount).
- In `NativeAdCard`, when `isFreeTier` changes away from free tier, the effect cleanup does not call `destroy()` on the ad instance; it only sets `destroyed = true` and relies on the separate cleanup effect tied to `nativeAd` state/unmount. This is usually fine, but could leave native ad resources resident longer than desired.

These are unlikely to break monetization, but are relevant for long-running app sessions.

### E) Dev-client stability / production readiness coupling

We verified the only production-sensitive runtime wiring changes:
- Android AdMob ids live in:
  - `frontend/app.json` (Android app id)
  - `frontend/src/services/adManager.ts` (Android unit ids)
- No changes were made to:
  - referral, avatar, dashboard correction, auth deep links, or any lifecycle orchestration code during this ad-id activation pass (per file impact review below).

### F) Regression-risk hotspots (what we touched)

**Touched files (2 only):**
- `frontend/app.json`
- `frontend/src/services/adManager.ts`

**Non-touched but reviewed for monetization safety:**
- `frontend/src/services/adManager.web.ts` (confirmed still web stub)
- `frontend/src/components/ads/AdBanner.tsx`
- `frontend/src/components/ads/useInterstitialAd.ts`
- `frontend/src/components/ads/useRewardedAd.ts`
- `frontend/src/components/ads/NativeAdCard.tsx`
- `frontend/app/academy/index.tsx`
- `frontend/app/academy/[category].tsx`

## 2) Remaining risks (if any)

1. **Potential ad resource lifecycle / memory pressure (SHOULD-FIX):**
   - Rewarded and interstitial hooks don’t call `ad.destroy()` on cleanup/unmount, only remove listeners and sometimes call `ad.load()`.
   - NativeAdCard may hold onto an ad instance longer than necessary if tier gating toggles during runtime.

2. **TypeScript errors exist elsewhere in the repo (pre-existing):**
   - A `tsc --noEmit` run produced unrelated TypeScript errors in several screens/components.
   - This ad-id activation pass did not introduce these errors, but it can still affect CI if CI blocks on typecheck.

3. **Interstitial pacing depends on user action recording correctness (no change made):**
   - We did not modify interstitial frequency logic or triggers, but production pacing correctness is still dependent on existing `recordAction()` call sites.

## 3) MUST-FIX blockers before commit

- **None specifically blocking this Android monetization activation**, given:
  - Android production APP ID is now used in `frontend/app.json`.
  - Android production ad unit IDs are now used in `frontend/src/services/adManager.ts`.
  - Old Google TEST IDs no longer appear in the frontend repo search.
  - Rewarded/interstitial/native components all consume `AD_UNITS` and are tier-gated.

## 4) SHOULD-FIX observations

1. **Add `ad.destroy()` during hook cleanup (rewarded/interstitial)**
   - Files:
     - `frontend/src/components/ads/useRewardedAd.ts`
     - `frontend/src/components/ads/useInterstitialAd.ts`
   - Rationale: reduce memory/resource retention in long sessions.

2. **Ensure NativeAdCard cleanup destroys ad instance on tier gate change**
   - File: `frontend/src/components/ads/NativeAdCard.tsx`
   - Rationale: guarantee native ad resources are released when free-tier gate is no longer met.

3. **Consider adding a small automated assertion/test**
   - e.g., grep-based CI check preventing `ca-app-pub-3940256099942544` (Google TEST) from appearing in Android config paths
   - This prevents future accidental production activation with test ids.

## 5) Confirmation (safe to commit / push / continue)

- **Safe to commit:** YES (for the scope of this production-hardening Android AdMob id activation pass)
- **Safe to push:** YES (assuming no other concurrent changes are being bundled)
- **Safe to continue stabilization roadmap:** YES, but avoid introducing any new changes to the ad placement/hooks/reward logic unless explicitly part of the stabilization tasks.

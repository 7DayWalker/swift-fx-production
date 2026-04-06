/**
 * Centralized Ad Manager — controls frequency, state, and test/production ID switching.
 *
 * All ad unit IDs live here. Swap TEST → production when going live.
 * TestIds are hardcoded Google well-known test IDs to avoid importing
 * the native-only SDK at the module level (breaks web bundling).
 */
import { Platform } from 'react-native';

// ─── Ad Unit IDs (Google well-known TEST IDs — replace with production IDs later) ──
export const AD_UNITS = {
  BANNER: Platform.select({
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios: 'ca-app-pub-3940256099942544/2934735716',
    default: 'test-banner',
  }),
  INTERSTITIAL: Platform.select({
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios: 'ca-app-pub-3940256099942544/4411468910',
    default: 'test-interstitial',
  }),
  REWARDED: Platform.select({
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712485313',
    default: 'test-rewarded',
  }),
  NATIVE: Platform.select({
    android: 'ca-app-pub-3940256099942544/2247696110',
    ios: 'ca-app-pub-3940256099942544/3986624511',
    default: 'test-native',
  }),
};

// ─── Interstitial Frequency Gate ────────────────────────────────────────────
const INTERSTITIAL_ACTION_THRESHOLD = 4; // show every N meaningful actions
const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes minimum gap

let _actionCount = 0;
let _lastInterstitialTime = 0;

/** Call after a meaningful user action (e.g. AI analysis complete, signal viewed). */
export function recordAction(): boolean {
  _actionCount += 1;
  return shouldShowInterstitial();
}

/** Returns true if enough actions have occurred AND cooldown has elapsed. */
export function shouldShowInterstitial(): boolean {
  if (_actionCount < INTERSTITIAL_ACTION_THRESHOLD) return false;
  const now = Date.now();
  if (now - _lastInterstitialTime < INTERSTITIAL_COOLDOWN_MS) return false;
  return true;
}

/** Call after an interstitial has been shown to reset counters. */
export function markInterstitialShown(): void {
  _actionCount = 0;
  _lastInterstitialTime = Date.now();
}

/** Reset all ad state (e.g. on logout). */
export function resetAdState(): void {
  _actionCount = 0;
  _lastInterstitialTime = 0;
}

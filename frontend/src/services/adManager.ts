/**
 * Centralized Ad Manager — controls frequency, state, and test/production ID switching.
 *
 * iOS uses LIVE production ad unit IDs.
 * Android still uses Google well-known TEST IDs (swap when going live on Play Store).
 * TestIds are hardcoded Google well-known test IDs to avoid importing
 * the native-only SDK at the module level (breaks web bundling).
 */
import { Platform } from 'react-native';

// ─── Ad Unit IDs ────────────────────────────────────────────────────────────
export const AD_UNITS = {
  BANNER: Platform.select({
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios: 'ca-app-pub-3249620629100588/3292403004',
    default: 'test-banner',
  }),
  INTERSTITIAL: Platform.select({
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios: 'ca-app-pub-3249620629100588/1155370427',
    default: 'test-interstitial',
  }),
  REWARDED: Platform.select({
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3249620629100588/5016548217',
    default: 'test-rewarded',
  }),
  NATIVE: Platform.select({
    android: 'ca-app-pub-3940256099942544/2247696110',
    ios: 'ca-app-pub-3249620629100588/5343851273',
    default: 'test-native',
  }),
};

// ─── Interstitial Frequency Gate ────────────────────────────────────────────
const INTERSTITIAL_ACTION_THRESHOLD = 1; // show after every meaningful action
const INTERSTITIAL_COOLDOWN_MS = 0; // no cooldown — show after every action

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

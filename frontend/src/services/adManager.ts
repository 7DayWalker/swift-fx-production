/**
 * Centralized Ad Manager — controls frequency, state, and test/production ID switching.
 *
 * All ad unit IDs live here. Swap TEST → production when going live.
 */
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// ─── Ad Unit IDs (TEST for now — replace with production IDs later) ─────────
export const AD_UNITS = {
  BANNER: TestIds.BANNER,
  INTERSTITIAL: TestIds.INTERSTITIAL,
  REWARDED: TestIds.REWARDED,
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

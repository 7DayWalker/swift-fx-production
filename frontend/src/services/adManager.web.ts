/**
 * adManager — web stub. Provides safe no-op implementations for web.
 */
export const AD_UNITS = {
  BANNER: 'test-banner',
  INTERSTITIAL: 'test-interstitial',
  REWARDED: 'test-rewarded',
};

export function recordAction(): boolean { return false; }
export function shouldShowInterstitial(): boolean { return false; }
export function markInterstitialShown(): void {}
export function resetAdState(): void {}

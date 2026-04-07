/**
 * useRewardedAd — web stub. No-op on web.
 */
export function useRewardedAd() {
  return {
    showRewardedAd: () => Promise.resolve(true),
    isAdReady: false,
    adFailed: false,
    retryLoadAd: () => {},
  };
}

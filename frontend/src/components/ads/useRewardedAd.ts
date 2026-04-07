/**
 * useRewardedAd — shows a rewarded ad and resolves when the user earns the reward.
 *
 * Only for free users. The caller must explicitly trigger showRewardedAd().
 * Returns a promise that resolves true (reward earned) or false (dismissed/error).
 * Exposes adFailed + retryLoadAd for retry UX when the initial load fails.
 * No-ops silently on web.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { AD_UNITS } from '../../services/adManager';

let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    RewardedAd = mobileAds.RewardedAd;
    RewardedAdEventType = mobileAds.RewardedAdEventType;
    AdEventType = mobileAds.AdEventType;
  } catch {}
}

export function useRewardedAd() {
  const { status } = useSubscription();
  const adRef = useRef<any>(null);
  const resolverRef = useRef<((earned: boolean) => void) | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);

  const tier = status?.capability_tier || status?.subscription || 'free';
  const isFree = tier === 'free';

  const initAd = useCallback(() => {
    if (Platform.OS === 'web' || !isFree || !RewardedAd || !AdEventType || !RewardedAdEventType) return;

    // Reset states for a fresh attempt
    setIsLoaded(false);
    setAdFailed(false);

    try {
      const ad = RewardedAd.createForAdRequest(AD_UNITS.REWARDED, {
        requestNonPersonalizedAdsOnly: true,
      });

      const loadedUnsub = ad.addAdEventListener(AdEventType.LOADED, () => {
        setIsLoaded(true);
        setAdFailed(false);
      });
      const earnedUnsub = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        resolverRef.current?.(true);
        resolverRef.current = null;
      });
      const closedUnsub = ad.addAdEventListener(AdEventType.CLOSED, () => {
        if (resolverRef.current) {
          resolverRef.current(false);
          resolverRef.current = null;
        }
        setIsLoaded(false);
        try { ad.load(); } catch {}
      });
      const errorUnsub = ad.addAdEventListener(AdEventType.ERROR, () => {
        setIsLoaded(false);
        setAdFailed(true);
        if (resolverRef.current) {
          resolverRef.current(false);
          resolverRef.current = null;
        }
      });

      adRef.current = ad;
      ad.load();

      return () => {
        loadedUnsub();
        earnedUnsub();
        closedUnsub();
        errorUnsub();
      };
    } catch (e) {
      console.warn('[Ads] Failed to initialize rewarded ad:', e);
      setAdFailed(true);
      return undefined;
    }
  }, [isFree]);

  // Preload ad on mount
  useEffect(() => {
    const cleanup = initAd();
    return cleanup;
  }, [initAd]);

  /** Retry loading after a failure */
  const retryLoadAd = useCallback(() => {
    if (adRef.current) {
      setAdFailed(false);
      setIsLoaded(false);
      try { adRef.current.load(); } catch { setAdFailed(true); }
    } else {
      initAd();
    }
  }, [initAd]);

  /**
   * Show the rewarded ad. Returns a promise:
   *  true  = user watched and earned the reward
   *  false = dismissed, error, or not available
   */
  const showRewardedAd = useCallback((): Promise<boolean> => {
    if (!isFree || Platform.OS === 'web') return Promise.resolve(true); // non-free skip ads

    if (!isLoaded || !adRef.current) {
      return Promise.resolve(false); // ad not ready
    }

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      adRef.current.show();
    });
  }, [isFree, isLoaded]);

  const isAdReady = isLoaded && isFree && Platform.OS !== 'web';

  return { showRewardedAd, isAdReady, adFailed, retryLoadAd };
}

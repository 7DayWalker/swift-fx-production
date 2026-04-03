/**
 * useRewardedAd — shows a rewarded ad and resolves when the user earns the reward.
 *
 * Only for free users. The caller must explicitly trigger showRewardedAd().
 * Returns a promise that resolves true (reward earned) or false (dismissed/error).
 * No-ops silently on web.
 */
import { useCallback, useEffect, useRef } from 'react';
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
  const isLoadedRef = useRef(false);
  const resolverRef = useRef<((earned: boolean) => void) | null>(null);

  const tier = status?.capability_tier || status?.subscription || 'free';
  const isFree = tier === 'free';

  // Preload ad on mount
  useEffect(() => {
    if (Platform.OS === 'web' || !isFree || !RewardedAd || !AdEventType || !RewardedAdEventType) return;

    try {
      const ad = RewardedAd.createForAdRequest(AD_UNITS.REWARDED, {
        requestNonPersonalizedAdsOnly: true,
      });

      const loadedUnsub = ad.addAdEventListener(AdEventType.LOADED, () => {
        isLoadedRef.current = true;
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
        isLoadedRef.current = false;
        try { ad.load(); } catch {}
      });
      const errorUnsub = ad.addAdEventListener(AdEventType.ERROR, () => {
        isLoadedRef.current = false;
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
      return undefined;
    }
  }, [isFree]);

  /**
   * Show the rewarded ad. Returns a promise:
   *  true  = user watched and earned the reward
   *  false = dismissed, error, or not available
   */
  const showRewardedAd = useCallback((): Promise<boolean> => {
    if (!isFree || Platform.OS === 'web') return Promise.resolve(true); // non-free skip ads

    if (!isLoadedRef.current || !adRef.current) {
      return Promise.resolve(false); // ad not ready
    }

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      adRef.current.show();
    });
  }, [isFree]);

  const isAdReady = isLoadedRef.current && isFree && Platform.OS !== 'web';

  return { showRewardedAd, isAdReady };
}

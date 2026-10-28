/**
 * useInterstitialAd — preloads and shows a full-screen interstitial ad.
 *
 * Respects the adManager frequency gate. Only triggers for free users.
 * No-ops silently on web.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { AD_UNITS, recordAction, shouldShowInterstitial, markInterstitialShown } from '../../services/adManager';

let InterstitialAd: any = null;
let AdEventType: any = null;
if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    InterstitialAd = mobileAds.InterstitialAd;
    AdEventType = mobileAds.AdEventType;
  } catch {}
}

export function useInterstitialAd() {
  const { status, isLoading } = useSubscription();
  const adRef = useRef<any>(null);
  const isLoadedRef = useRef(false);

  const tier = status?.capability_tier || status?.subscription || 'free';
  const isFree = !isLoading && !status?.is_admin && tier === 'free';

  // Preload ad on mount (native + free only)
  useEffect(() => {
    if (Platform.OS === 'web' || !isFree || !InterstitialAd || !AdEventType) return;

    try {
      const ad = InterstitialAd.createForAdRequest(AD_UNITS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: true,
      });

      const loadedUnsub = ad.addAdEventListener(AdEventType.LOADED, () => {
        isLoadedRef.current = true;
      });
      const closedUnsub = ad.addAdEventListener(AdEventType.CLOSED, () => {
        isLoadedRef.current = false;
        try { ad.load(); } catch {}
      });
      const errorUnsub = ad.addAdEventListener(AdEventType.ERROR, () => {
        isLoadedRef.current = false;
      });

      adRef.current = ad;
      ad.load();

      return () => {
        loadedUnsub();
        closedUnsub();
        errorUnsub();
      };
    } catch (e) {
      console.warn('[Ads] Failed to initialize interstitial ad:', e);
      return undefined;
    }
  }, [isFree]);

  /**
   * Record a meaningful action. If the frequency threshold is met,
   * the interstitial is shown automatically.
   */
  const recordAndMaybeShow = useCallback(() => {
    if (!isFree) return;
    recordAction();
    if (shouldShowInterstitial() && isLoadedRef.current && adRef.current) {
      adRef.current.show();
      markInterstitialShown();
    }
  }, [isFree]);

  return { recordAndMaybeShow };
}

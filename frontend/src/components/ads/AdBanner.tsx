/**
 * AdBanner — renders a Google AdMob banner at the bottom of a screen.
 *
 * Only renders for FREE tier users. Premium/VIP see nothing.
 * Safely no-ops on web (react-native-google-mobile-ads is native-only).
 */
import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { AD_UNITS } from '../../services/adManager';

// Conditional import — the SDK only works on native
let BannerAd: any = null;
let BannerAdSize: any = null;
if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    BannerAd = mobileAds.BannerAd;
    BannerAdSize = mobileAds.BannerAdSize;
  } catch {}
}

interface AdBannerProps {
  /** Extra bottom margin (e.g. to clear tab bar) */
  bottomOffset?: number;
}

export const AdBanner: React.FC<AdBannerProps> = ({ bottomOffset = 0 }) => {
  const { status } = useSubscription();
  const [adError, setAdError] = useState(false);

  // Only free users see ads
  const tier = status?.capability_tier || status?.subscription || 'free';
  if (tier !== 'free') return null;

  // No ads on web
  if (Platform.OS === 'web' || !BannerAd || !BannerAdSize) return null;

  // Hide if ad failed to load
  if (adError) return null;

  return (
    <View style={[styles.container, { marginBottom: bottomOffset }]}>
      <BannerAd
        unitId={AD_UNITS.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setAdError(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
});

export default AdBanner;

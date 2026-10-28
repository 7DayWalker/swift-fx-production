/**
 * NativeAdCard — renders an in-feed native ad blending with content.
 *
 * Uses react-native-google-mobile-ads NativeAd (Promise-based API) on native.
 * Gracefully returns null if SDK unavailable or ad fails.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSubscription } from '../../context/SubscriptionContext';
import { AD_UNITS } from '../../services/adManager';

let NativeAdClass: any = null;
let NativeAdView: any = null;
let NativeAsset: any = null;
let NativeAssetType: any = null;
let NativeMediaView: any = null;

if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    NativeAdClass = mobileAds.NativeAd;
    NativeAdView = mobileAds.NativeAdView;
    NativeAsset = mobileAds.NativeAsset;
    NativeAssetType = mobileAds.NativeAssetType;
    NativeMediaView = mobileAds.NativeMediaView;
  } catch {}
}

interface NativeAdCardProps {
  style?: any;
}

function NativeAdCardInner({ style }: NativeAdCardProps) {
  const { status, isLoading } = useSubscription();

  const tier = status?.capability_tier || status?.subscription || 'free';
  const isFreeTier = !isLoading && !status?.is_admin && tier === 'free';

  const [nativeAd, setNativeAd] = useState<any>(null);
  const [adError, setAdError] = useState(false);

  useEffect(() => {
    if (!isFreeTier || !NativeAdClass || !AD_UNITS.NATIVE) return;

    let destroyed = false;
    let loadedAd: any = null;

    NativeAdClass.createForAdRequest(AD_UNITS.NATIVE, {
      requestNonPersonalizedAdsOnly: true,
    })
      .then((ad: any) => {
        loadedAd = ad;
        if (!destroyed) setNativeAd(ad);
        else if (ad?.destroy) {
          try { ad.destroy(); } catch {}
        }
      })
      .catch((err: any) => {
        console.warn('[Ads] NativeAd load failed:', err);
        if (!destroyed) setAdError(true);
      });

    return () => {
      destroyed = true;
      if (loadedAd?.destroy) {
        try { loadedAd.destroy(); } catch {}
      }
    };
  }, [isFreeTier]);

  // Cleanup ad on unmount if it loaded after initial effect
  useEffect(() => {
    return () => {
      if (nativeAd?.destroy) {
        try { nativeAd.destroy(); } catch {}
      }
    };
  }, [nativeAd]);

  // Hard gate placed AFTER all hooks so React hook order stays invariant across renders
  if (isLoading || !isFreeTier) return null;
  if (!NativeAdClass || !NativeAdView || adError || !nativeAd) return null;

  try {
    return (
      <View style={[styles.container, style]} data-testid="native-ad-card">
        <NativeAdView nativeAd={nativeAd} style={styles.adView}>
          <View style={styles.adContent}>
            {/* Ad attribution badge */}
            <View style={styles.adHeader}>
              <View style={styles.adBadge}>
                <Text style={styles.adBadgeText}>Ad</Text>
              </View>
            </View>

            {/* Icon + Headline row */}
            {NativeAsset && NativeAssetType && (
              <>
                {nativeAd.headline ? (
                  <NativeAsset assetType={NativeAssetType.HEADLINE}>
                    <Text style={styles.headline} numberOfLines={2}>
                      {nativeAd.headline}
                    </Text>
                  </NativeAsset>
                ) : null}

                {nativeAd.body ? (
                  <NativeAsset assetType={NativeAssetType.BODY}>
                    <Text style={styles.body} numberOfLines={2}>
                      {nativeAd.body}
                    </Text>
                  </NativeAsset>
                ) : null}
              </>
            )}

            {/* Media */}
            {NativeMediaView && (
              <NativeMediaView style={styles.mediaView} resizeMode="cover" />
            )}

            {/* CTA */}
            {NativeAsset && NativeAssetType && nativeAd.callToAction ? (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text style={styles.ctaText}>
                  {nativeAd.callToAction}
                </Text>
              </NativeAsset>
            ) : null}
          </View>
        </NativeAdView>
      </View>
    );
  } catch (e) {
    console.warn('[Ads] NativeAd render failed:', e);
    return null;
  }
}

export default function NativeAdCard(props: NativeAdCardProps) {
  if (Platform.OS === 'web') return null;
  return <NativeAdCardInner {...props} />;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A1F2E',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  adView: {
    width: '100%',
  },
  adContent: {
    padding: 14,
  },
  adHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  adBadge: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFD700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    color: '#8A8D98',
    lineHeight: 17,
    marginBottom: 10,
  },
  mediaView: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#0A0E17',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0E17',
    backgroundColor: '#00D4AA',
    borderRadius: 10,
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
});

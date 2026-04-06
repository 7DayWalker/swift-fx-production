/**
 * NativeAdCard — renders an in-feed native ad blending with content.
 *
 * Uses react-native-google-mobile-ads NativeAdView on native.
 * Gracefully returns null if SDK unavailable or ad fails.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import { AD_UNITS } from '../../services/adManager';

let NativeAd: any = null;
let NativeAdView: any = null;
let NativeAsset: any = null;
let NativeMediaView: any = null;
let NativeAdEventType: any = null;

if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    NativeAd = mobileAds.NativeAd;
    NativeAdView = mobileAds.NativeAdView;
    NativeAsset = mobileAds.NativeAsset;
    NativeMediaView = mobileAds.NativeMediaView;
    NativeAdEventType = mobileAds.NativeAdEventType;
  } catch {}
}

interface NativeAdCardProps {
  style?: any;
}

/**
 * Fallback card when native ad SDK is not available or ad hasn't loaded.
 * Returns null — no placeholder shown.
 */
function NativeAdCardInner({ style }: NativeAdCardProps) {
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const nativeAdRef = useRef<any>(null);

  useEffect(() => {
    if (!NativeAd || !AD_UNITS.NATIVE) return;

    try {
      const ad = NativeAd.createForAdRequest(AD_UNITS.NATIVE, {
        requestNonPersonalizedAdsOnly: true,
      });

      if (NativeAdEventType) {
        ad.addAdEventListener(NativeAdEventType?.LOADED || 'loaded', () => {
          setAdLoaded(true);
        });
        ad.addAdEventListener(NativeAdEventType?.ERROR || 'error', () => {
          setAdError(true);
        });
      }

      nativeAdRef.current = ad;
      ad.load();

      return () => {
        try { ad.destroy?.(); } catch {}
      };
    } catch (e) {
      console.warn('[Ads] NativeAd init failed:', e);
      setAdError(true);
    }
  }, []);

  // If SDK not available or error, render nothing
  if (!NativeAd || !NativeAdView || adError || !adLoaded) return null;

  try {
    return (
      <View style={[styles.container, style]} data-testid="native-ad-card">
        <NativeAdView nativeAd={nativeAdRef.current} style={styles.adView}>
          <View style={styles.adContent}>
            <View style={styles.adHeader}>
              <View style={styles.adBadge}>
                <Text style={styles.adBadgeText}>Ad</Text>
              </View>
            </View>
            {NativeAsset && (
              <>
                <NativeAsset assetType="headline">
                  <Text style={styles.headline} numberOfLines={2} />
                </NativeAsset>
                <NativeAsset assetType="body">
                  <Text style={styles.body} numberOfLines={2} />
                </NativeAsset>
                <NativeAsset assetType="callToAction">
                  <View style={styles.ctaButton}>
                    <Text style={styles.ctaText} />
                  </View>
                </NativeAsset>
              </>
            )}
            {NativeMediaView && (
              <NativeMediaView style={styles.mediaView} />
            )}
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
  ctaButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0E17',
  },
});

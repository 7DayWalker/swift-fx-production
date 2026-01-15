/**
 * Referral Landing Page
 * Handles deep links from web: https://swiftfx.app/register?ref=CODE
 * Detects device type and redirects appropriately
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import {
  APP_STORE_URLS,
  getDeviceType,
  storeReferralCode,
  validateReferralCode,
} from '../src/services/referralService';

export default function ReferralLandingScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string; referral?: string }>();
  
  const [isLoading, setIsLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [isValidCode, setIsValidCode] = useState(false);
  const [deviceType, setDeviceType] = useState<'android' | 'ios' | 'desktop'>('desktop');

  useEffect(() => {
    initializeLanding();
  }, [params]);

  const initializeLanding = async () => {
    setIsLoading(true);
    
    // Get referral code from URL params
    const code = params.ref || params.referral;
    const device = getDeviceType();
    setDeviceType(device);
    
    if (code) {
      setReferralCode(code.toUpperCase());
      
      // Validate the code
      const validation = await validateReferralCode(code);
      setIsValidCode(validation.valid);
      if (validation.referrer_name) {
        setReferrerName(validation.referrer_name);
      }
      
      // Store for later use
      if (validation.valid) {
        await storeReferralCode(code, 'deeplink');
      }
    }
    
    setIsLoading(false);
    
    // On mobile app (not web), redirect to signup
    if (Platform.OS !== 'web' && code) {
      router.replace('/(auth)/register');
    }
  };

  const handleStoreRedirect = (store: 'android' | 'ios') => {
    const url = APP_STORE_URLS[store];
    // In production, append referral code to store URL using Firebase Dynamic Links
    // or Branch.io for deferred deep linking
    Linking.openURL(url);
  };

  const handleOpenApp = () => {
    // Try to open the app with the referral code
    const appUrl = `swiftfx://register?ref=${referralCode}`;
    Linking.canOpenURL(appUrl).then((supported) => {
      if (supported) {
        Linking.openURL(appUrl);
      } else {
        // App not installed, show store options
        console.log('App not installed');
      }
    });
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Mobile Web View - Show store redirect
  if (Platform.OS === 'web' && deviceType !== 'desktop') {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoBox, { backgroundColor: theme.primary }]}>
              <Ionicons name="flash" size={48} color="#0A0E17" />
            </View>
            <Text style={[styles.appName, dynamicStyles.text]}>Swift FX Signals</Text>
          </View>

          {/* Referral Info */}
          {referralCode && isValidCode && (
            <View style={[styles.referralCard, dynamicStyles.card]}>
              <Ionicons name="gift" size={24} color={theme.primary} />
              <Text style={[styles.referralTitle, dynamicStyles.text]}>
                {referrerName ? `${referrerName} invited you!` : 'You\'ve been referred!'}
              </Text>
              <Text style={[styles.referralSubtitle, dynamicStyles.textSecondary]}>
                Referral Code: <Text style={{ color: theme.primary, fontWeight: 'bold' }}>{referralCode}</Text>
              </Text>
            </View>
          )}

          {/* Coming Soon Banner */}
          <View style={[styles.comingSoonBanner, { backgroundColor: `${theme.primary}15` }]}>
            <Ionicons name="rocket" size={20} color={theme.primary} />
            <Text style={[styles.comingSoonText, { color: theme.primary }]}>Coming Soon to App Stores!</Text>
          </View>

          {/* Store Buttons */}
          <View style={styles.storeButtons}>
            <TouchableOpacity
              style={[styles.storeButton, { backgroundColor: '#000' }]}
              onPress={() => handleStoreRedirect('ios')}
            >
              <Ionicons name="logo-apple" size={24} color="#FFF" />
              <View style={styles.storeButtonText}>
                <Text style={styles.storeButtonLabel}>Download on the</Text>
                <Text style={styles.storeButtonTitle}>App Store</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.storeButton, { backgroundColor: '#000' }]}
              onPress={() => handleStoreRedirect('android')}
            >
              <Ionicons name="logo-google-playstore" size={24} color="#FFF" />
              <View style={styles.storeButtonText}>
                <Text style={styles.storeButtonLabel}>Get it on</Text>
                <Text style={styles.storeButtonTitle}>Google Play</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <Text style={[styles.featuresTitle, dynamicStyles.text]}>Why Swift FX?</Text>
            <View style={styles.featuresList}>
              {[
                { icon: 'trending-up', text: 'Premium Trading Signals' },
                { icon: 'analytics', text: 'AI Chart Analysis' },
                { icon: 'school', text: 'Trading Academy' },
                { icon: 'people', text: 'Community Support' },
              ].map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Ionicons name={feature.icon as any} size={20} color={theme.primary} />
                  <Text style={[styles.featureText, dynamicStyles.text]}>{feature.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Referral Note */}
          {referralCode && isValidCode && (
            <Text style={[styles.referralNote, dynamicStyles.textSecondary]}>
              Your referral code will be automatically applied when you sign up.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Desktop Web View - Show QR Code + Store Links
  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]}>
      <View style={styles.desktopContent}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={[styles.logoBox, { backgroundColor: theme.primary }]}>
            <Ionicons name="flash" size={64} color="#0A0E17" />
          </View>
          <Text style={[styles.appNameLarge, dynamicStyles.text]}>Swift FX Signals</Text>
          <Text style={[styles.tagline, dynamicStyles.textSecondary]}>
            Professional Trading Signals & AI Analysis
          </Text>
        </View>

        {/* Main Content Card */}
        <View style={[styles.desktopCard, dynamicStyles.card]}>
          {/* Referral Info */}
          {referralCode && isValidCode && (
            <View style={[styles.referralBanner, { backgroundColor: `${theme.primary}15` }]}>
              <Ionicons name="gift" size={28} color={theme.primary} />
              <View style={styles.referralBannerText}>
                <Text style={[styles.referralBannerTitle, dynamicStyles.text]}>
                  {referrerName ? `${referrerName} invited you!` : 'You\'ve been referred!'}
                </Text>
                <Text style={[styles.referralBannerCode, { color: theme.primary }]}>
                  Code: {referralCode}
                </Text>
              </View>
            </View>
          )}

          {/* QR Code Section */}
          <View style={styles.qrSection}>
            <Text style={[styles.qrTitle, dynamicStyles.text]}>Scan to Download</Text>
            <View style={[styles.qrContainer, { backgroundColor: '#FFF' }]}>
              {/* Placeholder QR - In production, generate with react-native-qrcode-svg */}
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code" size={120} color="#000" />
              </View>
              {referralCode && (
                <Text style={styles.qrReferralText}>Includes referral: {referralCode}</Text>
              )}
            </View>
          </View>

          {/* Store Links */}
          <View style={styles.desktopStoreLinks}>
            <Text style={[styles.orText, dynamicStyles.textSecondary]}>Or download from</Text>
            <View style={styles.storeLinksRow}>
              <TouchableOpacity
                style={[styles.desktopStoreButton, { backgroundColor: '#000' }]}
                onPress={() => handleStoreRedirect('ios')}
              >
                <Ionicons name="logo-apple" size={28} color="#FFF" />
                <View style={styles.storeButtonText}>
                  <Text style={styles.storeButtonLabel}>Download on the</Text>
                  <Text style={styles.storeButtonTitle}>App Store</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.desktopStoreButton, { backgroundColor: '#000' }]}
                onPress={() => handleStoreRedirect('android')}
              >
                <Ionicons name="logo-google-playstore" size={28} color="#FFF" />
                <View style={styles.storeButtonText}>
                  <Text style={styles.storeButtonLabel}>Get it on</Text>
                  <Text style={styles.storeButtonTitle}>Google Play</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Coming Soon Notice */}
          <View style={[styles.comingSoonNotice, { borderColor: theme.border }]}>
            <Ionicons name="information-circle" size={20} color={theme.textSecondary} />
            <Text style={[styles.comingSoonNoticeText, dynamicStyles.textSecondary]}>
              Swift FX Signals is coming soon to app stores. Your referral code will be saved and automatically applied when you sign up.
            </Text>
          </View>
        </View>

        {/* Features Grid */}
        <View style={styles.featuresGrid}>
          {[
            { icon: 'trending-up', title: 'Premium Signals', desc: 'Expert trading signals with high accuracy' },
            { icon: 'analytics', title: 'AI Analysis', desc: 'Claude-powered chart analysis' },
            { icon: 'school', title: 'Trading Academy', desc: 'Learn from beginner to advanced' },
            { icon: 'people', title: 'Community', desc: 'Join thousands of traders' },
          ].map((feature, index) => (
            <View key={index} style={[styles.featureCard, dynamicStyles.card]}>
              <View style={[styles.featureIconBox, { backgroundColor: `${theme.primary}15` }]}>
                <Ionicons name={feature.icon as any} size={28} color={theme.primary} />
              </View>
              <Text style={[styles.featureCardTitle, dynamicStyles.text]}>{feature.title}</Text>
              <Text style={[styles.featureCardDesc, dynamicStyles.textSecondary]}>{feature.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopContent: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  appNameLarge: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
  },
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
    width: '100%',
    maxWidth: 400,
  },
  referralTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  referralSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  comingSoonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 8,
    marginBottom: 24,
  },
  comingSoonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  storeButtons: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 12,
  },
  storeButtonText: {
    flex: 1,
  },
  storeButtonLabel: {
    color: '#AAA',
    fontSize: 10,
  },
  storeButtonTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  featuresSection: {
    marginTop: 32,
    width: '100%',
    maxWidth: 400,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
  },
  referralNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  // Desktop styles
  desktopCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    width: '100%',
    maxWidth: 600,
    marginBottom: 40,
  },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 16,
    marginBottom: 24,
  },
  referralBannerText: {
    flex: 1,
  },
  referralBannerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  referralBannerCode: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  qrContainer: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrReferralText: {
    fontSize: 10,
    color: '#666',
    marginTop: 8,
  },
  desktopStoreLinks: {
    alignItems: 'center',
  },
  orText: {
    fontSize: 14,
    marginBottom: 16,
  },
  storeLinksRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  desktopStoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 12,
    minWidth: 180,
  },
  comingSoonNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  comingSoonNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 800,
  },
  featureCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    width: 180,
    alignItems: 'center',
  },
  featureIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureCardDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
});

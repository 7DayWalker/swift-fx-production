import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { storeReferralCode, validateReferralCode } from '../src/services/referralService';

/**
 * Splash / Loading screen.
 * Shown while AuthContext resolves getSession().
 * Navigation is handled entirely by _layout.tsx watching auth state.
 */
export default function SplashScreen() {
  const params = useLocalSearchParams<{ ref?: string; referral?: string }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const code = params.ref || params.referral;
    if (!code) return;

    (async () => {
      try {
        const validation = await validateReferralCode(code);
        if (validation.valid) {
          await storeReferralCode(code, 'deeplink');
          console.log('[Referral] Stored referral from web root:', code.toUpperCase().trim());
        }
      } catch (err) {
        console.error('[Referral] Failed to process web root referral:', err);
      }
    })();
  }, [params.ref, params.referral]);

  return (
    <LinearGradient colors={['#0A0E17', '#1A1F2E', '#0A0E17']} style={styles.container}>
      <View style={styles.logoContainer}>
        <Image 
          source={require('../assets/images/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </View>
      
      <Text style={styles.tagline}>Professional Trading Signals</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logo: {
    width: 200,
    height: 200,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  tagline: {
    position: 'absolute',
    bottom: 50,
    color: '#8A8D98',
    fontSize: 14,
  },
});

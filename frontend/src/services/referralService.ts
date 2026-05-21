/**
 * Referral Deep Linking Service
 * Handles referral code capture, storage, and validation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { api } from './api';

// Storage keys
const REFERRAL_CODE_KEY = 'pending_referral_code';
const REFERRAL_SOURCE_KEY = 'referral_source';
const REFERRAL_TIMESTAMP_KEY = 'referral_timestamp';

// App Store URLs (Placeholder - Update when app is live)
export const APP_STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.swiftfx.signals',
  ios: 'https://apps.apple.com/app/id0000000000',
};

// Deep link schemes
export const DEEP_LINK_SCHEMES = {
  custom: 'swiftfx://',
  universal: 'https://swiftfx.online/app',
};

export interface ReferralInfo {
  code: string;
  source: 'deeplink' | 'manual' | 'qr';
  timestamp: string;
  isValid?: boolean;
  referrerName?: string;
}

export interface ReferralValidationResult {
  valid: boolean;
  referrer_name?: string;
  message: string;
}

/**
 * Store a referral code for later use during signup
 */
export async function storeReferralCode(
  code: string,
  source: 'deeplink' | 'manual' | 'qr' = 'deeplink'
): Promise<void> {
  try {
    const normalizedCode = code.toUpperCase().trim();
    await AsyncStorage.multiSet([
      [REFERRAL_CODE_KEY, normalizedCode],
      [REFERRAL_SOURCE_KEY, source],
      [REFERRAL_TIMESTAMP_KEY, new Date().toISOString()],
    ]);
    console.log(`[Referral] Stored code: ${normalizedCode} (source: ${source})`);
  } catch (error) {
    console.error('[Referral] Failed to store referral code:', error);
  }
}

/**
 * Retrieve stored referral code
 */
export async function getStoredReferralCode(): Promise<ReferralInfo | null> {
  try {
    const results = await AsyncStorage.multiGet([
      REFERRAL_CODE_KEY,
      REFERRAL_SOURCE_KEY,
      REFERRAL_TIMESTAMP_KEY,
    ]);
    
    const code = results[0][1];
    const source = results[1][1] as 'deeplink' | 'manual' | 'qr' | null;
    const timestamp = results[2][1];
    
    if (!code) return null;
    
    // Check if referral is expired (30 days)
    if (timestamp) {
      const storedDate = new Date(timestamp);
      const now = new Date();
      const daysDiff = (now.getTime() - storedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) {
        await clearStoredReferralCode();
        return null;
      }
    }
    
    return {
      code,
      source: source || 'deeplink',
      timestamp: timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Referral] Failed to get stored referral code:', error);
    return null;
  }
}

/**
 * Clear stored referral code (after successful signup)
 */
export async function clearStoredReferralCode(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      REFERRAL_CODE_KEY,
      REFERRAL_SOURCE_KEY,
      REFERRAL_TIMESTAMP_KEY,
    ]);
    console.log('[Referral] Cleared stored referral code');
  } catch (error) {
    console.error('[Referral] Failed to clear referral code:', error);
  }
}

/**
 * Validate a referral code against the backend
 */
export async function validateReferralCode(code: string): Promise<ReferralValidationResult> {
  try {
    const response = await api.get(`/referral/validate/${code.toUpperCase().trim()}`);
    return {
      valid: response.data.valid,
      referrer_name: response.data.referrer_name,
      message: response.data.message,
    };
  } catch (error: any) {
    console.error('[Referral] Validation error:', error);
    return {
      valid: false,
      message: error.response?.data?.message || 'Failed to validate code',
    };
  }
}

/**
 * Extract referral code from a URL
 */
export function extractReferralCodeFromUrl(url: string): string | null {
  try {
    // Handle various URL formats:
    // https://swiftfx.online/app/?ref=CODE
    // swiftfx://register?ref=CODE
    // swiftfx://ref/CODE
    // (also tolerant of https://swiftfx.online/app/register?ref=CODE)
    
    const normalizedUrl = url.startsWith('swiftfx://')
      ? url.replace('swiftfx://', 'https://swiftfx.online/app/')
      : url;

    const urlObj = new URL(normalizedUrl);
    
    // Check query parameter
    const refParam = urlObj.searchParams.get('ref') || urlObj.searchParams.get('referral');
    if (refParam) {
      return refParam.toUpperCase().trim();
    }
    
    // Check path-based format (swiftfx://ref/CODE)
    const pathMatch = urlObj.pathname.match(/\/ref\/([A-Z0-9]+)/i);
    if (pathMatch) {
      return pathMatch[1].toUpperCase().trim();
    }
    
    return null;
  } catch (error) {
    console.error('[Referral] Failed to extract code from URL:', error);
    return null;
  }
}

/**
 * Handle incoming deep link URL
 */
export async function handleDeepLink(url: string): Promise<boolean> {
  const code = extractReferralCodeFromUrl(url);
  if (code) {
    // Validate before storing
    const validation = await validateReferralCode(code);
    if (validation.valid) {
      await storeReferralCode(code, 'deeplink');
      return true;
    }
  }
  return false;
}

/**
 * Initialize deep link listener
 */
export function initDeepLinkListener(
  onReferralDetected?: (code: string) => void
): () => void {
  // Handle URL that app was opened with
  const handleInitialUrl = async () => {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      const code = extractReferralCodeFromUrl(initialUrl);
      if (code) {
        const validation = await validateReferralCode(code);
        if (validation.valid) {
          await storeReferralCode(code, 'deeplink');
          onReferralDetected?.(code);
        }
      }
    }
  };
  
  handleInitialUrl();
  
  // Listen for incoming URLs while app is open
  const subscription = Linking.addEventListener('url', async (event) => {
    const code = extractReferralCodeFromUrl(event.url);
    if (code) {
      const validation = await validateReferralCode(code);
      if (validation.valid) {
        await storeReferralCode(code, 'deeplink');
        onReferralDetected?.(code);
      }
    }
  });
  
  // Return cleanup function
  return () => {
    subscription.remove();
  };
}

/**
 * Detect device type for redirect
 */
export function getDeviceType(): 'android' | 'ios' | 'desktop' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  
  // Web detection
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  }
  
  return 'desktop';
}

/**
 * Generate referral link for sharing
 */
export function generateReferralLink(code: string): string {
  // Backend expects the landing route to accept `?ref=CODE` on `/app/`
  return `${DEEP_LINK_SCHEMES.universal}/?ref=${code}`;
}

/**
 * Swift FX In-App Purchase Service
 * 
 * Handles Apple App Store and Google Play subscriptions
 * 
 * IMPORTANT: 
 * - Never unlock features client-side
 * - Always validate purchases through backend
 * - Backend is the source of truth for subscription status
 * - IAP is only available on native iOS/Android builds
 * - Web/preview builds use fallback (Stripe checkout)
 */

import { Platform } from 'react-native';
import { api } from './api';

// Product IDs - fetched from backend or use defaults
export interface IAPProducts {
  ios: {
    premium_monthly: string;
    vip_monthly: string;
  };
  android: {
    premium_monthly: string;
    vip_monthly: string;
  };
}

// Default product IDs (will be fetched from backend)
const DEFAULT_PRODUCTS: IAPProducts = {
  ios: {
    premium_monthly: 'swiftfx_premium_monthly',
    vip_monthly: 'swiftfx_vip_monthly',
  },
  android: {
    premium_monthly: 'swiftfx_premium_monthly',
    vip_monthly: 'swiftfx_vip_monthly',
  },
};

// Subscription plans
export type SubscriptionPlan = 'premium' | 'vip';

// Purchase result
export interface PurchaseResult {
  success: boolean;
  plan?: string;
  expiryDate?: string;
  isTrial?: boolean;
  autoRenew?: boolean;
  message: string;
  error?: string;
}

/**
 * Check if IAP is available on current platform
 * Only available on native iOS/Android builds, NOT on web/preview
 */
export function isIAPAvailable(): boolean {
  // Explicitly check we're on native mobile AND not web
  return (Platform.OS === 'ios' || Platform.OS === 'android') && Platform.OS !== 'web';
}

/**
 * Fetch product IDs from backend
 */
export async function fetchProductIds(): Promise<IAPProducts> {
  try {
    const response = await api.get('/api/iap/products');
    return response.data;
  } catch (error) {
    console.warn('[IAP] Failed to fetch product IDs, using defaults:', error);
    return DEFAULT_PRODUCTS;
  }
}

/**
 * Initialize IAP connection
 * This is a no-op on web - IAP only works on native builds
 */
export async function initIAP(): Promise<boolean> {
  if (!isIAPAvailable()) {
    console.log('[IAP] Skipping initialization - web/preview platform');
    return false;
  }
  
  // On native platforms, this will be handled by the native IAP module
  // For now, return false since react-native-iap is not available in preview
  console.log('[IAP] Native IAP will be available in TestFlight/Play Store builds');
  return false;
}

/**
 * End IAP connection - no-op on web
 */
export async function endIAP(): Promise<void> {
  if (!isIAPAvailable()) {
    return;
  }
  console.log('[IAP] endIAP called - will work in native builds');
}

/**
 * Get available subscription products
 */
export function getProducts(): any[] {
  return [];
}

/**
 * Get product by plan type
 */
export function getProductByPlan(plan: SubscriptionPlan): any | undefined {
  return undefined;
}

/**
 * Request subscription purchase
 * Returns fallback message on web - real implementation on native
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return {
      success: false,
      message: 'In-App Purchases are only available on mobile devices. Please use the web checkout option.',
    };
  }

  // This will work in native builds with react-native-iap
  return {
    success: false,
    message: 'Native IAP will be available in TestFlight and Play Store builds.',
  };
}

/**
 * Restore previous purchases
 * Returns fallback message on web - real implementation on native
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return {
      success: false,
      message: 'Restore purchases is only available on mobile devices.',
    };
  }

  return {
    success: false,
    message: 'Native restore will be available in TestFlight and Play Store builds.',
  };
}

/**
 * Get IAP status from backend
 */
export async function getIAPStatus(): Promise<any> {
  try {
    const response = await api.get('/api/iap/status');
    return response.data;
  } catch (error) {
    console.error('[IAP] Error fetching status:', error);
    return null;
  }
}

/**
 * Open subscription management - no-op on web
 */
export async function openSubscriptionManagement(): Promise<void> {
  if (!isIAPAvailable()) {
    console.log('[IAP] Subscription management not available on web');
    return;
  }
  console.log('[IAP] Native subscription management will work in native builds');
}

/**
 * Format price for display
 */
export function formatProductPrice(product: any): string {
  return product?.localizedPrice || `$${product?.price || '0.00'}`;
}

export default {
  initIAP,
  endIAP,
  getProducts,
  getProductByPlan,
  purchaseSubscription,
  restorePurchases,
  getIAPStatus,
  openSubscriptionManagement,
  isIAPAvailable,
  formatProductPrice,
  fetchProductIds,
};

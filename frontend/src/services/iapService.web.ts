/**
 * Swift FX In-App Purchase Service - WEB STUB
 * 
 * This file provides mock/stub implementations for web platform.
 * IAP is only available on native iOS/Android builds.
 * Web users will be directed to Stripe checkout instead.
 */

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
 * Always returns false on web - IAP is native only
 */
export function isIAPAvailable(): boolean {
  return false;
}

/**
 * Fetch product IDs from backend
 */
export async function fetchProductIds(): Promise<IAPProducts> {
  try {
    const response = await api.get('/iap/products');
    return response.data;
  } catch (error) {
    console.warn('[IAP-Web] Failed to fetch product IDs, using defaults:', error);
    return DEFAULT_PRODUCTS;
  }
}

/**
 * Initialize IAP connection - No-op on web
 */
export async function initIAP(): Promise<boolean> {
  console.log('[IAP-Web] IAP not available on web platform');
  return false;
}

/**
 * End IAP connection - No-op on web
 */
export async function endIAP(): Promise<void> {
  // No-op on web
}

/**
 * Get available subscription products - Empty on web
 */
export function getProducts(): any[] {
  return [];
}

/**
 * Get product by plan type - Returns undefined on web
 */
export function getProductByPlan(plan: SubscriptionPlan): any | undefined {
  return undefined;
}

/**
 * Request subscription purchase - Not available on web
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<PurchaseResult> {
  return {
    success: false,
    message: 'In-App Purchases are only available on mobile devices. Please use the web checkout option.',
  };
}

/**
 * Restore previous purchases - Not available on web
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  return {
    success: false,
    message: 'Restore purchases is only available on mobile devices.',
  };
}

/**
 * Get IAP status from backend
 */
export async function getIAPStatus(): Promise<any> {
  try {
    const response = await api.get('/iap/status');
    return response.data;
  } catch (error) {
    console.error('[IAP-Web] Error fetching status:', error);
    return null;
  }
}

/**
 * Open subscription management - Not available on web
 */
export async function openSubscriptionManagement(): Promise<void> {
  console.log('[IAP-Web] Subscription management not available on web');
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

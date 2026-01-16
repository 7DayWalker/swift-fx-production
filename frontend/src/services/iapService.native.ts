/**
 * Swift FX In-App Purchase Service - NATIVE (iOS/Android)
 * 
 * Handles Apple App Store and Google Play subscriptions
 * 
 * IMPORTANT: 
 * - Never unlock features client-side
 * - Always validate purchases through backend
 * - Backend is the source of truth for subscription status
 * - This file is only loaded on native iOS/Android builds
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

// IAP state
let iapProducts: any[] = [];
let productIds: IAPProducts = DEFAULT_PRODUCTS;
let isConnected = false;

/**
 * Check if IAP is available on current platform
 * Available on native iOS/Android
 */
export function isIAPAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Fetch product IDs from backend
 */
export async function fetchProductIds(): Promise<IAPProducts> {
  try {
    const response = await api.get('/api/iap/products');
    productIds = response.data;
    return response.data;
  } catch (error) {
    console.warn('[IAP-Native] Failed to fetch product IDs, using defaults:', error);
    return DEFAULT_PRODUCTS;
  }
}

/**
 * Initialize IAP connection
 * Note: react-native-iap initialization will happen here in production builds
 */
export async function initIAP(): Promise<boolean> {
  if (!isIAPAvailable()) {
    console.log('[IAP-Native] Skipping initialization - not on native platform');
    return false;
  }

  try {
    // In development/preview, react-native-iap may not be fully functional
    // The actual IAP functionality requires a TestFlight/Play Store build
    console.log('[IAP-Native] Initializing IAP connection...');
    
    // Try to dynamically import react-native-iap
    // This will only work in actual native builds
    try {
      const RNIap = require('react-native-iap');
      
      // Initialize connection
      await RNIap.initConnection();
      isConnected = true;
      
      // Fetch product IDs from backend
      await fetchProductIds();
      
      // Get products for current platform
      const platformProductIds = Platform.OS === 'ios' 
        ? [productIds.ios.premium_monthly, productIds.ios.vip_monthly]
        : [productIds.android.premium_monthly, productIds.android.vip_monthly];
      
      // Fetch products from store
      if (Platform.OS === 'ios') {
        iapProducts = await RNIap.getSubscriptions({ skus: platformProductIds });
      } else {
        iapProducts = await RNIap.getSubscriptions({ skus: platformProductIds });
      }
      
      console.log('[IAP-Native] IAP initialized successfully. Products:', iapProducts.length);
      return true;
    } catch (iapError: any) {
      // react-native-iap not available in this build (dev/preview)
      console.log('[IAP-Native] react-native-iap not available in this build:', iapError.message);
      console.log('[IAP-Native] Native IAP will be available in TestFlight/Play Store builds');
      return false;
    }
  } catch (error: any) {
    console.error('[IAP-Native] IAP initialization error:', error);
    return false;
  }
}

/**
 * End IAP connection
 */
export async function endIAP(): Promise<void> {
  if (!isConnected) return;
  
  try {
    const RNIap = require('react-native-iap');
    await RNIap.endConnection();
    isConnected = false;
    iapProducts = [];
    console.log('[IAP-Native] IAP connection ended');
  } catch (error) {
    console.warn('[IAP-Native] Error ending IAP connection:', error);
  }
}

/**
 * Get available subscription products
 */
export function getProducts(): any[] {
  return iapProducts;
}

/**
 * Get product by plan type
 */
export function getProductByPlan(plan: SubscriptionPlan): any | undefined {
  const productId = Platform.OS === 'ios'
    ? productIds.ios[`${plan}_monthly` as keyof typeof productIds.ios]
    : productIds.android[`${plan}_monthly` as keyof typeof productIds.android];
  
  return iapProducts.find(p => p.productId === productId);
}

/**
 * Request subscription purchase
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return {
      success: false,
      message: 'In-App Purchases are only available on mobile devices.',
    };
  }

  if (!isConnected) {
    return {
      success: false,
      message: 'IAP connection not established. Please restart the app and try again.',
    };
  }

  try {
    const RNIap = require('react-native-iap');
    
    const productId = Platform.OS === 'ios'
      ? productIds.ios[`${plan}_monthly` as keyof typeof productIds.ios]
      : productIds.android[`${plan}_monthly` as keyof typeof productIds.android];

    console.log('[IAP-Native] Requesting purchase for:', productId);

    // Request subscription
    const purchase = await RNIap.requestSubscription({ sku: productId });
    
    console.log('[IAP-Native] Purchase completed:', purchase);

    // Send receipt to backend for validation
    const verifyEndpoint = Platform.OS === 'ios' 
      ? '/api/iap/apple/verify' 
      : '/api/iap/google/verify';
    
    const receipt = Platform.OS === 'ios' 
      ? purchase.transactionReceipt 
      : purchase.purchaseToken;

    const response = await api.post(verifyEndpoint, {
      receipt,
      productId,
      transactionId: purchase.transactionId,
    });

    if (response.data.success) {
      // Finish the transaction after backend validation
      await RNIap.finishTransaction({ purchase, isConsumable: false });
      
      return {
        success: true,
        plan: response.data.plan,
        expiryDate: response.data.expires_date,
        isTrial: response.data.is_trial,
        autoRenew: response.data.auto_renew,
        message: `Your ${plan.toUpperCase()} subscription is now active!`,
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Purchase verification failed.',
        error: response.data.error,
      };
    }
  } catch (error: any) {
    console.error('[IAP-Native] Purchase error:', error);
    
    // Handle specific error codes
    if (error.code === 'E_USER_CANCELLED') {
      return {
        success: false,
        message: 'Purchase cancelled',
      };
    }
    
    if (error.code === 'E_ALREADY_OWNED') {
      return {
        success: false,
        message: 'You already own this subscription. Try restoring your purchases.',
      };
    }
    
    return {
      success: false,
      message: error.message || 'Purchase failed. Please try again.',
      error: error.code,
    };
  }
}

/**
 * Restore previous purchases
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return {
      success: false,
      message: 'Restore purchases is only available on mobile devices.',
    };
  }

  try {
    const RNIap = require('react-native-iap');
    
    console.log('[IAP-Native] Restoring purchases...');
    
    const purchases = await RNIap.getAvailablePurchases();
    
    if (!purchases || purchases.length === 0) {
      return {
        success: false,
        message: 'No previous purchases found to restore.',
      };
    }

    console.log('[IAP-Native] Found purchases to restore:', purchases.length);

    // Find the most recent valid subscription
    let latestPurchase = null;
    for (const purchase of purchases) {
      if (!latestPurchase || purchase.transactionDate > latestPurchase.transactionDate) {
        latestPurchase = purchase;
      }
    }

    if (latestPurchase) {
      // Send to backend for validation
      const verifyEndpoint = Platform.OS === 'ios' 
        ? '/api/iap/apple/verify' 
        : '/api/iap/google/verify';
      
      const receipt = Platform.OS === 'ios' 
        ? latestPurchase.transactionReceipt 
        : latestPurchase.purchaseToken;

      const response = await api.post(verifyEndpoint, {
        receipt,
        productId: latestPurchase.productId,
        transactionId: latestPurchase.transactionId,
        isRestore: true,
      });

      if (response.data.success) {
        return {
          success: true,
          plan: response.data.plan,
          expiryDate: response.data.expires_date,
          message: `Your ${response.data.plan?.toUpperCase()} subscription has been restored!`,
        };
      }
    }

    return {
      success: false,
      message: 'Could not restore a valid subscription. Please contact support.',
    };
  } catch (error: any) {
    console.error('[IAP-Native] Restore error:', error);
    
    // Check if react-native-iap is not available
    if (error.message?.includes('cannot find') || error.message?.includes('not found')) {
      return {
        success: false,
        message: 'Native restore will be available in TestFlight and Play Store builds.',
      };
    }
    
    return {
      success: false,
      message: error.message || 'Failed to restore purchases. Please try again.',
      error: error.code,
    };
  }
}

/**
 * Get IAP status from backend
 */
export async function getIAPStatus(): Promise<any> {
  try {
    const response = await api.get('/api/iap/status');
    return response.data;
  } catch (error) {
    console.error('[IAP-Native] Error fetching status:', error);
    return null;
  }
}

/**
 * Open subscription management
 */
export async function openSubscriptionManagement(): Promise<void> {
  try {
    const { Linking } = require('react-native');
    
    if (Platform.OS === 'ios') {
      await Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      await Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  } catch (error) {
    console.error('[IAP-Native] Error opening subscription management:', error);
    throw error;
  }
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

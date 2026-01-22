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
 * 
 * NOTE: react-native-iap is NOT bundled with the app.
 * IAP functionality requires a native build with the IAP module installed.
 * This service provides stub implementations that will work in Expo Go
 * and full implementations when built with EAS Build including the IAP module.
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
let RNIap: any = null;

/**
 * Check if IAP is available on current platform
 * Available on native iOS/Android only when react-native-iap is installed
 */
export function isIAPAvailable(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && RNIap !== null;
}

/**
 * Try to load react-native-iap module
 * Returns true if loaded successfully, false otherwise
 */
async function tryLoadIAPModule(): Promise<boolean> {
  if (RNIap !== null) {
    return true;
  }
  
  try {
    // Dynamic require to avoid bundling issues
    // This will only work in production builds that include the native module
    RNIap = require('react-native-iap');
    return true;
  } catch (error) {
    console.log('[IAP-Native] react-native-iap not available in this build');
    console.log('[IAP-Native] IAP will be available in production EAS builds');
    return false;
  }
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
 */
export async function initIAP(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    console.log('[IAP-Native] Skipping initialization - not on native platform');
    return false;
  }

  // Try to load the IAP module
  const moduleLoaded = await tryLoadIAPModule();
  if (!moduleLoaded || !RNIap) {
    console.log('[IAP-Native] IAP module not available - using stub implementation');
    return false;
  }

  try {
    console.log('[IAP-Native] Initializing IAP connection...');
    
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
    iapProducts = await RNIap.getSubscriptions({ skus: platformProductIds });
    
    console.log('[IAP-Native] IAP initialized successfully. Products:', iapProducts.length);
    return true;
  } catch (error: any) {
    console.error('[IAP-Native] IAP initialization error:', error);
    return false;
  }
}

/**
 * End IAP connection
 */
export async function endIAP(): Promise<void> {
  if (!isConnected || !RNIap) return;
  
  try {
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
      message: 'In-App Purchases require a production build. Please use the App Store or Play Store version.',
    };
  }

  if (!isConnected || !RNIap) {
    return {
      success: false,
      message: 'IAP connection not established. Please restart the app and try again.',
    };
  }

  try {
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
      message: 'Restore purchases requires a production build. Please use the App Store or Play Store version.',
    };
  }

  if (!RNIap) {
    return {
      success: false,
      message: 'IAP module not available in this build.',
    };
  }

  try {
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

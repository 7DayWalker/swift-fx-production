/**
 * Swift FX In-App Purchase Service
 * 
 * Handles Apple App Store and Google Play subscriptions
 * 
 * IMPORTANT: 
 * - Never unlock features client-side
 * - Always validate purchases through backend
 * - Backend is the source of truth for subscription status
 */

import { Platform } from 'react-native';
import * as RNIap from 'react-native-iap';
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

// IAP Service state
let isInitialized = false;
let productIds: string[] = [];
let products: RNIap.Product[] = [];
let purchaseUpdateSubscription: any = null;
let purchaseErrorSubscription: any = null;

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
 * Call this when app starts or before showing subscription screen
 */
export async function initIAP(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  try {
    // Check if IAP is available on this platform
    if (Platform.OS === 'web') {
      console.log('[IAP] Web platform - IAP not available');
      return false;
    }

    // Initialize connection
    const canMakePayments = await RNIap.initConnection();
    console.log('[IAP] Connection initialized, canMakePayments:', canMakePayments);

    if (!canMakePayments) {
      console.warn('[IAP] Cannot make payments on this device');
      return false;
    }

    // Fetch product IDs from backend
    const productConfig = await fetchProductIds();
    
    // Get product IDs for current platform
    const platformProducts = Platform.OS === 'ios' 
      ? productConfig.ios 
      : productConfig.android;
    
    productIds = Object.values(platformProducts);
    console.log('[IAP] Product IDs:', productIds);

    // Fetch subscription products
    products = await RNIap.getSubscriptions({ skus: productIds });
    console.log('[IAP] Products loaded:', products.length);

    // Set up purchase listeners
    setupPurchaseListeners();

    // Flush any pending purchases (iOS)
    if (Platform.OS === 'ios') {
      await RNIap.flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
    }

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[IAP] Initialization error:', error);
    return false;
  }
}

/**
 * Set up purchase update and error listeners
 */
function setupPurchaseListeners() {
  // Remove existing listeners
  if (purchaseUpdateSubscription) {
    purchaseUpdateSubscription.remove();
  }
  if (purchaseErrorSubscription) {
    purchaseErrorSubscription.remove();
  }

  // Listen for purchase updates
  purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
    console.log('[IAP] Purchase update:', purchase.productId);
    
    // The actual validation will be handled in the purchase flow
    // This listener is mainly for background updates
  });

  // Listen for purchase errors
  purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
    console.error('[IAP] Purchase error:', error);
  });
}

/**
 * End IAP connection
 * Call this when app is closing or user logs out
 */
export async function endIAP(): Promise<void> {
  try {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
    
    await RNIap.endConnection();
    isInitialized = false;
    products = [];
    console.log('[IAP] Connection ended');
  } catch (error) {
    console.error('[IAP] Error ending connection:', error);
  }
}

/**
 * Get available subscription products
 */
export function getProducts(): RNIap.Product[] {
  return products;
}

/**
 * Get product by plan type
 */
export function getProductByPlan(plan: SubscriptionPlan): RNIap.Product | undefined {
  const platformProducts = Platform.OS === 'ios' 
    ? DEFAULT_PRODUCTS.ios 
    : DEFAULT_PRODUCTS.android;
  
  const productId = plan === 'vip' 
    ? platformProducts.vip_monthly 
    : platformProducts.premium_monthly;
  
  return products.find(p => p.productId === productId);
}

/**
 * Request subscription purchase
 * 
 * Flow:
 * 1. Request purchase from Apple/Google
 * 2. Get receipt/token
 * 3. Send to backend for validation
 * 4. Backend updates user subscription
 * 5. Return result
 */
export async function purchaseSubscription(plan: SubscriptionPlan): Promise<PurchaseResult> {
  try {
    if (!isInitialized) {
      const success = await initIAP();
      if (!success) {
        return {
          success: false,
          message: 'In-App Purchases not available on this device',
        };
      }
    }

    // Get product for the plan
    const product = getProductByPlan(plan);
    if (!product) {
      return {
        success: false,
        message: `Product not found for plan: ${plan}`,
      };
    }

    console.log('[IAP] Requesting subscription:', product.productId);

    // Request subscription purchase
    const purchase = await RNIap.requestSubscription({
      sku: product.productId,
      andDangerouslyFinishTransactionAutomaticallyIOS: false, // We'll finish after validation
    });

    console.log('[IAP] Purchase result:', purchase);

    // Validate with backend
    const validationResult = await validatePurchaseWithBackend(purchase);
    
    // Finish transaction if validated (iOS)
    if (validationResult.success && Platform.OS === 'ios') {
      if (Array.isArray(purchase)) {
        for (const p of purchase) {
          await RNIap.finishTransaction({ purchase: p, isConsumable: false });
        }
      } else {
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      }
    }

    return validationResult;
  } catch (error: any) {
    console.error('[IAP] Purchase error:', error);
    
    // Handle user cancellation
    if (error.code === 'E_USER_CANCELLED' || error.message?.includes('cancelled')) {
      return {
        success: false,
        message: 'Purchase cancelled',
      };
    }

    return {
      success: false,
      message: error.message || 'Purchase failed',
      error: error.code,
    };
  }
}

/**
 * Validate purchase with backend
 */
async function validatePurchaseWithBackend(purchase: RNIap.SubscriptionPurchase | RNIap.SubscriptionPurchase[]): Promise<PurchaseResult> {
  try {
    const purchaseData = Array.isArray(purchase) ? purchase[0] : purchase;
    
    if (Platform.OS === 'ios') {
      // iOS: Send receipt data
      const receiptData = purchaseData.transactionReceipt;
      
      if (!receiptData) {
        return {
          success: false,
          message: 'No receipt data available',
        };
      }

      const response = await api.post('/api/iap/apple/verify', {
        receipt_data: receiptData,
        exclude_old_transactions: true,
      });

      return {
        success: response.data.success,
        plan: response.data.plan,
        expiryDate: response.data.expiry_date,
        isTrial: response.data.is_trial,
        autoRenew: response.data.auto_renew,
        message: response.data.message,
      };
    } else {
      // Android: Send purchase token
      const purchaseToken = purchaseData.purchaseToken;
      const productId = purchaseData.productId;

      if (!purchaseToken) {
        return {
          success: false,
          message: 'No purchase token available',
        };
      }

      const response = await api.post('/api/iap/google/verify', {
        purchase_token: purchaseToken,
        product_id: productId,
      });

      return {
        success: response.data.success,
        plan: response.data.plan,
        expiryDate: response.data.expiry_date,
        isTrial: response.data.is_trial,
        autoRenew: response.data.auto_renew,
        message: response.data.message,
      };
    }
  } catch (error: any) {
    console.error('[IAP] Validation error:', error);
    return {
      success: false,
      message: error.response?.data?.detail || 'Failed to validate purchase',
    };
  }
}

/**
 * Restore previous purchases
 * Call this when user taps "Restore Purchases" or after reinstall
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  try {
    if (!isInitialized) {
      const success = await initIAP();
      if (!success) {
        return {
          success: false,
          message: 'In-App Purchases not available on this device',
        };
      }
    }

    console.log('[IAP] Restoring purchases...');

    // Get available purchases
    const purchases = await RNIap.getAvailablePurchases();
    console.log('[IAP] Found purchases:', purchases.length);

    if (purchases.length === 0) {
      return {
        success: false,
        message: 'No previous purchases found',
      };
    }

    // Find the most recent subscription
    const subscription = purchases
      .filter(p => productIds.includes(p.productId))
      .sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0))[0];

    if (!subscription) {
      return {
        success: false,
        message: 'No subscription found to restore',
      };
    }

    // Validate with backend
    return await validatePurchaseWithBackend(subscription);
  } catch (error: any) {
    console.error('[IAP] Restore error:', error);
    return {
      success: false,
      message: error.message || 'Failed to restore purchases',
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
    console.error('[IAP] Error fetching status:', error);
    return null;
  }
}

/**
 * Open subscription management
 * Opens native subscription management screen
 */
export async function openSubscriptionManagement(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      // Open iOS subscription settings
      await RNIap.deepLinkToSubscriptionsIos();
    } else if (Platform.OS === 'android') {
      // Open Google Play subscriptions
      await RNIap.deepLinkToSubscriptionsAndroid({
        sku: productIds[0], // Any product ID will work
      });
    }
  } catch (error) {
    console.error('[IAP] Error opening subscription management:', error);
    // Fallback: Open app store directly
    // You could use Linking.openURL here
  }
}

/**
 * Check if IAP is available on current platform
 */
export function isIAPAvailable(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Format price for display
 */
export function formatProductPrice(product: RNIap.Product): string {
  return product.localizedPrice || `$${product.price}`;
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

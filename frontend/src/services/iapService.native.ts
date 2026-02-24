/**
 * Swift FX In-App Purchase Service - NATIVE (iOS/Android)
 *
 * Production IAP implementation using react-native-iap.
 *
 * RULES:
 * - Backend is the ONLY authority for subscription status.
 * - Content is NEVER unlocked based on local purchase state.
 * - Every purchase/restore goes through backend verification.
 * - Listeners are registered once and cleaned up on endIAP().
 *
 * This file is only resolved on native iOS/Android builds.
 * react-native-iap must be installed via EAS Build (not available in Expo Go).
 */

import { Platform } from 'react-native';
import { api } from './api';

// ── Official product IDs (locked – match App Store Connect / Google Play Console) ──
const SUBSCRIPTION_SKUS = [
  'com.swiftfx.signals.premium.weekly',
  'com.swiftfx.signals.premium.monthly',
  'com.swiftfx.signals.premium.yearly',
  'com.swiftfx.signals.vip.weekly',
  'com.swiftfx.signals.vip.monthly',
  'com.swiftfx.signals.vip.yearly',
] as const;

// ── Public types ──
export type SubscriptionPlan = 'premium' | 'vip';
export type BillingCycle = 'weekly' | 'monthly' | 'yearly';

export interface PurchaseResult {
  success: boolean;
  plan?: string;
  expiryDate?: string;
  isTrial?: boolean;
  autoRenew?: boolean;
  message: string;
  error?: string;
}

// ── Internal state ──
let RNIap: any = null;
let isConnected = false;
let storeProducts: any[] = [];
let purchaseListener: any = null;
let errorListener: any = null;

// ── Module loader ──

function tryLoadIAPModule(): boolean {
  if (RNIap !== null) return true;
  try {
    RNIap = require('react-native-iap');
    return true;
  } catch {
    console.log('[IAP] react-native-iap not available (Expo Go or dev build without native module)');
    return false;
  }
}

// ── Public API ──

export function isIAPAvailable(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && RNIap !== null;
}

/**
 * Initialize IAP: connect to store, fetch products, register listeners.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initIAP(): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (!tryLoadIAPModule() || !RNIap) return false;
  if (isConnected) return true;

  try {
    console.log('[IAP] Connecting to store...');
    await RNIap.initConnection();
    isConnected = true;

    // Android: flush any stale pending purchases so the store dialog isn't blocked.
    if (Platform.OS === 'android') {
      try { await RNIap.flushFailedPurchasesCachedAsPendingAndroid(); } catch { /* ignore */ }
    }

    // Fetch products from store using official SKUs.
    storeProducts = await RNIap.getSubscriptions({ skus: [...SUBSCRIPTION_SKUS] });
    console.log('[IAP] Products loaded:', storeProducts.length);

    // Register listeners ONCE.
    registerListeners();

    return true;
  } catch (err: any) {
    console.error('[IAP] initConnection error:', err.message);
    isConnected = false;
    return false;
  }
}

/**
 * Tear down IAP: remove listeners, end connection.
 */
export async function endIAP(): Promise<void> {
  removeListeners();
  if (!isConnected || !RNIap) return;
  try {
    await RNIap.endConnection();
  } catch { /* ignore */ }
  isConnected = false;
  storeProducts = [];
  console.log('[IAP] Connection ended');
}

/**
 * Return all store products fetched during initIAP().
 */
export function getProducts(): any[] {
  return storeProducts;
}

/**
 * Get a single product by tier + cycle.
 * Returns undefined if product not found in store response.
 */
export function getProductByPlan(plan: SubscriptionPlan, cycle: BillingCycle = 'monthly'): any | undefined {
  const sku = `com.swiftfx.signals.${plan}.${cycle}`;
  return storeProducts.find((p: any) => p.productId === sku);
}

/**
 * Get the SKU string for a given tier + cycle.
 */
export function getSkuForPlan(plan: SubscriptionPlan, cycle: BillingCycle): string {
  return `com.swiftfx.signals.${plan}.${cycle}`;
}

/**
 * Request a subscription purchase.
 *
 * Flow:
 * 1. Call store requestSubscription()
 * 2. On receipt, send to backend /iap/{platform}/verify
 * 3. Backend verifies with Apple/Google
 * 4. Backend updates subscription record
 * 5. Return result — caller refreshes /api/subscription/status
 *
 * Content must NOT be unlocked until backend confirms.
 */
export async function purchaseSubscription(
  plan: SubscriptionPlan,
  cycle: BillingCycle = 'monthly',
): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return { success: false, message: 'In-App Purchases require a production build.' };
  }
  if (!isConnected || !RNIap) {
    return { success: false, message: 'Store connection not established. Restart the app.' };
  }

  const sku = getSkuForPlan(plan, cycle);
  console.log('[IAP] Requesting purchase:', sku);

  try {
    // iOS uses requestSubscription with sku; Android uses offerToken from subscriptionOfferDetails.
    if (Platform.OS === 'ios') {
      await RNIap.requestSubscription({ sku });
    } else {
      // Android: find the product and get the first offer token.
      const product = storeProducts.find((p: any) => p.productId === sku);
      if (!product) {
        return { success: false, message: `Product ${sku} not found in store.` };
      }
      const offerToken = product.subscriptionOfferDetails?.[0]?.offerToken;
      if (!offerToken) {
        return { success: false, message: 'No subscription offer available.' };
      }
      await RNIap.requestSubscription({
        sku,
        subscriptionOffers: [{ sku, offerToken }],
      });
    }

    // NOTE: The actual purchase completion is handled by the purchaseUpdatedListener.
    // We return a "pending" result here. The listener will call verifyWithBackend().
    // The caller should poll /api/subscription/status after a short delay.
    return {
      success: true,
      message: 'Purchase initiated. Verifying with server...',
    };
  } catch (err: any) {
    console.error('[IAP] Purchase error:', err.code, err.message);

    if (err.code === 'E_USER_CANCELLED') {
      return { success: false, message: 'Purchase cancelled.' };
    }
    if (err.code === 'E_ALREADY_OWNED') {
      return { success: false, message: 'You already own this subscription. Try restoring purchases.' };
    }
    if (err.code === 'E_DEFERRED_PAYMENT') {
      return { success: false, message: 'Purchase is pending approval (e.g. Ask to Buy).' };
    }

    return { success: false, message: err.message || 'Purchase failed.', error: err.code };
  }
}

/**
 * Restore purchases (Apple compliance — REQUIRED).
 *
 * Calls getAvailablePurchases(), sends each receipt to backend for re-verification,
 * and returns the highest-tier result.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return { success: false, message: 'Restore requires a production build.' };
  }
  if (!RNIap) {
    return { success: false, message: 'IAP module not available.' };
  }

  try {
    console.log('[IAP] Restoring purchases...');
    const purchases = await RNIap.getAvailablePurchases();

    if (!purchases || purchases.length === 0) {
      return { success: false, message: 'No previous purchases found.' };
    }

    console.log('[IAP] Found purchases to restore:', purchases.length);

    // Verify the most recent purchase with the backend.
    const sorted = [...purchases].sort(
      (a: any, b: any) => (b.transactionDate || 0) - (a.transactionDate || 0),
    );

    for (const purchase of sorted) {
      const result = await verifyWithBackend(purchase);
      if (result.success) {
        // Finish the restored transaction.
        try { await RNIap.finishTransaction({ purchase, isConsumable: false }); } catch { /* ok */ }
        return result;
      }
    }

    return { success: false, message: 'No active subscription found to restore.' };
  } catch (err: any) {
    console.error('[IAP] Restore error:', err.message);
    return { success: false, message: err.message || 'Restore failed.', error: err.code };
  }
}

/**
 * Fetch subscription status from backend (authoritative).
 */
export async function getSubscriptionStatus(): Promise<any> {
  try {
    const response = await api.get('/subscription/status');
    return response.data;
  } catch (err) {
    console.error('[IAP] Error fetching subscription status:', err);
    return null;
  }
}

/**
 * Kept for backward compatibility with existing consumers.
 */
export async function getIAPStatus(): Promise<any> {
  return getSubscriptionStatus();
}

/**
 * Open the platform's subscription management page.
 */
export async function openSubscriptionManagement(): Promise<void> {
  const { Linking } = require('react-native');
  if (Platform.OS === 'ios') {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    await Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}

/**
 * Format a store product price for display.
 * Returns the store's localized price string (e.g. "$9.99").
 */
export function formatProductPrice(product: any): string {
  if (!product) return '';
  return product.localizedPrice || `$${product.price || '0.00'}`;
}

/**
 * Fetch product IDs from backend.
 * Returns the official product list. Kept for API compatibility.
 */
export async function fetchProductIds(): Promise<any> {
  try {
    const response = await api.get('/iap/products');
    return response.data;
  } catch {
    return { products: [...SUBSCRIPTION_SKUS] };
  }
}

// ── Internal helpers ──

/**
 * Verify a purchase with the backend.
 * Builds the correct payload for iOS (receipt_data) vs Android (purchase_token + product_id).
 */
async function verifyWithBackend(purchase: any): Promise<PurchaseResult> {
  try {
    const isIOS = Platform.OS === 'ios';
    const endpoint = isIOS ? '/iap/apple/verify' : '/iap/google/verify';

    const payload = isIOS
      ? {
          receipt_data: purchase.transactionReceipt,
          exclude_old_transactions: true,
        }
      : {
          purchase_token: purchase.purchaseToken,
          product_id: purchase.productId,
        };

    console.log('[IAP] Verifying with backend:', endpoint, 'product:', purchase.productId);
    const response = await api.post(endpoint, payload);
    const data = response.data;

    if (data.success) {
      console.log('[IAP] Backend verified:', data.plan, 'expires:', data.expiry_date);
      return {
        success: true,
        plan: data.plan,
        expiryDate: data.expiry_date,
        isTrial: data.is_trial,
        autoRenew: data.auto_renew,
        message: data.message || `Subscribed to ${(data.plan || '').toUpperCase()}!`,
      };
    }

    return { success: false, message: data.message || 'Verification failed.' };
  } catch (err: any) {
    console.error('[IAP] Backend verification error:', err.message);
    return { success: false, message: 'Server verification failed. Please try again.', error: err.message };
  }
}

/**
 * Register purchase listeners ONCE.
 * purchaseUpdatedListener: fires on successful purchase → verify with backend → finish transaction.
 * purchaseErrorListener: fires on purchase error → log.
 */
function registerListeners(): void {
  if (purchaseListener || !RNIap) return;

  purchaseListener = RNIap.purchaseUpdatedListener(async (purchase: any) => {
    console.log('[IAP] purchaseUpdatedListener fired:', purchase.productId);

    if (!purchase.transactionReceipt && !purchase.purchaseToken) {
      console.warn('[IAP] Purchase has no receipt/token — skipping verification.');
      return;
    }

    const result = await verifyWithBackend(purchase);

    if (result.success) {
      try {
        await RNIap.finishTransaction({ purchase, isConsumable: false });
        console.log('[IAP] Transaction finished:', purchase.productId);
      } catch (finishErr: any) {
        console.error('[IAP] finishTransaction error:', finishErr.message);
      }
    } else {
      console.warn('[IAP] Backend rejected purchase:', result.message);
      // Do NOT finish the transaction if backend rejects — store will retry.
    }
  });

  errorListener = RNIap.purchaseErrorListener((error: any) => {
    console.warn('[IAP] purchaseErrorListener:', error.code, error.message);
  });

  console.log('[IAP] Listeners registered');
}

/**
 * Remove listeners to prevent duplicate events.
 */
function removeListeners(): void {
  if (purchaseListener) {
    purchaseListener.remove();
    purchaseListener = null;
  }
  if (errorListener) {
    errorListener.remove();
    errorListener = null;
  }
}

// ── Default export (backward compatible) ──
export default {
  initIAP,
  endIAP,
  getProducts,
  getProductByPlan,
  getSkuForPlan,
  purchaseSubscription,
  restorePurchases,
  getSubscriptionStatus,
  getIAPStatus,
  openSubscriptionManagement,
  isIAPAvailable,
  formatProductPrice,
  fetchProductIds,
};

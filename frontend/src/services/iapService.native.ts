/**
 * Swift FX In-App Purchase Service - NATIVE (iOS/Android)
 *
 * Production IAP implementation using react-native-iap v14 (Nitro Modules).
 *
 * RULES:
 * - Backend is the ONLY authority for subscription status.
 * - Content is NEVER unlocked based on local purchase state.
 * - Every purchase/restore goes through backend verification.
 * - Listeners are registered once and cleaned up on endIAP().
 *
 * This file is only resolved on native iOS/Android builds.
 * react-native-iap must be installed via EAS Build (not available in Expo Go).
 *
 * v14 API changes (from earlier versions):
 *   getSubscriptions()    → fetchProducts({ skus, type: 'subs' })
 *   requestSubscription() → requestPurchase({ type: 'subs', request: { ... } })
 *   product.productId     → product.id
 *   product.localizedPrice → product.displayPrice
 *   flushFailedPurchasesCachedAsPendingAndroid() → removed
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

// ── Verification callbacks ──
type VerificationCallback = (result: PurchaseResult) => void;
type VerificationFailedCallback = (error: { message: string; code?: string }) => void;

const verificationCallbacks: Set<VerificationCallback> = new Set();
const verificationFailedCallbacks: Set<VerificationFailedCallback> = new Set();

/**
 * Register a callback that fires when a purchase is verified by the backend.
 * Returns an unsubscribe function.
 */
export function onPurchaseVerified(cb: VerificationCallback): () => void {
  verificationCallbacks.add(cb);
  return () => { verificationCallbacks.delete(cb); };
}

/**
 * Register a callback that fires when purchase verification fails.
 * Covers: backend rejection, network errors, missing purchase data.
 * Returns an unsubscribe function.
 */
export function onPurchaseVerificationFailed(cb: VerificationFailedCallback): () => void {
  verificationFailedCallbacks.add(cb);
  return () => { verificationFailedCallbacks.delete(cb); };
}

// ── Module loader ──

function tryLoadIAPModule(): boolean {
  if (RNIap !== null) return true;
  try {
    RNIap = require('react-native-iap');
    console.log('[IAP] Module loaded. Checking v14 API surface...');
    console.log(`[IAP]   initConnection: ${typeof RNIap.initConnection}`);
    console.log(`[IAP]   fetchProducts: ${typeof RNIap.fetchProducts}`);
    console.log(`[IAP]   requestPurchase: ${typeof RNIap.requestPurchase}`);
    console.log(`[IAP]   getAvailablePurchases: ${typeof RNIap.getAvailablePurchases}`);
    console.log(`[IAP]   finishTransaction: ${typeof RNIap.finishTransaction}`);
    return true;
  } catch (err: any) {
    console.error('[IAP] FAILED to load react-native-iap:', err.message);
    console.error('[IAP] Ensure EAS Build includes react-native-iap native module.');
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
    console.log('[IAP] ──────── INIT START ────────');
    console.log(`[IAP] Platform: ${Platform.OS}`);

    console.log('[IAP] Calling initConnection()...');
    const connectionResult = await RNIap.initConnection();
    isConnected = true;
    console.log('[IAP] initConnection() RESOLVED:', JSON.stringify(connectionResult));

    // ── Fetch subscription products via v14 fetchProducts() ──
    const skuList = [...SUBSCRIPTION_SKUS];
    console.log('[IAP] Calling fetchProducts({ skus, type: "subs" }) with', skuList.length, 'SKUs');
    const rawResponse = await RNIap.fetchProducts({ skus: skuList, type: 'subs' });
    console.log('[IAP] fetchProducts() returned', rawResponse?.length ?? 0, 'products');

    storeProducts = rawResponse || [];

    // If batch returned empty on Android, retry one-by-one to isolate propagation issues
    if (storeProducts.length === 0 && Platform.OS === 'android') {
      console.warn('[IAP] Batch returned 0 products. Retrying individually...');
      const fallbackSku = 'com.swiftfx.signals.premium.monthly';
      try {
        const singleResult = await RNIap.fetchProducts({ skus: [fallbackSku], type: 'subs' });
        console.log(`[IAP] Single-SKU retry (${fallbackSku}):`, singleResult.length, 'products');
        if (singleResult.length > 0) {
          const allProducts: any[] = [...singleResult];
          for (const sku of SUBSCRIPTION_SKUS) {
            if (sku === fallbackSku) continue;
            try {
              const res = await RNIap.fetchProducts({ skus: [sku], type: 'subs' });
              if (res.length > 0) allProducts.push(...res);
              else console.warn(`[IAP] SKU not in store: ${sku}`);
            } catch (skuErr: any) {
              console.warn(`[IAP] Failed SKU ${sku}:`, skuErr.message);
            }
          }
          storeProducts = allProducts;
          console.log('[IAP] Individual fetch complete:', storeProducts.length, 'products');
        } else {
          console.error('[IAP] Single-SKU also returned 0. Check Play Console setup.');
        }
      } catch (retryErr: any) {
        console.error('[IAP] Single-SKU retry failed:', retryErr.message);
      }
    }

    if (storeProducts.length > 0) {
      storeProducts.forEach((p: any) => {
        // v14: product.id (not productId), product.displayPrice (not localizedPrice)
        console.log(`[IAP] Product: ${p.id} | price: ${p.displayPrice || p.price} | title: ${p.title || 'N/A'}`);
      });
    } else {
      console.warn('[IAP] No products returned. Expected SKUs:', skuList);
    }

    registerListeners();

    console.log('[IAP] ──────── INIT COMPLETE ────────');
    console.log(`[IAP] connected=${isConnected}, products=${storeProducts.length}`);
    return true;
  } catch (err: any) {
    console.error('[IAP] ──────── INIT FAILED ────────');
    console.error('[IAP] Error:', err.message, '| code:', err.code);
    console.error('[IAP] Full error:', JSON.stringify(err, null, 2));
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
 * v14: products use `id` field (not `productId`).
 */
export function getProductByPlan(plan: SubscriptionPlan, cycle: BillingCycle = 'monthly'): any | undefined {
  const sku = `com.swiftfx.signals.${plan}.${cycle}`;
  return storeProducts.find((p: any) => p.id === sku);
}

/**
 * Get the SKU string for a given tier + cycle.
 */
export function getSkuForPlan(plan: SubscriptionPlan, cycle: BillingCycle): string {
  return `com.swiftfx.signals.${plan}.${cycle}`;
}

/**
 * Request a subscription purchase via v14 requestPurchase().
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
    if (Platform.OS === 'ios') {
      // v14 iOS: requestPurchase with type + apple.sku
      await RNIap.requestPurchase({
        type: 'subs',
        request: {
          apple: { sku },
        },
      });
    } else {
      // v14 Android: find product, extract offerToken, request with google.skus + offerToken
      const product = storeProducts.find((p: any) => p.id === sku);
      if (!product) {
        return { success: false, message: `Product ${sku} not found in store.` };
      }
      const offerToken = selectAndroidOfferToken(product);
      if (!offerToken) {
        return { success: false, message: 'No subscription offer available for this product.' };
      }
      await RNIap.requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [sku],
            offerToken,
          },
        },
      });
    }

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
 * Restore purchases.
 * Retrieves existing purchases from the device, verifies each with backend
 * (highest tier first), and fires onPurchaseVerified on success.
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

    // Sort: VIP first, then most recent
    const tierPriority: Record<string, number> = { vip: 2, premium: 1 };
    const sorted = [...purchases].sort((a: any, b: any) => {
      const aPriority = tierPriority[getTierFromProductId(a.productId)] || 0;
      const bPriority = tierPriority[getTierFromProductId(b.productId)] || 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      return (b.transactionDate || 0) - (a.transactionDate || 0);
    });

    for (const purchase of sorted) {
      const result = await verifyWithBackend(purchase);
      if (result.success) {
        try { await RNIap.finishTransaction({ purchase, isConsumable: false }); } catch { /* ok */ }
        // Fire the same callback so SubscriptionContext refreshes immediately
        verificationCallbacks.forEach((cb) => {
          try { cb(result); } catch { /* consumer error */ }
        });
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
 * v14: uses `displayPrice` (not `localizedPrice`).
 */
export function formatProductPrice(product: any): string {
  if (!product) return '';
  return product.displayPrice || `$${product.price || '0.00'}`;
}

/**
 * Fetch product IDs from backend (backward compatibility).
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

function getTierFromProductId(productId: string | undefined): string {
  if (!productId) return '';
  const pid = productId.toLowerCase();
  if (pid.includes('.vip.') || pid.includes('vip')) return 'vip';
  if (pid.includes('.premium.') || pid.includes('premium')) return 'premium';
  return '';
}

/**
 * Select the best offer token from Android subscriptionOfferDetailsAndroid.
 * v14: offers are in `subscriptionOfferDetailsAndroid` array.
 */
function selectAndroidOfferToken(product: any): string | null {
  const offers = product?.subscriptionOfferDetailsAndroid;
  if (!offers || offers.length === 0) return null;

  if (offers.length === 1) return offers[0].offerToken || null;

  // Prefer the base plan offer (no free trial / zero-price phases)
  const basePlan = offers.find(
    (o: any) =>
      !o.pricingPhases?.pricingPhaseList?.some(
        (p: any) => p.priceAmountMicros === '0' || p.recurrenceMode === 2,
      ),
  );
  if (basePlan?.offerToken) return basePlan.offerToken;

  const withToken = offers.find((o: any) => !!o.offerToken);
  return withToken?.offerToken || null;
}

/**
 * Verify a purchase with the backend.
 * v14 purchase objects use `productId` and `purchaseToken` (unchanged from v12).
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
 */
function registerListeners(): void {
  if (purchaseListener || !RNIap) return;

  purchaseListener = RNIap.purchaseUpdatedListener(async (purchase: any) => {
    console.log('[IAP] purchaseUpdatedListener fired:', purchase.productId);

    if (!purchase.transactionReceipt && !purchase.purchaseToken) {
      console.warn('[IAP] Purchase has no receipt/token — skipping.');
      verificationFailedCallbacks.forEach((cb) => {
        try { cb({ message: 'Purchase data is incomplete. Please try again or contact support.', code: 'MISSING_RECEIPT' }); } catch { /* consumer error */ }
      });
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
      // Notify all registered listeners that verification succeeded
      console.log('[IAP] Notifying', verificationCallbacks.size, 'verification listeners');
      verificationCallbacks.forEach((cb) => {
        try { cb(result); } catch { /* consumer error */ }
      });
    } else {
      console.warn('[IAP] Backend rejected purchase:', result.message);
      verificationFailedCallbacks.forEach((cb) => {
        try { cb({ message: result.message, code: result.error }); } catch { /* consumer error */ }
      });
    }
  });

  errorListener = RNIap.purchaseErrorListener((error: any) => {
    console.warn('[IAP] purchaseErrorListener:', error.code, error.message);
  });

  console.log('[IAP] Listeners registered');
}

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

// ── Default export ──
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

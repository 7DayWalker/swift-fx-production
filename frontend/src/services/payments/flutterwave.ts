/**
 * Flutterwave payment service (Android-only, sideloaded distributions).
 *
 * All Flutterwave logic is isolated to this module. Apple IAP and Google Play
 * Billing flows are NEVER touched here.
 *
 * Backend contract:
 *   POST /payments/flutterwave/initialize  → { checkout_url, tx_ref, amount, currency }
 *   GET  /payments/flutterwave/status      → { status, plan_id, tier, subscription_expiry }
 *
 * Subscription activation is performed exclusively by the backend webhook
 * (POST /payments/flutterwave/webhook) after re-verifying with Flutterwave.
 * The client never grants entitlements on its own.
 */
import { api } from '../api';
import { getDistributionChannel, type DistributionChannel } from '../../utils/distribution';

export type FlutterwavePlanId =
  | 'premium_weekly'
  | 'premium_monthly'
  | 'premium_yearly'
  | 'vip_weekly'
  | 'vip_monthly'
  | 'vip_yearly';

export type FlutterwaveStatus = 'pending' | 'successful' | 'failed' | 'cancelled';

export interface InitializeResponse {
  checkout_url: string;
  tx_ref: string;
  amount: number;
  currency: string;
}

export interface StatusResponse {
  tx_ref: string;
  status: FlutterwaveStatus;
  plan_id?: string;
  tier?: 'premium' | 'vip';
  subscription_expiry?: string | null;
}

export interface CatalogPlan {
  plan_id: FlutterwavePlanId;
  tier: 'premium' | 'vip';
  duration_days: number;
  amount: number;
  product_id: string;
}

export interface CatalogResponse {
  currency: string;
  plans: CatalogPlan[];
}

/**
 * Server-authoritative catalog. The ONLY place to source Flutterwave prices
 * for display. Never compute or hardcode them client-side.
 */
export async function getFlutterwaveCatalog(): Promise<CatalogResponse> {
  const res = await api.get<CatalogResponse>('/payments/flutterwave/catalog');
  return res.data;
}

/**
 * Maps an internal plan + cycle to the Flutterwave plan_id understood by the backend.
 */
export function toFlutterwavePlanId(
  plan: 'premium' | 'vip',
  cycle: 'weekly' | 'monthly' | 'yearly',
): FlutterwavePlanId {
  return `${plan}_${cycle}` as FlutterwavePlanId;
}

/**
 * Kicks off a Flutterwave payment session.
 * Backend creates a pending transaction and returns the hosted checkout URL.
 */
export async function initializeFlutterwavePayment(
  planId: FlutterwavePlanId,
  channel?: DistributionChannel,
): Promise<InitializeResponse> {
  const platform = channel || getDistributionChannel();
  const res = await api.post<InitializeResponse>('/payments/flutterwave/initialize', {
    plan_id: planId,
    platform,
  });
  return res.data;
}

/**
 * Poll this after the in-app WebView returns to learn the verified result.
 * Webhook + server-side verification are the only sources of truth.
 */
export async function getFlutterwaveStatus(txRef: string): Promise<StatusResponse> {
  const res = await api.get<StatusResponse>('/payments/flutterwave/status', {
    params: { tx_ref: txRef },
  });
  return res.data;
}

/** URL prefix used to detect when the WebView lands on our backend redirect page. */
export const FLUTTERWAVE_REDIRECT_PREFIX = '/api/payments/flutterwave/redirect';

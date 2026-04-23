import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';
import { onPurchaseVerified, onPurchaseVerificationFailed, restorePurchases as iapRestore, isIAPAvailable } from '../services/iapService';
import { useAuth } from './AuthContext';

// ── Types ──

export type SubscriptionPlan = 'free' | 'premium' | 'vip';

export interface SubscriptionFeatures {
  signals_access: SubscriptionPlan;
  ai_analyzer: boolean;
  ai_limit: number | 'unlimited';
  ai_used: number;
  ai_remaining: number | 'unlimited';
  ai_limit_reached: boolean;
  fund_management: boolean;
  academy: boolean;
  image_uploads: boolean;
}

export interface SubscriptionStatus {
  user_id: string;
  subscription: SubscriptionPlan;       // Backward compat: maps to capability_tier
  billing_tier: SubscriptionPlan;       // Pure store/IAP tier
  capability_tier: SubscriptionPlan;    // Effective tier for feature gating
  capability_source: 'admin_privilege' | 'subscription';
  subscription_active: boolean;
  subscription_expiry: string | null;
  subscription_platform: string | null;
  subscription_product_id: string | null;
  auto_renew: boolean;
  is_admin: boolean;
  features: SubscriptionFeatures;
}

interface SubscriptionContextType {
  status: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;
  verificationError: string | null;
  refreshStatus: () => Promise<void>;
  clearVerificationError: () => void;
  hasFeature: (feature: keyof SubscriptionFeatures) => boolean;
  canAccessSignal: (visibility: string) => boolean;
  getPlanBadgeColor: () => string;
  getPlanDisplayName: () => string;
  isAdminPrivilege: boolean;
}

// ── Defaults (used only when user is not logged in) ──

const defaultFeatures: SubscriptionFeatures = {
  signals_access: 'free',
  ai_analyzer: true,
  ai_limit: 3,
  ai_used: 0,
  ai_remaining: 3,
  ai_limit_reached: false,
  fund_management: false,
  academy: false,
  image_uploads: false,
};

// ── Context ──

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const clearVerificationError = useCallback(() => {
    setVerificationError(null);
  }, []);

  /**
   * Fetch subscription status from backend.
   * Backend is the ONLY authority — no Supabase queries, no local fallback.
   */
  const fetchStatus = useCallback(async () => {
    if (!token || !user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get('/subscription/status');
      const data = response.data;

      // Map backend fields to context.
      // capability_tier is the effective tier for all feature gating.
      const capabilityTier: SubscriptionPlan = data.capability_tier || data.entitlement || 'free';
      const billingTier: SubscriptionPlan = data.billing_tier || data.entitlement || 'free';
      const capabilitySource = data.capability_source || 'subscription';

      setStatus({
        user_id: data.user_id,
        subscription: capabilityTier,          // Backward compat: uses capability_tier
        billing_tier: billingTier,
        capability_tier: capabilityTier,
        capability_source: capabilitySource,
        subscription_active: data.subscription_active ?? false,
        subscription_expiry: data.subscription_expiry ?? null,
        subscription_platform: data.subscription_platform ?? null,
        subscription_product_id: data.subscription_product_id ?? null,
        auto_renew: data.auto_renew ?? false,
        is_admin: data.is_admin ?? false,
        features: data.features ?? defaultFeatures,
      });
      setError(null);
    } catch (err: any) {
      console.error('[SubscriptionContext] Failed to fetch status:', err.message);
      setError(err.message || 'Failed to fetch subscription status');
      // No local fallback. Status remains null on failure.
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  // Initial fetch + polling every 30s.
  useEffect(() => {
    if (user && token) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 30000);
      return () => clearInterval(interval);
    } else {
      setStatus(null);
      setIsLoading(false);
    }
  }, [user, token, fetchStatus]);

  // Refresh immediately when a purchase is verified by the backend.
  // Show error when verification fails.
  useEffect(() => {
    const unsubVerified = onPurchaseVerified((result) => {
      console.log('[SubscriptionContext] Purchase verified, refreshing status:', result.plan);
      setVerificationError(null);
      fetchStatus();
    });
    const unsubFailed = onPurchaseVerificationFailed((err) => {
      console.warn('[SubscriptionContext] Purchase verification failed:', err.message);
      setVerificationError(err.message);
    });
    return () => {
      unsubVerified();
      unsubFailed();
    };
  }, [fetchStatus]);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  const hasFeature = useCallback(
    (feature: keyof SubscriptionFeatures): boolean => {
      if (!status) return false;
      const value = status.features[feature];
      if (typeof value === 'boolean') return value;
      return true;
    },
    [status],
  );

  const canAccessSignal = useCallback(
    (visibility: string): boolean => {
      if (!status) return visibility === 'free';
      const levels: Record<string, number> = { free: 0, premium: 1, vip: 2 };
      if (status.is_admin) return true;
      return (levels[status.subscription] ?? 0) >= (levels[visibility.toLowerCase()] ?? 0);
    },
    [status],
  );

  const getPlanBadgeColor = useCallback((): string => {
    if (!status) return '#6B7280';
    switch (status.capability_tier) {
      case 'vip': return '#7C3AED';
      case 'premium': return '#D97706';
      default: return '#6B7280';
    }
  }, [status]);

  const getPlanDisplayName = useCallback((): string => {
    if (!status) return 'Free';
    switch (status.capability_tier) {
      case 'vip': return 'VIP';
      case 'premium': return 'Premium';
      default: return 'Free';
    }
  }, [status]);

  const isAdminPrivilege = status?.capability_source === 'admin_privilege';

  return (
    <SubscriptionContext.Provider
      value={{ status, isLoading, error, verificationError, refreshStatus, clearVerificationError, hasFeature, canAccessSignal, getPlanBadgeColor, getPlanDisplayName, isAdminPrivilege }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

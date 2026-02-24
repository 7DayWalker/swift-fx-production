import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';
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
  subscription: SubscriptionPlan;
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
  refreshStatus: () => Promise<void>;
  hasFeature: (feature: keyof SubscriptionFeatures) => boolean;
  canAccessSignal: (visibility: string) => boolean;
  getPlanBadgeColor: () => string;
  getPlanDisplayName: () => string;
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

      // Map backend "entitlement" to context "subscription" for backward compat.
      const entitlement: SubscriptionPlan = data.entitlement || 'free';

      setStatus({
        user_id: data.user_id,
        subscription: entitlement,
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
    switch (status.subscription) {
      case 'vip': return '#7C3AED';
      case 'premium': return '#D97706';
      default: return '#6B7280';
    }
  }, [status]);

  const getPlanDisplayName = useCallback((): string => {
    if (!status) return 'Free';
    switch (status.subscription) {
      case 'vip': return 'VIP';
      case 'premium': return 'Premium';
      default: return 'Free';
    }
  }, [status]);

  return (
    <SubscriptionContext.Provider
      value={{ status, isLoading, error, refreshStatus, hasFeature, canAccessSignal, getPlanBadgeColor, getPlanDisplayName }}
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

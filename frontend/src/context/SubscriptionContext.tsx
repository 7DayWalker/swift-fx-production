import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

// Subscription types
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
  subscription_raw: string;
  subscription_expiry: string | null;
  subscription_active: boolean;
  role: string;
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

// Build feature flags from the effective tier
const buildFeatures = (tier: SubscriptionPlan, isAdmin: boolean): SubscriptionFeatures => {
  if (isAdmin) {
    return {
      signals_access: 'vip',
      ai_analyzer: true,
      ai_limit: 'unlimited',
      ai_used: 0,
      ai_remaining: 'unlimited',
      ai_limit_reached: false,
      fund_management: true,
      academy: true,
      image_uploads: true,
    };
  }
  switch (tier) {
    case 'vip':
      return {
        signals_access: 'vip',
        ai_analyzer: true,
        ai_limit: 'unlimited',
        ai_used: 0,
        ai_remaining: 'unlimited',
        ai_limit_reached: false,
        fund_management: true,
        academy: true,
        image_uploads: true,
      };
    case 'premium':
      return {
        signals_access: 'premium',
        ai_analyzer: true,
        ai_limit: 10,
        ai_used: 0,
        ai_remaining: 10,
        ai_limit_reached: false,
        fund_management: false,
        academy: true,
        image_uploads: true,
      };
    default:
      return {
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
  }
};

const defaultFeatures: SubscriptionFeatures = buildFeatures('free', false);

const defaultStatus: SubscriptionStatus = {
  user_id: '',
  subscription: 'free',
  subscription_raw: 'free',
  subscription_expiry: null,
  subscription_active: true,
  role: 'free',
  is_admin: false,
  features: defaultFeatures,
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription status from Supabase
  const fetchStatus = useCallback(async () => {
    if (!token || !user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, admin_role')
        .eq('id', user.user_id)
        .single();

      const profileRole = profile?.role ?? 'free';
      const isAdmin = profileRole === 'admin';

      // 2. Fetch active subscription (latest)
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*, plans(tier)')
        .eq('user_id', user.user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Derive tier
      let tier: SubscriptionPlan = 'free';
      let subscriptionActive = false;
      let expiryDate: string | null = null;

      if (isAdmin) {
        tier = 'vip';
        subscriptionActive = true;
      } else if (sub?.plans?.tier) {
        tier = sub.plans.tier as SubscriptionPlan;
        subscriptionActive = true;
        expiryDate = sub.current_period_end;
      } else if (['premium', 'vip'].includes(profileRole)) {
        tier = profileRole as SubscriptionPlan;
        subscriptionActive = true;
      }

      const features = buildFeatures(tier, isAdmin);

      setStatus({
        user_id: user.user_id,
        subscription: tier,
        subscription_raw: profileRole,
        subscription_expiry: expiryDate,
        subscription_active: subscriptionActive,
        role: profileRole,
        is_admin: isAdmin,
        features,
      });
      setError(null);
    } catch (err: any) {
      console.error('[Sub] Failed to fetch subscription status:', err);
      setError(err.message || 'Failed to fetch subscription status');
      setStatus({
        ...defaultStatus,
        user_id: user.user_id,
        subscription: (user.role as SubscriptionPlan) || 'free',
        role: user.role || 'free',
        is_admin: user.is_admin || false,
        features: buildFeatures((user.role as SubscriptionPlan) || 'free', user.is_admin || false),
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  // Initial fetch + light polling
  useEffect(() => {
    if (user && token) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 30000); // 30s poll
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
      case 'vip': return '#8B5CF6';
      case 'premium': return '#F59E0B';
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

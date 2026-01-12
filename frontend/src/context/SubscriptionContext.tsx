import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';
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

// Polling interval for real-time sync (~5 seconds as per requirements)
const POLL_INTERVAL = 5000;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription status from backend
  const fetchStatus = useCallback(async () => {
    if (!token || !user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get('/subscription/status');
      setStatus(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch subscription status:', err);
      setError(err.message || 'Failed to fetch subscription status');
      // Set default status on error
      setStatus({
        ...defaultStatus,
        user_id: user.user_id,
        subscription: (user.role as SubscriptionPlan) || 'free',
        role: user.role || 'free',
        is_admin: user.is_admin || false,
      });
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  // Initial fetch and polling setup
  useEffect(() => {
    if (user && token) {
      fetchStatus();

      // Set up polling for real-time sync
      const pollInterval = setInterval(() => {
        fetchStatus();
      }, POLL_INTERVAL);

      return () => clearInterval(pollInterval);
    } else {
      setStatus(null);
      setIsLoading(false);
    }
  }, [user, token, fetchStatus]);

  // Manual refresh function
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  // Check if user has a specific feature
  const hasFeature = useCallback((feature: keyof SubscriptionFeatures): boolean => {
    if (!status) return false;
    const value = status.features[feature];
    if (typeof value === 'boolean') return value;
    return true; // For numeric/string features, return true if they exist
  }, [status]);

  // Check if user can access a signal based on visibility
  const canAccessSignal = useCallback((visibility: string): boolean => {
    if (!status) return visibility === 'free';
    
    const subscriptionLevel: Record<string, number> = {
      'free': 0,
      'premium': 1,
      'vip': 2,
    };
    
    const userLevel = subscriptionLevel[status.subscription] || 0;
    const signalLevel = subscriptionLevel[visibility.toLowerCase()] || 0;
    
    // Admin can access all
    if (status.is_admin) return true;
    
    return userLevel >= signalLevel;
  }, [status]);

  // Get badge color based on plan
  const getPlanBadgeColor = useCallback((): string => {
    if (!status) return '#6B7280'; // Gray
    switch (status.subscription) {
      case 'vip':
        return '#8B5CF6'; // Purple
      case 'premium':
        return '#F59E0B'; // Amber/Gold
      case 'free':
      default:
        return '#6B7280'; // Gray
    }
  }, [status]);

  // Get display name for the plan
  const getPlanDisplayName = useCallback((): string => {
    if (!status) return 'Free';
    switch (status.subscription) {
      case 'vip':
        return 'VIP';
      case 'premium':
        return 'Premium';
      case 'free':
      default:
        return 'Free';
    }
  }, [status]);

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        isLoading,
        error,
        refreshStatus,
        hasFeature,
        canAccessSignal,
        getPlanBadgeColor,
        getPlanDisplayName,
      }}
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

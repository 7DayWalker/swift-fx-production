import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { SubscriptionTier } from '../utils/signalAccess';
import api from '../services/api';

// Signal interface — kept identical to what screens expect
interface Signal {
  signal_id: string;
  pair: string;
  signal_type: 'buy' | 'sell';
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  take_profit?: number;
  tp_hit?: number;
  risk_reward?: number;
  state: 'pending' | 'active' | 'tp1' | 'tp2' | 'tp3' | 'closed';
  is_active: boolean;
  visibility: 'free' | 'premium' | 'vip';
  analysis?: string;
  final_pips?: number;
  result_pips?: number;
  created_at: string;
  activated_at?: string;
  closed_at?: string;
  locked?: boolean;
}

interface SignalStats {
  total_signals: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pips: number;
  average_pips: number;
  best_trade: number;
  worst_trade: number;
}

interface SignalHistoryData {
  stats: SignalStats;
  signals: Signal[];
  access_level: string;
}

interface SignalContextType {
  signals: Signal[];
  activeSignals: Signal[];
  pendingSignals: Signal[];
  closedSignals: Signal[];
  stats: SignalStats | null;
  historyData: SignalHistoryData | null;
  userTier: SubscriptionTier;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refreshSignals: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshAll: () => Promise<void>;
  onSignalCreated: () => void;
  onSignalActivated: () => void;
  onSignalClosed: () => void;
  onSignalDeleted: () => void;
  onSignalUpdated: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

const SignalContext = createContext<SignalContextType | undefined>(undefined);

const POLLING_INTERVAL = 5000;
const BACKGROUND_POLLING_INTERVAL = 30000;

/** Map a backend API response row → app Signal.
 *  Backend already handles tier gating: locked signals have sensitive fields stripped. */
const mapBackendSignal = (row: any): Signal => ({
  signal_id: row.signal_id,
  pair: row.pair,
  signal_type: row.signal_type,
  entry: row.entry != null ? Number(row.entry) : undefined,
  stop_loss: row.stop_loss != null ? Number(row.stop_loss) : undefined,
  tp1: row.tp1 != null ? Number(row.tp1) : undefined,
  tp2: row.tp2 != null ? Number(row.tp2) : undefined,
  tp3: row.tp3 != null ? Number(row.tp3) : undefined,
  take_profit: row.tp1 != null ? Number(row.tp1) : undefined,
  tp_hit: row.tp_hit != null ? Number(row.tp_hit) : undefined,
  risk_reward: row.risk_reward != null ? parseFloat(String(row.risk_reward)) : undefined,
  state: row.state || 'pending',
  is_active: row.is_active ?? true,
  visibility: row.visibility,
  analysis: row.analysis,
  final_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
  result_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
  created_at: row.created_at,
  activated_at: row.activated_at,
  closed_at: row.closed_at,
  locked: row.locked || false,
});

export function SignalProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();

  // Extract user_id once to use as stable dependency
  const userId = user?.user_id;

  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [historyData, setHistoryData] = useState<SignalHistoryData | null>(null);
  const [userTier, setUserTier] = useState<SubscriptionTier>('free');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  // Track if tier has been fetched for current user to prevent duplicate calls
  const tierFetchedForUserRef = useRef<string | null>(null);

  // DEBUG: Track renders
  console.log('[SignalContext] RENDER - userId:', userId, 'userTier:', userTier);

  // Derived lists - "active" = all non-closed signals (pending, active, tp1, tp2, tp3)
  const activeSignals = signals.filter((s) => s.state !== 'closed');
  const pendingSignals = signals.filter((s) => s.state === 'pending');
  const closedSignals = signals.filter((s) => s.state === 'closed');

  // Fetch user's subscription tier - ONLY depends on userId (primitive)
  // Precedence: super_admin → vip, admin → vip, Active VIP sub → vip, Active Premium sub → premium, else → free
  const fetchUserTier = useCallback(async () => {
    console.log('[SignalContext] fetchUserTier called - userId:', userId, 'alreadyFetchedFor:', tierFetchedForUserRef.current);
    
    if (!userId) {
      console.log('[SignalContext] No user ID, defaulting to free');
      setUserTier('free');
      tierFetchedForUserRef.current = null;
      return;
    }

    // Skip if already fetched for this user
    if (tierFetchedForUserRef.current === userId) {
      console.log('[SignalContext] Tier already fetched for this user, skipping');
      return;
    }

    try {
      // STEP 1: Fetch profile to check admin roles FIRST (highest precedence)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.warn('[SignalContext] Profile fetch error:', profileError.message);
      }

      const profileRole = profile?.role;
      console.log('[SignalContext] Profile role:', profileRole);

      // RULE 1 & 2: super_admin or admin → VIP (highest precedence)
      if (profileRole === 'super_admin' || profileRole === 'admin') {
        console.log('[SignalContext] Admin detected, granting VIP access');
        console.log('[SignalContext] FINAL RESOLVED TIER: vip');
        setUserTier('vip');
        tierFetchedForUserRef.current = userId;
        return;
      }

      // STEP 2: Check active subscription from subscriptions table
      const now = new Date().toISOString();
      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('id, status, current_period_end, plans(tier)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (subError) {
        console.warn('[SignalContext] Subscription fetch error:', subError.message);
      }

      console.log('[SignalContext] Raw subscriptions:', subscriptions);

      // Filter active subscriptions: current_period_end IS NULL OR current_period_end > now
      const activeSubscriptions = (subscriptions || []).filter((sub) => {
        if (!sub.current_period_end) return true; // NULL means never expires
        return sub.current_period_end > now;
      });

      console.log('[SignalContext] Active subscriptions after filter:', activeSubscriptions);

      if (activeSubscriptions.length > 0) {
        // Find the highest tier among active subscriptions
        const tierPriority: Record<string, number> = { vip: 2, premium: 1, free: 0 };
        let highestTier: SubscriptionTier = 'free';
        let highestPriority = 0;

        for (const sub of activeSubscriptions) {
          const subTier = ((sub.plans as any)?.tier || 'free').toLowerCase() as SubscriptionTier;
          const priority = tierPriority[subTier] ?? 0;
          if (priority > highestPriority) {
            highestPriority = priority;
            highestTier = subTier;
          }
        }

        console.log('[SignalContext] FINAL RESOLVED TIER:', highestTier);
        setUserTier(highestTier);
        tierFetchedForUserRef.current = userId;
        return;
      }

      // No active subscription found
      console.log('[SignalContext] No active subscription, defaulting to free');
      console.log('[SignalContext] FINAL RESOLVED TIER: free');
      setUserTier('free');
      tierFetchedForUserRef.current = userId;
    } catch (err) {
      console.error('[SignalContext] fetchUserTier error:', err);
      setUserTier('free');
      tierFetchedForUserRef.current = userId;
    }
  }, [userId]); // ONLY depends on userId primitive

  // ---- Data fetching ----
  // Store userTier in ref to avoid dependency in refreshSignals
  const userTierRef = useRef<SubscriptionTier>(userTier);
  userTierRef.current = userTier;

  const refreshSignals = useCallback(async () => {
    if (!token) return;

    try {
      const response = await api.get('/signals');
      const data = response.data;

      // Backend handles tier-based gating: locked signals have sensitive fields stripped
      setSignals((data || []).map(mapBackendSignal));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[Signals] refreshSignals failed:', err);
    }
  }, [token]); // Only depends on token - backend resolves tier from JWT

  const refreshStats = useCallback(async () => {
    if (!token) return;

    try {
      const closed = signals.filter((s) => s.state === 'closed');
      const winning = closed.filter((s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return pips > 0;
      });

      const totalPips = closed.reduce((sum, s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return sum + (isNaN(pips) ? 0 : pips);
      }, 0);

      const pipsArray = closed.map((s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return isNaN(pips) ? 0 : pips;
      });

      const rawWinRate = closed.length > 0 ? (winning.length / closed.length) * 100 : 0;

      setStats({
        total_signals: signals.length,
        winning_trades: winning.length,
        losing_trades: closed.length - winning.length,
        win_rate: Math.round(rawWinRate * 10) / 10,
        total_pips: Math.round(totalPips * 10) / 10,
        average_pips: closed.length > 0 ? Math.round((totalPips / closed.length) * 10) / 10 : 0,
        best_trade: pipsArray.length > 0 ? Math.round(Math.max(...pipsArray) * 10) / 10 : 0,
        worst_trade: pipsArray.length > 0 ? Math.round(Math.min(...pipsArray) * 10) / 10 : 0,
      });
    } catch (err) {
      console.error('[Signals] refreshStats failed:', err);
    }
  }, [token, signals]);

  const refreshHistory = useCallback(async () => {
    // History is now derived from local signals state (same source)
    if (!token || signals.length === 0) return;

    const closed = signals.filter((s) => s.state === 'closed');
    const winning = closed.filter((s) => (s.final_pips ?? 0) > 0);
    const totalPips = closed.reduce((sum, s) => sum + (s.final_pips ?? 0), 0);

    setHistoryData({
      stats: {
        total_signals: signals.length,
        winning_trades: winning.length,
        losing_trades: closed.length - winning.length,
        win_rate: closed.length > 0 ? Math.round((winning.length / closed.length) * 100 * 10) / 10 : 0,
        total_pips: Math.round(totalPips * 10) / 10,
        average_pips: closed.length > 0 ? Math.round((totalPips / closed.length) * 10) / 10 : 0,
        best_trade: 0,
        worst_trade: 0,
      },
      signals: closed,
      access_level: 'full',
    });
  }, [token, signals]);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      await refreshSignals();
    } catch (err) {
      console.error('[Signals] refreshAll failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [token, refreshSignals]);

  // Event handlers
  const onSignalCreated = useCallback(() => refreshAll(), [refreshAll]);
  const onSignalActivated = useCallback(() => refreshAll(), [refreshAll]);
  const onSignalClosed = useCallback(() => refreshAll(), [refreshAll]);
  const onSignalDeleted = useCallback(() => refreshAll(), [refreshAll]);
  const onSignalUpdated = useCallback(() => refreshAll(), [refreshAll]);

  // Polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsPolling(true);

    const poll = () => {
      const interval =
        appStateRef.current === 'active' ? POLLING_INTERVAL : BACKGROUND_POLLING_INTERVAL;
      pollingIntervalRef.current = setTimeout(async () => {
        if (token) await refreshSignals();
        poll();
      }, interval);
    };
    poll();
  }, [token, refreshSignals]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // App state handling (foreground/background)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        refreshAll();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refreshAll]);

  // SINGLE useEffect for userId changes - fetches tier and signals
  // This is the ONLY place that should call fetchUserTier
  useEffect(() => {
    console.log('[SignalContext] useEffect[userId, token] triggered - userId:', userId, 'token:', !!token);
    
    if (token && userId) {
      setIsLoading(true);
      // Reset tier fetched ref when user changes
      tierFetchedForUserRef.current = null;
      
      // Fetch user tier first, then signals
      fetchUserTier().then(() => {
        refreshAll().finally(() => setIsLoading(false));
      });
      startPolling();
    } else if (!token) {
      // Logged out - reset everything
      setSignals([]);
      setStats(null);
      setHistoryData(null);
      setLastUpdated(null);
      setUserTier('free');
      tierFetchedForUserRef.current = null;
      stopPolling();
    }
    return () => stopPolling();
  }, [userId, token]); // ONLY primitive dependencies - no functions

  // Re-fetch signals when userTier changes — backend returns different locked state per tier
  useEffect(() => {
    console.log('[SignalContext] useEffect[userTier] triggered - userTier:', userTier, 'signals.length:', signals.length);
    
    if (signals.length > 0 && token) {
      // Re-fetch from backend so locked/unlocked state and field visibility are correct
      refreshSignals();
    }
  }, [userTier]); // Only depends on userTier - refreshSignals is stable via token

  // Recompute stats whenever signals change - use refs to avoid dependency on callbacks
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  
  useEffect(() => {
    if (signals.length > 0 && token) {
      // Compute stats inline instead of calling callbacks
      const closed = signals.filter((s) => s.state === 'closed');
      const winning = closed.filter((s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return pips > 0;
      });

      const totalPips = closed.reduce((sum, s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return sum + (isNaN(pips) ? 0 : pips);
      }, 0);

      const pipsArray = closed.map((s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return isNaN(pips) ? 0 : pips;
      });

      const rawWinRate = closed.length > 0 ? (winning.length / closed.length) * 100 : 0;

      setStats({
        total_signals: signals.length,
        winning_trades: winning.length,
        losing_trades: closed.length - winning.length,
        win_rate: Math.round(rawWinRate * 10) / 10,
        total_pips: Math.round(totalPips * 10) / 10,
        average_pips: closed.length > 0 ? Math.round((totalPips / closed.length) * 10) / 10 : 0,
        best_trade: pipsArray.length > 0 ? Math.round(Math.max(...pipsArray) * 10) / 10 : 0,
        worst_trade: pipsArray.length > 0 ? Math.round(Math.min(...pipsArray) * 10) / 10 : 0,
      });

      // Update history data
      setHistoryData({
        stats: {
          total_signals: signals.length,
          winning_trades: winning.length,
          losing_trades: closed.length - winning.length,
          win_rate: closed.length > 0 ? Math.round((winning.length / closed.length) * 100 * 10) / 10 : 0,
          total_pips: Math.round(totalPips * 10) / 10,
          average_pips: closed.length > 0 ? Math.round((totalPips / closed.length) * 10) / 10 : 0,
          best_trade: 0,
          worst_trade: 0,
        },
        signals: closed,
        access_level: 'full',
      });
    }
  }, [signals, token]); // Only depends on signals array and token

  return (
    <SignalContext.Provider
      value={{
        signals,
        activeSignals,
        pendingSignals,
        closedSignals,
        stats,
        historyData,
        userTier,
        isLoading,
        isRefreshing,
        lastUpdated,
        refreshSignals,
        refreshStats,
        refreshHistory,
        refreshAll,
        onSignalCreated,
        onSignalActivated,
        onSignalClosed,
        onSignalDeleted,
        onSignalUpdated,
        startPolling,
        stopPolling,
        isPolling,
      }}
    >
      {children}
    </SignalContext.Provider>
  );
}

export function useSignals() {
  const context = useContext(SignalContext);
  if (context === undefined) {
    throw new Error('useSignals must be used within a SignalProvider');
  }
  return context;
}

export function useSignalRefresh() {
  const { refreshAll, lastUpdated, isRefreshing } = useSignals();

  useEffect(() => {
    refreshAll();
  }, []);

  return { refresh: refreshAll, lastUpdated, isRefreshing };
}

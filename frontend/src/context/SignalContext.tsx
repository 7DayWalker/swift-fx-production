import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { canAccessSignal, SubscriptionTier } from '../utils/signalAccess';

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
  status: 'pending' | 'active' | 'closed';
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

/** Map a Supabase row → app Signal */
const mapRow = (row: any): Signal => ({
  signal_id: row.id,
  pair: row.pair,
  signal_type: row.signal_type,
  entry: row.entry_price != null ? Number(row.entry_price) : undefined,
  stop_loss: row.stop_loss != null ? Number(row.stop_loss) : undefined,
  tp1: row.take_profit_1 != null ? Number(row.take_profit_1) : undefined,
  tp2: row.take_profit_2 != null ? Number(row.take_profit_2) : undefined,
  tp3: row.take_profit_3 != null ? Number(row.take_profit_3) : undefined,
  take_profit: row.take_profit_1 != null ? Number(row.take_profit_1) : undefined,
  risk_reward: row.risk_reward != null ? Number(row.risk_reward) : undefined,
  // Map DB state → old 'status' names (tp1/tp2/tp3 → 'active', closed → 'closed')
  status: ['pending'].includes(row.state)
    ? 'pending'
    : row.state === 'closed'
    ? 'closed'
    : 'active',
  visibility: row.visibility,
  analysis: row.analysis,
  final_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
  result_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
  created_at: row.created_at,
  activated_at: row.activated_at,
  closed_at: row.closed_at,
  locked: false,
});

export function SignalProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();

  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [historyData, setHistoryData] = useState<SignalHistoryData | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Derived lists
  const activeSignals = signals.filter((s) => s.status === 'active');
  const pendingSignals = signals.filter((s) => s.status === 'pending');
  const closedSignals = signals.filter((s) => s.status === 'closed');

  // ---- Data fetching ----

  const refreshSignals = useCallback(async () => {
    if (!token) return;

    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Signals] fetch error:', error.message);
        return;
      }

      setSignals((data || []).map(mapRow));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[Signals] refreshSignals failed:', err);
    }
  }, [token]);

  const refreshStats = useCallback(async () => {
    if (!token) return;

    try {
      const closed = signals.filter((s) => s.status === 'closed');
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

    const closed = signals.filter((s) => s.status === 'closed');
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

  // Initial load
  useEffect(() => {
    if (token) {
      setIsLoading(true);
      refreshAll().finally(() => setIsLoading(false));
      startPolling();
    } else {
      setSignals([]);
      setStats(null);
      setHistoryData(null);
      setLastUpdated(null);
      stopPolling();
    }
    return () => stopPolling();
  }, [token]);

  // Recompute stats whenever signals change
  useEffect(() => {
    if (signals.length > 0) {
      refreshStats();
      refreshHistory();
    }
  }, [signals, refreshStats, refreshHistory]);

  return (
    <SignalContext.Provider
      value={{
        signals,
        activeSignals,
        pendingSignals,
        closedSignals,
        stats,
        historyData,
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

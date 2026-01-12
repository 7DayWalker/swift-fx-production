import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

// Signal interface matching backend
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
  // Signal data
  signals: Signal[];
  activeSignals: Signal[];
  pendingSignals: Signal[];
  closedSignals: Signal[];
  
  // Stats
  stats: SignalStats | null;
  historyData: SignalHistoryData | null;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  
  // Actions
  refreshSignals: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // Event triggers - call these after admin actions
  onSignalCreated: () => void;
  onSignalActivated: () => void;
  onSignalClosed: () => void;
  onSignalDeleted: () => void;
  onSignalUpdated: () => void;
  
  // Polling control
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

const SignalContext = createContext<SignalContextType | undefined>(undefined);

// Polling interval in milliseconds
const POLLING_INTERVAL = 5000; // 5 seconds for active trading
const BACKGROUND_POLLING_INTERVAL = 30000; // 30 seconds when in background

export function SignalProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  
  // Signal data state
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [historyData, setHistoryData] = useState<SignalHistoryData | null>(null);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  // Derived signal lists
  const activeSignals = signals.filter(s => s.status === 'active');
  const pendingSignals = signals.filter(s => s.status === 'pending');
  const closedSignals = signals.filter(s => s.status === 'closed');
  
  // Fetch signals from API
  const refreshSignals = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await api.get('/signals');
      setSignals(response.data || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    }
  }, [token]);
  
  // Fetch stats (for dashboard) - PROPERLY ROUNDED
  const refreshStats = useCallback(async () => {
    if (!token) return;
    
    try {
      // Calculate stats from signals
      const closed = signals.filter(s => s.status === 'closed');
      const winning = closed.filter(s => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return pips > 0;
      });
      
      const totalPips = closed.reduce((sum, s) => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return sum + (isNaN(pips) ? 0 : pips);
      }, 0);
      
      const pipsArray = closed.map(s => {
        const pips = s.final_pips ?? s.result_pips ?? 0;
        return isNaN(pips) ? 0 : pips;
      });
      
      // Calculate win rate with proper rounding (1 decimal place)
      const rawWinRate = closed.length > 0 ? (winning.length / closed.length) * 100 : 0;
      const roundedWinRate = Math.round(rawWinRate * 10) / 10; // Round to 1 decimal
      
      // Round all values properly
      const roundedTotalPips = Math.round(totalPips * 10) / 10;
      const roundedAvgPips = closed.length > 0 ? Math.round((totalPips / closed.length) * 10) / 10 : 0;
      
      setStats({
        total_signals: signals.length,
        winning_trades: winning.length,
        losing_trades: closed.length - winning.length,
        win_rate: roundedWinRate,
        total_pips: roundedTotalPips,
        average_pips: roundedAvgPips,
        best_trade: pipsArray.length > 0 ? Math.round(Math.max(...pipsArray) * 10) / 10 : 0,
        worst_trade: pipsArray.length > 0 ? Math.round(Math.min(...pipsArray) * 10) / 10 : 0,
      });
    } catch (error) {
      console.error('Failed to calculate stats:', error);
    }
  }, [token, signals]);
  
  // Fetch history data
  const refreshHistory = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await api.get('/signals/history/stats');
      setHistoryData(response.data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, [token]);
  
  // Refresh all data
  const refreshAll = useCallback(async () => {
    if (!token) return;
    
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshSignals(),
        refreshHistory(),
      ]);
      // Stats depend on signals, so refresh after
      await refreshStats();
    } catch (error) {
      console.error('Failed to refresh all data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [token, refreshSignals, refreshStats, refreshHistory]);
  
  // Event handlers - trigger immediate refresh
  const onSignalCreated = useCallback(() => {
    console.log('[SignalContext] Signal created - refreshing...');
    refreshAll();
  }, [refreshAll]);
  
  const onSignalActivated = useCallback(() => {
    console.log('[SignalContext] Signal activated - refreshing...');
    refreshAll();
  }, [refreshAll]);
  
  const onSignalClosed = useCallback(() => {
    console.log('[SignalContext] Signal closed - refreshing...');
    refreshAll();
  }, [refreshAll]);
  
  const onSignalDeleted = useCallback(() => {
    console.log('[SignalContext] Signal deleted - refreshing...');
    refreshAll();
  }, [refreshAll]);
  
  const onSignalUpdated = useCallback(() => {
    console.log('[SignalContext] Signal updated - refreshing...');
    refreshAll();
  }, [refreshAll]);
  
  // Polling control
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return; // Already polling
    
    console.log('[SignalContext] Starting polling...');
    setIsPolling(true);
    
    const poll = () => {
      const interval = appStateRef.current === 'active' 
        ? POLLING_INTERVAL 
        : BACKGROUND_POLLING_INTERVAL;
      
      pollingIntervalRef.current = setTimeout(async () => {
        if (token) {
          await refreshSignals();
          await refreshStats();
        }
        poll(); // Schedule next poll
      }, interval);
    };
    
    poll();
  }, [token, refreshSignals, refreshStats]);
  
  const stopPolling = useCallback(() => {
    console.log('[SignalContext] Stopping polling...');
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);
  
  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - immediate refresh
        console.log('[SignalContext] App came to foreground - refreshing...');
        refreshAll();
      }
      appStateRef.current = nextAppState;
    });
    
    return () => {
      subscription.remove();
    };
  }, [refreshAll]);
  
  // Initial load and start polling when user is authenticated
  useEffect(() => {
    if (token) {
      setIsLoading(true);
      refreshAll().finally(() => setIsLoading(false));
      startPolling();
    } else {
      // User logged out - clear data and stop polling
      setSignals([]);
      setStats(null);
      setHistoryData(null);
      setLastUpdated(null);
      stopPolling();
    }
    
    return () => {
      stopPolling();
    };
  }, [token]);
  
  // Update stats when signals change
  useEffect(() => {
    if (signals.length > 0) {
      refreshStats();
    }
  }, [signals, refreshStats]);
  
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

// Custom hook for screens that need auto-refresh
export function useSignalRefresh() {
  const { refreshAll, lastUpdated, isRefreshing } = useSignals();
  
  // Refresh on mount
  useEffect(() => {
    refreshAll();
  }, []);
  
  return { refresh: refreshAll, lastUpdated, isRefreshing };
}

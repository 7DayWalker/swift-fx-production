import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import { useSignals } from '../../src/context/SignalContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import { SubscriptionBadge } from '../../src/components/SubscriptionBadge';
import { AdBanner, AD_BANNER_HEIGHT } from '../../src/components/ads';
import { UpgradeBanner, LockedSignalBody } from '../../src/components/UpgradeKit';
import { TAB_BAR_HEIGHT } from './_layout';
import PressableScale from '../../src/components/ui/PressableScale';
import InsightCard from '../../src/components/InsightCard';
import InsightViewer from '../../src/components/InsightViewer';
import { PAIR_CATEGORIES } from '../../src/constants/tradingPairs';

const WATCHLIST_STORAGE_KEY = 'swiftfx_watchlist';

const DEFAULT_WATCHLIST = [
  { pair: 'EUR/USD', category: 'forex' },
  { pair: 'GBP/USD', category: 'forex' },
  { pair: 'XAU/USD', category: 'gold' },
  { pair: 'BTC/USD', category: 'crypto' },
  { pair: 'ETH/USD', category: 'crypto' },
];

const getPairCategoryInfo = (pair: string): { label: string; color: string } => {
  const p = pair.toUpperCase();
  if (p.includes('XAU') || p.includes('XAG') || p.includes('XPT') || p.includes('XPD')) return { label: 'METALS', color: '#FFD700' };
  if (p.includes('BTC') || p.includes('ETH') || p.includes('SOL') || p.includes('BNB') || p.includes('XRP') || p.includes('ADA') || p.includes('DOGE')) return { label: 'CRYPTO', color: '#F7931A' };
  if (['US30', 'US100', 'SPX500', 'GER40', 'UK100', 'JP225', 'HK50'].some(idx => p.includes(idx))) return { label: 'INDEX', color: '#6366F1' };
  return { label: 'FOREX', color: '#00D4AA' };
};

const getTradingViewUrl = (pair: string): string => {
  const symbol = pair.replace('/', '');
  return `https://www.tradingview.com/chart/?symbol=${symbol}`;
};

// ─── Dashboard signal card helpers ──────────────────────────────────────────

const getPairCategory = (pair: string): { label: string; color: string } => getPairCategoryInfo(pair);

const getDashboardAge = (createdAt: string): string => {
  try {
    const date = new Date(createdAt);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${time}`;
    if (isYesterday) return `Yesterday at ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
  } catch {
    return 'recently';
  }
};

const getDashboardState = (state: string): { label: string; color: string } => {
  switch (state) {
    case 'pending': return { label: 'PENDING', color: '#FFD700' };
    case 'active': return { label: 'ACTIVE', color: '#00D4AA' };
    case 'tp1': return { label: 'TP1 HIT', color: '#00D4AA' };
    case 'tp2': return { label: 'TP2 HIT', color: '#00D4AA' };
    case 'tp3': return { label: 'TP3 HIT', color: '#00D4AA' };
    default: return { label: state?.toUpperCase() || '', color: '#8A8D98' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────

// ── Swift Insights horizontal section ──
function SwiftInsightsSection() {
  const { theme } = useTheme();
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const autoScrollPaused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { api } = require('../../src/services/api');
        const res = await api.get('/insights/feed', { params: { limit: 12 } });
        if (res.data && Array.isArray(res.data)) {
          setInsights(res.data);
        }
      } catch {
        // Silent fail
      }
      setLoading(false);
    })();
  }, []);

  // Auto-scroll — pauses on touch, resumes after 6s inactivity
  useEffect(() => {
    if (insights.length < 4) return;
    const interval = setInterval(() => {
      if (autoScrollPaused.current) return;
      scrollX.current += 212;
      const maxScroll = (insights.length - 2) * 212;
      if (scrollX.current >= maxScroll) scrollX.current = 0;
      scrollRef.current?.scrollTo({ x: scrollX.current, animated: true });
    }, 4000);
    return () => clearInterval(interval);
  }, [insights.length]);

  const handleTouchStart = () => {
    autoScrollPaused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { autoScrollPaused.current = false; }, 6000);
  };

  const handleCardPress = (index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  // Loading state
  if (loading) {
    return (
      <View style={[styles.section, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  // Empty state — don't render section
  if (insights.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Swift Insights</Text>
            <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>Quick trading insights while you wait</Text>
          </View>
          <TouchableOpacity onPress={() => handleCardPress(0)}>
            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '600' }}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          onScrollBeginDrag={handleTouchStart}
        >
          {insights.map((item, idx) => (
            <InsightCard
              key={item.id}
              id={item.id}
              title={item.title}
              thumbnail={item.thumbnail}
              category={item.category}
              duration={item.duration}
              is_ad={item.is_ad}
              onPress={() => handleCardPress(idx)}
            />
          ))}
        </ScrollView>
      </View>
      {viewerVisible && (
        <Modal visible animationType="slide" statusBarTranslucent>
          <InsightViewer
            items={insights}
            initialIndex={viewerIndex}
            onClose={() => setViewerVisible(false)}
          />
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  // Admin redirect guard — skipped when admin explicitly chose "View User App"
  // Read params synchronously to avoid race condition between state updates
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (
      user?.is_admin === true &&
      hasRedirected.current === false &&
      params.forceUserView !== 'true'
    ) {
      hasRedirected.current = true;
      router.replace('/(admin)/dashboard');
    }
  }, [user?.is_admin, params.forceUserView]);
  
  // SINGLE SOURCE OF TRUTH: Use SignalContext directly for all real-time data
  const { 
    stats, 
    signals, 
    activeSignals,
    closedSignals,
    isLoading: contextLoading, 
    isRefreshing, 
    refreshAll,
    lastUpdated
  } = useSignals();
  
  // ─── Watchlist state (persisted to AsyncStorage) ────────────
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_STORAGE_KEY).then(stored => {
      if (stored) {
        try { setWatchlist(JSON.parse(stored)); } catch {}
      }
    });
  }, []);

  const saveWatchlist = useCallback((newList: typeof DEFAULT_WATCHLIST) => {
    setWatchlist(newList);
    AsyncStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(newList));
  }, []);

  const addPairToWatchlist = useCallback((pair: string) => {
    if (watchlist.some(w => w.pair === pair)) return;
    const cat = getPairCategoryInfo(pair);
    saveWatchlist([...watchlist, { pair, category: cat.label.toLowerCase() }]);
  }, [watchlist, saveWatchlist]);

  const removePairFromWatchlist = useCallback((pair: string) => {
    Alert.alert('Remove', `Remove ${pair} from watchlist?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveWatchlist(watchlist.filter(w => w.pair !== pair)) },
    ]);
  }, [watchlist, saveWatchlist]);

  const openTradingViewChart = useCallback((pair: string) => {
    const symbol = pair.replace('/', '');
    router.push(`/chart?symbol=${symbol}`);
  }, [router]);

  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8 + AD_BANNER_HEIGHT;
  
  // Use subscription context for plan info (real-time reactive)
  const currentPlan = subscriptionStatus?.capability_tier || subscriptionStatus?.subscription || 'free';
  const isFreeUser = currentPlan === 'free';
  
  type GlobalPerformance = {
    win_rate: number;
    total_pips: number;
    total_signals: number;
  };

  const [globalPerformance, setGlobalPerformance] = useState<GlobalPerformance | null>(null);

  useEffect(() => {
    // SOURCE-OF-TRUTH correction:
    // Dashboard performance cards must use global aggregation, not tier-shaped SignalContext stats.
    const fetchGlobalPerformance = async () => {
      try {
        const { api } = require('../../src/services/api');
        const res = await api.get('/dashboard');
        const perf = res?.data?.performance;
        if (
          perf &&
          typeof perf.win_rate === 'number' &&
          typeof perf.total_pips === 'number' &&
          typeof perf.total_signals === 'number'
        ) {
          setGlobalPerformance({
            win_rate: perf.win_rate,
            total_pips: perf.total_pips,
            total_signals: perf.total_signals,
          });
        }
      } catch (err) {
        console.error('[Dashboard] Failed to fetch global performance (/api/dashboard). Falling back to SignalContext stats.', err);
        // fail-closed: keep null so we fall back below
      }
    };

    // Trigger once per-user
    if (user?.user_id) fetchGlobalPerformance();
  }, [user?.user_id]);

  const fallbackWinRate = stats?.win_rate ?? 0;
  const fallbackTotalPips = stats?.total_pips ?? 0;
  const fallbackTotalSignals = signals.length;
  const closedCount = closedSignals.length;

  const winRate = globalPerformance?.win_rate ?? fallbackWinRate;
  const totalPips = globalPerformance?.total_pips ?? fallbackTotalPips;
  const totalSignals = globalPerformance?.total_signals ?? fallbackTotalSignals;
  
  // Format helpers - pure functions, no state
  const formatWinRate = (rate: number): string => {
    if (isNaN(rate) || !isFinite(rate)) return '0.0';
    return rate.toFixed(1);
  };
  
  const formatPips = (pips: number): string => {
    if (isNaN(pips) || !isFinite(pips)) return '0';
    const rounded = Math.round(pips * 10) / 10;
    return rounded >= 0 ? `+${rounded}` : `${rounded}`;
  };

  const onRefresh = async () => {
    await refreshAll();
  };
  
  // Get recent signals from context (first 5 active signals)
  const recentSignals = activeSignals.slice(0, 5);

  if (contextLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>Welcome back,</Text>
            <Text style={[styles.userName, { color: theme.text }]}>{user?.name || 'Trader'}</Text>
          </View>
          <View style={styles.headerRight}>
            <SubscriptionBadge 
              size="medium" 
              showIcon={true}
              onPress={() => router.push('/subscription')}
            />
          </View>
        </View>

        {/* Upgrade Banner for Free Users */}
        {isFreeUser && (
          <UpgradeBanner onPress={() => router.push('/subscription')} theme={theme} />
        )}

        {/* Performance Stats - REACTIVE from SignalContext */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Performance</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 8, marginHorizontal: 16 }}>Personal stats based on your followed signals</Text>
          <View style={styles.statsContainer}>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{formatWinRate(winRate)}%</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Win Rate</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statValue, { color: totalPips >= 0 ? theme.success : theme.error }]}>
                {formatPips(totalPips)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Pips</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{totalSignals}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Signals</Text>
            </View>
          </View>
        </View>

        {/* Watchlist — clickable pairs, editable */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Watchlist</Text>
            <TouchableOpacity
              onPress={() => setShowWatchlistPicker(true)}
              style={[styles.addPairBtn, { backgroundColor: `${theme.primary}18` }]}
              data-testid="add-pair-btn"
            >
              <Ionicons name="add" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.watchlistScroll}>
            {watchlist.map((item, index) => {
              const cat = getPairCategoryInfo(item.pair);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.watchlistItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => openTradingViewChart(item.pair)}
                  onLongPress={() => removePairFromWatchlist(item.pair)}
                  activeOpacity={0.7}
                  data-testid={`watchlist-${item.pair.replace('/', '-')}`}
                >
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.watchlistPair, { color: theme.text }]}>{item.pair}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.watchlistCategory, { color: cat.color }]}>
                      {cat.label}
                    </Text>
                    <Ionicons name="open-outline" size={11} color={theme.textSecondary} style={{ marginLeft: 4 }} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Swift Insights */}
        <SwiftInsightsSection />

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <View style={styles.quickActionCard}>
              <PressableScale onPress={() => router.push('/calendar')}>
                <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                    <Ionicons name="calendar" size={22} color="#6366F1" />
                  </View>
                  <Text style={[styles.quickActionTitle, { color: theme.text }]}>Calendar</Text>
                  <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Economic Events</Text>
                </View>
              </PressableScale>
            </View>
            
            <View style={styles.quickActionCard}>
              <PressableScale onPress={() => router.push('/academy')}>
                <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.quickActionIcon, { backgroundColor: `${theme.primary}15` }]}>
                    <Ionicons name="school" size={22} color={theme.primary} />
                  </View>
                  <Text style={[styles.quickActionTitle, { color: theme.text }]}>Academy</Text>
                  <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Learn Trading</Text>
                </View>
              </PressableScale>
            </View>
            
            <View style={styles.quickActionCard}>
              <PressableScale onPress={() => router.push('/(tabs)/ai')}>
                <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                    <Ionicons name="analytics" size={22} color="#8B5CF6" />
                  </View>
                  <Text style={[styles.quickActionTitle, { color: theme.text }]}>AI Analyzer</Text>
                  <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Chart Analysis</Text>
                </View>
              </PressableScale>
            </View>
            
            <View style={styles.quickActionCard}>
              <PressableScale onPress={() => router.push('/signal-history')}>
                <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.quickActionIcon, { backgroundColor: `${theme.warning}15` }]}>
                    <Ionicons name="time" size={22} color={theme.warning} />
                  </View>
                  <Text style={[styles.quickActionTitle, { color: theme.text }]}>History</Text>
                  <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Past Signals</Text>
                </View>
              </PressableScale>
            </View>
          </View>
        </View>

        {/* Recent Signals - REACTIVE from SignalContext */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Active Signals</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/signals')}>
              <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {recentSignals.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="trending-up-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No active signals</Text>
            </View>
          ) : (
            recentSignals.slice(0, 3).map((signal, index) => {
              const isBuy = signal.signal_type === 'buy';
              const dirColor = isBuy ? theme.success : theme.error;
              const category = getPairCategory(signal.pair);
              const stateInfo = getDashboardState(signal.state);
              const tp = signal.tp1 || signal.take_profit;

              return (
                <PressableScale
                  key={signal.signal_id || index}
                  style={[styles.signalCard, { backgroundColor: theme.surface, borderColor: `${dirColor}25` }]}
                  onPress={() => router.push('/(tabs)/signals')}
                  data-testid={`signal-card-${index}`}
                >
                  {/* Left accent stripe */}
                  <View style={[styles.signalAccent, { backgroundColor: dirColor }]} />

                  <View style={styles.signalBody}>
                    {/* Row 1: pair + state | direction + category */}
                    <View style={styles.signalHeader}>
                      <View style={styles.signalLeft}>
                        <Text style={[styles.signalPair, { color: theme.text }]}>{signal.pair}</Text>
                        <View style={[styles.signalStateBadge, { backgroundColor: `${stateInfo.color}18` }]}>
                          <View style={[styles.signalStateDot, { backgroundColor: stateInfo.color }]} />
                          <Text style={[styles.signalStateText, { color: stateInfo.color }]}>{stateInfo.label}</Text>
                        </View>
                      </View>
                      <View style={styles.signalRight}>
                        <View style={[styles.signalTypeBadge, { backgroundColor: `${dirColor}20`, borderColor: `${dirColor}40`, borderWidth: 1 }]}>
                          <Ionicons name={isBuy ? 'arrow-up' : 'arrow-down'} size={11} color={dirColor} />
                          <Text style={[styles.signalTypeText, { color: dirColor }]}>{signal.signal_type?.toUpperCase()}</Text>
                        </View>
                        <View style={[styles.categoryChip, { backgroundColor: `${category.color}15` }]}>
                          <Text style={[styles.categoryText, { color: category.color }]}>{category.label}</Text>
                        </View>
                      </View>
                    </View>

                    {signal.locked ? (
                      <LockedSignalBody
                        tier={signal.visibility as 'premium' | 'vip'}
                        onPress={() => router.push('/subscription')}
                        theme={theme}
                      />
                    ) : (
                      <>
                        {/* Row 2: price grid */}
                        <View style={[styles.priceGrid, { backgroundColor: theme.background }]}>
                          <View style={styles.priceCol}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>ENTRY</Text>
                            <Text style={[styles.priceValue, { color: theme.text }]}>{signal.entry}</Text>
                          </View>
                          <View style={[styles.priceCol, styles.priceColBorder, { borderColor: `${theme.border}50` }]}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>TP1</Text>
                            <Text style={[styles.priceValue, { color: theme.success }]}>{tp}</Text>
                          </View>
                          <View style={[styles.priceCol, styles.priceColBorder, { borderColor: `${theme.border}50` }]}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>SL</Text>
                            <Text style={[styles.priceValue, { color: theme.error }]}>{signal.stop_loss}</Text>
                          </View>
                          {signal.risk_reward ? (
                            <View style={[styles.priceCol, styles.priceColBorder, { borderColor: `${theme.border}50` }]}>
                              <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>R:R</Text>
                              <Text style={[styles.priceValue, { color: theme.text }]}>1:{signal.risk_reward}</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Row 3: age + tap hint */}
                        <View style={styles.signalFooter}>
                          <View style={styles.signalAgeRow}>
                            <Ionicons name="time-outline" size={10} color={theme.textSecondary} />
                            <Text style={[styles.signalAge, { color: theme.textSecondary }]}>{getDashboardAge(signal.created_at)}</Text>
                          </View>
                          <View style={styles.tapHint}>
                            <Text style={[styles.tapHintText, { color: theme.primary }]}>View details</Text>
                            <Ionicons name="chevron-forward" size={11} color={theme.primary} />
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* Fixed bottom ad banner — free users only */}
      <AdBanner />

      {/* ─── Watchlist Pair Picker Modal ──────────────────────── */}
      <Modal visible={showWatchlistPicker} animationType="slide" transparent onRequestClose={() => setShowWatchlistPicker(false)}>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: theme.surface }]}>
            <View style={[modalStyles.header, { borderBottomColor: theme.border }]}>
              <Text style={[modalStyles.title, { color: theme.text }]}>Add to Watchlist</Text>
              <TouchableOpacity onPress={() => setShowWatchlistPicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={PAIR_CATEGORIES}
              keyExtractor={(item) => item.name}
              renderItem={({ item: category }) => (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Ionicons name={category.icon as any} size={16} color={theme.textSecondary} />
                    <Text style={[modalStyles.catTitle, { color: theme.textSecondary }]}>{category.name}</Text>
                  </View>
                  <View style={modalStyles.pairGrid}>
                    {category.pairs.map(pair => {
                      const isInWatchlist = watchlist.some(w => w.pair === pair.symbol);
                      const cat = getPairCategoryInfo(pair.symbol);
                      return (
                        <TouchableOpacity
                          key={pair.symbol}
                          style={[
                            modalStyles.pairChip,
                            { backgroundColor: isInWatchlist ? `${cat.color}20` : theme.background, borderColor: isInWatchlist ? cat.color : theme.border },
                          ]}
                          onPress={() => {
                            if (isInWatchlist) {
                              saveWatchlist(watchlist.filter(w => w.pair !== pair.symbol));
                            } else {
                              addPairToWatchlist(pair.symbol);
                            }
                          }}
                          data-testid={`picker-${pair.symbol.replace('/', '-')}`}
                        >
                          {isInWatchlist && <Ionicons name="checkmark-circle" size={14} color={cat.color} style={{ marginRight: 4 }} />}
                          <Text style={[modalStyles.pairChipText, { color: isInWatchlist ? cat.color : theme.text }]}>
                            {pair.symbol}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  roleBadge: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  premiumBadge: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
  },
  vipBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  roleText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  upgradeBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.18)',
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeTextContainer: {
    marginLeft: 12,
  },
  upgradeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeSubtitle: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.7,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: 0.1,
  },
  sectionTitleRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingRight: 4,
    marginBottom: 4,
  },
  addPairBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 6,
    opacity: 0.7,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  watchlistScroll: {
    marginHorizontal: -4,
  },
  watchlistItem: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 5,
    alignItems: 'center',
    minWidth: 96,
    borderWidth: 1,
  },
  categoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginBottom: 8,
    opacity: 0.9,
  },
  watchlistPair: {
    fontSize: 14,
    fontWeight: '700',
  },
  watchlistCategory: {
    fontSize: 9,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
    opacity: 0.65,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  quickActionCard: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  quickActionCardInner: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 11,
    marginTop: 3,
    opacity: 0.6,
    textAlign: 'center',
  },
  // ── Active Signal Card ──────────────────────────────────────────────────────
  signalCard: {
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  signalAccent: {
    width: 4,
    borderRadius: 0,
  },
  signalBody: {
    flex: 1,
    padding: 14,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  signalLeft: { flex: 1 },
  signalRight: { alignItems: 'flex-end', gap: 5 },
  signalPair: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: -0.2,
  },
  signalStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  signalStateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  signalStateText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  signalTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  signalTypeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  priceGrid: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 10,
    marginBottom: 9,
  },
  priceCol: {
    flex: 1,
    alignItems: 'center',
  },
  priceColBorder: {
    borderLeftWidth: 1,
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
    opacity: 0.7,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  signalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalAgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  signalAge: {
    fontSize: 10,
    fontWeight: '500',
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tapHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signalDetailText: {
    fontSize: 12,
  },
  // ────────────────────────────────────────────────────────────────────────────
  lockedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  lockedText: {
    fontSize: 12,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  catTitle: { fontSize: 13, fontWeight: '600', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pairGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pairChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  pairChipText: { fontSize: 13, fontWeight: '600' },
});

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSignals } from '../../src/context/SignalContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import { SubscriptionBadge } from '../../src/components/SubscriptionBadge';
import MockAdBanner from '../../src/components/MockAdBanner';
import { UpgradeBanner, LockedSignalBody } from '../../src/components/UpgradeKit';
import { TAB_BAR_HEIGHT } from './_layout';
import PressableScale from '../../src/components/ui/PressableScale';

// Static data that doesn't need real-time updates
const WATCHLIST = [
  { pair: 'EUR/USD', category: 'forex' },
  { pair: 'GBP/USD', category: 'forex' },
  { pair: 'XAU/USD', category: 'gold' },
  { pair: 'BTC/USD', category: 'crypto' },
  { pair: 'ETH/USD', category: 'crypto' },
];

// ─── Dashboard signal card helpers ──────────────────────────────────────────

const getPairCategory = (pair: string): { label: string; color: string } => {
  const p = pair.toUpperCase();
  if (p.includes('XAU') || p.includes('XAG') || p.includes('GOLD')) return { label: 'GOLD', color: '#FFD700' };
  if (p.includes('BTC') || p.includes('ETH') || p.includes('USDT') || p.includes('SOL')) return { label: 'CRYPTO', color: '#A855F7' };
  return { label: 'FOREX', color: '#00D4AA' };
};

const getDashboardAge = (createdAt: string): string => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

export default function DashboardScreen() {
  const { user } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
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
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;
  
  // Use subscription context for plan info (real-time reactive)
  const currentPlan = subscriptionStatus?.capability_tier || subscriptionStatus?.subscription || 'free';
  const isFreeUser = currentPlan === 'free';
  
  // REACTIVE STATS - Directly computed from SignalContext (no caching, no local state)
  const winRate = stats?.win_rate ?? 0;
  const totalPips = stats?.total_pips ?? 0;
  const totalSignals = signals.length;
  const closedCount = closedSignals.length;
  
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

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'forex': return '#00D4AA';
      case 'gold': return '#FFD700';
      case 'crypto': return '#F7931A';
      default: return '#8A8D98';
    }
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
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Performance</Text>
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

        {/* Watchlist - Static data */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Watchlist</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.watchlistScroll}>
            {WATCHLIST.map((item, index) => (
              <View key={index} style={[styles.watchlistItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category) }]} />
                <Text style={[styles.watchlistPair, { color: theme.text }]}>{item.pair}</Text>
                <Text style={[styles.watchlistCategory, { color: getCategoryColor(item.category) }]}>
                  {item.category.toUpperCase()}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

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

        {/* Show mock ad for free users */}
        {user?.role === 'free' && <MockAdBanner />}
      </ScrollView>
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

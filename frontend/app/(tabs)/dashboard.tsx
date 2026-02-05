import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
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
import { TAB_BAR_HEIGHT } from './_layout';

// Static data that doesn't need real-time updates
const WATCHLIST = [
  { pair: 'EUR/USD', category: 'forex' },
  { pair: 'GBP/USD', category: 'forex' },
  { pair: 'XAU/USD', category: 'gold' },
  { pair: 'BTC/USD', category: 'crypto' },
  { pair: 'ETH/USD', category: 'crypto' },
];

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
  const currentPlan = subscriptionStatus?.subscription || 'free';
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

        {/* Upgrade Banner for Free Users - Routes to canonical /subscription page */}
        {isFreeUser && (
          <TouchableOpacity style={[styles.upgradeBanner, { borderColor: `${theme.warning}30` }]} onPress={() => router.push('/subscription')}>
            <View style={styles.upgradeContent}>
              <Ionicons name="rocket-outline" size={24} color={theme.warning} />
              <View style={styles.upgradeTextContainer}>
                <Text style={[styles.upgradeTitle, { color: theme.warning }]}>Upgrade to Premium</Text>
                <Text style={[styles.upgradeSubtitle, { color: theme.textSecondary }]}>Unlock all signals & AI features</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.warning} />
          </TouchableOpacity>
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
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/calendar')}
            >
              <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Ionicons name="calendar" size={22} color="#6366F1" />
                </View>
                <Text style={[styles.quickActionTitle, { color: theme.text }]}>Calendar</Text>
                <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Economic Events</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/academy')}
            >
              <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.quickActionIcon, { backgroundColor: `${theme.primary}15` }]}>
                  <Ionicons name="school" size={22} color={theme.primary} />
                </View>
                <Text style={[styles.quickActionTitle, { color: theme.text }]}>Academy</Text>
                <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Learn Trading</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/(tabs)/ai')}
            >
              <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.quickActionIcon, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Ionicons name="analytics" size={22} color="#8B5CF6" />
                </View>
                <Text style={[styles.quickActionTitle, { color: theme.text }]}>AI Analyzer</Text>
                <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Chart Analysis</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.quickActionCard}
              onPress={() => router.push('/signal-history')}
            >
              <View style={[styles.quickActionCardInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.quickActionIcon, { backgroundColor: `${theme.warning}15` }]}>
                  <Ionicons name="time" size={22} color={theme.warning} />
                </View>
                <Text style={[styles.quickActionTitle, { color: theme.text }]}>History</Text>
                <Text style={[styles.quickActionSubtitle, { color: theme.textSecondary }]}>Past Signals</Text>
              </View>
            </TouchableOpacity>
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
            recentSignals.slice(0, 3).map((signal, index) => (
              <TouchableOpacity
                key={signal.signal_id || index}
                style={[styles.signalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => router.push(`/(tabs)/signals`)}
              >
                <View style={styles.signalHeader}>
                  <Text style={[styles.signalPair, { color: theme.text }]}>{signal.pair}</Text>
                  <View style={[
                    styles.signalTypeBadge,
                    { backgroundColor: signal.signal_type === 'buy' ? `${theme.success}20` : `${theme.error}20` }
                  ]}>
                    <Text style={[
                      styles.signalTypeText,
                      { color: signal.signal_type === 'buy' ? theme.success : theme.error }
                    ]}>
                      {signal.signal_type?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {signal.locked ? (
                  <View style={styles.lockedContent}>
                    <Ionicons name="lock-closed" size={16} color={theme.warning} />
                    <Text style={[styles.lockedText, { color: theme.warning }]}>Upgrade to unlock</Text>
                  </View>
                ) : (
                  <View style={styles.signalDetails}>
                    <Text style={[styles.signalDetailText, { color: theme.textSecondary }]}>Entry: {signal.entry}</Text>
                    <Text style={[styles.signalDetailText, { color: theme.textSecondary }]}>TP1: {signal.tp1 || signal.take_profit}</Text>
                    <Text style={[styles.signalDetailText, { color: theme.textSecondary }]}>SL: {signal.stop_loss}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
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
    backgroundColor: '#0A0E17',
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
    fontSize: 14,
    color: '#8A8D98',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  upgradeBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeTextContainer: {
    marginLeft: 12,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  upgradeSubtitle: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: '#00D4AA',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  watchlistScroll: {
    marginHorizontal: -4,
  },
  watchlistItem: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  watchlistPair: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  watchlistCategory: {
    fontSize: 10,
    marginTop: 4,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  quickActionCard: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  quickActionCardInner: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: '#8A8D98',
    marginTop: 2,
  },
  signalCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  signalPair: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  signalTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  signalTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signalDetailText: {
    fontSize: 12,
    color: '#8A8D98',
  },
  lockedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  lockedText: {
    fontSize: 12,
    color: '#FFD700',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  emptyText: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 12,
  },
});

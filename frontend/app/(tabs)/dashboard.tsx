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
import { api } from '../../src/services/api';
import MockAdBanner from '../../src/components/MockAdBanner';
import { TAB_BAR_HEIGHT } from './_layout';

interface DashboardData {
  recent_signals: any[];
  performance: {
    win_rate: number;
    total_pips: number;
    total_signals: number;
  };
  watchlist: { pair: string; category: string }[];
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Use centralized signal context for real-time stats
  const { stats, signals, isRefreshing, refreshAll } = useSignals();
  
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Calculate bottom padding for content to avoid tab bar overlap
  // TAB_BAR_HEIGHT (56) + safe area bottom + extra padding
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;
  
  // Helper function to safely format numbers
  const formatNumber = (value: number | undefined | null, decimals: number = 1): string => {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
      return '0';
    }
    return Number(value).toFixed(decimals);
  };
  
  // Get real-time performance stats from context (priority) or fallback to dashboardData
  const getWinRate = (): string => {
    if (stats?.win_rate !== undefined) {
      return formatNumber(stats.win_rate, 1);
    }
    return formatNumber(dashboardData?.performance?.win_rate, 1);
  };
  
  const getTotalPips = (): number => {
    if (stats?.total_pips !== undefined) {
      return Math.round(stats.total_pips * 10) / 10;
    }
    return dashboardData?.performance?.total_pips || 0;
  };
  
  const getTotalSignals = (): number => {
    if (stats?.total_signals !== undefined) {
      return stats.total_signals;
    }
    return dashboardData?.performance?.total_signals || 0;
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await api.get('/dashboard');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    await Promise.all([fetchDashboard(), refreshAll()]);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'forex': return '#00D4AA';
      case 'gold': return '#FFD700';
      case 'crypto': return '#F7931A';
      default: return '#8A8D98';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D4AA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || 'Trader'}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.roleBadge, user?.role === 'vip' && styles.vipBadge, user?.role === 'premium' && styles.premiumBadge]}>
              <Text style={styles.roleText}>{user?.role?.toUpperCase() || 'FREE'}</Text>
            </View>
          </View>
        </View>

        {/* Upgrade Banner for Free Users */}
        {user?.role === 'free' && (
          <TouchableOpacity style={styles.upgradeBanner} onPress={() => router.push('/(tabs)/more')}>
            <View style={styles.upgradeContent}>
              <Ionicons name="rocket-outline" size={24} color="#FFD700" />
              <View style={styles.upgradeTextContainer}>
                <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
                <Text style={styles.upgradeSubtitle}>Unlock all signals & AI features</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFD700" />
          </TouchableOpacity>
        )}

        {/* Performance Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{getWinRate()}%</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: getTotalPips() >= 0 ? '#00D4AA' : '#FF4757' }]}>
                {getTotalPips() >= 0 ? '+' : ''}{getTotalPips()}
              </Text>
              <Text style={styles.statLabel}>Total Pips</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{getTotalSignals()}</Text>
              <Text style={styles.statLabel}>Signals</Text>
            </View>
          </View>
        </View>

        {/* Watchlist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Watchlist</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.watchlistScroll}>
            {dashboardData?.watchlist?.map((item, index) => (
              <View key={index} style={styles.watchlistItem}>
                <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category) }]} />
                <Text style={styles.watchlistPair}>{item.pair}</Text>
                <Text style={[styles.watchlistCategory, { color: getCategoryColor(item.category) }]}>
                  {item.category.toUpperCase()}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Recent Signals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Signals</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/signals')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {dashboardData?.recent_signals?.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trending-up-outline" size={48} color="#8A8D98" />
              <Text style={styles.emptyText}>No signals today yet</Text>
            </View>
          ) : (
            dashboardData?.recent_signals?.slice(0, 3).map((signal, index) => (
              <TouchableOpacity
                key={index}
                style={styles.signalCard}
                onPress={() => router.push(`/(tabs)/signals`)}
              >
                <View style={styles.signalHeader}>
                  <Text style={styles.signalPair}>{signal.pair}</Text>
                  <View style={[
                    styles.signalTypeBadge,
                    { backgroundColor: signal.signal_type === 'buy' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 71, 87, 0.2)' }
                  ]}>
                    <Text style={[
                      styles.signalTypeText,
                      { color: signal.signal_type === 'buy' ? '#00D4AA' : '#FF4757' }
                    ]}>
                      {signal.signal_type?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {signal.locked ? (
                  <View style={styles.lockedContent}>
                    <Ionicons name="lock-closed" size={16} color="#FFD700" />
                    <Text style={styles.lockedText}>Upgrade to unlock</Text>
                  </View>
                ) : (
                  <View style={styles.signalDetails}>
                    <Text style={styles.signalDetailText}>Entry: {signal.entry}</Text>
                    <Text style={styles.signalDetailText}>TP: {signal.take_profit}</Text>
                    <Text style={styles.signalDetailText}>SL: {signal.stop_loss}</Text>
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

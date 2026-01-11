import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useSignals } from '../src/context/SignalContext';
import { api } from '../src/services/api';

interface Signal {
  signal_id: string;
  pair: string;
  signal_type: 'buy' | 'sell';
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tp_hit?: number;
  take_profit?: number; // Legacy
  risk_reward?: number;
  status: string;
  visibility: 'free' | 'premium' | 'vip';
  created_at: string;
  closed_at?: string;
  final_pips?: number;
  result_pips?: number; // Legacy
}

interface Stats {
  total_signals: number;
  winning_signals: number;
  losing_signals: number;
  breakeven_signals: number;
  win_rate: number;
  total_pips: number;
  avg_pips_per_trade: number;
  best_trade_pips: number;
  worst_trade_pips: number;
}

interface HistoryResponse {
  stats: Stats;
  signals: Signal[];
  signals_count: number;
  total_available: number;
  is_limited: boolean;
  upgrade_message?: string;
}

export default function SignalHistoryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await api.get('/signals/history/stats');
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch signal history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderStatCard = (label: string, value: string | number, icon: string, color: string) => (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const getPipsValue = (signal: Signal) => signal.final_pips ?? signal.result_pips ?? 0;

  const renderSignal = ({ item }: { item: Signal }) => {
    const pips = getPipsValue(item);
    const isProfitable = pips > 0;
    const isLoss = pips < 0;
    
    return (
      <View style={styles.signalCard}>
        <View style={styles.signalHeader}>
          <View style={styles.signalLeft}>
            <Text style={styles.signalPair}>{item.pair}</Text>
            <View style={[
              styles.typeBadge,
              { backgroundColor: item.signal_type === 'buy' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 71, 87, 0.2)' }
            ]}>
              <Ionicons
                name={item.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={item.signal_type === 'buy' ? '#00D4AA' : '#FF4757'}
              />
              <Text style={[
                styles.typeText,
                { color: item.signal_type === 'buy' ? '#00D4AA' : '#FF4757' }
              ]}>
                {item.signal_type?.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.signalRight}>
            <View style={[
              styles.resultBadge,
              { backgroundColor: isProfitable ? 'rgba(0, 212, 170, 0.2)' : isLoss ? 'rgba(255, 71, 87, 0.2)' : 'rgba(138, 141, 152, 0.2)' }
            ]}>
              <Text style={[
                styles.resultText,
                { color: isProfitable ? '#00D4AA' : isLoss ? '#FF4757' : '#8A8D98' }
              ]}>
                {isProfitable ? '+' : ''}{pips.toFixed(1)} pips
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.signalDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Entry</Text>
            <Text style={styles.detailValue}>{item.entry}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>SL</Text>
            <Text style={[styles.detailValue, { color: '#FF4757' }]}>{item.stop_loss}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>TP1</Text>
            <Text style={[styles.detailValue, { color: '#00D4AA' }]}>{item.tp1 || item.take_profit}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>R:R</Text>
            <Text style={styles.detailValue}>1:{item.risk_reward}</Text>
          </View>
        </View>
        
        <Text style={styles.signalDate}>
          Closed: {item.closed_at ? formatDate(item.closed_at) : formatDate(item.created_at)}
        </Text>
      </View>
    );
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

  const stats = data?.stats;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signal History</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={data?.signals || []}
        renderItem={renderSignal}
        keyExtractor={(item) => item.signal_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        ListHeaderComponent={
          <>
            {/* Performance Stats */}
            <Text style={styles.sectionTitle}>Performance Overview</Text>
            <View style={styles.statsGrid}>
              {renderStatCard('Win Rate', `${stats?.win_rate || 0}%`, 'trophy-outline', '#FFD700')}
              {renderStatCard('Total Pips', `${(stats?.total_pips || 0) >= 0 ? '+' : ''}${stats?.total_pips || 0}`, 'trending-up-outline', stats?.total_pips && stats.total_pips >= 0 ? '#00D4AA' : '#FF4757')}
              {renderStatCard('Signals', stats?.total_signals || 0, 'analytics-outline', '#00D4AA')}
              {renderStatCard('Avg Pips', `${(stats?.avg_pips_per_trade || 0) >= 0 ? '+' : ''}${stats?.avg_pips_per_trade || 0}`, 'stats-chart-outline', '#8A8D98')}
            </View>

            {/* Win/Loss Breakdown */}
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#00D4AA' }]} />
                  <Text style={styles.breakdownLabel}>Winning</Text>
                  <Text style={[styles.breakdownValue, { color: '#00D4AA' }]}>{stats?.winning_signals || 0}</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#FF4757' }]} />
                  <Text style={styles.breakdownLabel}>Losing</Text>
                  <Text style={[styles.breakdownValue, { color: '#FF4757' }]}>{stats?.losing_signals || 0}</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#8A8D98' }]} />
                  <Text style={styles.breakdownLabel}>Breakeven</Text>
                  <Text style={styles.breakdownValue}>{stats?.breakeven_signals || 0}</Text>
                </View>
              </View>
              
              {/* Progress Bar */}
              <View style={styles.progressBar}>
                {stats && stats.total_signals > 0 && (
                  <>
                    <View style={[styles.progressSegment, { flex: stats.winning_signals, backgroundColor: '#00D4AA' }]} />
                    <View style={[styles.progressSegment, { flex: stats.losing_signals, backgroundColor: '#FF4757' }]} />
                    <View style={[styles.progressSegment, { flex: stats.breakeven_signals, backgroundColor: '#8A8D98' }]} />
                  </>
                )}
              </View>
            </View>

            {/* Best/Worst Trades */}
            <View style={styles.extremesCard}>
              <View style={styles.extremeItem}>
                <Ionicons name="arrow-up-circle" size={24} color="#00D4AA" />
                <Text style={styles.extremeLabel}>Best Trade</Text>
                <Text style={[styles.extremeValue, { color: '#00D4AA' }]}>
                  +{stats?.best_trade_pips || 0} pips
                </Text>
              </View>
              <View style={styles.extremeDivider} />
              <View style={styles.extremeItem}>
                <Ionicons name="arrow-down-circle" size={24} color="#FF4757" />
                <Text style={styles.extremeLabel}>Worst Trade</Text>
                <Text style={[styles.extremeValue, { color: '#FF4757' }]}>
                  {stats?.worst_trade_pips || 0} pips
                </Text>
              </View>
            </View>

            {/* Limited Access Banner */}
            {data?.is_limited && (
              <View style={styles.limitedBanner}>
                <Ionicons name="lock-closed" size={20} color="#FFD700" />
                <View style={styles.limitedTextContainer}>
                  <Text style={styles.limitedTitle}>Limited History</Text>
                  <Text style={styles.limitedText}>
                    Showing {data.signals_count} of {data.total_available} signals. {data.upgrade_message}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.upgradeBtn}
                  onPress={() => router.push('/(tabs)/more')}
                >
                  <Text style={styles.upgradeBtnText}>Upgrade</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Signal History Header */}
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Closed Signals</Text>
              <Text style={styles.signalCount}>
                {data?.signals_count || 0} {data?.is_limited ? `of ${data.total_available}` : 'signals'}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#8A8D98" />
            <Text style={styles.emptyTitle}>No Closed Signals</Text>
            <Text style={styles.emptyText}>Closed signals will appear here with their results</Text>
          </View>
        }
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#8A8D98',
  },
  breakdownCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  progressBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2F3E',
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },
  extremesCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  extremeItem: {
    flex: 1,
    alignItems: 'center',
  },
  extremeDivider: {
    width: 1,
    backgroundColor: '#2A2F3E',
    marginHorizontal: 16,
  },
  extremeLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 8,
    marginBottom: 4,
  },
  extremeValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  limitedTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  limitedTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 2,
  },
  limitedText: {
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  upgradeBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  signalCount: {
    fontSize: 14,
    color: '#8A8D98',
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  signalLeft: {
    flex: 1,
  },
  signalRight: {
    alignItems: 'flex-end',
  },
  signalPair: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  typeText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resultText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0E17',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    color: '#8A8D98',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  signalDate: {
    fontSize: 11,
    color: '#8A8D98',
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 8,
    textAlign: 'center',
  },
});

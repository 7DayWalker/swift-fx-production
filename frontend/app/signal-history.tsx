import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import api from '../src/services/api';

// ─── Types ───────────────────────────────────────────────────────────────────
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
  take_profit?: number;
  risk_reward?: number;
  status: string;
  visibility: 'free' | 'premium' | 'vip';
  created_at: string;
  closed_at?: string;
  final_pips?: number;
  result_pips?: number;
}

interface MonthlyPerf {
  month: string;
  pips: number;
  wins: number;
  losses: number;
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
  winning_streak: number;
  monthly_performance: MonthlyPerf[];
}

interface HistoryResponse {
  stats: Stats;
  signals: Signal[];
  signals_count: number;
  total_available: number;
  is_limited: boolean;
  upgrade_message?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getPipsValue = (s: Signal) => s.final_pips ?? s.result_pips ?? 0;

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const formatDateShort = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Mini Bar Chart ──────────────────────────────────────────────────────────
const MiniBarChart = ({ data, theme }: { data: MonthlyPerf[]; theme: any }) => {
  const maxPips = Math.max(...data.map(d => Math.abs(d.pips)), 1);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, { toValue: 1, duration: 800, useNativeDriver: false }).start();
  }, []);

  if (data.length === 0) {
    return (
      <View style={[st.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[st.chartTitle, { color: theme.text }]}>Monthly Performance</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
          No monthly data yet
        </Text>
      </View>
    );
  }

  return (
    <View style={[st.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="monthly-chart">
      <Text style={[st.chartTitle, { color: theme.text }]}>Monthly Performance</Text>
      <View style={st.chartContainer}>
        {data.map((item, idx) => {
          const isPositive = item.pips >= 0;
          const heightPct = (Math.abs(item.pips) / maxPips) * 100;
          const barHeight = barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.max(heightPct * 0.8, 4)],
          });
          return (
            <View key={idx} style={st.chartBarCol}>
              <Text style={[st.chartPips, { color: isPositive ? theme.success : theme.error }]}>
                {isPositive ? '+' : ''}{item.pips}
              </Text>
              <View style={st.chartBarTrack}>
                <Animated.View
                  style={[
                    st.chartBar,
                    {
                      height: barHeight,
                      backgroundColor: isPositive ? theme.success : theme.error,
                    },
                  ]}
                />
              </View>
              <Text style={[st.chartMonth, { color: theme.textSecondary }]}>{item.month}</Text>
              <Text style={{ fontSize: 9, color: theme.textMuted || '#5A5D68' }}>
                {item.wins}W/{item.losses}L
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ─── Winning Streak Badge ────────────────────────────────────────────────────
const StreakBadge = ({ streak, theme }: { streak: number; theme: any }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (streak >= 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [streak]);

  if (streak < 2) return null;

  const isHot = streak >= 3;
  const color = isHot ? '#FFD700' : theme.success;

  return (
    <Animated.View
      style={[st.streakBadge, { backgroundColor: `${color}15`, borderColor: `${color}30`, transform: [{ scale: pulseAnim }] }]}
      data-testid="winning-streak-badge"
    >
      <Ionicons name={isHot ? 'flame' : 'trophy'} size={20} color={color} />
      <View>
        <Text style={[st.streakCount, { color }]}>{streak} Wins in a Row</Text>
        <Text style={[st.streakLabel, { color: theme.textSecondary }]}>
          {isHot ? 'On Fire!' : 'Keep going!'}
        </Text>
      </View>
    </Animated.View>
  );
};

// ─── Last 5 Trades Quick Summary ─────────────────────────────────────────────
const QuickSummary = ({ signals, theme }: { signals: Signal[]; theme: any }) => {
  const last5 = signals.slice(0, 5);
  if (last5.length === 0) return null;

  return (
    <View style={[st.quickCard, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="last-5-trades">
      <Text style={[st.sectionTitle, { color: theme.text, marginBottom: 12 }]}>Last 5 Trades</Text>
      {last5.map((s, i) => {
        const pips = getPipsValue(s);
        const isWin = pips > 0;
        const isLoss = pips < 0;
        const color = isWin ? theme.success : isLoss ? theme.error : theme.textSecondary;
        return (
          <View
            key={s.signal_id}
            style={[
              st.quickRow,
              i < last5.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
            ]}
          >
            <View style={[st.quickDot, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[st.quickPair, { color: theme.text }]}>{s.pair}</Text>
              <Text style={{ fontSize: 10, color: theme.textSecondary }}>
                {s.signal_type?.toUpperCase()} - {s.closed_at ? formatDateShort(s.closed_at) : formatDateShort(s.created_at)}
              </Text>
            </View>
            <Text style={[st.quickPips, { color }]}>
              {isWin ? '+' : ''}{pips.toFixed(1)} pips
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
export default function SignalHistoryScreen() {
  const { user, token } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => { fetchHistory(); }, [token]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/signals/history/stats');
      setData(res.data);
    } catch (e) {
      console.error('[SignalHistory] Failed to fetch:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchHistory();
    setIsRefreshing(false);
  };

  const stats = data?.stats;

  // ─── Stat Card ─────────────────────────────────────────────────────────
  const renderStatCard = (label: string, value: string | number, icon: string, color: string) => (
    <View style={[st.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[st.statIconWrap, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[st.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[st.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );

  // ─── Signal Card with gradient ─────────────────────────────────────────
  const renderSignal = ({ item }: { item: Signal }) => {
    const pips = getPipsValue(item);
    const isWin = pips > 0;
    const isLoss = pips < 0;
    const accentColor = isWin ? theme.success : isLoss ? theme.error : theme.textSecondary;

    return (
      <View
        style={[
          st.signalCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderLeftWidth: 3,
            borderLeftColor: accentColor,
          },
        ]}
        data-testid={`signal-card-${item.signal_id}`}
      >
        {/* Subtle top gradient overlay */}
        <View
          style={[
            st.signalGradient,
            { backgroundColor: `${accentColor}08` },
          ]}
        />

        <View style={st.signalHeader}>
          <View style={st.signalLeft}>
            <Text style={[st.signalPair, { color: theme.text }]}>{item.pair}</Text>
            <View style={[st.typeBadge, { backgroundColor: `${item.signal_type === 'buy' ? theme.success : theme.error}20` }]}>
              <Ionicons
                name={item.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={item.signal_type === 'buy' ? theme.success : theme.error}
              />
              <Text style={[st.typeText, { color: item.signal_type === 'buy' ? theme.success : theme.error }]}>
                {item.signal_type?.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={st.signalRight}>
            <View style={[st.resultBadge, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30`, borderWidth: 1 }]}>
              <Text style={[st.resultText, { color: accentColor }]}>
                {isWin ? '+' : ''}{pips.toFixed(1)} pips
              </Text>
            </View>
          </View>
        </View>

        <View style={[st.signalDetails, { backgroundColor: theme.background }]}>
          <View style={st.detailRow}>
            <Text style={[st.detailLabel, { color: theme.textSecondary }]}>Entry</Text>
            <Text style={[st.detailValue, { color: theme.text }]}>{item.entry}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={[st.detailLabel, { color: theme.textSecondary }]}>SL</Text>
            <Text style={[st.detailValue, { color: theme.error }]}>{item.stop_loss}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={[st.detailLabel, { color: theme.textSecondary }]}>TP1</Text>
            <Text style={[st.detailValue, { color: theme.success }]}>{item.tp1 || item.take_profit}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={[st.detailLabel, { color: theme.textSecondary }]}>R:R</Text>
            <Text style={[st.detailValue, { color: theme.text }]}>1:{item.risk_reward}</Text>
          </View>
        </View>

        <Text style={[st.signalDate, { color: theme.textMuted || '#8A8D98' }]}>
          Closed: {item.closed_at ? formatDate(item.closed_at) : formatDate(item.created_at)}
        </Text>
      </View>
    );
  };

  // ─── Loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[st.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[st.backButton, { backgroundColor: theme.surface }]} onPress={() => router.back()} data-testid="history-back-button">
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>Signal History</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={data?.signals || []}
        renderItem={renderSignal}
        keyExtractor={(item) => item.signal_id}
        contentContainerStyle={[st.listContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <>
            {/* Winning Streak */}
            <StreakBadge streak={stats?.winning_streak || 0} theme={theme} />

            {/* Performance Stats */}
            <Text style={[st.sectionTitle, { color: theme.text }]}>Performance Overview</Text>
            <View style={st.statsGrid}>
              {renderStatCard('Win Rate', `${stats?.win_rate || 0}%`, 'trophy-outline', theme.warning)}
              {renderStatCard(
                'Total Pips',
                `${(stats?.total_pips || 0) >= 0 ? '+' : ''}${stats?.total_pips || 0}`,
                'trending-up-outline',
                stats?.total_pips && stats.total_pips >= 0 ? theme.success : theme.error
              )}
              {renderStatCard('Signals', stats?.total_signals || 0, 'analytics-outline', theme.primary)}
              {renderStatCard(
                'Avg Pips',
                `${(stats?.avg_pips_per_trade || 0) >= 0 ? '+' : ''}${stats?.avg_pips_per_trade || 0}`,
                'stats-chart-outline',
                (stats?.avg_pips_per_trade || 0) >= 0 ? theme.success : theme.error
              )}
            </View>

            {/* Win/Loss Breakdown */}
            <View style={[st.breakdownCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={st.breakdownRow}>
                <View style={st.breakdownItem}>
                  <View style={[st.breakdownDot, { backgroundColor: theme.success }]} />
                  <Text style={[st.breakdownLabel, { color: theme.textSecondary }]}>Winning</Text>
                  <Text style={[st.breakdownValue, { color: theme.success }]}>{stats?.winning_signals || 0}</Text>
                </View>
                <View style={st.breakdownItem}>
                  <View style={[st.breakdownDot, { backgroundColor: theme.error }]} />
                  <Text style={[st.breakdownLabel, { color: theme.textSecondary }]}>Losing</Text>
                  <Text style={[st.breakdownValue, { color: theme.error }]}>{stats?.losing_signals || 0}</Text>
                </View>
                <View style={st.breakdownItem}>
                  <View style={[st.breakdownDot, { backgroundColor: theme.textSecondary }]} />
                  <Text style={[st.breakdownLabel, { color: theme.textSecondary }]}>Breakeven</Text>
                  <Text style={[st.breakdownValue, { color: theme.text }]}>{stats?.breakeven_signals || 0}</Text>
                </View>
              </View>
              <View style={[st.progressBar, { backgroundColor: theme.background }]}>
                {stats && stats.total_signals > 0 && (
                  <>
                    <View style={[st.progressSegment, { flex: stats.winning_signals || 0.01, backgroundColor: theme.success }]} />
                    <View style={[st.progressSegment, { flex: stats.losing_signals || 0.01, backgroundColor: theme.error }]} />
                    <View style={[st.progressSegment, { flex: stats.breakeven_signals || 0.01, backgroundColor: theme.textSecondary }]} />
                  </>
                )}
              </View>
            </View>

            {/* Best/Worst Trades */}
            <View style={[st.extremesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={st.extremeItem}>
                <Ionicons name="arrow-up-circle" size={24} color={theme.success} />
                <Text style={[st.extremeLabel, { color: theme.textSecondary }]}>Best Trade</Text>
                <Text style={[st.extremeValue, { color: theme.success }]}>
                  +{stats?.best_trade_pips || 0} pips
                </Text>
              </View>
              <View style={[st.extremeDivider, { backgroundColor: theme.border }]} />
              <View style={st.extremeItem}>
                <Ionicons name="arrow-down-circle" size={24} color={theme.error} />
                <Text style={[st.extremeLabel, { color: theme.textSecondary }]}>Worst Trade</Text>
                <Text style={[st.extremeValue, { color: theme.error }]}>
                  {stats?.worst_trade_pips || 0} pips
                </Text>
              </View>
            </View>

            {/* Mini Monthly Chart */}
            <MiniBarChart data={stats?.monthly_performance || []} theme={theme} />

            {/* Last 5 Trades Quick Summary */}
            <QuickSummary signals={data?.signals || []} theme={theme} />

            {/* Limited Access Banner */}
            {data?.is_limited && (
              <View style={st.limitedBanner}>
                <Ionicons name="lock-closed" size={20} color="#FFD700" />
                <View style={st.limitedTextWrap}>
                  <Text style={st.limitedTitle}>Limited History</Text>
                  <Text style={st.limitedText}>
                    Showing {data.signals_count} of {data.total_available} signals. {data.upgrade_message}
                  </Text>
                </View>
                <TouchableOpacity style={st.upgradeBtn} onPress={() => router.push('/subscription')} data-testid="upgrade-history-button">
                  <Text style={st.upgradeBtnText}>Upgrade</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Signal History Header */}
            <View style={st.historyHeader}>
              <Text style={[st.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Closed Signals</Text>
              <Text style={[st.signalCount, { color: theme.textSecondary }]}>
                {data?.signals_count || 0} {data?.is_limited ? `of ${data.total_available}` : 'signals'}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={st.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#8A8D98" />
            <Text style={[st.emptyTitle, { color: theme.text }]}>No Closed Signals</Text>
            <Text style={[st.emptyText, { color: theme.textSecondary }]}>Closed signals will appear here with their results</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  listContent: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  statCard: { width: '48%', borderRadius: 14, padding: 16, marginBottom: 12, alignItems: 'center', borderWidth: 1 },
  statIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 12 },

  // Breakdown
  breakdownCard: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  breakdownItem: { alignItems: 'center' },
  breakdownDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 8 },
  breakdownLabel: { fontSize: 12, marginBottom: 4 },
  breakdownValue: { fontSize: 18, fontWeight: '700' },
  progressBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  progressSegment: { height: '100%' },

  // Extremes
  extremesCard: { flexDirection: 'row', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
  extremeItem: { flex: 1, alignItems: 'center' },
  extremeDivider: { width: 1, marginHorizontal: 16 },
  extremeLabel: { fontSize: 12, marginTop: 8, marginBottom: 4 },
  extremeValue: { fontSize: 18, fontWeight: '700' },

  // Streak badge
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1 },
  streakCount: { fontSize: 16, fontWeight: '800' },
  streakLabel: { fontSize: 11, marginTop: 1 },

  // Mini chart
  chartCard: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
  chartTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 110 },
  chartBarCol: { alignItems: 'center', flex: 1 },
  chartPips: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  chartBarTrack: { width: 24, height: 70, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 4, minHeight: 4 },
  chartMonth: { fontSize: 11, fontWeight: '600', marginTop: 6 },

  // Quick summary
  quickCard: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1 },
  quickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  quickDot: { width: 8, height: 8, borderRadius: 4 },
  quickPair: { fontSize: 14, fontWeight: '700' },
  quickPips: { fontSize: 14, fontWeight: '700' },

  // Limited banner
  limitedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  limitedTextWrap: { flex: 1, marginLeft: 12 },
  limitedTitle: { fontSize: 14, fontWeight: '700', color: '#FFD700', marginBottom: 2 },
  limitedText: { fontSize: 12, color: '#FFFFFF', lineHeight: 18 },
  upgradeBtn: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginLeft: 12 },
  upgradeBtnText: { fontSize: 12, fontWeight: '700', color: '#0A0E17' },

  // History list header
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  signalCount: { fontSize: 14 },

  // Signal card
  signalCard: { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  signalGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 60, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  signalLeft: { flex: 1 },
  signalRight: { alignItems: 'flex-end' },
  signalPair: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  typeText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  resultBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  resultText: { fontSize: 14, fontWeight: '700' },
  signalDetails: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 10, padding: 12, marginBottom: 12 },
  detailRow: { alignItems: 'center' },
  detailLabel: { fontSize: 10, marginBottom: 2 },
  detailValue: { fontSize: 12, fontWeight: '700' },
  signalDate: { fontSize: 11, textAlign: 'right' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
});

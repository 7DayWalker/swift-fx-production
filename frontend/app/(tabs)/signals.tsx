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
import { useAuth } from '../../src/context/AuthContext';
import { useSignals } from '../../src/context/SignalContext';
import { useTheme } from '../../src/context/ThemeContext';
import { getUpgradeMessage } from '../../src/utils/signalAccess';
import MockAdBanner from '../../src/components/MockAdBanner';
import { TAB_BAR_HEIGHT } from './_layout';

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
  take_profit?: number; // Legacy support
  risk_reward?: number;
  state: string;
  is_active?: boolean;
  visibility: 'free' | 'premium' | 'vip';
  created_at: string;
  locked?: boolean;
  final_pips?: number;
  result_pips?: number; // Legacy support
}

export default function SignalsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Use centralized signal state with auto-refresh
  const { 
    signals, 
    isLoading, 
    isRefreshing, 
    refreshSignals, 
    lastUpdated 
  } = useSignals();
  
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'closed'>('all');
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;

  const onRefresh = async () => {
    await refreshSignals();
  };

  const filteredSignals = signals.filter(signal => {
    if (filter === 'all') return true;
    if (filter === 'active') return signal.state !== 'closed' && signal.state !== 'pending';
    return signal.state === filter;
  });

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'pending': return '#FFD700';
      case 'active': case 'tp1': case 'tp2': case 'tp3': return '#00D4AA';
      case 'closed': return '#8A8D98';
      default: return '#8A8D98';
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'pending': return 'PENDING';
      case 'active': return 'ACTIVE';
      case 'tp1': return 'TP1 HIT';
      case 'tp2': return 'TP2 HIT';
      case 'tp3': return 'TP3 HIT';
      case 'closed': return 'CLOSED';
      default: return state?.toUpperCase() || 'UNKNOWN';
    }
  };

  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'vip': return { bg: 'rgba(255, 215, 0, 0.2)', color: '#FFD700', text: 'VIP' };
      case 'premium': return { bg: 'rgba(0, 212, 170, 0.2)', color: '#00D4AA', text: 'PREMIUM' };
      default: return { bg: 'rgba(138, 141, 152, 0.2)', color: '#8A8D98', text: 'FREE' };
    }
  };

  const renderSignal = ({ item }: { item: Signal }) => {
    const badge = getVisibilityBadge(item.visibility);
    
    return (
      <View style={[styles.signalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.signalHeader}>
          <View style={styles.signalLeft}>
            <Text style={[styles.signalPair, { color: theme.text }]}>{item.pair}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.state)}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.state) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.state) }]}>
                {getStateLabel(item.state)}
              </Text>
            </View>
          </View>
          <View style={styles.signalRight}>
            <View style={[
              styles.typeBadge,
              { backgroundColor: item.signal_type === 'buy' ? `${theme.success}20` : `${theme.error}20` }
            ]}>
              <Ionicons
                name={item.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color={item.signal_type === 'buy' ? theme.success : theme.error}
              />
              <Text style={[
                styles.typeText,
                { color: item.signal_type === 'buy' ? theme.success : theme.error }
              ]}>
                {item.signal_type?.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.visibilityBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.visibilityText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          </View>
        </View>

        {item.locked ? (
          <View style={[styles.lockedContainer, { backgroundColor: `${theme.warning}05` }]}>
            <Ionicons name="lock-closed" size={24} color={theme.warning} />
            <Text style={[styles.lockedTitle, { color: theme.warning }]}>
              {getUpgradeMessage(item.visibility)}
            </Text>
            <Text style={[styles.lockedSubtitle, { color: theme.textSecondary }]}>
              This signal requires {item.visibility === 'vip' ? 'VIP' : 'Premium'} subscription
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.signalDetails, { backgroundColor: theme.background }]}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Entry</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{item.entry}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>SL</Text>
                <Text style={[styles.detailValue, { color: theme.error }]}>{item.stop_loss}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>TP1</Text>
                <Text style={[styles.detailValue, { color: (item.tp_hit || 0) >= 1 ? theme.success : theme.textSecondary }]}>
                  {item.tp1 || item.take_profit}{(item.tp_hit || 0) >= 1 ? ' ✓' : ''}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>R:R</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>1:{item.risk_reward}</Text>
              </View>
            </View>
            
            {/* Show TP2 and TP3 if they exist */}
            {(item.tp2 || item.tp3) && (
              <View style={styles.additionalTPs}>
                {item.tp2 && (
                  <View style={[styles.tpTag, { borderColor: theme.border }, (item.tp_hit || 0) >= 2 && { backgroundColor: `${theme.success}20`, borderColor: theme.success }]}>
                    <Text style={[styles.tpTagText, { color: theme.textSecondary }, (item.tp_hit || 0) >= 2 && { color: theme.success }]}>
                      TP2: {item.tp2}{(item.tp_hit || 0) >= 2 ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
                {item.tp3 && (
                  <View style={[styles.tpTag, { borderColor: theme.border }, (item.tp_hit || 0) >= 3 && { backgroundColor: `${theme.success}20`, borderColor: theme.success }]}>
                    <Text style={[styles.tpTagText, { color: theme.textSecondary }, (item.tp_hit || 0) >= 3 && { color: theme.success }]}>
                      TP3: {item.tp3}{(item.tp_hit || 0) >= 3 ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            {item.state === 'closed' && (item.final_pips !== undefined || item.result_pips !== undefined) && (
              <View style={[styles.resultContainer, { borderTopColor: theme.border }]}>
                <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>Result:</Text>
                <Text style={[
                  styles.resultValue,
                  { color: (item.final_pips ?? item.result_pips ?? 0) >= 0 ? theme.success : theme.error }
                ]}>
                  {(item.final_pips ?? item.result_pips ?? 0) >= 0 ? '+' : ''}{item.final_pips ?? item.result_pips} pips
                </Text>
              </View>
            )}
          </>
        )}

        <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
          {new Date(item.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
    );
  };

  // Helper function for themed signal rendering
  const renderSignalWithTheme = (item: Signal, t: typeof theme) => {
    return renderSignal({ item });
  };

  if (isLoading) {
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
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Trading Signals</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Real-time trading opportunities</Text>
          </View>
          <TouchableOpacity 
            style={[styles.historyButton, { borderColor: `${theme.primary}30` }]}
            onPress={() => router.push('/signal-history')}
          >
            <Ionicons name="time-outline" size={18} color={theme.primary} />
            <Text style={[styles.historyButtonText, { color: theme.primary }]}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {['all', 'pending', 'active', 'closed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterTab, 
              { backgroundColor: theme.surface },
              filter === f && { backgroundColor: theme.primary }
            ]}
            onPress={() => setFilter(f as any)}
          >
            <Text style={[
              styles.filterText, 
              { color: theme.textSecondary },
              filter === f && { color: theme.background, fontWeight: 'bold' }
            ]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredSignals}
        renderItem={({ item }) => renderSignalWithTheme(item, theme)}
        keyExtractor={(item) => item.signal_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trending-up-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Signals</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Check back later for new trading signals</Text>
          </View>
        }
        ListFooterComponent={user?.role === 'free' ? <MockAdBanner /> : null}
      />
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
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.7,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.18)',
  },
  historyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#00D4AA',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#0A0E17',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  signalCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
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
    fontWeight: '700',
    marginBottom: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 3,
    letterSpacing: 0.3,
  },
  visibilityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  visibilityText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 12,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    marginBottom: 4,
    fontWeight: '500',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  additionalTPs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  tpTag: {
    backgroundColor: 'rgba(138, 141, 152, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  tpTagHit: {
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    borderColor: '#00D4AA',
  },
  tpTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tpTagTextHit: {
    color: '#00D4AA',
  },
  lockedContainer: {
    alignItems: 'center',
    paddingVertical: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderRadius: 14,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  lockedSubtitle: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  resultContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
  },
  resultLabel: {
    fontSize: 13,
    marginRight: 8,
    opacity: 0.7,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 10,
    textAlign: 'right',
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 8,
    opacity: 0.7,
  },
});

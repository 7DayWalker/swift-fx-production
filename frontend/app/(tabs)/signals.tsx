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
  status: 'pending' | 'active' | 'closed';
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
    return signal.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFD700';
      case 'active': return '#00D4AA';
      case 'closed': return '#8A8D98';
      default: return '#8A8D98';
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
      <View style={styles.signalCard}>
        <View style={styles.signalHeader}>
          <View style={styles.signalLeft}>
            <Text style={styles.signalPair}>{item.pair}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {item.status?.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.signalRight}>
            <View style={[
              styles.typeBadge,
              { backgroundColor: item.signal_type === 'buy' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 71, 87, 0.2)' }
            ]}>
              <Ionicons
                name={item.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'}
                size={16}
                color={item.signal_type === 'buy' ? '#00D4AA' : '#FF4757'}
              />
              <Text style={[
                styles.typeText,
                { color: item.signal_type === 'buy' ? '#00D4AA' : '#FF4757' }
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
          <View style={styles.lockedContainer}>
            <Ionicons name="lock-closed" size={24} color="#FFD700" />
            <Text style={styles.lockedTitle}>Upgrade to Unlock</Text>
            <Text style={styles.lockedSubtitle}>
              This signal requires {item.visibility === 'vip' ? 'VIP' : 'Premium'} subscription
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.signalDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Entry</Text>
                <Text style={styles.detailValue}>{item.entry}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>SL</Text>
                <Text style={[styles.detailValue, { color: '#FF4757' }]}>{item.stop_loss}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>TP1</Text>
                <Text style={[styles.detailValue, { color: (item.tp_hit || 0) >= 1 ? '#00D4AA' : '#8A8D98' }]}>
                  {item.tp1 || item.take_profit}{(item.tp_hit || 0) >= 1 ? ' ✓' : ''}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>R:R</Text>
                <Text style={styles.detailValue}>1:{item.risk_reward}</Text>
              </View>
            </View>
            
            {/* Show TP2 and TP3 if they exist */}
            {(item.tp2 || item.tp3) && (
              <View style={styles.additionalTPs}>
                {item.tp2 && (
                  <View style={[styles.tpTag, (item.tp_hit || 0) >= 2 && styles.tpTagHit]}>
                    <Text style={[styles.tpTagText, (item.tp_hit || 0) >= 2 && styles.tpTagTextHit]}>
                      TP2: {item.tp2}{(item.tp_hit || 0) >= 2 ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
                {item.tp3 && (
                  <View style={[styles.tpTag, (item.tp_hit || 0) >= 3 && styles.tpTagHit]}>
                    <Text style={[styles.tpTagText, (item.tp_hit || 0) >= 3 && styles.tpTagTextHit]}>
                      TP3: {item.tp3}{(item.tp_hit || 0) >= 3 ? ' ✓' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            {item.status === 'closed' && (item.final_pips !== undefined || item.result_pips !== undefined) && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultLabel}>Result:</Text>
                <Text style={[
                  styles.resultValue,
                  { color: (item.final_pips ?? item.result_pips ?? 0) >= 0 ? '#00D4AA' : '#FF4757' }
                ]}>
                  {(item.final_pips ?? item.result_pips ?? 0) >= 0 ? '+' : ''}{item.final_pips ?? item.result_pips} pips
                </Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.timestamp}>
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
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Trading Signals</Text>
            <Text style={styles.subtitle}>Real-time trading opportunities</Text>
          </View>
          <TouchableOpacity 
            style={styles.historyButton}
            onPress={() => router.push('/signal-history')}
          >
            <Ionicons name="time-outline" size={18} color="#00D4AA" />
            <Text style={styles.historyButtonText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {['all', 'pending', 'active', 'closed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f as any)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredSignals}
        renderItem={renderSignal}
        keyExtractor={(item) => item.signal_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trending-up-outline" size={64} color="#8A8D98" />
            <Text style={styles.emptyTitle}>No Signals</Text>
            <Text style={styles.emptyText}>Check back later for new trading signals</Text>
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
    backgroundColor: '#0A0E17',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 4,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.3)',
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00D4AA',
    marginLeft: 6,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#1A1F2E',
  },
  filterTabActive: {
    backgroundColor: '#00D4AA',
  },
  filterText: {
    fontSize: 14,
    color: '#8A8D98',
  },
  filterTextActive: {
    color: '#0A0E17',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
  },
  signalCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  signalLeft: {
    flex: 1,
  },
  signalRight: {
    alignItems: 'flex-end',
  },
  signalPair: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  typeText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  visibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  visibilityText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 12,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: '#8A8D98',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  additionalTPs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  tpTag: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  tpTagHit: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    borderColor: '#00D4AA',
  },
  tpTagText: {
    fontSize: 12,
    color: '#8A8D98',
    fontWeight: '600',
  },
  tpTagTextHit: {
    color: '#00D4AA',
  },
  lockedContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 12,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 12,
  },
  lockedSubtitle: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  resultContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
  },
  resultLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginRight: 8,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 11,
    color: '#8A8D98',
    marginTop: 12,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  },
});

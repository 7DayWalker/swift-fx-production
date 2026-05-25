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
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSignals } from '../../src/context/SignalContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { AdBanner, useInterstitialAd, AD_BANNER_HEIGHT } from '../../src/components/ads';
import { LockedSignalBody } from '../../src/components/UpgradeKit';
import api from '../../src/services/api';
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
  take_profit?: number;
  risk_reward?: number;
  state: string;
  is_active?: boolean;
  visibility: 'free' | 'premium' | 'vip';
  created_at: string;
  locked?: boolean;
  final_pips?: number;
  result_pips?: number;
  tp_messages?: Array<{ message: string; level: number; timestamp: string }>;
}

// ─── Signal card helpers ─────────────────────────────────────────────────────

const getSignalAge = (createdAt: string): string => {
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
    return 'Recently posted';
  }
};

const calcConfidence = (rr?: number, entry?: number, sl?: number, tp1?: number): number => {
  let ratio = rr;
  if (!ratio && entry && sl && tp1) {
    const slDist = Math.abs(entry - sl);
    if (slDist > 0) ratio = Math.abs(tp1 - entry) / slDist;
  }
  if (!ratio) return 62;
  return Math.min(95, Math.max(48, Math.round(48 + (ratio * 14))));
};

const calcProjectedPips = (pair: string, entry?: number, tp?: number): number => {
  if (!entry || !tp) return 0;
  const diff = Math.abs(tp - entry);
  const p = pair.toUpperCase();
  if (p.includes('JPY')) return Math.round(diff * 100);
  if (p.includes('XAU') || p.includes('GOLD')) return Math.round(diff * 10);
  if (p.includes('XAG') || p.includes('SILVER')) return Math.round(diff * 100);
  if (p.includes('BTC') || p.includes('ETH') || p.includes('USDT')) return Math.round(diff);
  return Math.round(diff * 10000);
};

const getEntryValidity = (state: string): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } | null => {
  if (state === 'pending') return { label: 'Entry Active', color: '#FFD700', icon: 'radio-button-on' };
  if (['active', 'tp1', 'tp2', 'tp3'].includes(state)) return { label: 'Trade Running', color: '#00D4AA', icon: 'trending-up' };
  return null;
};

// ─── SignalCard component (needs its own Animated.Value) ─────────────────────

interface CardProps { item: Signal; theme: any; canJournal: boolean; hasJournalAccess: boolean }

const SignalCard = ({ item, theme, canJournal, hasJournalAccess }: CardProps) => {
  const router = useRouter();
  const glowAnim = useRef(new Animated.Value(0)).current;
  const isActive = ['active', 'tp1', 'tp2', 'tp3'].includes(item.state);

  useEffect(() => {
    if (isActive && !item.locked) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.15, duration: 1800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    return undefined;
  }, [isActive, item.locked]);

  const badge = (() => {
    switch (item.visibility) {
      case 'vip': return { bg: 'rgba(255,215,0,0.2)', color: '#FFD700', text: 'VIP' };
      case 'premium': return { bg: 'rgba(0,212,170,0.2)', color: '#00D4AA', text: 'PREMIUM' };
      default: return { bg: 'rgba(138,141,152,0.2)', color: '#8A8D98', text: 'FREE' };
    }
  })();

  const stateColor = (() => {
    switch (item.state) {
      case 'pending': return '#FFD700';
      case 'active': case 'tp1': case 'tp2': case 'tp3': return '#00D4AA';
      default: return '#8A8D98';
    }
  })();

  const stateLabel = (() => {
    switch (item.state) {
      case 'pending': return 'PENDING';
      case 'active': return 'ACTIVE';
      case 'tp1': return 'TP1 HIT';
      case 'tp2': return 'TP2 HIT';
      case 'tp3': return 'TP3 HIT';
      case 'closed': return 'CLOSED';
      default: return item.state?.toUpperCase() || 'UNKNOWN';
    }
  })();

  const confidence = calcConfidence(item.risk_reward, item.entry, item.stop_loss, item.tp1);
  const bestTp = item.tp3 || item.tp2 || item.tp1 || item.take_profit;
  const projectedPips = calcProjectedPips(item.pair, item.entry, bestTp);
  const signalAge = getSignalAge(item.created_at);
  const validity = getEntryValidity(item.state);

  const [isAddingJournal, setIsAddingJournal] = useState(false);
  const [showJournalUpgrade, setShowJournalUpgrade] = useState(false);

  const handleAddToJournal = async () => {
    if (isAddingJournal) return;

    if (item.locked) {
      Alert.alert('Premium Feature', 'Upgrade to add trades to journal.');
      return;
    }

    // Type 1 journal entries require snapshot closure metrics, so only allow on closed signals.
    if (item.state !== 'closed') {
      Alert.alert('Not ready', 'This signal has no final result yet.');
      return;
    }

    // Free-user gating UX: show upgrade modal only (NO journal API request)
    if (!hasJournalAccess) {
      setShowJournalUpgrade(true);
      return;
    }

    try {
      setIsAddingJournal(true);

      const res = await api.post('/journal/from-signal', {
        source_signal_id: item.signal_id,
      });

      const already = res.data?.already_journaled === true;

      Alert.alert(
        already ? 'Already Saved' : 'Saved to Journal',
        already ? 'This signal is already in your journal.' : 'Your signal was added to your journal.'
      );

      router.push('/journal' as any);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to add to journal';
      Alert.alert('Journal Error', detail);
    } finally {
      setIsAddingJournal(false);
    }
  };

  return (
    <View style={cardStyles.wrapper}>
      {/* Glow layer — absolute, opacity-pulsed with native driver */}
      {isActive && !item.locked && (
        <Animated.View style={[cardStyles.glowLayer, { opacity: glowAnim }]} />
      )}

      <View style={[cardStyles.card, { backgroundColor: theme.surface, borderColor: isActive && !item.locked ? 'rgba(0,212,170,0.35)' : theme.border }]}>

        {/* ── Header row ── */}
        <View style={cardStyles.header}>
          <View style={cardStyles.headerLeft}>
            <Text style={[cardStyles.pair, { color: theme.text }]}>{item.pair}</Text>
            <View style={[cardStyles.statusBadge, { backgroundColor: `${stateColor}20` }]}>
              <View style={[cardStyles.statusDot, { backgroundColor: stateColor }]} />
              <Text style={[cardStyles.statusText, { color: stateColor }]}>{stateLabel}</Text>
            </View>
          </View>
          <View style={cardStyles.headerRight}>
            <View style={[cardStyles.typeBadge, { backgroundColor: item.signal_type === 'buy' ? `${theme.success}20` : `${theme.error}20` }]}>
              <Ionicons name={item.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'} size={14} color={item.signal_type === 'buy' ? theme.success : theme.error} />
              <Text style={[cardStyles.typeText, { color: item.signal_type === 'buy' ? theme.success : theme.error }]}>
                {item.signal_type?.toUpperCase()}
              </Text>
            </View>
            <View style={[cardStyles.visibilityBadge, { backgroundColor: badge.bg }]}>
              <Text style={[cardStyles.visibilityText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          </View>
        </View>

        {/* ── Meta row: Age + Validity ── */}
        <View style={cardStyles.metaRow}>
          <View style={cardStyles.metaItem}>
            <Ionicons name="time-outline" size={11} color={theme.textSecondary} />
            <Text style={[cardStyles.metaText, { color: theme.textSecondary }]}>{signalAge}</Text>
          </View>
          {validity && (
            <View style={[cardStyles.validityBadge, { backgroundColor: `${validity.color}18`, borderColor: `${validity.color}40` }]}>
              <Ionicons name={validity.icon} size={11} color={validity.color} />
              <Text style={[cardStyles.validityText, { color: validity.color }]}>{validity.label}</Text>
            </View>
          )}
        </View>

        {item.locked ? (
          <LockedSignalBody
            tier={item.visibility === 'vip' ? 'vip' : 'premium'}
            onPress={() => router.push('/subscription')}
            theme={theme}
          />
        ) : (
          <>
            {/* ── Price details grid ── */}
            <View style={[cardStyles.detailsGrid, { backgroundColor: theme.background }]}>
              <View style={cardStyles.detailItem}>
                <Text style={[cardStyles.detailLabel, { color: theme.textSecondary }]}>ENTRY</Text>
                <Text style={[cardStyles.detailValue, { color: theme.text }]}>{item.entry}</Text>
              </View>
              <View style={[cardStyles.detailItem, cardStyles.detailItemBorder, { borderColor: `${theme.border}60` }]}>
                <Text style={[cardStyles.detailLabel, { color: theme.textSecondary }]}>SL</Text>
                <Text style={[cardStyles.detailValue, { color: theme.error }]}>{item.stop_loss}</Text>
              </View>
              <View style={[cardStyles.detailItem, cardStyles.detailItemBorder, { borderColor: `${theme.border}60` }]}>
                <Text style={[cardStyles.detailLabel, { color: theme.textSecondary }]}>TP1</Text>
                <Text style={[cardStyles.detailValue, { color: (item.tp_hit || 0) >= 1 ? theme.success : theme.textSecondary }]}>
                  {item.tp1 || item.take_profit}{(item.tp_hit || 0) >= 1 ? ' ✓' : ''}
                </Text>
              </View>
              <View style={[cardStyles.detailItem, cardStyles.detailItemBorder, { borderColor: `${theme.border}60` }]}>
                <Text style={[cardStyles.detailLabel, { color: theme.textSecondary }]}>R:R</Text>
                <Text style={[cardStyles.detailValue, { color: theme.text }]}>1:{item.risk_reward}</Text>
              </View>
            </View>

            {/* ── Confidence + Projected pips ── */}
            {item.state !== 'closed' && (
              <View style={cardStyles.insightRow}>
                {/* Confidence meter */}
                <View style={cardStyles.confidenceWrap}>
                  <Text style={[cardStyles.insightLabel, { color: theme.textSecondary }]}>Confidence</Text>
                  <View style={cardStyles.confidenceBar}>
                    <View style={[cardStyles.confidenceFill, {
                      width: `${confidence}%` as any,
                      backgroundColor: confidence >= 75 ? '#00D4AA' : confidence >= 60 ? '#FFD700' : '#FF6B35',
                    }]} />
                  </View>
                  <Text style={[cardStyles.confidencePct, {
                    color: confidence >= 75 ? '#00D4AA' : confidence >= 60 ? '#FFD700' : '#FF6B35'
                  }]}>{confidence}%</Text>
                </View>

                {/* Projected pips */}
                {projectedPips > 0 && (
                  <View style={[cardStyles.pipsBadge, { backgroundColor: 'rgba(0,212,170,0.12)', borderColor: 'rgba(0,212,170,0.3)' }]}>
                    <Ionicons name="arrow-up-circle" size={13} color="#00D4AA" />
                    <Text style={[cardStyles.pipsText, { color: '#00D4AA' }]}>+{projectedPips} pips</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Additional TPs ── */}
            {(item.tp2 || item.tp3) && (
              <View style={cardStyles.tpRow}>
                {item.tp2 && (
                  <View style={[cardStyles.tpTag, { borderColor: theme.border }, (item.tp_hit || 0) >= 2 && { backgroundColor: `${theme.success}20`, borderColor: theme.success }]}>
                    <Text style={[cardStyles.tpTagText, { color: theme.textSecondary }, (item.tp_hit || 0) >= 2 && { color: theme.success }]}>
                      TP2: {item.tp2}{(item.tp_hit || 0) >= 2 ? ' \u2713' : ''}
                    </Text>
                  </View>
                )}
                {item.tp3 && (
                  <View style={[cardStyles.tpTag, { borderColor: theme.border }, (item.tp_hit || 0) >= 3 && { backgroundColor: `${theme.success}20`, borderColor: theme.success }]}>
                    <Text style={[cardStyles.tpTagText, { color: theme.textSecondary }, (item.tp_hit || 0) >= 3 && { color: theme.success }]}>
                      TP3: {item.tp3}{(item.tp_hit || 0) >= 3 ? ' \u2713' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── TP Hit Messages (trailing SL updates) ── */}
            {Array.isArray(item.tp_messages) && item.tp_messages.length > 0 && (
              <View style={cardStyles.tpMessagesWrap}>
                {item.tp_messages.map((msg, idx) => (
                  <View key={idx} style={[cardStyles.tpMsgRow, { backgroundColor: `${theme.success}12` }]}>
                    <Ionicons name="checkmark-circle" size={13} color={theme.success} />
                    <Text style={[cardStyles.tpMsgText, { color: theme.success }]}>{msg.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Closed result ── */}
            {item.state === 'closed' && (item.final_pips !== undefined || item.result_pips !== undefined) && (
              <>
                <View style={[cardStyles.resultRow, { borderTopColor: theme.border }]}>
                  <Text style={[cardStyles.resultLabel, { color: theme.textSecondary }]}>Result:</Text>
                  <Text
                    style={[
                      cardStyles.resultValue,
                      {
                        color:
                          (item.final_pips ?? item.result_pips ?? 0) >= 0 ? theme.success : theme.error,
                      },
                    ]}
                  >
                    {(item.final_pips ?? item.result_pips ?? 0) >= 0 ? '+' : ''}
                    {item.final_pips ?? item.result_pips} pips
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    cardStyles.journalBtn,
                    {
                      backgroundColor: isAddingJournal ? `${theme.primary}35` : `${theme.primary}18`,
                      borderColor: `${theme.primary}55`,
                      opacity: item.locked ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleAddToJournal}
                  disabled={isAddingJournal || item.locked}
                  testID="add-to-journal-btn"
                >
                  <Ionicons name="bookmark-outline" size={16} color={theme.primary} />
                  <Text style={[cardStyles.journalBtnText, { color: theme.primary }]}>
                    {isAddingJournal ? 'Adding…' : 'Add To Journal'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>

      <Modal
        visible={showJournalUpgrade}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJournalUpgrade(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 18,
          }}
        >
          <View
            style={{
              width: '100%',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '900', letterSpacing: -0.2, color: theme.text }}>
                Trading Journal is a Premium feature
              </Text>

              <TouchableOpacity
                style={{ padding: 8 }}
                onPress={() => setShowJournalUpgrade(false)}
                accessibilityRole="button"
                testID="journal-upgrade-close"
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 18, color: theme.textSecondary }}>
              Upgrade to Premium or VIP to track trades, analyze performance, and build your personal trading journal.
            </Text>

            <TouchableOpacity
              style={{
                marginTop: 16,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.primary,
              }}
              onPress={() => {
                setShowJournalUpgrade(false);
                router.push('/subscription');
              }}
              accessibilityRole="button"
              accessibilityLabel="Upgrade Now"
              testID="journal-upgrade-now"
            >
              <Text style={{ color: '#0A0E17', fontWeight: '900', fontSize: 15 }}>Upgrade Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Per-card styles (static, defined once) ──────────────────────────────────

const cardStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  glowLayer: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#00D4AA',
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', gap: 5 },
  pair: { fontSize: 18, fontWeight: '700', marginBottom: 5, letterSpacing: -0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: 12, fontWeight: '700', marginLeft: 3, letterSpacing: 0.3 },
  visibilityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  visibilityText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  // Meta row
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontWeight: '500' },
  validityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  validityText: { fontSize: 11, fontWeight: '600' },
  // Details grid
  detailsGrid: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 12, padding: 11, marginBottom: 10 },
  detailItem: { alignItems: 'center', flex: 1 },
  detailItemBorder: { borderLeftWidth: 1 },
  detailLabel: { fontSize: 9, marginBottom: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.7 },
  detailValue: { fontSize: 13, fontWeight: '700' },
  // Insight row (confidence + pips)
  insightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  confidenceWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  insightLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  confidenceBar: { flex: 1, height: 4, backgroundColor: 'rgba(138,141,152,0.2)', borderRadius: 2, maxWidth: 70, overflow: 'hidden' },
  confidenceFill: { height: 4, borderRadius: 2 },
  confidencePct: { fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  pipsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  pipsText: { fontSize: 11, fontWeight: '700' },
  // TPs
  tpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  tpTag: { backgroundColor: 'rgba(138,141,152,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  tpTagText: { fontSize: 11, fontWeight: '600' },
  tpMessagesWrap: { marginTop: 8 },
  tpMsgRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginBottom: 4, gap: 5 },
  tpMsgText: { fontSize: 11, fontWeight: '600' },
  // Result
  resultRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 10, marginTop: 2, borderTopWidth: 0.5 },
  resultLabel: { fontSize: 12, marginRight: 8, opacity: 0.7 },
  resultValue: { fontSize: 14, fontWeight: '700' },

  // Journal
  journalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  journalBtnText: { fontSize: 13, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function SignalsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { status: subscriptionStatus } = useSubscription();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const { signals, isLoading, isRefreshing, refreshSignals, lastUpdated } = useSignals();
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'closed'>('all');
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8 + AD_BANNER_HEIGHT;

  const journalTier = subscriptionStatus?.capability_tier || 'free';
  const hasJournalAccess = journalTier === 'premium' || journalTier === 'vip';

  // Interstitial — fires after multiple meaningful actions (refresh / filter change)
  const { recordAndMaybeShow } = useInterstitialAd();

  const filteredSignals = signals.filter(signal => {
    if (filter === 'all') return true;
    if (filter === 'active') return signal.state !== 'closed' && signal.state !== 'pending';
    return signal.state === filter;
  });

  const renderSignal = ({ item }: { item: Signal }) => (
    <SignalCard item={item} theme={theme} canJournal={!!user} hasJournalAccess={hasJournalAccess} />
  );

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
        renderItem={renderSignal}
        keyExtractor={(item) => item.signal_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => { refreshSignals(); recordAndMaybeShow(); }} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="trending-up-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Signals</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Check back later for new trading signals</Text>
          </View>
        }
      />

      {/* Fixed bottom ad banner — free users only */}
      <AdBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 4, opacity: 0.7 },
  historyButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,212,170,0.08)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,212,170,0.18)',
  },
  historyButtonText: { fontSize: 13, fontWeight: '600', marginLeft: 5 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 14 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: '500' },
  listContent: { padding: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 16 },
  emptyText: { fontSize: 13, marginTop: 8, opacity: 0.7 },
});

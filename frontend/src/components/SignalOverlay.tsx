import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SignalData {
  signal_id?: string;
  signal_type: 'buy' | 'sell';
  pair: string;
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  state: string;
}

interface SignalOverlayProps {
  signal: SignalData;
  onClose: () => void;
  onViewSignal?: () => void;
}

export default function SignalOverlay({ signal, onClose, onViewSignal }: SignalOverlayProps) {
  const isBuy = signal.signal_type === 'buy';
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Subtle pulse on the entry price
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const formatPrice = (v: number) => v.toFixed(v >= 100 ? 2 : 5);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card} data-testid="signal-overlay-card">
        {/* Header — type badge + pair + close */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.typeBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
              <Ionicons
                name={isBuy ? 'arrow-up-circle' : 'arrow-down-circle'}
                size={14}
                color="#FFFFFF"
              />
              <Text style={styles.typeText}>{isBuy ? 'BUY' : 'SELL'}</Text>
            </View>
            <Text style={styles.pairText}>{signal.pair}</Text>
            <View style={styles.statePill}>
              <View style={[styles.stateDot, { backgroundColor: signal.state === 'active' ? '#00D4AA' : '#FFD700' }]} />
              <Text style={styles.stateText}>{signal.state.toUpperCase()}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            data-testid="signal-overlay-close"
          >
            <Ionicons name="close" size={16} color="#8A8D98" />
          </TouchableOpacity>
        </View>

        {/* Entry — prominent with pulse glow */}
        {signal.entry != null && (
          <View style={styles.entryRow}>
            <Text style={styles.entryLabel}>ENTRY</Text>
            <View style={styles.entryValueWrap}>
              <Animated.View style={[styles.entryGlow, isBuy ? styles.glowBuy : styles.glowSell, { opacity: pulseAnim }]} />
              <Text style={styles.entryValue}>{formatPrice(signal.entry)}</Text>
            </View>
          </View>
        )}

        {/* SL + TPs in a compact grid */}
        <View style={styles.levelsRow}>
          {signal.stop_loss != null && (
            <View style={styles.levelChip}>
              <Text style={styles.levelChipLabel}>SL</Text>
              <Text style={[styles.levelChipValue, styles.slValue]}>{formatPrice(signal.stop_loss)}</Text>
            </View>
          )}
          {signal.tp1 != null && (
            <View style={styles.levelChip}>
              <Text style={styles.levelChipLabel}>TP1</Text>
              <Text style={[styles.levelChipValue, styles.tpValue]}>{formatPrice(signal.tp1)}</Text>
            </View>
          )}
          {signal.tp2 != null && (
            <View style={styles.levelChip}>
              <Text style={styles.levelChipLabel}>TP2</Text>
              <Text style={[styles.levelChipValue, styles.tpValue]}>{formatPrice(signal.tp2)}</Text>
            </View>
          )}
          {signal.tp3 != null && (
            <View style={styles.levelChip}>
              <Text style={styles.levelChipLabel}>TP3</Text>
              <Text style={[styles.levelChipValue, styles.tpValue]}>{formatPrice(signal.tp3)}</Text>
            </View>
          )}
        </View>

        {/* View Signal action */}
        {onViewSignal && (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={onViewSignal}
            activeOpacity={0.7}
            data-testid="signal-overlay-view"
          >
            <Text style={styles.viewButtonText}>View Signal</Text>
            <Ionicons name="chevron-forward" size={14} color="#00D4AA" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  card: {
    backgroundColor: 'rgba(18, 22, 36, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  buyBadge: { backgroundColor: '#00D4AA' },
  sellBadge: { backgroundColor: '#FF6B6B' },
  typeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  pairText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  stateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  stateText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8A8D98',
    letterSpacing: 0.4,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Entry
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  entryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A8D98',
    letterSpacing: 0.6,
  },
  entryValueWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryGlow: {
    position: 'absolute',
    width: '120%',
    height: '160%',
    borderRadius: 8,
  },
  glowBuy: { backgroundColor: 'rgba(0, 212, 170, 0.12)' },
  glowSell: { backgroundColor: 'rgba(255, 107, 107, 0.12)' },
  entryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  // Levels
  levelsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  levelChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A8D98',
    letterSpacing: 0.3,
  },
  levelChipValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  slValue: { color: '#FF6B6B' },
  tpValue: { color: '#00D4AA' },
  // View button
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D4AA',
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SignalData {
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
}

export default function SignalOverlay({ signal, onClose }: SignalOverlayProps) {
  const isBuy = signal.signal_type === 'buy';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card} data-testid="signal-overlay-card">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.typeBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
              <Ionicons
                name={isBuy ? 'trending-up' : 'trending-down'}
                size={12}
                color="#FFFFFF"
              />
              <Text style={styles.typeText}>{isBuy ? 'BUY' : 'SELL'}</Text>
            </View>
            <Text style={styles.pairText}>{signal.pair}</Text>
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

        {/* Price rows */}
        <View style={styles.rows}>
          <PriceRow label="Entry" value={signal.entry} color="#FFFFFF" />
          <PriceRow label="Stop Loss" value={signal.stop_loss} color="#FF6B6B" />
          {signal.tp1 != null && <PriceRow label="TP1" value={signal.tp1} color="#00D4AA" />}
          {signal.tp2 != null && <PriceRow label="TP2" value={signal.tp2} color="#00D4AA" />}
          {signal.tp3 != null && <PriceRow label="TP3" value={signal.tp3} color="#00D4AA" />}
        </View>

        {/* State indicator */}
        <View style={styles.footer}>
          <View style={styles.stateDot} />
          <Text style={styles.stateText}>{signal.state.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function PriceRow({ label, value, color }: { label: string; value?: number; color: string }) {
  if (value == null) return null;
  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.priceValue, { color }]}>{value.toFixed(value >= 100 ? 2 : 5)}</Text>
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
    backgroundColor: 'rgba(18, 22, 36, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  buyBadge: {
    backgroundColor: '#00D4AA',
  },
  sellBadge: {
    backgroundColor: '#FF6B6B',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  pairText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rows: {
    gap: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: '#8A8D98',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D4AA',
  },
  stateText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8A8D98',
    letterSpacing: 0.5,
  },
});

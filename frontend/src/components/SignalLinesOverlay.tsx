import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SignalData {
  signal_type: 'buy' | 'sell';
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
}

type LineKind = 'entry' | 'sl' | 'tp';

interface PriceLine {
  price: number;
  label: string;
  kind: LineKind;
}

const LINE_COLORS: Record<LineKind, string> = {
  entry: '#3B82F6',
  sl: '#FF6B6B',
  tp: '#00D4AA',
};

const LABEL_BG: Record<LineKind, string> = {
  entry: 'rgba(59, 130, 246, 0.85)',
  sl: 'rgba(255, 107, 107, 0.85)',
  tp: 'rgba(0, 212, 170, 0.85)',
};

interface SignalLinesOverlayProps {
  signal: SignalData;
  currentPrice?: number | null;
}

export default function SignalLinesOverlay({ signal, currentPrice }: SignalLinesOverlayProps) {
  const lines = useMemo(() => {
    const result: PriceLine[] = [];
    if (signal.entry != null) result.push({ price: signal.entry, label: 'Entry', kind: 'entry' });
    if (signal.stop_loss != null) result.push({ price: signal.stop_loss, label: 'SL', kind: 'sl' });
    if (signal.tp1 != null) result.push({ price: signal.tp1, label: 'TP1', kind: 'tp' });
    if (signal.tp2 != null) result.push({ price: signal.tp2, label: 'TP2', kind: 'tp' });
    if (signal.tp3 != null) result.push({ price: signal.tp3, label: 'TP3', kind: 'tp' });
    return result;
  }, [signal]);

  // Anchor: live price → fallback to entry
  const anchor = currentPrice ?? signal.entry ?? 0;

  // Compute range anchored on current price.
  // Find the maximum distance any signal level sits from the anchor,
  // then pad by 2.5× so lines spread naturally like a real chart scale.
  const { topPrice, bottomPrice } = useMemo(() => {
    if (lines.length === 0 || anchor === 0) return { topPrice: 0, bottomPrice: 0 };

    let maxDist = 0;
    for (const l of lines) {
      const d = Math.abs(l.price - anchor);
      if (d > maxDist) maxDist = d;
    }

    // Floor: at least 0.15% of anchor so lines never collapse to a single point
    maxDist = Math.max(maxDist, anchor * 0.0015);

    // Adaptive multiplier: tighter signals get more breathing room,
    // wide signals get less so they don't push lines to edges.
    const ratio = maxDist / anchor;
    const multiplier = ratio < 0.002 ? 3.5 : ratio > 0.01 ? 2.0 : 2.5;

    const paddedRange = Math.max(maxDist * multiplier, anchor * 0.002);
    return {
      topPrice: anchor + paddedRange,
      bottomPrice: anchor - paddedRange,
    };
  }, [lines, anchor]);

  if (lines.length < 2 || topPrice === bottomPrice) return null;

  const totalRange = topPrice - bottomPrice;

  const priceToPercent = (price: number): number => {
    return ((topPrice - price) / totalRange) * 100;
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const formatPrice = (v: number) => v.toFixed(v >= 100 ? 2 : 5);

  // Out-of-range indicators
  const signalPrices = lines.map((l) => l.price);
  const signalMin = Math.min(...signalPrices);
  const signalMax = Math.max(...signalPrices);
  const priceAbove = currentPrice != null && currentPrice > signalMax;
  const priceBelow = currentPrice != null && currentPrice < signalMin;

  return (
    <View style={styles.container} pointerEvents="none">
      {priceAbove && (
        <View style={[styles.rangeIndicatorTop, styles.rangeIndicatorAbove]}>
          <Text style={[styles.rangeIndicatorText, styles.rangeTextAbove]}>
            {'\u2191'} Price above signal range
          </Text>
        </View>
      )}

      {lines.map((line) => {
        const pct = clamp(priceToPercent(line.price), 2, 98);
        const color = LINE_COLORS[line.kind];
        const bgColor = LABEL_BG[line.kind];

        return (
          <View
            key={`${line.label}-${line.price}`}
            style={[styles.lineRow, { top: `${pct}%` }]}
          >
            <View style={[styles.line, { borderColor: color }]} />
            <View style={[styles.label, { backgroundColor: bgColor }]}>
              <Text style={styles.labelKind}>{line.label}</Text>
              <Text style={styles.labelPrice}>{formatPrice(line.price)}</Text>
            </View>
          </View>
        );
      })}

      {priceBelow && (
        <View style={[styles.rangeIndicatorBottom, styles.rangeIndicatorBelow]}>
          <Text style={[styles.rangeIndicatorText, styles.rangeTextBelow]}>
            {'\u2193'} Price below signal range
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
  },
  lineRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: -1,
  },
  labelKind: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  labelPrice: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  rangeIndicatorTop: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rangeIndicatorBottom: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rangeIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  rangeIndicatorAbove: {
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
  },
  rangeTextAbove: {
    color: 'rgba(0, 212, 170, 0.8)',
  },
  rangeIndicatorBelow: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  rangeTextBelow: {
    color: 'rgba(255, 107, 107, 0.8)',
  },
});

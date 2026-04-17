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
}

export default function SignalLinesOverlay({ signal }: SignalLinesOverlayProps) {
  const lines = useMemo(() => {
    const result: PriceLine[] = [];
    if (signal.entry != null) result.push({ price: signal.entry, label: 'Entry', kind: 'entry' });
    if (signal.stop_loss != null) result.push({ price: signal.stop_loss, label: 'SL', kind: 'sl' });
    if (signal.tp1 != null) result.push({ price: signal.tp1, label: 'TP1', kind: 'tp' });
    if (signal.tp2 != null) result.push({ price: signal.tp2, label: 'TP2', kind: 'tp' });
    if (signal.tp3 != null) result.push({ price: signal.tp3, label: 'TP3', kind: 'tp' });
    return result;
  }, [signal]);

  // Compute visible price range with adaptive padding.
  // Goals:
  //   - Entry roughly centered vertically (~40-50% from top)
  //   - Minimum spread so lines never cluster into a thin band
  //   - Wider padding when SL/TP span is tight relative to entry price
  const { rangeTop, rangeBottom } = useMemo(() => {
    if (lines.length === 0) return { rangeTop: 0, rangeBottom: 0 };

    const prices = lines.map((l) => l.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const entry = signal.entry ?? (min + max) / 2;
    const rawSpan = max - min;

    // Minimum span: 0.4% of entry price — prevents extreme compression
    // when SL and TP are only a few pips apart
    const minSpan = entry * 0.004;
    const span = Math.max(rawSpan, minSpan);

    // Build range around entry so it sits near the vertical center.
    // Measure how far above / below entry the levels extend.
    const above = max - entry;
    const below = entry - min;

    // Make both sides at least as large as the larger side,
    // then add dynamic padding (30-50% of the used side).
    // This keeps entry near the middle while giving breathing room.
    const side = Math.max(above, below, span * 0.5);
    const padFactor = span < minSpan * 2 ? 0.5 : 0.3; // more padding when tight

    const top = entry + side + side * padFactor;
    const bottom = entry - side - side * padFactor;

    return { rangeTop: top, rangeBottom: bottom };
  }, [lines, signal.entry]);

  if (lines.length < 2) return null; // need at least entry + one level

  const totalRange = rangeTop - rangeBottom;

  // Map price → percentage from top (0% = rangeTop, 100% = rangeBottom)
  const priceToPercent = (price: number): number => {
    if (totalRange === 0) return 50;
    return ((rangeTop - price) / totalRange) * 100;
  };

  const formatPrice = (v: number) => v.toFixed(v >= 100 ? 2 : 5);

  return (
    <View style={styles.container} pointerEvents="none">
      {lines.map((line) => {
        const topPercent = priceToPercent(line.price);
        // Clamp to prevent lines from going off-screen
        const clamped = Math.max(2, Math.min(98, topPercent));
        const color = LINE_COLORS[line.kind];
        const bgColor = LABEL_BG[line.kind];

        return (
          <View
            key={`${line.label}-${line.price}`}
            style={[styles.lineRow, { top: `${clamped}%` }]}
          >
            {/* Dashed line */}
            <View style={[styles.line, { borderColor: color }]} />

            {/* Price label on the right */}
            <View style={[styles.label, { backgroundColor: bgColor }]}>
              <Text style={styles.labelKind}>{line.label}</Text>
              <Text style={styles.labelPrice}>{formatPrice(line.price)}</Text>
            </View>
          </View>
        );
      })}
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
});

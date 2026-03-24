/**
 * UpgradeKit — shared premium/VIP upgrade UX components
 * Used on: dashboard, signals locked cards
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

// ─── Dynamic pips by day-of-week ─────────────────────────────────────────────

export const getWeeklyPips = (): number => {
  const day = new Date().getDay(); // 0=Sun, 1=Mon … 6=Sat
  const pipsByDay: Record<number, number> = {
    0: 1200, // Sunday  (showing last week's full total)
    1: 220,  // Monday
    2: 480,  // Tuesday
    3: 750,  // Wednesday
    4: 970,  // Thursday
    5: 1200, // Friday
    6: 1200, // Saturday (showing full week)
  };
  return pipsByDay[day] ?? 1200;
};

// ─── Benefit list ─────────────────────────────────────────────────────────────

const BENEFITS = [
  { icon: 'flash' as const,       text: 'Unlimited signals, zero restrictions' },
  { icon: 'analytics' as const,   text: 'AI chart analyses on demand' },
  { icon: 'briefcase' as const,   text: 'Fund management eligibility' },
];

// ─── CTA pulse hook (6s interval, native driver) ──────────────────────────────

export const useCtaPulse = () => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = () =>
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.04, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]);

    pulse().start();
    const id = setInterval(() => pulse().start(), 6000);
    return () => clearInterval(id);
  }, []);

  return scale;
};

// ─── Components ──────────────────────────────────────────────────────────────

interface Props {
  tier: 'premium' | 'vip';
  onPress: () => void;
  theme: any;
  compact?: boolean;
}

export const BenefitChecklist = ({ theme }: { theme: any }) => (
  <View style={kit.checklist}>
    {BENEFITS.map((b, i) => (
      <View key={i} style={kit.checkRow}>
        <View style={kit.checkDot}>
          <Ionicons name={b.icon} size={10} color="#00D4AA" />
        </View>
        <Text style={[kit.checkText, { color: theme.textSecondary }]}>{b.text}</Text>
      </View>
    ))}
  </View>
);

export const UrgencyLine = ({ theme }: { theme: any }) => {
  const pips = getWeeklyPips();
  return (
    <View style={kit.urgencyRow}>
      <Ionicons name="trending-up" size={12} color="#FFD700" />
      <Text style={[kit.urgencyText, { color: theme.textSecondary }]}>
        VIP traders pocketed{' '}
        <Text style={kit.urgencyHighlight}>+{pips.toLocaleString()} pips</Text>
        {' '}this week
      </Text>
    </View>
  );
};

export const CtaButton = ({ label, onPress, scale }: { label: string; onPress: () => void; scale: Animated.Value }) => (
  <Animated.View style={{ transform: [{ scale }] }}>
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={kit.ctaButton}>
      <Ionicons name="rocket" size={14} color="#0A0E17" />
      <Text style={kit.ctaText}>{label}</Text>
    </TouchableOpacity>
  </Animated.View>
);

/** Blurred price row — shows realistic-looking placeholder values blurred out */
export const BlurredPricePreview = ({ pair, theme }: { pair: string; theme: any }) => {
  const placeholders = ['X,XXX.XX', 'X,XXX.XX', 'X,XXX.XX'];
  const labels = ['ENTRY', 'TP1', 'SL'];

  return (
    <View style={kit.blurWrap}>
      {/* Fake price row beneath blur */}
      <View style={[kit.blurContent, { backgroundColor: theme.background }]}>
        {labels.map((label, i) => (
          <View key={i} style={kit.blurCol}>
            <Text style={[kit.blurLabel, { color: theme.textSecondary }]}>{label}</Text>
            <Text style={[kit.blurValue, { color: theme.text }]}>{placeholders[i]}</Text>
          </View>
        ))}
      </View>
      {/* Blur overlay */}
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Lock icon centred on top of blur */}
      <View style={kit.blurLockRow}>
        <View style={kit.blurLockBadge}>
          <Ionicons name="lock-closed" size={12} color="#FFD700" />
          <Text style={kit.blurLockText}>Unlock to view</Text>
        </View>
      </View>
    </View>
  );
};

/** Full upgrade card body — used inside locked signal cards on the signals screen */
export const LockedSignalBody = ({ tier, onPress, theme }: Props) => {
  const scale = useCtaPulse();
  const label = tier === 'vip' ? 'Upgrade to VIP' : 'Upgrade to Premium';

  return (
    <View style={kit.lockedBody}>
      <BlurredPricePreview pair="" theme={theme} />
      <BenefitChecklist theme={theme} />
      <UrgencyLine theme={theme} />
      <CtaButton label={label} onPress={onPress} scale={scale} />
    </View>
  );
};

/** Compact upgrade banner — used on the dashboard */
export const UpgradeBanner = ({ onPress, theme }: { onPress: () => void; theme: any }) => {
  const scale = useCtaPulse();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={[kit.banner, { backgroundColor: theme.surface, borderColor: `rgba(255,215,0,0.25)` }]}
      data-testid="upgrade-banner"
    >
      {/* Gold left stripe */}
      <View style={kit.bannerStripe} />

      <View style={kit.bannerBody}>
        {/* Header */}
        <View style={kit.bannerHeader}>
          <View style={kit.bannerTitleRow}>
            <Ionicons name="rocket" size={16} color="#FFD700" />
            <Text style={[kit.bannerTitle, { color: '#FFD700' }]}>Upgrade to Premium</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#FFD700" />
        </View>

        {/* Benefits */}
        <BenefitChecklist theme={theme} />

        {/* Urgency + CTA row */}
        <View style={kit.bannerFooter}>
          <UrgencyLine theme={theme} />
          <CtaButton label="Unlock Now" onPress={onPress} scale={scale} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const kit = StyleSheet.create({
  // Checklist
  checklist: { marginVertical: 8, gap: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,212,170,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  checkText: { fontSize: 12, flex: 1, fontWeight: '500' },

  // Urgency
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  urgencyText: { fontSize: 11, flex: 1 },
  urgencyHighlight: { color: '#FFD700', fontWeight: '700' },

  // CTA button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    alignSelf: 'center',
    marginTop: 10,
  },
  ctaText: { color: '#0A0E17', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  // Blurred preview
  blurWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  blurContent: {
    flexDirection: 'row',
    padding: 11,
    borderRadius: 12,
  },
  blurCol: { flex: 1, alignItems: 'center' },
  blurLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, opacity: 0.7 },
  blurValue: { fontSize: 13, fontWeight: '700' },
  blurLockRow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(10,14,23,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  blurLockText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },

  // Locked signal body
  lockedBody: { paddingTop: 4 },

  // Banner
  banner: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 16,
    marginHorizontal: 16,
  },
  bannerStripe: { width: 4, backgroundColor: '#FFD700' },
  bannerBody: { flex: 1, padding: 14 },
  bannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bannerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  bannerFooter: { gap: 2 },
});

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

interface Category {
  id: string;
  title: string;
  description: string;
  icon: string;
  courseCount: number;
  color: string;
  requiredRole: 'free' | 'premium' | 'vip';
}

const CATEGORIES: Category[] = [
  { id: 'beginner', title: 'Beginner', description: 'Master the fundamentals of trading', icon: 'school-outline', courseCount: 6, color: '#00D4AA', requiredRole: 'free' },
  { id: 'intermediate', title: 'Intermediate', description: 'Advanced strategies and analysis', icon: 'trending-up-outline', courseCount: 8, color: '#FFD700', requiredRole: 'premium' },
  { id: 'advanced', title: 'Advanced', description: 'Professional trading techniques', icon: 'rocket-outline', courseCount: 10, color: '#FF6B6B', requiredRole: 'vip' },
];

interface StreakData {
  current_streak: number;
  longest_streak: number;
  active_today: boolean;
  streak_at_risk: boolean;
  has_streak_shield: boolean;
  shield_available: boolean;
}

// ─── Streak Badge Component ───
function StreakBadge({ streak, theme }: { streak: StreakData; theme: any }) {
  const fireScale = useRef(new Animated.Value(1)).current;
  const fireGlow = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (streak.current_streak > 0) {
      Animated.loop(Animated.sequence([
        Animated.timing(fireScale, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(fireScale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(fireGlow, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(fireGlow, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ])).start();
    }
  }, [streak.current_streak]);

  const isActive = streak.current_streak > 0;
  const atRisk = streak.streak_at_risk;
  const fireColor = atRisk ? '#FF6B6B' : isActive ? '#FF8C00' : '#4A4F5E';
  const bgColor = atRisk ? '#FF6B6B12' : isActive ? '#FF8C0012' : `${theme.surface}`;

  return (
    <View style={[sk.card, { backgroundColor: bgColor, borderColor: atRisk ? '#FF6B6B30' : isActive ? '#FF8C0030' : theme.border }]} data-testid="streak-badge">
      <View style={sk.row}>
        <View style={sk.left}>
          <Animated.View style={{ transform: [{ scale: isActive ? fireScale : 1 }] }}>
            <Ionicons name="flame" size={32} color={fireColor} />
          </Animated.View>
          <View style={sk.info}>
            <Text style={[sk.count, { color: isActive ? fireColor : theme.textSecondary }]}>
              {streak.current_streak}
            </Text>
            <Text style={[sk.label, { color: theme.textSecondary }]}>
              {streak.current_streak === 1 ? 'Day Streak' : 'Day Streak'}
            </Text>
          </View>
        </View>
        <View style={sk.right}>
          {streak.active_today && (
            <View style={[sk.todayBadge, { backgroundColor: '#00D4AA20' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#00D4AA" />
              <Text style={sk.todayText}>Today</Text>
            </View>
          )}
          {atRisk && !streak.active_today && (
            <View style={[sk.todayBadge, { backgroundColor: '#FF6B6B20' }]}>
              <Ionicons name="warning" size={12} color="#FF6B6B" />
              <Text style={[sk.todayText, { color: '#FF6B6B' }]}>At Risk</Text>
            </View>
          )}
          {streak.has_streak_shield && streak.shield_available && (
            <View style={[sk.shieldBadge, { backgroundColor: '#FFD70020' }]}>
              <Ionicons name="shield-checkmark" size={12} color="#FFD700" />
              <Text style={sk.shieldText}>Shield</Text>
            </View>
          )}
        </View>
      </View>
      <View style={sk.details}>
        <View style={sk.detailItem}>
          <Text style={[sk.detailLabel, { color: theme.textSecondary }]}>Best</Text>
          <Text style={[sk.detailValue, { color: theme.text }]}>{streak.longest_streak}d</Text>
        </View>
        <View style={sk.detailDivider} />
        <View style={sk.detailItem}>
          <Text style={[sk.detailLabel, { color: theme.textSecondary }]}>Bonus</Text>
          <Text style={[sk.detailValue, { color: '#FFD700' }]}>+{streak.current_streak > 0 ? 10 : 0} XP</Text>
        </View>
        <View style={sk.detailDivider} />
        <View style={sk.detailItem}>
          <Text style={[sk.detailLabel, { color: theme.textSecondary }]}>Next</Text>
          <Text style={[sk.detailValue, { color: '#FF8C00' }]}>
            {streak.current_streak > 0 ? `${7 - (streak.current_streak % 7)}d` : '7d'}
          </Text>
        </View>
      </View>
      <Text style={[sk.tooltip, { color: theme.textSecondary }]}>
        Maintain daily streak to earn bonus XP
      </Text>
    </View>
  );
}

const sk = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  left: { flexDirection: 'row', alignItems: 'center' },
  info: { marginLeft: 10 },
  count: { fontSize: 28, fontWeight: 'bold' },
  label: { fontSize: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  todayText: { fontSize: 11, fontWeight: '600', color: '#00D4AA' },
  shieldBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  shieldText: { fontSize: 11, fontWeight: '600', color: '#FFD700' },
  details: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  detailItem: { alignItems: 'center' },
  detailLabel: { fontSize: 11 },
  detailValue: { fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  detailDivider: { width: 1, backgroundColor: '#2A2F3E' },
  tooltip: { fontSize: 11, textAlign: 'center', marginTop: 4 },
});

export default function AcademyScreen() {
  const { status: sub, isAdminPrivilege } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState({ completed_lessons: 0, total_lessons: 150, progress_pct: 0 });
  const [streak, setStreak] = useState<StreakData>({
    current_streak: 0, longest_streak: 0, active_today: false,
    streak_at_risk: false, has_streak_shield: false, shield_available: false,
  });
  const [animatedWidth] = useState(new Animated.Value(0));

  const userTier = sub?.capability_tier || sub?.subscription || 'free';
  const hasAccess = (req: string) => {
    if (isAdminPrivilege) return true;
    if (req === 'free') return true;
    if (req === 'premium') return userTier === 'premium' || userTier === 'vip';
    if (req === 'vip') return userTier === 'vip';
    return false;
  };

  const fetchData = useCallback(async () => {
    try {
      const [progRes, streakRes] = await Promise.all([
        api.get('/academy/progress').catch(() => ({ data: null })),
        api.get('/academy/streak-status').catch(() => ({ data: null })),
      ]);
      if (progRes.data) {
        setProgress(progRes.data);
        Animated.timing(animatedWidth, {
          toValue: progRes.data.progress_pct, duration: 800, useNativeDriver: false,
        }).start();
      }
      if (streakRes.data) setStreak(streakRes.data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Academy</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.surface }]} onPress={() => router.push('/academy/leaderboard' as any)} data-testid="academy-leaderboard-btn">
          <Ionicons name="trophy" size={22} color="#FFD700" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <View style={[styles.welcomeIcon, { backgroundColor: `${theme.primary}20` }]}>
            <Ionicons name="school" size={32} color={theme.primary} />
          </View>
          <Text style={[styles.welcomeTitle, { color: theme.text }]}>Trading Academy</Text>
          <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
            Learn to trade with comprehensive courses for all skill levels
          </Text>
        </View>

        {/* Streak Badge */}
        <StreakBadge streak={streak} theme={theme} />

        {/* Progress Widget */}
        <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="academy-progress-widget">
          <View style={styles.progressHeader}>
            <Ionicons name="trophy-outline" size={20} color="#FFD700" />
            <Text style={[styles.progressTitle, { color: theme.text }]}>Your Progress</Text>
          </View>
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <Text style={[styles.progressStatValue, { color: '#00D4AA' }]}>{progress.completed_lessons}</Text>
              <Text style={[styles.progressStatLabel, { color: theme.textSecondary }]}>Completed</Text>
            </View>
            <View style={[styles.progressDivider, { backgroundColor: theme.border }]} />
            <View style={styles.progressStat}>
              <Text style={[styles.progressStatValue, { color: theme.text }]}>{progress.total_lessons}</Text>
              <Text style={[styles.progressStatLabel, { color: theme.textSecondary }]}>Total</Text>
            </View>
            <View style={[styles.progressDivider, { backgroundColor: theme.border }]} />
            <View style={styles.progressStat}>
              <Text style={[styles.progressStatValue, { color: '#FFD700' }]}>{progress.progress_pct}%</Text>
              <Text style={[styles.progressStatLabel, { color: theme.textSecondary }]}>Progress</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: animatedWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Course Categories</Text>

        {CATEGORIES.map((cat) => {
          const locked = !hasAccess(cat.requiredRole);
          const badge = cat.requiredRole !== 'free' ? cat.requiredRole.toUpperCase() : null;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryCard, { backgroundColor: theme.surface, borderColor: theme.border }, locked && { opacity: 0.6 }]}
              onPress={() => locked ? router.push('/subscription') : router.push(`/academy/${cat.id}`)}
              data-testid={`academy-category-${cat.id}`}
            >
              <View style={[styles.categoryIconContainer, { backgroundColor: `${cat.color}20` }]}>
                <Ionicons name={cat.icon as any} size={28} color={locked ? theme.textSecondary : cat.color} />
              </View>
              <View style={styles.categoryContent}>
                <View style={styles.categoryHeader}>
                  <Text style={[styles.categoryTitle, { color: locked ? theme.textSecondary : theme.text }]}>{cat.title}</Text>
                  {badge && (
                    <View style={[styles.categoryBadge, { backgroundColor: `${cat.color}20` }]}>
                      <Text style={[styles.categoryBadgeText, { color: cat.color }]}>{badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.categoryDescription, { color: theme.textSecondary }]}>{cat.description}</Text>
                <Text style={[styles.categoryCourseCount, { color: cat.color }]}>{cat.courseCount} courses</Text>
              </View>
              <Ionicons name={locked ? 'lock-closed' : 'chevron-forward'} size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          );
        })}

        {/* XP Economy Info */}
        <View style={[styles.xpCard, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="xp-economy-card">
          <Text style={[styles.xpCardTitle, { color: theme.text }]}>XP Rewards</Text>
          <View style={styles.xpRow}>
            <View style={styles.xpItem}>
              <Ionicons name="book-outline" size={16} color="#00D4AA" />
              <Text style={styles.xpItemText}>Lesson: +20</Text>
            </View>
            <View style={styles.xpItem}>
              <Ionicons name="help-circle-outline" size={16} color="#FFD700" />
              <Text style={styles.xpItemText}>Quiz: +40</Text>
            </View>
            <View style={styles.xpItem}>
              <Ionicons name="star" size={16} color="#FF8C00" />
              <Text style={styles.xpItemText}>Perfect: +60</Text>
            </View>
            <View style={styles.xpItem}>
              <Ionicons name="flame" size={16} color="#FF6B6B" />
              <Text style={styles.xpItemText}>Streak: +10</Text>
            </View>
          </View>
        </View>

        {userTier !== 'vip' && !isAdminPrivilege && (
          <View style={styles.upgradeCTA}>
            <Ionicons name="star" size={24} color="#FFD700" />
            <Text style={styles.upgradeCTATitle}>Unlock All Courses</Text>
            <Text style={styles.upgradeCTAText}>Upgrade to access all academy content</Text>
            <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/subscription')}>
              <Text style={styles.upgradeButtonText}>View Plans</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  scrollView: { flex: 1, padding: 16 },
  welcomeSection: { alignItems: 'center', marginBottom: 24 },
  welcomeIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  welcomeSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  progressCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  progressTitle: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
  progressStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  progressStat: { alignItems: 'center' },
  progressStatValue: { fontSize: 24, fontWeight: 'bold' },
  progressStatLabel: { fontSize: 12, marginTop: 4 },
  progressDivider: { width: 1 },
  progressBarBg: { height: 8, backgroundColor: '#2A2F3E', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#00D4AA', borderRadius: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  categoryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  categoryIconContainer: { width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  categoryContent: { flex: 1 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  categoryTitle: { fontSize: 16, fontWeight: 'bold', marginRight: 8 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  categoryBadgeText: { fontSize: 10, fontWeight: 'bold' },
  categoryDescription: { fontSize: 13, marginBottom: 4 },
  categoryCourseCount: { fontSize: 12, fontWeight: '500' },
  xpCard: { borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 16, borderWidth: 1 },
  xpCardTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  xpItemText: { fontSize: 12, color: '#C0C4CC' },
  upgradeCTA: { backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  upgradeCTATitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF', marginTop: 12, marginBottom: 8 },
  upgradeCTAText: { fontSize: 14, color: '#8A8D98', textAlign: 'center', marginBottom: 16 },
  upgradeButton: { backgroundColor: '#FFD700', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  upgradeButtonText: { fontSize: 14, fontWeight: 'bold', color: '#0A0E17' },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
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

export default function AcademyScreen() {
  const { status: sub, isAdminPrivilege } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState({ completed_lessons: 0, total_lessons: 150, progress_pct: 0 });
  const [animatedWidth] = useState(new Animated.Value(0));

  const userTier = sub?.capability_tier || sub?.subscription || 'free';
  const hasAccess = (req: string) => {
    if (req === 'free') return true;
    if (req === 'premium') return userTier === 'premium' || userTier === 'vip';
    if (req === 'vip') return userTier === 'vip';
    return false;
  };

  const fetchProgress = useCallback(async () => {
    try {
      const { data } = await api.get('/academy/progress');
      setProgress(data);
      Animated.timing(animatedWidth, {
        toValue: data.progress_pct,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchProgress(); }, [fetchProgress]));

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
  progressCard: { borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1 },
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
  upgradeCTA: { backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)' },
  upgradeCTATitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF', marginTop: 12, marginBottom: 8 },
  upgradeCTAText: { fontSize: 14, color: '#8A8D98', textAlign: 'center', marginBottom: 16 },
  upgradeButton: { backgroundColor: '#FFD700', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  upgradeButtonText: { fontSize: 14, fontWeight: 'bold', color: '#0A0E17' },
});

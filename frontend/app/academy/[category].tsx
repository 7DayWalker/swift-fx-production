import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useRewardedAd } from '../../src/components/ads';
import api from '../../src/services/api';
import {
  BEGINNER_COURSES, INTERMEDIATE_COURSES, ADVANCED_COURSES, CourseContent,
} from '../../src/data/academyContent';

const CATEGORY_META: Record<string, { title: string; color: string; icon: string; requiredRole: 'free' | 'premium' | 'vip' }> = {
  beginner:     { title: 'Beginner',     color: '#00D4AA', icon: 'school-outline',       requiredRole: 'free' },
  intermediate: { title: 'Intermediate', color: '#FFD700', icon: 'trending-up-outline',  requiredRole: 'premium' },
  advanced:     { title: 'Advanced',     color: '#FF6B6B', icon: 'rocket-outline',       requiredRole: 'vip' },
};

function getCourses(category: string): CourseContent[] {
  switch (category) {
    case 'beginner': return BEGINNER_COURSES;
    case 'intermediate': return INTERMEDIATE_COURSES;
    case 'advanced': return ADVANCED_COURSES;
    default: return [];
  }
}

interface ProgressData {
  by_course: Record<string, (number | string)[]>;
}

export default function CourseListScreen() {
  const { status: sub, isAdminPrivilege } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category } = useLocalSearchParams<{ category: string }>();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  const meta = CATEGORY_META[category || 'beginner'] || CATEGORY_META.beginner;
  const courses = getCourses(category || 'beginner');

  const userTier = sub?.capability_tier || sub?.subscription || 'free';
  const isFree = userTier === 'free';
  const { showRewardedAd, isAdReady, adFailed, retryLoadAd } = useRewardedAd();
  const [adUnlocked, setAdUnlocked] = useState(false);
  const [adLoading, setAdLoading] = useState(false);

  const hasAccess = () => {
    if (isAdminPrivilege) return true;
    if (adUnlocked) return true;
    const req = meta.requiredRole;
    if (req === 'free') return true;
    if (req === 'premium') return userTier === 'premium' || userTier === 'vip';
    if (req === 'vip') return userTier === 'vip';
    return false;
  };

  const handleWatchAdToUnlock = async () => {
    if (adFailed) {
      retryLoadAd();
      return;
    }
    setAdLoading(true);
    try {
      const rewarded = await showRewardedAd();
      if (rewarded) {
        setAdUnlocked(true);
        Alert.alert('Unlocked!', `You now have temporary access to ${meta.title} courses for this session.`);
      } else {
        Alert.alert('Ad Not Available', 'Please try again in a moment.');
      }
    } catch {
      Alert.alert('Error', 'Failed to load the ad. Please try again.');
    } finally {
      setAdLoading(false);
    }
  };

  const fetchProgress = useCallback(async () => {
    try {
      const { data } = await api.get('/academy/progress');
      if (data && data.by_course && typeof data.by_course === 'object') {
        setProgress(data);
      }
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchProgress(); }, [fetchProgress]));

  if (!hasAccess()) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{meta.title} Courses</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.lockedContainer}>
          <View style={[styles.lockedIcon, { backgroundColor: `${meta.color}20` }]}>
            <Ionicons name="lock-closed" size={40} color={meta.color} />
          </View>
          <Text style={[styles.lockedTitle, { color: theme.text }]}>Content Locked</Text>
          <Text style={[styles.lockedSubtext, { color: theme.textSecondary }]}>
            Upgrade to {meta.requiredRole.toUpperCase()} to access {meta.title.toLowerCase()} courses
          </Text>
          <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: meta.color }]} onPress={() => router.push('/subscription')}>
            <Text style={styles.upgradeBtnText}>View Plans</Text>
          </TouchableOpacity>
          <Text style={[styles.lockedDivider, { color: theme.textSecondary }]}>or</Text>
          <TouchableOpacity
            style={[styles.watchAdBtn, { borderColor: meta.color }, (!isAdReady && !adLoading && !adFailed) && { opacity: 0.5 }]}
            onPress={handleWatchAdToUnlock}
            disabled={adLoading || (!isAdReady && !adFailed)}
            data-testid="watch-ad-unlock-btn"
          >
            <Ionicons
              name={adFailed ? 'refresh-outline' : 'play-circle-outline'}
              size={18}
              color={meta.color}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.watchAdBtnText, { color: meta.color }]}>
              {adLoading ? 'Loading Ad...' : adFailed ? 'Tap to Retry Loading Ad' : isAdReady ? 'Watch Ad to Unlock' : 'Ad Loading...'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const getCourseProgress = (courseId: string, totalLessons: number) => {
    const completed = (progress?.by_course?.[courseId] || []).length;
    const pct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
    return { completed, total: totalLessons, pct, isComplete: completed >= totalLessons };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{meta.title} Courses</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category Banner */}
      <View style={[styles.banner, { backgroundColor: `${meta.color}12` }]}>
        <View style={[styles.bannerIcon, { backgroundColor: `${meta.color}25` }]}>
          <Ionicons name={meta.icon as any} size={24} color={meta.color} />
        </View>
        <View style={styles.bannerInfo}>
          <Text style={[styles.bannerTitle, { color: theme.text }]}>{meta.title} Level</Text>
          <Text style={[styles.bannerCount, { color: theme.textSecondary }]}>{courses.length} courses available</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
        {loading && courses.length > 0 && (
          <View style={styles.skeletonWrap}>
            {[1, 2, 3].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: theme.surface }]} />)}
          </View>
        )}

        {courses.map((course) => {
          const prog = getCourseProgress(course.id, course.lessons.length);
          const isComplete = prog.isComplete;
          return (
            <TouchableOpacity
              key={course.id}
              style={[styles.courseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => router.push(`/academy/lesson?category=${category}&course=${course.id}`)}
              data-testid={`course-card-${course.id}`}
            >
              <View style={[styles.courseIcon, { backgroundColor: `${meta.color}18` }]}>
                {isComplete ? (
                  <Ionicons name="checkmark-circle" size={26} color="#00D4AA" />
                ) : (
                  <Ionicons name="book-outline" size={24} color={meta.color} />
                )}
              </View>
              <View style={styles.courseContent}>
                <View style={styles.courseRow}>
                  <Text style={[styles.courseTitle, { color: theme.text }]} numberOfLines={1}>{course.title}</Text>
                  {isComplete && (
                    <View style={styles.completeBadge}>
                      <Text style={styles.completeBadgeText}>DONE</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.courseDesc, { color: theme.textSecondary }]} numberOfLines={1}>{course.description}</Text>
                <View style={styles.courseMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="play-circle-outline" size={13} color={theme.textSecondary} />
                    <Text style={[styles.metaText, { color: theme.textSecondary }]}>{course.lessons.length} lessons</Text>
                  </View>
                  <Text style={[styles.metaText, { color: meta.color }]}>
                    {prog.completed}/{prog.total} completed
                  </Text>
                </View>
                {/* Progress Bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${prog.pct}%`, backgroundColor: isComplete ? '#00D4AA' : meta.color }]} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  banner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 12 },
  bannerIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  bannerInfo: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: 'bold' },
  bannerCount: { fontSize: 13, marginTop: 2 },
  scroll: { flex: 1, padding: 16 },
  courseCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  courseIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  courseContent: { flex: 1 },
  courseRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  courseTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  courseDesc: { fontSize: 13, marginBottom: 6 },
  courseMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, marginLeft: 4 },
  progressBarBg: { height: 4, backgroundColor: '#2A2F3E', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2 },
  completeBadge: { backgroundColor: '#00D4AA20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  completeBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#00D4AA' },
  lockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockedIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lockedTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  lockedSubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  upgradeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  upgradeBtnText: { fontSize: 14, fontWeight: 'bold', color: '#0A0E17' },
  lockedDivider: { fontSize: 13, marginVertical: 12 },
  watchAdBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5 },
  watchAdBtnText: { fontSize: 14, fontWeight: '600' },
  skeletonWrap: { gap: 10 },
  skeleton: { height: 90, borderRadius: 14 },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

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
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'Master the fundamentals of trading',
    icon: 'school-outline',
    courseCount: 8,
    color: '#00D4AA',
    requiredRole: 'free',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Advanced strategies and analysis',
    icon: 'trending-up-outline',
    courseCount: 12,
    color: '#FFD700',
    requiredRole: 'premium',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'Professional trading techniques',
    icon: 'rocket-outline',
    courseCount: 10,
    color: '#FF6B6B',
    requiredRole: 'vip',
  },
];

export default function AcademyScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const hasAccess = (requiredRole: string) => {
    if (!user) return false;
    if (requiredRole === 'free') return true;
    if (requiredRole === 'premium') return user.role === 'premium' || user.role === 'vip';
    if (requiredRole === 'vip') return user.role === 'vip';
    return false;
  };

  const getAccessBadge = (requiredRole: string) => {
    if (requiredRole === 'free') return null;
    if (requiredRole === 'premium') return 'PREMIUM';
    if (requiredRole === 'vip') return 'VIP';
    return null;
  };

  const handleCategoryPress = (category: Category) => {
    if (hasAccess(category.requiredRole)) {
      router.push(`/academy/${category.id}`);
    } else {
      // Redirect to subscription page for locked content
      router.push('/subscription');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeIcon}>
            <Ionicons name="school" size={32} color="#00D4AA" />
          </View>
          <Text style={styles.welcomeTitle}>Trading Academy</Text>
          <Text style={styles.welcomeSubtitle}>
            Learn to trade with our comprehensive courses designed for all skill levels
          </Text>
        </View>

        {/* User Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Ionicons name="trophy-outline" size={20} color="#FFD700" />
            <Text style={styles.progressTitle}>Your Progress</Text>
          </View>
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatValue}>0</Text>
              <Text style={styles.progressStatLabel}>Completed</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressStat}>
              <Text style={styles.progressStatValue}>30</Text>
              <Text style={styles.progressStatLabel}>Total Lessons</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressStat}>
              <Text style={styles.progressStatValue}>0%</Text>
              <Text style={styles.progressStatLabel}>Progress</Text>
            </View>
          </View>
        </View>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Course Categories</Text>

        {CATEGORIES.map((category) => {
          const locked = !hasAccess(category.requiredRole);
          const badge = getAccessBadge(category.requiredRole);

          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.categoryCard, locked && styles.categoryCardLocked]}
              onPress={() => handleCategoryPress(category)}
            >
              <View style={[styles.categoryIconContainer, { backgroundColor: `${category.color}20` }]}>
                <Ionicons 
                  name={category.icon as any} 
                  size={28} 
                  color={locked ? '#8A8D98' : category.color} 
                />
              </View>
              <View style={styles.categoryContent}>
                <View style={styles.categoryHeader}>
                  <Text style={[styles.categoryTitle, locked && styles.categoryTitleLocked]}>
                    {category.title}
                  </Text>
                  {badge && (
                    <View style={[
                      styles.categoryBadge,
                      { backgroundColor: badge === 'VIP' ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0, 212, 170, 0.2)' }
                    ]}>
                      <Text style={[
                        styles.categoryBadgeText,
                        { color: badge === 'VIP' ? '#FFD700' : '#00D4AA' }
                      ]}>
                        {badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.categoryDescription, locked && styles.categoryDescriptionLocked]}>
                  {category.description}
                </Text>
                <Text style={styles.categoryCourseCount}>
                  {category.courseCount} courses
                </Text>
              </View>
              <View style={styles.categoryAction}>
                {locked ? (
                  <Ionicons name="lock-closed" size={20} color="#8A8D98" />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color="#8A8D98" />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Upgrade CTA for non-VIP users */}
        {user?.role !== 'vip' && (
          <View style={styles.upgradeCTA}>
            <Ionicons name="star" size={24} color="#FFD700" />
            <Text style={styles.upgradeCTATitle}>Unlock All Courses</Text>
            <Text style={styles.upgradeCTAText}>
              Upgrade to {user?.role === 'free' ? 'Premium or VIP' : 'VIP'} to access all academy content
            </Text>
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.upgradeButtonText}>View Plans</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressStat: {
    alignItems: 'center',
  },
  progressStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  progressStatLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  progressDivider: {
    width: 1,
    backgroundColor: '#2A2F3E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  categoryCardLocked: {
    opacity: 0.6,
  },
  categoryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryContent: {
    flex: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 8,
  },
  categoryTitleLocked: {
    color: '#8A8D98',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  categoryDescription: {
    fontSize: 13,
    color: '#8A8D98',
    marginBottom: 4,
  },
  categoryDescriptionLocked: {
    color: '#6B7280',
  },
  categoryCourseCount: {
    fontSize: 12,
    color: '#00D4AA',
    fontWeight: '500',
  },
  categoryAction: {
    marginLeft: 12,
  },
  upgradeCTA: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  upgradeCTATitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 8,
  },
  upgradeCTAText: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
});

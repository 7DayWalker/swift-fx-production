import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

interface Course {
  id: string;
  title: string;
  description: string;
  lessonCount: number;
  duration: string;
  icon: string;
}

const COURSES_DATA: Record<string, { title: string; color: string; courses: Course[] }> = {
  beginner: {
    title: 'Beginner',
    color: '#00D4AA',
    courses: [
      { id: 'intro-trading', title: 'Introduction to Trading', description: 'Learn the basics of financial markets', lessonCount: 5, duration: '45 min', icon: 'book-outline' },
      { id: 'chart-basics', title: 'Chart Reading Basics', description: 'Understanding candlesticks and patterns', lessonCount: 6, duration: '50 min', icon: 'bar-chart-outline' },
      { id: 'risk-management', title: 'Risk Management 101', description: 'Protect your capital effectively', lessonCount: 4, duration: '35 min', icon: 'shield-outline' },
      { id: 'trading-psychology', title: 'Trading Psychology', description: 'Master your emotions', lessonCount: 5, duration: '40 min', icon: 'brain-outline' },
      { id: 'forex-basics', title: 'Forex Fundamentals', description: 'Currency pairs and market structure', lessonCount: 6, duration: '55 min', icon: 'cash-outline' },
      { id: 'crypto-intro', title: 'Crypto Trading Intro', description: 'Getting started with cryptocurrencies', lessonCount: 4, duration: '30 min', icon: 'logo-bitcoin' },
      { id: 'gold-trading', title: 'Gold Trading Basics', description: 'Trading precious metals', lessonCount: 3, duration: '25 min', icon: 'diamond-outline' },
      { id: 'first-trade', title: 'Your First Trade', description: 'Step-by-step guide to execution', lessonCount: 4, duration: '35 min', icon: 'rocket-outline' },
    ],
  },
  intermediate: {
    title: 'Intermediate',
    color: '#FFD700',
    courses: [
      { id: 'technical-analysis', title: 'Technical Analysis', description: 'Advanced chart patterns and indicators', lessonCount: 8, duration: '75 min', icon: 'analytics-outline' },
      { id: 'support-resistance', title: 'Support & Resistance', description: 'Key levels and price action', lessonCount: 5, duration: '45 min', icon: 'git-compare-outline' },
      { id: 'fibonacci', title: 'Fibonacci Trading', description: 'Retracements and extensions', lessonCount: 4, duration: '40 min', icon: 'infinite-outline' },
      { id: 'moving-averages', title: 'Moving Averages Mastery', description: 'MA strategies and crossovers', lessonCount: 5, duration: '50 min', icon: 'trending-up-outline' },
      { id: 'rsi-macd', title: 'RSI & MACD Strategies', description: 'Momentum indicators deep dive', lessonCount: 6, duration: '55 min', icon: 'pulse-outline' },
      { id: 'breakout-trading', title: 'Breakout Trading', description: 'Catching explosive moves', lessonCount: 4, duration: '35 min', icon: 'flash-outline' },
      { id: 'trend-trading', title: 'Trend Trading Strategies', description: 'Ride the trend to profits', lessonCount: 6, duration: '60 min', icon: 'arrow-up-outline' },
      { id: 'swing-trading', title: 'Swing Trading', description: 'Multi-day position strategies', lessonCount: 5, duration: '50 min', icon: 'swap-horizontal-outline' },
      { id: 'backtesting', title: 'Backtesting Strategies', description: 'Test before you trade', lessonCount: 4, duration: '40 min', icon: 'time-outline' },
      { id: 'trade-management', title: 'Trade Management', description: 'Entries, exits, and scaling', lessonCount: 5, duration: '45 min', icon: 'settings-outline' },
      { id: 'news-trading', title: 'News Trading', description: 'Trading economic events', lessonCount: 4, duration: '35 min', icon: 'newspaper-outline' },
      { id: 'correlation', title: 'Market Correlation', description: 'Understanding market relationships', lessonCount: 3, duration: '30 min', icon: 'link-outline' },
    ],
  },
  advanced: {
    title: 'Advanced',
    color: '#FF6B6B',
    courses: [
      { id: 'institutional', title: 'Institutional Trading', description: 'Trade like the banks', lessonCount: 8, duration: '80 min', icon: 'business-outline' },
      { id: 'order-flow', title: 'Order Flow Analysis', description: 'Reading the market depth', lessonCount: 6, duration: '65 min', icon: 'layers-outline' },
      { id: 'smart-money', title: 'Smart Money Concepts', description: 'Following institutional footprints', lessonCount: 7, duration: '70 min', icon: 'eye-outline' },
      { id: 'liquidity', title: 'Liquidity Trading', description: 'Understanding market liquidity', lessonCount: 5, duration: '50 min', icon: 'water-outline' },
      { id: 'market-structure', title: 'Market Structure Analysis', description: 'Advanced price action', lessonCount: 6, duration: '60 min', icon: 'construct-outline' },
      { id: 'algorithmic', title: 'Algorithmic Trading Intro', description: 'Automated trading basics', lessonCount: 5, duration: '55 min', icon: 'code-outline' },
      { id: 'portfolio', title: 'Portfolio Management', description: 'Diversification strategies', lessonCount: 4, duration: '45 min', icon: 'briefcase-outline' },
      { id: 'options', title: 'Options Trading', description: 'Derivatives and hedging', lessonCount: 6, duration: '65 min', icon: 'options-outline' },
      { id: 'intermarket', title: 'Intermarket Analysis', description: 'Cross-market correlations', lessonCount: 4, duration: '40 min', icon: 'globe-outline' },
      { id: 'pro-psychology', title: 'Pro Trading Psychology', description: 'Elite mental performance', lessonCount: 5, duration: '50 min', icon: 'fitness-outline' },
    ],
  },
};

export default function CourseListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category } = useLocalSearchParams<{ category: string }>();

  const categoryData = COURSES_DATA[category || 'beginner'];

  if (!categoryData) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Category not found</Text>
      </SafeAreaView>
    );
  }

  const handleCoursePress = (courseId: string) => {
    router.push(`/academy/lesson?category=${category}&course=${courseId}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{categoryData.title} Courses</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category Info */}
      <View style={[styles.categoryBanner, { backgroundColor: `${categoryData.color}15` }]}>
        <View style={[styles.categoryIcon, { backgroundColor: `${categoryData.color}30` }]}>
          <Ionicons 
            name={category === 'beginner' ? 'school-outline' : category === 'intermediate' ? 'trending-up-outline' : 'rocket-outline'} 
            size={24} 
            color={categoryData.color} 
          />
        </View>
        <View style={styles.categoryInfo}>
          <Text style={styles.categoryTitle}>{categoryData.title} Level</Text>
          <Text style={styles.categoryCount}>{categoryData.courses.length} courses available</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {categoryData.courses.map((course, index) => (
          <TouchableOpacity
            key={course.id}
            style={styles.courseCard}
            onPress={() => handleCoursePress(course.id)}
          >
            <View style={[styles.courseIcon, { backgroundColor: `${categoryData.color}20` }]}>
              <Ionicons name={course.icon as any} size={24} color={categoryData.color} />
            </View>
            <View style={styles.courseContent}>
              <Text style={styles.courseTitle}>{course.title}</Text>
              <Text style={styles.courseDescription}>{course.description}</Text>
              <View style={styles.courseMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="play-circle-outline" size={14} color="#8A8D98" />
                  <Text style={styles.metaText}>{course.lessonCount} lessons</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#8A8D98" />
                  <Text style={styles.metaText}>{course.duration}</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8A8D98" />
          </TouchableOpacity>
        ))}
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
  categoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  categoryCount: {
    fontSize: 13,
    color: '#8A8D98',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  courseContent: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  courseDescription: {
    fontSize: 13,
    color: '#8A8D98',
    marginBottom: 8,
  },
  courseMeta: {
    flexDirection: 'row',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    fontSize: 12,
    color: '#8A8D98',
    marginLeft: 4,
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 50,
  },
});

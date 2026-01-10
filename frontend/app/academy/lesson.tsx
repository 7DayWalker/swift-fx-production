import React, { useState } from 'react';
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

interface Lesson {
  id: number;
  title: string;
  duration: string;
  type: 'video' | 'text' | 'quiz';
}

const COURSE_LESSONS: Record<string, { title: string; lessons: Lesson[] }> = {
  'intro-trading': {
    title: 'Introduction to Trading',
    lessons: [
      { id: 1, title: 'What is Trading?', duration: '8 min', type: 'video' },
      { id: 2, title: 'Types of Financial Markets', duration: '10 min', type: 'video' },
      { id: 3, title: 'Understanding Market Participants', duration: '7 min', type: 'text' },
      { id: 4, title: 'How Prices Move', duration: '12 min', type: 'video' },
      { id: 5, title: 'Knowledge Check', duration: '5 min', type: 'quiz' },
    ],
  },
  'chart-basics': {
    title: 'Chart Reading Basics',
    lessons: [
      { id: 1, title: 'Introduction to Charts', duration: '6 min', type: 'video' },
      { id: 2, title: 'Candlestick Anatomy', duration: '10 min', type: 'video' },
      { id: 3, title: 'Common Candlestick Patterns', duration: '12 min', type: 'video' },
      { id: 4, title: 'Timeframes Explained', duration: '8 min', type: 'text' },
      { id: 5, title: 'Reading Price Action', duration: '10 min', type: 'video' },
      { id: 6, title: 'Pattern Recognition Quiz', duration: '5 min', type: 'quiz' },
    ],
  },
};

// Default lesson structure for courses without specific lessons
const DEFAULT_LESSONS: Lesson[] = [
  { id: 1, title: 'Introduction', duration: '8 min', type: 'video' },
  { id: 2, title: 'Core Concepts', duration: '12 min', type: 'video' },
  { id: 3, title: 'Practical Application', duration: '10 min', type: 'text' },
  { id: 4, title: 'Advanced Techniques', duration: '15 min', type: 'video' },
  { id: 5, title: 'Final Assessment', duration: '5 min', type: 'quiz' },
];

export default function LessonScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category: string; course: string }>();
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
  const [showContent, setShowContent] = useState(false);

  const courseData = COURSE_LESSONS[params.course || ''] || {
    title: params.course?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Course',
    lessons: DEFAULT_LESSONS,
  };

  const getCategoryColor = () => {
    switch (params.category) {
      case 'beginner': return '#00D4AA';
      case 'intermediate': return '#FFD700';
      case 'advanced': return '#FF6B6B';
      default: return '#00D4AA';
    }
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case 'video': return 'play-circle-outline';
      case 'text': return 'document-text-outline';
      case 'quiz': return 'help-circle-outline';
      default: return 'play-circle-outline';
    }
  };

  const handleLessonPress = (lessonId: number) => {
    setSelectedLesson(lessonId);
    setShowContent(true);
  };

  const color = getCategoryColor();

  // Content view for selected lesson
  if (showContent && selectedLesson) {
    const lesson = courseData.lessons.find(l => l.id === selectedLesson);
    
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => setShowContent(false)}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {lesson?.title || 'Lesson'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          {/* Placeholder Video/Content Area */}
          <View style={[styles.contentPlaceholder, { borderColor: color }]}>
            <View style={[styles.playButton, { backgroundColor: `${color}30` }]}>
              <Ionicons 
                name={getLessonIcon(lesson?.type || 'video')} 
                size={48} 
                color={color} 
              />
            </View>
            <Text style={styles.placeholderText}>
              {lesson?.type === 'video' ? 'Video Content' : lesson?.type === 'quiz' ? 'Quiz' : 'Reading Material'}
            </Text>
            <Text style={styles.placeholderSubtext}>{lesson?.duration}</Text>
          </View>

          {/* Lesson Info */}
          <View style={styles.lessonInfo}>
            <Text style={styles.lessonTitle}>{lesson?.title}</Text>
            <View style={styles.lessonMeta}>
              <View style={[styles.typeBadge, { backgroundColor: `${color}20` }]}>
                <Ionicons name={getLessonIcon(lesson?.type || 'video')} size={14} color={color} />
                <Text style={[styles.typeBadgeText, { color }]}>
                  {lesson?.type?.charAt(0).toUpperCase() + lesson?.type?.slice(1)}
                </Text>
              </View>
              <Text style={styles.durationText}>{lesson?.duration}</Text>
            </View>
          </View>

          {/* Placeholder Content */}
          <View style={styles.contentSection}>
            <Text style={styles.sectionTitle}>Lesson Overview</Text>
            <Text style={styles.contentText}>
              This is placeholder content for the lesson. In a production app, this would contain:
            </Text>
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={[styles.bullet, { backgroundColor: color }]} />
                <Text style={styles.bulletText}>
                  {lesson?.type === 'video' ? 'Embedded video player with progress tracking' : 
                   lesson?.type === 'quiz' ? 'Interactive quiz questions' : 
                   'Rich text content with images'}
                </Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={[styles.bullet, { backgroundColor: color }]} />
                <Text style={styles.bulletText}>Key takeaways and learning objectives</Text>
              </View>
              <View style={styles.bulletItem}>
                <View style={[styles.bullet, { backgroundColor: color }]} />
                <Text style={styles.bulletText}>Downloadable resources and notes</Text>
              </View>
            </View>
          </View>

          {/* Navigation Buttons */}
          <View style={styles.navButtons}>
            {selectedLesson > 1 && (
              <TouchableOpacity 
                style={styles.navButton}
                onPress={() => setSelectedLesson(selectedLesson - 1)}
              >
                <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                <Text style={styles.navButtonText}>Previous</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {selectedLesson < courseData.lessons.length && (
              <TouchableOpacity 
                style={[styles.navButton, styles.navButtonPrimary, { backgroundColor: color }]}
                onPress={() => setSelectedLesson(selectedLesson + 1)}
              >
                <Text style={styles.navButtonTextPrimary}>Next Lesson</Text>
                <Ionicons name="chevron-forward" size={20} color="#0A0E17" />
              </TouchableOpacity>
            )}
            {selectedLesson === courseData.lessons.length && (
              <TouchableOpacity 
                style={[styles.navButton, styles.navButtonPrimary, { backgroundColor: color }]}
                onPress={() => router.back()}
              >
                <Text style={styles.navButtonTextPrimary}>Complete Course</Text>
                <Ionicons name="checkmark" size={20} color="#0A0E17" />
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Lesson list view
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{courseData.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Course Header */}
      <View style={[styles.courseBanner, { backgroundColor: `${color}15` }]}>
        <View style={[styles.courseIconLarge, { backgroundColor: `${color}30` }]}>
          <Ionicons name="book-outline" size={32} color={color} />
        </View>
        <Text style={styles.courseTitleLarge}>{courseData.title}</Text>
        <View style={styles.courseStats}>
          <View style={styles.statItem}>
            <Ionicons name="play-circle-outline" size={16} color="#8A8D98" />
            <Text style={styles.statText}>{courseData.lessons.length} lessons</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={16} color="#8A8D98" />
            <Text style={styles.statText}>
              {courseData.lessons.reduce((acc, l) => acc + parseInt(l.duration), 0)} min
            </Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '0%', backgroundColor: color }]} />
        </View>
        <Text style={styles.progressText}>0% Complete</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Course Content</Text>

        {courseData.lessons.map((lesson, index) => (
          <TouchableOpacity
            key={lesson.id}
            style={styles.lessonCard}
            onPress={() => handleLessonPress(lesson.id)}
          >
            <View style={[styles.lessonNumber, { backgroundColor: `${color}20` }]}>
              <Text style={[styles.lessonNumberText, { color }]}>{index + 1}</Text>
            </View>
            <View style={styles.lessonContent}>
              <Text style={styles.lessonCardTitle}>{lesson.title}</Text>
              <View style={styles.lessonCardMeta}>
                <Ionicons name={getLessonIcon(lesson.type)} size={14} color="#8A8D98" />
                <Text style={styles.lessonCardMetaText}>{lesson.duration}</Text>
              </View>
            </View>
            <Ionicons name="play-circle" size={24} color={color} />
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
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  courseBanner: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  courseIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  courseTitleLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  courseStats: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  statText: {
    fontSize: 13,
    color: '#8A8D98',
    marginLeft: 4,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#2A2F3E',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#8A8D98',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  lessonNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  lessonContent: {
    flex: 1,
  },
  lessonCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  lessonCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lessonCardMetaText: {
    fontSize: 12,
    color: '#8A8D98',
    marginLeft: 4,
  },
  // Content view styles
  contentPlaceholder: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  placeholderSubtext: {
    fontSize: 13,
    color: '#8A8D98',
  },
  lessonInfo: {
    marginBottom: 20,
  },
  lessonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  lessonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  durationText: {
    fontSize: 13,
    color: '#8A8D98',
  },
  contentSection: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  contentText: {
    fontSize: 14,
    color: '#8A8D98',
    lineHeight: 22,
    marginBottom: 16,
  },
  bulletList: {
    gap: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  navButtonPrimary: {
    backgroundColor: '#00D4AA',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  navButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0E17',
    marginRight: 4,
  },
});

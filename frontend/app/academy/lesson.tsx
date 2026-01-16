import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { getCourseContent, LessonContent } from '../../src/data/academyContent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
      { id: 1, title: 'What is Trading?', duration: '5 min', type: 'video' },
      { id: 2, title: 'Types of Financial Markets', duration: '6 min', type: 'video' },
      { id: 3, title: 'Understanding Market Participants', duration: '7 min', type: 'text' },
      { id: 4, title: 'How Prices Move', duration: '5 min', type: 'video' },
      { id: 5, title: 'Course Quiz: Trading Basics', duration: '5 min', type: 'quiz' },
    ],
  },
  'chart-basics': {
    title: 'Chart Reading Basics',
    lessons: [
      { id: 1, title: 'Introduction to Charts', duration: '6 min', type: 'video' },
      { id: 2, title: 'Candlestick Anatomy', duration: '7 min', type: 'video' },
      { id: 3, title: 'Common Candlestick Patterns', duration: '8 min', type: 'video' },
      { id: 4, title: 'Timeframes Explained', duration: '8 min', type: 'text' },
      { id: 5, title: 'Reading Price Action', duration: '6 min', type: 'video' },
      { id: 6, title: 'Chart Patterns Quiz', duration: '5 min', type: 'quiz' },
    ],
  },
  'risk-management': {
    title: 'Risk Management 101',
    lessons: [
      { id: 1, title: 'Why Risk Management Matters', duration: '5 min', type: 'video' },
      { id: 2, title: 'Position Sizing', duration: '6 min', type: 'video' },
      { id: 3, title: 'Stop Losses and Take Profits', duration: '7 min', type: 'video' },
      { id: 4, title: 'The 1% Rule', duration: '7 min', type: 'text' },
      { id: 5, title: 'Risk Management Quiz', duration: '5 min', type: 'quiz' },
    ],
  },
  'trading-psychology': {
    title: 'Trading Psychology',
    lessons: [
      { id: 1, title: 'The Trader\'s Mindset', duration: '6 min', type: 'video' },
      { id: 2, title: 'Fear and Greed', duration: '5 min', type: 'video' },
      { id: 3, title: 'Dealing with Losses', duration: '8 min', type: 'text' },
      { id: 4, title: 'Building Discipline', duration: '6 min', type: 'video' },
      { id: 5, title: 'Psychology Quiz', duration: '5 min', type: 'quiz' },
    ],
  },
  'forex-basics': {
    title: 'Forex Fundamentals',
    lessons: [
      { id: 1, title: 'What is Forex?', duration: '5 min', type: 'video' },
      { id: 2, title: 'Currency Pairs Explained', duration: '6 min', type: 'video' },
      { id: 3, title: 'Pips, Lots, and Leverage', duration: '7 min', type: 'video' },
      { id: 4, title: 'What Moves Currency Prices', duration: '10 min', type: 'text' },
      { id: 5, title: 'Forex Trading Sessions', duration: '5 min', type: 'video' },
      { id: 6, title: 'Forex Fundamentals Quiz', duration: '5 min', type: 'quiz' },
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

// Quiz Answer Component
interface QuizQuestionProps {
  question: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
  questionNumber: number;
  color: string;
}

function QuizQuestion({ question, questionNumber, color }: QuizQuestionProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const handleSelectAnswer = (index: number) => {
    setSelectedAnswer(index);
    setShowExplanation(true);
  };

  const isCorrect = selectedAnswer === question.correctIndex;

  return (
    <View style={styles.quizQuestion}>
      <Text style={styles.questionNumber}>Question {questionNumber}</Text>
      <Text style={styles.questionText}>{question.question}</Text>
      
      <View style={styles.optionsContainer}>
        {question.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          const isCorrectOption = index === question.correctIndex;
          
          let optionStyle = styles.optionButton;
          let textStyle = styles.optionText;
          
          if (showExplanation) {
            if (isCorrectOption) {
              optionStyle = { ...styles.optionButton, ...styles.optionCorrect };
              textStyle = { ...styles.optionText, color: '#00D4AA' };
            } else if (isSelected && !isCorrectOption) {
              optionStyle = { ...styles.optionButton, ...styles.optionWrong };
              textStyle = { ...styles.optionText, color: '#FF6B6B' };
            }
          } else if (isSelected) {
            optionStyle = { ...styles.optionButton, borderColor: color, borderWidth: 2 };
          }

          return (
            <TouchableOpacity
              key={index}
              style={optionStyle}
              onPress={() => handleSelectAnswer(index)}
              disabled={showExplanation}
            >
              <View style={[styles.optionLetter, { backgroundColor: showExplanation && isCorrectOption ? '#00D4AA20' : `${color}20` }]}>
                <Text style={[styles.optionLetterText, { color: showExplanation && isCorrectOption ? '#00D4AA' : color }]}>
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <Text style={textStyle}>{option}</Text>
              {showExplanation && isCorrectOption && (
                <Ionicons name="checkmark-circle" size={20} color="#00D4AA" style={{ marginLeft: 'auto' }} />
              )}
              {showExplanation && isSelected && !isCorrectOption && (
                <Ionicons name="close-circle" size={20} color="#FF6B6B" style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {showExplanation && (
        <View style={[styles.explanationBox, { borderLeftColor: isCorrect ? '#00D4AA' : '#FFD700' }]}>
          <View style={styles.explanationHeader}>
            <Ionicons 
              name={isCorrect ? "checkmark-circle" : "information-circle"} 
              size={18} 
              color={isCorrect ? '#00D4AA' : '#FFD700'} 
            />
            <Text style={[styles.explanationTitle, { color: isCorrect ? '#00D4AA' : '#FFD700' }]}>
              {isCorrect ? 'Correct!' : 'Explanation'}
            </Text>
          </View>
          <Text style={styles.explanationText}>{question.explanation}</Text>
        </View>
      )}
    </View>
  );
}

// Embedded YouTube Player Component
interface YouTubePlayerProps {
  videoId: string;
  color: string;
}

function YouTubePlayer({ videoId, color }: YouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const embedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #1A1F2E; }
          .video-container {
            position: relative;
            width: 100%;
            padding-bottom: 56.25%;
            height: 0;
            overflow: hidden;
          }
          .video-container iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: 0;
          }
        </style>
      </head>
      <body>
        <div class="video-container">
          <iframe 
            src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&autoplay=1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
      </body>
    </html>
  `;

  if (!isPlaying) {
    return (
      <TouchableOpacity 
        style={[styles.videoThumbnail, { borderColor: color }]}
        onPress={() => setIsPlaying(true)}
        activeOpacity={0.9}
      >
        <View style={styles.thumbnailOverlay}>
          <View style={[styles.playButtonLarge, { backgroundColor: `${color}` }]}>
            <Ionicons name="play" size={32} color="#0A0E17" style={{ marginLeft: 4 }} />
          </View>
          <Text style={styles.tapToPlay}>Tap to play video</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.videoContainer}>
      <WebView
        source={{ html: embedHtml }}
        style={styles.webview}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
      />
    </View>
  );
}

export default function LessonScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category: string; course: string }>();
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
  const [showContent, setShowContent] = useState(false);

  const courseData = COURSE_LESSONS[params.course || ''] || {
    title: params.course?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Course',
    lessons: DEFAULT_LESSONS,
  };

  // Get populated content from academyContent.ts
  const courseContent = getCourseContent(params.course || '');

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
    const lessonContent = courseContent?.lessons.find(l => l.id === selectedLesson);
    const isQuiz = lesson?.type === 'quiz';
    
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
          {/* Video Player - Embedded */}
          {lesson?.type === 'video' && lessonContent?.youtubeId && (
            <YouTubePlayer videoId={lessonContent.youtubeId} color={color} />
          )}

          {/* Text Lesson Icon */}
          {lesson?.type === 'text' && (
            <View style={[styles.textLessonHeader, { backgroundColor: `${color}15` }]}>
              <View style={[styles.textIcon, { backgroundColor: `${color}30` }]}>
                <Ionicons name="document-text" size={32} color={color} />
              </View>
              <Text style={styles.textLessonLabel}>Reading Material</Text>
            </View>
          )}

          {/* Quiz Header */}
          {isQuiz && (
            <View style={[styles.quizHeader, { backgroundColor: `${color}15` }]}>
              <View style={[styles.quizIcon, { backgroundColor: `${color}30` }]}>
                <Ionicons name="help-circle" size={32} color={color} />
              </View>
              <Text style={styles.quizTitle}>Knowledge Check</Text>
              <Text style={styles.quizSubtitle}>Test your understanding of this course</Text>
            </View>
          )}

          {/* Lesson Info */}
          {!isQuiz && (
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
          )}

          {/* Quiz Questions */}
          {isQuiz && lessonContent?.quizQuestions && (
            <View style={styles.quizContainer}>
              {lessonContent.quizQuestions.map((q, index) => (
                <QuizQuestion 
                  key={index} 
                  question={q} 
                  questionNumber={index + 1}
                  color={color}
                />
              ))}
            </View>
          )}

          {/* Lesson Overview (non-quiz) */}
          {!isQuiz && lessonContent?.overview && (
            <View style={styles.contentSection}>
              <Text style={styles.sectionTitle}>Lesson Overview</Text>
              <Text style={styles.overviewText}>{lessonContent.overview}</Text>
            </View>
          )}

          {/* Key Takeaways (non-quiz) */}
          {!isQuiz && lessonContent?.keyTakeaways && lessonContent.keyTakeaways.length > 0 && (
            <View style={styles.contentSection}>
              <Text style={styles.sectionTitle}>Key Takeaways</Text>
              <View style={styles.bulletList}>
                {lessonContent.keyTakeaways.map((takeaway, index) => (
                  <View key={index} style={styles.bulletItem}>
                    <View style={[styles.bullet, { backgroundColor: color }]} />
                    <Text style={styles.bulletText}>{takeaway}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

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
            <Ionicons 
              name={lesson.type === 'quiz' ? 'help-circle' : 'play-circle'} 
              size={24} 
              color={color} 
            />
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
  // Video player styles
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#1A1F2E',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1A1F2E',
  },
  videoThumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: '#1A1F2E',
    marginBottom: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbnailOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButtonLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tapToPlay: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  // Text lesson styles
  textLessonHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  textIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  textLessonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Quiz styles
  quizHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  quizIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quizTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  quizSubtitle: {
    fontSize: 14,
    color: '#8A8D98',
  },
  quizContainer: {
    gap: 24,
  },
  quizQuestion: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8D98',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
    lineHeight: 24,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0E17',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  optionCorrect: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderColor: '#00D4AA',
  },
  optionWrong: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
  },
  optionLetter: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionLetterText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  explanationBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#0A0E17',
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  explanationText: {
    fontSize: 13,
    color: '#C0C4CC',
    lineHeight: 20,
  },
  // Content styles
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
    marginBottom: 16,
  },
  overviewText: {
    fontSize: 14,
    color: '#C0C4CC',
    lineHeight: 24,
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
    marginTop: 7,
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
    marginTop: 8,
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

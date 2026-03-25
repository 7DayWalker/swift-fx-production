import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';
import { getCourseContent, LessonContent, CourseContent } from '../../src/data/academyContent';

// ─── Category color helper ───
const getCategoryColor = (cat: string) => {
  switch (cat) {
    case 'beginner': return '#00D4AA';
    case 'intermediate': return '#FFD700';
    case 'advanced': return '#FF6B6B';
    default: return '#00D4AA';
  }
};

const CATEGORY_REQUIRED_ROLE: Record<string, 'free' | 'premium' | 'vip'> = {
  beginner: 'free', intermediate: 'premium', advanced: 'vip',
};

// ─── Coming Soon Video Banner ───
function ComingSoonBanner({ color }: { color: string }) {
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <View style={[cs.banner, { borderColor: `${color}40` }]}>
      <View style={[cs.bannerGrad, { backgroundColor: `${color}12` }]}>
        <Animated.View style={{ opacity: pulseAnim }}>
          <Ionicons name="sparkles" size={36} color={color} />
        </Animated.View>
        <Text style={[cs.bannerTitle, { color }]}>Premium Video Lesson Coming Soon</Text>
        <Text style={cs.bannerSub}>Professional video lessons will be added soon</Text>
      </View>
    </View>
  );
}
const cs = StyleSheet.create({
  banner: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  bannerGrad: { alignItems: 'center', padding: 32 },
  bannerTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 14, textAlign: 'center' },
  bannerSub: { fontSize: 13, color: '#8A8D98', marginTop: 6, textAlign: 'center' },
});

// ─── TTS Player (Built-in expo-speech for Free/Premium) ───
function TTSPlayerBasic({ text, color }: { text: string; color: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const speeds = [0.75, 1.0, 1.25, 1.5];

  const toggle = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      Speech.speak(text, {
        rate: speed,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    }
  };

  const cycleSpeed = () => {
    Speech.stop();
    setSpeaking(false);
    const idx = speeds.indexOf(speed);
    setSpeed(speeds[(idx + 1) % speeds.length]);
  };

  useEffect(() => () => { Speech.stop(); }, []);

  return (
    <View style={[ttsStyles.card, { borderColor: `${color}30` }]} data-testid="tts-player-basic">
      <View style={ttsStyles.row}>
        <TouchableOpacity style={[ttsStyles.playBtn, { backgroundColor: `${color}20` }]} onPress={toggle}>
          <Ionicons name={speaking ? 'pause' : 'play'} size={20} color={color} />
        </TouchableOpacity>
        <View style={ttsStyles.info}>
          <Text style={ttsStyles.label}>Listen to lesson</Text>
          <Text style={ttsStyles.sub}>Built-in Text-to-Speech</Text>
        </View>
        <TouchableOpacity style={ttsStyles.speedBtn} onPress={cycleSpeed}>
          <Text style={[ttsStyles.speedText, { color }]}>{speed}x</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── VIP TTS Player (OpenAI via backend) ───
function TTSPlayerVIP({ courseId, lessonId, text, color }: { courseId: string; lessonId: number; text: string; color: string }) {
  const [loading, setLoading] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [fallback, setFallback] = useState(false);
  const speeds = [0.75, 1.0, 1.25, 1.5];

  const generateAudio = async () => {
    setLoading(true);
    try {
      await api.post('/academy/tts', { course_id: courseId, lesson_id: lessonId, text });
      setAudioReady(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setFallback(true);
    }
    setLoading(false);
  };

  const togglePlay = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      Speech.speak(text, {
        rate: speed,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    }
  };

  const cycleSpeed = () => {
    Speech.stop();
    setSpeaking(false);
    const idx = speeds.indexOf(speed);
    setSpeed(speeds[(idx + 1) % speeds.length]);
  };

  useEffect(() => () => { Speech.stop(); }, []);

  if (fallback) return <TTSPlayerBasic text={text} color={color} />;

  return (
    <View style={[ttsStyles.card, ttsStyles.vipCard, { borderColor: '#FFD70040' }]} data-testid="tts-player-vip">
      <View style={ttsStyles.vipBadgeRow}>
        <Ionicons name="star" size={12} color="#FFD700" />
        <Text style={ttsStyles.vipBadge}>VIP Voice</Text>
      </View>
      <View style={ttsStyles.row}>
        {!audioReady && !loading && (
          <TouchableOpacity style={[ttsStyles.playBtn, { backgroundColor: '#FFD70020' }]} onPress={generateAudio}>
            <Ionicons name="volume-high" size={20} color="#FFD700" />
          </TouchableOpacity>
        )}
        {loading && <ActivityIndicator size="small" color="#FFD700" style={{ marginRight: 12 }} />}
        {audioReady && (
          <TouchableOpacity style={[ttsStyles.playBtn, { backgroundColor: '#FFD70020' }]} onPress={togglePlay}>
            <Ionicons name={speaking ? 'pause' : 'play'} size={20} color="#FFD700" />
          </TouchableOpacity>
        )}
        <View style={ttsStyles.info}>
          <Text style={ttsStyles.label}>{audioReady ? 'AI-Narrated Lesson' : 'Generate AI Narration'}</Text>
          <Text style={ttsStyles.sub}>{loading ? 'Generating...' : audioReady ? 'OpenAI TTS' : 'Tap to generate'}</Text>
        </View>
        {audioReady && (
          <TouchableOpacity style={ttsStyles.speedBtn} onPress={cycleSpeed}>
            <Text style={[ttsStyles.speedText, { color: '#FFD700' }]}>{speed}x</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const ttsStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16, backgroundColor: '#1A1F2E' },
  vipCard: { backgroundColor: '#1A1F2E' },
  vipBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  vipBadge: { fontSize: 11, fontWeight: 'bold', color: '#FFD700', marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  playBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  sub: { fontSize: 12, color: '#8A8D98', marginTop: 2 },
  speedBtn: { backgroundColor: '#2A2F3E', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  speedText: { fontSize: 13, fontWeight: 'bold' },
});

// ─── YouTube Player ───
function YouTubePlayer({ videoId, color }: { videoId: string; color: string }) {
  const [playing, setPlaying] = useState(false);
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#1A1F2E}.vc{position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden}.vc iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}</style></head><body><div class="vc"><iframe src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&autoplay=1" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div></body></html>`;

  if (!playing) {
    return (
      <TouchableOpacity style={[yt.thumb, { borderColor: color }]} onPress={() => setPlaying(true)} activeOpacity={0.9}>
        <View style={yt.overlay}>
          <View style={[yt.playBtn, { backgroundColor: color }]}>
            <Ionicons name="play" size={30} color="#0A0E17" style={{ marginLeft: 3 }} />
          </View>
          <Text style={yt.tapText}>Tap to play video</Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <View style={yt.container}>
      <WebView source={{ html }} style={yt.wv} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled domStorageEnabled scrollEnabled={false} />
    </View>
  );
}
const yt = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', marginBottom: 20, backgroundColor: '#1A1F2E' },
  wv: { flex: 1, backgroundColor: '#1A1F2E' },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#1A1F2E', marginBottom: 20, borderWidth: 2, overflow: 'hidden' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  playBtn: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  tapText: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
});

// ─── Quiz Component ───
function QuizQuestion({ question, num, color, onAnswer }: { question: any; num: number; color: string; onAnswer: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const select = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    onAnswer(idx === question.correctIndex);
    Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={qz.card}>
      <Text style={qz.num}>Question {num}</Text>
      <Text style={qz.text}>{question.question}</Text>
      <View style={qz.opts}>
        {question.options.map((opt: string, i: number) => {
          const isSel = selected === i;
          const isCorr = i === question.correctIndex;
          let bg = '#0A0E17'; let border = '#2A2F3E'; let txtC = '#FFFFFF';
          if (revealed && isCorr) { bg = 'rgba(0,212,170,0.1)'; border = '#00D4AA'; txtC = '#00D4AA'; }
          else if (revealed && isSel && !isCorr) { bg = 'rgba(255,107,107,0.1)'; border = '#FF6B6B'; txtC = '#FF6B6B'; }
          else if (isSel && !revealed) { border = color; }
          return (
            <TouchableOpacity key={i} style={[qz.opt, { backgroundColor: bg, borderColor: border }]} onPress={() => select(i)} disabled={revealed}>
              <View style={[qz.letter, { backgroundColor: revealed && isCorr ? '#00D4AA20' : `${color}20` }]}>
                <Text style={[qz.letterT, { color: revealed && isCorr ? '#00D4AA' : color }]}>{String.fromCharCode(65 + i)}</Text>
              </View>
              <Text style={[qz.optT, { color: txtC }]}>{opt}</Text>
              {revealed && isCorr && <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />}
              {revealed && isSel && !isCorr && <Ionicons name="close-circle" size={20} color="#FF6B6B" />}
            </TouchableOpacity>
          );
        })}
      </View>
      {revealed && (
        <Animated.View style={[qz.explain, { borderLeftColor: selected === question.correctIndex ? '#00D4AA' : '#FFD700', transform: [{ scale: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
          <View style={qz.explainHead}>
            <Ionicons name={selected === question.correctIndex ? 'checkmark-circle' : 'information-circle'} size={16} color={selected === question.correctIndex ? '#00D4AA' : '#FFD700'} />
            <Text style={[qz.explainTitle, { color: selected === question.correctIndex ? '#00D4AA' : '#FFD700' }]}>
              {selected === question.correctIndex ? 'Correct!' : 'Explanation'}
            </Text>
          </View>
          <Text style={qz.explainText}>{question.explanation}</Text>
        </Animated.View>
      )}
    </View>
  );
}
const qz = StyleSheet.create({
  card: { backgroundColor: '#1A1F2E', borderRadius: 12, padding: 16, marginBottom: 16 },
  num: { fontSize: 12, fontWeight: '600', color: '#8A8D98', marginBottom: 6, textTransform: 'uppercase' },
  text: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 14, lineHeight: 24 },
  opts: { gap: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, borderWidth: 1 },
  letter: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  letterT: { fontSize: 14, fontWeight: 'bold' },
  optT: { flex: 1, fontSize: 14 },
  explain: { marginTop: 14, padding: 12, backgroundColor: '#0A0E17', borderRadius: 8, borderLeftWidth: 3 },
  explainHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  explainTitle: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  explainText: { fontSize: 13, color: '#C0C4CC', lineHeight: 20 },
});

// ─── Quiz Result Screen ───
function QuizResult({ score, total, xp, passed, color, onRetry, onBack }: { score: number; total: number; xp: number; passed: boolean; color: string; onRetry: () => void; onBack: () => void }) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    if (Platform.OS !== 'web' && passed) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <Animated.View style={[qr.wrap, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[qr.icon, { backgroundColor: passed ? '#00D4AA20' : '#FF6B6B20' }]}>
        <Ionicons name={passed ? 'trophy' : 'refresh'} size={40} color={passed ? '#FFD700' : '#FF6B6B'} />
      </View>
      <Text style={qr.title}>{passed ? 'Quiz Passed!' : 'Keep Learning'}</Text>
      <Text style={qr.scoreText}>{pct}%</Text>
      <Text style={qr.sub}>{score} / {total} correct</Text>
      {passed && <Text style={qr.xp}>+{xp} XP earned</Text>}
      {!passed && <Text style={qr.hint}>You need 60% to pass. Review the lessons and try again!</Text>}
      <View style={qr.btns}>
        {!passed && (
          <TouchableOpacity style={[qr.btn, { backgroundColor: color }]} onPress={onRetry}>
            <Text style={qr.btnText}>Retry Quiz</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[qr.btn, passed ? { backgroundColor: color } : { backgroundColor: '#2A2F3E' }]} onPress={onBack}>
          <Text style={[qr.btnText, !passed && { color: '#FFFFFF' }]}>Back to Course</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
const qr = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 24 },
  icon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  scoreText: { fontSize: 48, fontWeight: 'bold', color: '#FFD700', marginBottom: 4 },
  sub: { fontSize: 16, color: '#8A8D98', marginBottom: 12 },
  xp: { fontSize: 16, fontWeight: 'bold', color: '#00D4AA', marginBottom: 16 },
  hint: { fontSize: 14, color: '#8A8D98', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  btns: { flexDirection: 'row', gap: 12 },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { fontSize: 14, fontWeight: 'bold', color: '#0A0E17' },
});

// ─── Success Animation with XP ───
function CompletionSuccess({ color, xpData }: { color: string; xpData?: { base_xp: number; bonus_xp: number; total_xp_earned: number; streak_increased: boolean; current_streak: number } | null }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  return (
    <Animated.View style={[succ.wrap, { transform: [{ scale }] }]}>
      <View style={[succ.circle, { backgroundColor: `${color}20`, borderColor: color }]}>
        <Ionicons name="checkmark" size={28} color={color} />
      </View>
      <Text style={[succ.text, { color }]}>Lesson Complete!</Text>
      {xpData && xpData.total_xp_earned > 0 && (
        <View style={succ.xpWrap}>
          <Text style={succ.xpText}>+{xpData.total_xp_earned} XP</Text>
          {xpData.bonus_xp > 0 && (
            <View style={succ.bonusRow}>
              <Ionicons name="flame" size={14} color="#FF8C00" />
              <Text style={succ.bonusText}>+{xpData.bonus_xp} streak bonus</Text>
            </View>
          )}
          {xpData.streak_increased && (
            <View style={succ.bonusRow}>
              <Ionicons name="flame" size={14} color="#FF8C00" />
              <Text style={succ.bonusText}>{xpData.current_streak} day streak!</Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}
const succ = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 12 },
  circle: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 8 },
  text: { fontSize: 15, fontWeight: 'bold' },
  xpWrap: { alignItems: 'center', marginTop: 8 },
  xpText: { fontSize: 20, fontWeight: 'bold', color: '#FFD700' },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bonusText: { fontSize: 12, color: '#FF8C00', fontWeight: '600' },
});

// ═══════════════════════════════════════════════════════════
// MAIN LESSON SCREEN
// ═══════════════════════════════════════════════════════════
export default function LessonScreen() {
  const { status: sub, isAdminPrivilege } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category: string; course: string }>();
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [xpReward, setXpReward] = useState<{ base_xp: number; bonus_xp: number; total_xp_earned: number; streak_increased: boolean; current_streak: number } | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, boolean>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<{ score: number; total: number; xp: number; passed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichedContent, setEnrichedContent] = useState<any>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const category = params.category || 'beginner';
  const courseId = params.course || '';
  const color = getCategoryColor(category);
  const courseContent = getCourseContent(courseId);
  const userTier = sub?.capability_tier || sub?.subscription || 'free';
  const isVip = userTier === 'vip' || isAdminPrivilege;

  // Fetch existing progress
  const fetchProgress = useCallback(async () => {
    try {
      const { data } = await api.get('/academy/progress');
      const done = data.by_course?.[courseId] || [];
      setCompletedLessons(new Set(done.map((id: number | string) => Number(id))));
    } catch {}
    setLoading(false);
  }, [courseId]);

  useFocusEffect(useCallback(() => { fetchProgress(); }, [fetchProgress]));

  // Fetch enriched content when lesson selected
  useEffect(() => {
    if (selectedLesson === null) { setEnrichedContent(null); setContentLoading(false); return; }
    const lesson = courseContent?.lessons.find((l: any) => l.id === selectedLesson);
    if (!lesson || lesson.type === 'quiz') { setContentLoading(false); return; }
    let cancelled = false;
    setContentLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/academy/lesson-content/${courseId}/${selectedLesson}`);
        if (!cancelled && data?.generated) setEnrichedContent(data);
      } catch (err) {
        console.log('[Academy] Content fetch failed, using static content');
      }
      if (!cancelled) setContentLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedLesson, courseId]);

  // Tier access check
  const requiredRole = CATEGORY_REQUIRED_ROLE[category] || 'free';
  const hasAccess = () => {
    if (isAdminPrivilege) return true;
    if (requiredRole === 'free') return true;
    if (requiredRole === 'premium') return userTier === 'premium' || userTier === 'vip';
    if (requiredRole === 'vip') return userTier === 'vip';
    return false;
  };

  if (!hasAccess()) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={s.lockedWrap}>
          <Ionicons name="lock-closed" size={48} color={theme.textSecondary} />
          <Text style={[s.lockedTitle, { color: theme.text }]}>Content Locked</Text>
          <Text style={[s.lockedSub, { color: theme.textSecondary }]}>Upgrade to {requiredRole.toUpperCase()}</Text>
          <TouchableOpacity style={[s.upgradeBtn, { backgroundColor: color }]} onPress={() => router.push('/subscription')}>
            <Text style={s.upgradeBtnText}>View Plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!courseContent) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]}>Course</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.lockedWrap}>
          <Ionicons name="construct-outline" size={48} color={color} />
          <Text style={[s.lockedTitle, { color: theme.text }]}>Coming Soon</Text>
          <Text style={[s.lockedSub, { color: theme.textSecondary }]}>This course content is being prepared</Text>
        </View>
      </SafeAreaView>
    );
  }

  const lessons = courseContent.lessons;
  const isLessonUnlocked = (idx: number) => {
    if (idx === 0) return true;
    const prevLesson = lessons[idx - 1];
    return completedLessons.has(prevLesson.id);
  };

  // ─── Mark Lesson Complete ───
  const markComplete = async (lessonId: number) => {
    if (completedLessons.has(lessonId) || completing) return;
    setCompleting(true);
    try {
      const { data } = await api.post('/academy/lesson-complete', { course_id: courseId, lesson_id: lessonId });
      setCompletedLessons(prev => new Set([...prev, lessonId]));
      if (data?.xp) setXpReward(data.xp);
      setShowSuccess(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => { setShowSuccess(false); setXpReward(null); }, 3000);
    } catch {}
    setCompleting(false);
  };

  // ─── Quiz Submit ───
  const submitQuiz = async (lessonContent: LessonContent) => {
    if (quizSubmitted) return;
    const qs = lessonContent.quizQuestions || [];
    const total = qs.length;
    const correct = Object.values(quizAnswers).filter(Boolean).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = pct >= 60;
    setQuizSubmitted(true);
    try {
      const { data } = await api.post('/academy/quiz-submit', { course_id: courseId, lesson_id: lessonContent.id, score: pct });
      const totalXp = data?.xp?.total_xp_earned || 0;
      setQuizResult({ score: correct, total, xp: totalXp, passed: data?.passed ?? passed });
      if (data?.passed) {
        setCompletedLessons(prev => new Set([...prev, lessonContent.id]));
      }
    } catch {
      setQuizResult({ score: correct, total, xp: 0, passed });
    }
  };

  // ─── Navigate to next lesson ───
  const goToNextLesson = () => {
    if (!selectedLesson) return;
    const idx = lessons.findIndex(l => l.id === selectedLesson);
    if (idx < lessons.length - 1) {
      setSelectedLesson(lessons[idx + 1].id);
      setShowSuccess(false);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizResult(null);
    }
  };

  // ═══ CONTENT VIEW (single lesson) ═══
  if (selectedLesson !== null) {
    const lessonIdx = lessons.findIndex(l => l.id === selectedLesson);
    const lesson = lessons[lessonIdx];
    if (!lesson) { setSelectedLesson(null); return null; }
    const isQuiz = lesson.type === 'quiz';
    const isCompleted = completedLessons.has(lesson.id);
    const quizQs = lesson.quizQuestions || [];
    const allAnswered = isQuiz && Object.keys(quizAnswers).length >= quizQs.length;

    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => {
            setSelectedLesson(null); setQuizAnswers({}); setQuizSubmitted(false); setQuizResult(null);
          }}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{lesson.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          {/* Video or Coming Soon */}
          {lesson.type === 'video' && lesson.youtubeId && <YouTubePlayer videoId={lesson.youtubeId} color={color} />}
          {lesson.type === 'video' && !lesson.youtubeId && <ComingSoonBanner color={color} />}

          {/* Text lesson header */}
          {lesson.type === 'text' && (
            <View style={[s.textHeader, { backgroundColor: `${color}12` }]}>
              <View style={[s.textIcon, { backgroundColor: `${color}25` }]}>
                <Ionicons name="document-text" size={28} color={color} />
              </View>
              <Text style={s.textLabel}>Reading Material</Text>
            </View>
          )}

          {/* Quiz header */}
          {isQuiz && !quizResult && (
            <View style={[s.textHeader, { backgroundColor: `${color}12` }]}>
              <View style={[s.textIcon, { backgroundColor: `${color}25` }]}>
                <Ionicons name="help-circle" size={28} color={color} />
              </View>
              <Text style={[s.textLabel, { fontSize: 18 }]}>Knowledge Check</Text>
              <Text style={{ fontSize: 13, color: '#8A8D98', marginTop: 4 }}>Score 60% or higher to pass and earn XP</Text>
            </View>
          )}

          {/* Lesson title + meta (non-quiz) */}
          {!isQuiz && (
            <View style={s.lessonMeta}>
              <Text style={[s.lessonTitle, { color: theme.text }]}>{lesson.title}</Text>
              <View style={s.metaRow}>
                <View style={[s.typeBadge, { backgroundColor: `${color}20` }]}>
                  <Ionicons name={lesson.type === 'video' ? 'play-circle-outline' : 'document-text-outline'} size={13} color={color} />
                  <Text style={[s.typeBadgeText, { color }]}>{lesson.type === 'video' ? 'Video' : 'Reading'}</Text>
                </View>
                <Text style={s.durText}>{lesson.duration}</Text>
              </View>
            </View>
          )}

          {/* TTS Player for text/video lessons */}
          {!isQuiz && !contentLoading && (enrichedContent?.overview || lesson.overview) && (
            isVip && category === 'advanced'
              ? <TTSPlayerVIP courseId={courseId} lessonId={lesson.id} text={enrichedContent?.overview || lesson.overview} color={color} />
              : <TTSPlayerBasic text={enrichedContent?.overview || lesson.overview} color={color} />
          )}

          {/* Content loading indicator */}
          {!isQuiz && contentLoading && (
            <View style={[s.section, { backgroundColor: theme.surface, alignItems: 'center', paddingVertical: 24 }]}>
              <ActivityIndicator size="small" color={color} />
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 8 }}>Loading lesson content...</Text>
            </View>
          )}

          {/* Overview — enriched or fallback */}
          {!isQuiz && !contentLoading && (enrichedContent?.overview || lesson.overview) && (
            <View style={[s.section, { backgroundColor: theme.surface }]}>
              <Text style={[s.sectionLabel, { color: theme.text }]}>Lesson Overview</Text>
              <Text style={s.overviewText}>{enrichedContent?.overview || lesson.overview}</Text>
            </View>
          )}

          {/* How to Apply This — enriched content */}
          {!isQuiz && enrichedContent?.how_to_apply && (
            <View style={[s.section, { backgroundColor: `${color}08`, borderWidth: 1, borderColor: `${color}20` }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <View style={[s.sectionIcon, { backgroundColor: `${color}20` }]}>
                  <Ionicons name="bulb-outline" size={16} color={color} />
                </View>
                <Text style={[s.sectionLabel, { color, marginBottom: 0, marginLeft: 8 }]}>How to Apply This</Text>
              </View>
              <Text style={s.overviewText}>{enrichedContent.how_to_apply}</Text>
            </View>
          )}

          {/* Mini Action Task — enriched content */}
          {!isQuiz && enrichedContent?.mini_action_task && (
            <View style={[s.actionCard, { borderColor: '#FFD70040' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <View style={[s.sectionIcon, { backgroundColor: '#FFD70020' }]}>
                  <Ionicons name="rocket-outline" size={16} color="#FFD700" />
                </View>
                <Text style={[s.sectionLabel, { color: '#FFD700', marginBottom: 0, marginLeft: 8 }]}>Mini Action Task</Text>
              </View>
              <Text style={[s.overviewText, { color: '#E0E0E0' }]}>{enrichedContent.mini_action_task}</Text>
            </View>
          )}

          {/* Key Takeaways — enriched or fallback */}
          {!isQuiz && ((enrichedContent?.key_takeaways?.length > 0) || (lesson.keyTakeaways && lesson.keyTakeaways.length > 0)) && (
            <View style={[s.section, { backgroundColor: theme.surface }]}>
              <Text style={[s.sectionLabel, { color: theme.text }]}>Key Takeaways</Text>
              {(enrichedContent?.key_takeaways || lesson.keyTakeaways || []).map((t: string, i: number) => (
                <View key={i} style={s.bulletRow}>
                  <View style={[s.bullet, { backgroundColor: color }]} />
                  <Text style={s.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Quiz Questions */}
          {isQuiz && !quizResult && (
            <View style={{ gap: 12 }}>
              {quizQs.map((q, i) => (
                <QuizQuestion key={i} question={q} num={i + 1} color={color} onAnswer={(correct) => {
                  setQuizAnswers(prev => ({ ...prev, [i]: correct }));
                }} />
              ))}
              {allAnswered && !quizSubmitted && (
                <TouchableOpacity style={[s.completeBtn, { backgroundColor: color }]} onPress={() => submitQuiz(lesson)} data-testid="submit-quiz-btn">
                  <Ionicons name="paper-plane" size={18} color="#0A0E17" />
                  <Text style={s.completeBtnText}>Submit Quiz</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Quiz Result */}
          {quizResult && (
            <QuizResult
              score={quizResult.score} total={quizResult.total} xp={quizResult.xp}
              passed={quizResult.passed} color={color}
              onRetry={() => { setQuizAnswers({}); setQuizSubmitted(false); setQuizResult(null); }}
              onBack={() => { setSelectedLesson(null); setQuizAnswers({}); setQuizSubmitted(false); setQuizResult(null); }}
            />
          )}

          {/* Success Animation */}
          {showSuccess && <CompletionSuccess color={color} xpData={xpReward} />}

          {/* Mark Complete + Navigation */}
          {!isQuiz && !quizResult && (
            <View style={s.navRow}>
              {!isCompleted && !showSuccess && (
                <TouchableOpacity style={[s.completeBtn, { backgroundColor: color }]} onPress={() => markComplete(lesson.id)} disabled={completing} data-testid="mark-complete-btn">
                  {completing ? <ActivityIndicator size="small" color="#0A0E17" /> : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#0A0E17" />
                      <Text style={s.completeBtnText}>Mark Complete</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {isCompleted && !showSuccess && (
                <View style={[s.completedTag, { backgroundColor: '#00D4AA20' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                  <Text style={{ color: '#00D4AA', fontSize: 13, fontWeight: '600', marginLeft: 4 }}>Completed</Text>
                </View>
              )}
            </View>
          )}

          {/* Next / Previous buttons */}
          {!quizResult && (
            <View style={s.navBtns}>
              {lessonIdx > 0 && (
                <TouchableOpacity style={s.navBtn} onPress={() => {
                  setSelectedLesson(lessons[lessonIdx - 1].id);
                  setShowSuccess(false); setQuizAnswers({}); setQuizSubmitted(false); setQuizResult(null);
                }}>
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                  <Text style={s.navBtnText}>Previous</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {lessonIdx < lessons.length - 1 && isLessonUnlocked(lessonIdx + 1) && (
                <TouchableOpacity style={[s.navBtn, { backgroundColor: color }]} onPress={goToNextLesson}>
                  <Text style={[s.navBtnText, { color: '#0A0E17' }]}>Next Lesson</Text>
                  <Ionicons name="chevron-forward" size={18} color="#0A0E17" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══ LESSON LIST VIEW ═══
  const totalLessons = lessons.length;
  const completedCount = completedLessons.size;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{courseContent.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Course Banner */}
      <View style={[s.courseBanner, { backgroundColor: `${color}12` }]}>
        <View style={[s.courseIconLg, { backgroundColor: `${color}25` }]}>
          <Ionicons name="book-outline" size={28} color={color} />
        </View>
        <Text style={[s.courseTitleLg, { color: theme.text }]}>{courseContent.title}</Text>
        <View style={s.courseStats}>
          <View style={s.statItem}>
            <Ionicons name="play-circle-outline" size={15} color="#8A8D98" />
            <Text style={s.statText}>{totalLessons} lessons</Text>
          </View>
          <View style={s.statItem}>
            <Ionicons name="checkmark-done-outline" size={15} color="#00D4AA" />
            <Text style={[s.statText, { color: '#00D4AA' }]}>{completedCount} done</Text>
          </View>
        </View>
        <View style={s.progBarBg}>
          <View style={[s.progBarFill, { width: `${progressPct}%`, backgroundColor: progressPct >= 100 ? '#00D4AA' : color }]} />
        </View>
        <Text style={s.progText}>{progressPct}% Complete</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
        <Text style={[s.sectionLabel, { color: theme.text, paddingHorizontal: 0, marginBottom: 12 }]}>Course Content</Text>

        {loading && (
          <View style={{ gap: 8 }}>
            {[1, 2, 3, 4].map(i => <View key={i} style={[s.skeleton, { backgroundColor: theme.surface }]} />)}
          </View>
        )}

        {!loading && lessons.map((lesson, idx) => {
          const unlocked = isLessonUnlocked(idx);
          const done = completedLessons.has(lesson.id);
          return (
            <TouchableOpacity
              key={lesson.id}
              style={[s.lessonRow, { backgroundColor: theme.surface, borderColor: theme.border }, !unlocked && { opacity: 0.45 }]}
              onPress={() => {
                if (!unlocked) {
                  Alert.alert('Locked', 'Complete the previous lesson first.');
                  return;
                }
                setSelectedLesson(lesson.id);
                setShowSuccess(false); setQuizAnswers({}); setQuizSubmitted(false); setQuizResult(null);
              }}
              data-testid={`lesson-row-${lesson.id}`}
            >
              <View style={[s.lessonNum, { backgroundColor: done ? '#00D4AA20' : `${color}18` }]}>
                {done
                  ? <Ionicons name="checkmark" size={16} color="#00D4AA" />
                  : unlocked
                    ? <Text style={[s.lessonNumText, { color }]}>{idx + 1}</Text>
                    : <Ionicons name="lock-closed" size={14} color="#8A8D98" />
                }
              </View>
              <View style={s.lessonInfo}>
                <Text style={[s.lessonName, { color: unlocked ? theme.text : theme.textSecondary }]}>{lesson.title}</Text>
                <View style={s.lessonMetaRow}>
                  <Ionicons
                    name={lesson.type === 'quiz' ? 'help-circle-outline' : lesson.type === 'video' ? 'play-circle-outline' : 'document-text-outline'}
                    size={13} color="#8A8D98"
                  />
                  <Text style={s.lessonMetaText}>{lesson.duration}</Text>
                  {done && <Text style={s.doneLabel}>Completed</Text>}
                </View>
              </View>
              <Ionicons
                name={!unlocked ? 'lock-closed' : lesson.type === 'quiz' ? 'help-circle' : 'play-circle'}
                size={22}
                color={!unlocked ? '#8A8D98' : color}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══ STYLES ═══
const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  scroll: { flex: 1, padding: 16 },
  courseBanner: { margin: 16, padding: 18, borderRadius: 14, alignItems: 'center' },
  courseIconLg: { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  courseTitleLg: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  courseStats: { flexDirection: 'row', marginBottom: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  statText: { fontSize: 13, color: '#8A8D98', marginLeft: 4 },
  progBarBg: { width: '100%', height: 5, backgroundColor: '#2A2F3E', borderRadius: 3, marginBottom: 6 },
  progBarFill: { height: '100%', borderRadius: 3 },
  progText: { fontSize: 12, color: '#8A8D98' },
  sectionLabel: { fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  lessonNum: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  lessonNumText: { fontSize: 14, fontWeight: 'bold' },
  lessonInfo: { flex: 1 },
  lessonName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  lessonMetaRow: { flexDirection: 'row', alignItems: 'center' },
  lessonMetaText: { fontSize: 12, color: '#8A8D98', marginLeft: 4 },
  doneLabel: { fontSize: 11, color: '#00D4AA', fontWeight: '600', marginLeft: 8 },
  // Content view styles
  textHeader: { alignItems: 'center', padding: 22, borderRadius: 12, marginBottom: 18 },
  textIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  textLabel: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  lessonMeta: { marginBottom: 16 },
  lessonTitle: { fontSize: 19, fontWeight: 'bold', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, marginRight: 10 },
  typeBadgeText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  durText: { fontSize: 13, color: '#8A8D98' },
  section: { borderRadius: 12, padding: 16, marginBottom: 14 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  overviewText: { fontSize: 14, color: '#C0C4CC', lineHeight: 24 },
  actionCard: { borderRadius: 12, padding: 16, marginBottom: 14, backgroundColor: '#1A1F2E', borderWidth: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 10 },
  bulletText: { flex: 1, fontSize: 14, color: '#FFFFFF', lineHeight: 20 },
  navRow: { marginTop: 8, alignItems: 'center' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, gap: 8, marginTop: 8 },
  completeBtnText: { fontSize: 15, fontWeight: 'bold', color: '#0A0E17' },
  completedTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  navBtns: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  navBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1F2E', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  navBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginHorizontal: 2 },
  lockedWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockedTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  lockedSub: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  upgradeBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  upgradeBtnText: { fontSize: 14, fontWeight: 'bold', color: '#0A0E17' },
  skeleton: { height: 60, borderRadius: 12 },
});

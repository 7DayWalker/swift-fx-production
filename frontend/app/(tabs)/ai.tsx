import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  FlatList,
  Share,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/services/supabase';
import { TAB_BAR_HEIGHT } from './_layout';
import PressableScale from '../../src/components/ui/PressableScale';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────
interface AIUsage {
  current_usage: number;
  weekly_limit: number | string;
  remaining: number;
  has_access: boolean;
}

interface AnalysisResult {
  analysis_id: string;
  pair: string;
  timeframe: string;
  market_bias: string;
  trade_bias: string;
  confidence_score: number;
  trend_structure: string;
  support_levels: string[];
  resistance_levels: string[];
  trade_insight: string;
  analysis_text: string;
  detected_pattern: string;
  confidence: string;
  remaining_analyses?: number;
  weekly_limit?: number | string;
  disclaimer?: string;
  created_at?: string;
  image_snapshot?: string;
}

interface HistoryItem {
  analysis_id: string;
  pair: string;
  timeframe: string;
  trade_bias: string;
  confidence_score: number;
  analysis_text: string;
  detected_pattern: string;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TIER_LIMITS: Record<string, number> = { free: 3, premium: 10, vip: -1, admin: -1 };
const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

type ScreenState = 'upload' | 'analyzing' | 'result' | 'error' | 'limit_reached' | 'history_detail';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const safeString = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
  if (typeof value === 'object') return value.msg || value.message || JSON.stringify(value);
  return String(value);
};

const safeLevels = (levels: any): string[] => {
  if (!levels) return [];
  if (!Array.isArray(levels)) { const s = safeString(levels); return s ? [s] : []; }
  return levels.map((l: any) => typeof l === 'string' ? l : String(l)).filter(Boolean);
};

const getBiasColor = (bias: string) => {
  const b = bias?.toLowerCase() || '';
  if (b.includes('bullish') || b === 'buy') return '#00D4AA';
  if (b.includes('bearish') || b === 'sell') return '#FF4757';
  return '#FFD700';
};

const getTradeBiasColor = (bias: string) => {
  if (bias === 'BUY') return '#00D4AA';
  if (bias === 'SELL') return '#FF4757';
  return '#FFD700';
};

const getTradeBiasIcon = (bias: string): keyof typeof Ionicons.glyphMap => {
  if (bias === 'BUY') return 'trending-up';
  if (bias === 'SELL') return 'trending-down';
  return 'pause-circle';
};

const getConfidenceColor = (score: number) => {
  if (score >= 70) return '#00D4AA';
  if (score >= 45) return '#FFD700';
  return '#FF4757';
};

const formatTimeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ─── Animated Confidence Meter ───────────────────────────────────────────────
const ConfidenceMeter = ({ score, size = 'large' }: { score: number; size?: 'large' | 'small' }) => {
  const animVal = useRef(new Animated.Value(0)).current;
  const color = getConfidenceColor(score);
  const isLarge = size === 'large';

  useEffect(() => {
    Animated.timing(animVal, { toValue: score, duration: 1200, useNativeDriver: false }).start();
  }, [score]);

  const barWidth = animVal.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={{ gap: isLarge ? 6 : 3 }}>
      {isLarge && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#8A8D98', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>Confidence</Text>
          <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{score}%</Text>
        </View>
      )}
      <View style={{ height: isLarge ? 8 : 4, backgroundColor: 'rgba(138,141,152,0.15)', borderRadius: 4, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', width: barWidth, backgroundColor: color, borderRadius: 4 }} />
      </View>
      {!isLarge && <Text style={{ color, fontSize: 10, fontWeight: '700', textAlign: 'right' }}>{score}%</Text>}
    </View>
  );
};

// ─── Trade Bias Badge ────────────────────────────────────────────────────────
const TradeBiasBadge = ({ bias, large }: { bias: string; large?: boolean }) => {
  const color = getTradeBiasColor(bias);
  const icon = getTradeBiasIcon(bias);
  return (
    <View style={[s.biasBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }, large && { paddingHorizontal: 18, paddingVertical: 10 }]} data-testid="trade-bias-badge">
      <Ionicons name={icon} size={large ? 22 : 14} color={color} />
      <Text style={[s.biasBadgeText, { color }, large && { fontSize: 18 }]}>{bias}</Text>
    </View>
  );
};

// ─── Progress Steps ──────────────────────────────────────────────────────────
const PROGRESS_STEPS = ['Uploading', 'Analyzing', 'Generating Insight', 'Completed'];

const AnalyzingProgress = ({ pair, timeframe }: { pair: string; timeframe: string }) => {
  const [step, setStep] = useState(0);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 2000),
      setTimeout(() => setStep(2), 8000),
    ];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { timers.forEach(clearTimeout); loop.stop(); };
  }, []);

  return (
    <View style={s.analyzingContainer} data-testid="analyzing-progress">
      <Animated.View style={[s.analyzingIcon, { opacity: pulseAnim }]}>
        <Ionicons name="sparkles" size={48} color="#00D4AA" />
      </Animated.View>
      <Text style={s.analyzingTitle}>Analyzing {pair}</Text>
      <Text style={s.analyzingSubtitle}>{timeframe} timeframe</Text>
      <View style={s.stepsWrap}>
        {PROGRESS_STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={label} style={s.stepRow}>
              {done ? (
                <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              ) : active ? (
                <ActivityIndicator size="small" color="#00D4AA" />
              ) : (
                <Ionicons name="ellipse-outline" size={20} color="#3A3F4E" />
              )}
              <Text style={[s.stepText, done && { color: '#00D4AA' }, active && { color: '#FFFFFF' }]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.analyzingNote}>This may take up to 30 seconds...</Text>
    </View>
  );
};

// ─── Success Animation ───────────────────────────────────────────────────────
const SuccessFlash = ({ onDone }: { onDone: () => void }) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[s.successOverlay, { opacity, transform: [{ scale }] }]}>
      <View style={s.successCircle}>
        <Ionicons name="checkmark" size={48} color="#0A0E17" />
      </View>
      <Text style={s.successText}>Analysis Complete</Text>
    </Animated.View>
  );
};

// ─── History Card ────────────────────────────────────────────────────────────
const HistoryCard = ({ item, onPress }: { item: HistoryItem; onPress: () => void }) => {
  const color = getTradeBiasColor(item.trade_bias);
  return (
    <TouchableOpacity style={s.historyCard} onPress={onPress} activeOpacity={0.7} data-testid={`history-card-${item.analysis_id}`}>
      <View style={[s.historyStripe, { backgroundColor: color }]} />
      <View style={s.historyBody}>
        <View style={s.historyTop}>
          <Text style={s.historyPair}>{item.pair}</Text>
          <TradeBiasBadge bias={item.trade_bias} />
        </View>
        <Text style={s.historyPreview} numberOfLines={2}>{item.analysis_text || 'No summary available'}</Text>
        <View style={s.historyMeta}>
          <View style={s.historyMetaItem}>
            <Ionicons name="time-outline" size={11} color="#6A6D78" />
            <Text style={s.historyMetaText}>{formatTimeAgo(item.created_at)}</Text>
          </View>
          <View style={s.historyMetaItem}>
            <Ionicons name="stats-chart" size={11} color="#6A6D78" />
            <Text style={s.historyMetaText}>{item.timeframe}</Text>
          </View>
          {item.detected_pattern && item.detected_pattern !== 'None' && (
            <View style={s.historyMetaItem}>
              <Ionicons name="git-branch-outline" size={11} color="#6A6D78" />
              <Text style={s.historyMetaText}>{item.detected_pattern}</Text>
            </View>
          )}
          <Text style={[s.historyConfScore, { color: getConfidenceColor(item.confidence_score) }]}>{item.confidence_score}%</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#3A3F4E" style={{ alignSelf: 'center', marginRight: 12 }} />
    </TouchableOpacity>
  );
};

// ─── Upgrade Nudge Card ──────────────────────────────────────────────────────
const UpgradeNudge = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity style={s.nudgeCard} onPress={onPress} activeOpacity={0.8} data-testid="upgrade-nudge">
    <View style={s.nudgeIcon}>
      <Ionicons name="diamond" size={18} color="#FFD700" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.nudgeTitle}>Upgrade to VIP</Text>
      <Text style={s.nudgeSubtitle}>Get unlimited AI analyses + premium signals</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="#FFD700" />
  </TouchableOpacity>
);

// ─── Share Modal ─────────────────────────────────────────────────────────────
interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  analysisId: string;
  result: AnalysisResult;
  getAuthToken: () => Promise<string | null>;
}

const ShareModal = ({ visible, onClose, analysisId, result, getAuthToken }: ShareModalProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [communityPosted, setCommunityPosted] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      setCopied(false);
      setCommunityPosted(false);
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);

  const handleCopyLink = async () => {
    try {
      setIsSharing(true);
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/share/${analysisId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const data = await res.json();
      const shareUrl = `${API_BASE_URL}/api/ai/shared/${data.share_token}`;
      await Clipboard.setStringAsync(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      Platform.OS === 'web' ? window.alert('Failed to copy link') : Alert.alert('Error', 'Failed to generate share link');
    } finally { setIsSharing(false); }
  };

  const handleNativeShare = async () => {
    try {
      setIsSharing(true);
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/share/${analysisId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const data = await res.json();
      const shareUrl = `${API_BASE_URL}/api/ai/shared/${data.share_token}`;

      const message = `AI Analysis: ${result.pair} (${result.timeframe})\nBias: ${result.trade_bias} | Confidence: ${result.confidence_score}%${result.detected_pattern && result.detected_pattern !== 'None' ? `\nPattern: ${result.detected_pattern}` : ''}\n\n${shareUrl}`;

      await Share.share({ message, title: `Swift FX AI Analysis - ${result.pair}` });
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Platform.OS === 'web' ? window.alert('Share failed') : Alert.alert('Error', 'Failed to share');
      }
    } finally { setIsSharing(false); }
  };

  const handleCommunityShare = async () => {
    try {
      setIsSharing(true);
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/share/${analysisId}/community`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to post');
      setCommunityPosted(true);
    } catch (e) {
      Platform.OS === 'web' ? window.alert('Failed to post to community') : Alert.alert('Error', 'Failed to share to community');
    } finally { setIsSharing(false); }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[s.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Share Analysis</Text>
            <Text style={s.modalSubtitle}>{result.pair} - {result.trade_bias} ({result.confidence_score}%)</Text>

            <View style={{ gap: 10, marginTop: 16 }}>
              {/* Copy Link */}
              <TouchableOpacity style={s.shareOption} onPress={handleCopyLink} disabled={isSharing} data-testid="share-copy-link">
                <View style={[s.shareIconWrap, { backgroundColor: 'rgba(0,212,170,0.12)' }]}>
                  <Ionicons name={copied ? 'checkmark' : 'link'} size={20} color="#00D4AA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{copied ? 'Link Copied!' : 'Copy Link'}</Text>
                  <Text style={s.shareOptionSub}>Share a public link to this analysis</Text>
                </View>
                {isSharing && <ActivityIndicator size="small" color="#00D4AA" />}
              </TouchableOpacity>

              {/* Native Share */}
              <TouchableOpacity style={s.shareOption} onPress={handleNativeShare} disabled={isSharing} data-testid="share-native">
                <View style={[s.shareIconWrap, { backgroundColor: 'rgba(88,101,242,0.12)' }]}>
                  <Ionicons name="share-social" size={20} color="#5865F2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>Share</Text>
                  <Text style={s.shareOptionSub}>Twitter, WhatsApp, Telegram & more</Text>
                </View>
              </TouchableOpacity>

              {/* Community */}
              <TouchableOpacity
                style={[s.shareOption, communityPosted && { borderColor: 'rgba(0,212,170,0.3)' }]}
                onPress={handleCommunityShare}
                disabled={isSharing || communityPosted}
                data-testid="share-community"
              >
                <View style={[s.shareIconWrap, { backgroundColor: communityPosted ? 'rgba(0,212,170,0.12)' : 'rgba(255,215,0,0.12)' }]}>
                  <Ionicons name={communityPosted ? 'checkmark-circle' : 'people'} size={20} color={communityPosted ? '#00D4AA' : '#FFD700'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.shareOptionTitle}>{communityPosted ? 'Posted to Community!' : 'Post to Community'}</Text>
                  <Text style={s.shareOptionSub}>Share your insight with the Swift FX community</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.modalCloseBtn} onPress={onClose} data-testid="share-modal-close">
              <Text style={s.modalCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
export default function AIScreen() {
  const { user } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;

  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('H1');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPairPicker, setShowPairPicker] = useState(false);
  const [showTimeframePicker, setShowTimeframePicker] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [screenState, setScreenState] = useState<ScreenState>('upload');
  const [showSuccess, setShowSuccess] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Share state
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // ─── Data Fetching ───────────────────────────────────────────────────────
  useEffect(() => { fetchUsage(); }, [user, subscriptionStatus]);
  useEffect(() => { if (user) fetchHistory(); }, [user]);

  const getAuthToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const fetchUsage = async () => {
    try {
      if (!user) { setUsage({ current_usage: 0, weekly_limit: 0, remaining: 0, has_access: false }); setIsLoadingUsage(false); return; }
      if (!subscriptionStatus) return;

      const effectiveTier = subscriptionStatus.subscription || 'free';
      const limit = TIER_LIMITS[effectiveTier] ?? TIER_LIMITS.free;
      const isUnlimited = limit === -1;

      const { data: profile } = await supabase
        .from('profiles')
        .select('ai_weekly_used, ai_weekly_reset')
        .eq('id', user.user_id)
        .single();

      let currentUsage = profile?.ai_weekly_used || 0;
      const resetDate = profile?.ai_weekly_reset ? new Date(profile.ai_weekly_reset) : null;
      if (!resetDate || (Date.now() - resetDate.getTime()) >= 7 * 86400000) currentUsage = 0;

      setUsage({
        current_usage: currentUsage,
        weekly_limit: isUnlimited ? 'unlimited' : limit,
        remaining: isUnlimited ? 999 : Math.max(0, limit - currentUsage),
        has_access: true,
      });
    } catch { setUsage({ current_usage: 0, weekly_limit: 3, remaining: 3, has_access: true }); }
    finally { setIsLoadingUsage(false); }
  };

  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.items || []);
      }
    } catch (e) { console.warn('Failed to fetch AI history:', e); }
    finally { setIsLoadingHistory(false); }
  };

  const fetchHistoryDetail = async (analysisId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/history/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const result: AnalysisResult = {
          ...data,
          disclaimer: 'AI-generated analysis for educational purposes only.',
        };
        // Restore image from snapshot
        if (data.image_snapshot) {
          setSelectedImage(`data:image/png;base64,${data.image_snapshot}`);
        } else {
          setSelectedImage(null);
        }
        setAnalysisResult(result);
        setScreenState('history_detail');
      }
    } catch (e) { console.warn('Failed to fetch analysis detail:', e); }
  };

  // ─── Image Handling ──────────────────────────────────────────────────────
  const processAndSetImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setSelectedImage(asset.uri);
    if (asset.base64) {
      const processed = await preprocessImage(asset.base64, asset.width, asset.height);
      setImageBase64(processed);
    } else { setImageBase64(null); }
    if (screenState === 'result' || screenState === 'error' || screenState === 'history_detail') {
      setScreenState('upload');
      setAnalysisResult(null);
      setErrorMessage(null);
    }
  };

  const preprocessImage = async (base64: string, width?: number, height?: number): Promise<string> => {
    const MAX = 1024;
    if (Platform.OS === 'web') {
      try {
        const img = new window.Image();
        img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; setTimeout(() => reject(new Error('timeout')), 10000); });
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.fillStyle = '#FFF'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); return canvas.toDataURL('image/png').split(',')[1]; }
      } catch {}
    }
    return base64;
  };

  const pickImage = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Platform.OS === 'web' ? window.alert('Allow photo library access') : Alert.alert('Permission Required', 'Allow photo library access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.85, base64: true, exif: false });
    if (!result.canceled && result.assets[0]) await processAndSetImage(result.assets[0]);
  };

  const takePhoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { Platform.OS === 'web' ? window.alert('Allow camera access') : Alert.alert('Permission Required', 'Allow camera access'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.85, base64: true, exif: false });
    if (!result.canceled && result.assets[0]) await processAndSetImage(result.assets[0]);
  };

  // ─── Analyze ─────────────────────────────────────────────────────────────
  const analyzeChart = async () => {
    if (!selectedImage) { Platform.OS === 'web' ? window.alert('Select a chart first') : Alert.alert('No Image', 'Select a chart first'); return; }
    if (usage && usage.weekly_limit !== 'unlimited' && usage.remaining <= 0) {
      setErrorMessage('Weekly AI analysis limit reached.'); setScreenState('limit_reached'); return;
    }

    setScreenState('analyzing');
    setErrorMessage(null);

    try {
      let cleanBase64 = imageBase64 || undefined;
      if (cleanBase64?.includes(',')) cleanBase64 = cleanBase64.split(',')[1];

      const token = await getAuthToken();
      if (!token) { setErrorMessage('Not authenticated.'); setScreenState('error'); return; }

      const res = await fetch(`${API_BASE_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: `Analyze this ${selectedPair} chart on ${selectedTimeframe} timeframe.`, pair: selectedPair, timeframe: selectedTimeframe, image_base64: cleanBase64 }),
      });

      const data = await res.json();
      if (!res.ok) { setErrorMessage(data.detail || `Analysis failed (${res.status})`); setScreenState('error'); return; }

      const result: AnalysisResult = {
        analysis_id: data.analysis_id || '',
        pair: selectedPair,
        timeframe: selectedTimeframe,
        market_bias: data.market_bias || 'Unknown',
        trade_bias: data.trade_bias || 'WAIT',
        confidence_score: data.confidence_score ?? 50,
        trend_structure: data.trend_structure || '',
        support_levels: data.support_levels || [],
        resistance_levels: data.resistance_levels || [],
        trade_insight: data.trade_insight || '',
        analysis_text: data.analysis_text || data.trade_insight || '',
        detected_pattern: data.detected_pattern || 'None',
        confidence: data.confidence || 'Medium',
        remaining_analyses: usage?.weekly_limit === 'unlimited' ? undefined : (usage?.remaining ? usage.remaining - 1 : 0),
        weekly_limit: usage?.weekly_limit || 3,
        disclaimer: 'AI-generated analysis for educational purposes only.',
      };

      setAnalysisResult(result);
      setShowSuccess(true); // Trigger success animation
      fetchUsage();
      fetchHistory(); // Refresh history list
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to analyze chart.'); setScreenState('error');
    }
  };

  const resetToUpload = () => { setScreenState('upload'); setAnalysisResult(null); setErrorMessage(null); };
  const startNewAnalysis = () => { setScreenState('upload'); setSelectedImage(null); setImageBase64(null); setAnalysisResult(null); setErrorMessage(null); setSelectedPair(PAIRS[0]); setSelectedTimeframe('H1'); };

  const showUpgradeNudge = subscriptionStatus?.subscription !== 'vip' && subscriptionStatus?.subscription !== 'admin';

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (isLoadingUsage) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Success animation overlay ───────────────────────────────────────────
  if (showSuccess) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <SuccessFlash onDone={() => { setShowSuccess(false); setScreenState('result'); }} />
      </SafeAreaView>
    );
  }

  // ─── Analyzing ───────────────────────────────────────────────────────────
  if (screenState === 'analyzing') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <AnalyzingProgress pair={selectedPair} timeframe={selectedTimeframe} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────
  if (screenState === 'error') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.centeredContainer}>
            <View style={[s.iconCircle, { backgroundColor: 'rgba(255,71,87,0.12)' }]}>
              <Ionicons name="alert-circle" size={56} color="#FF4757" />
            </View>
            <Text style={s.centeredTitle}>Analysis Failed</Text>
            <Text style={s.centeredSubtitle}>{errorMessage}</Text>
            <View style={s.btnGroup}>
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: theme.primary }]} onPress={analyzeChart} data-testid="retry-button">
                <Ionicons name="refresh" size={18} color="#0A0E17" />
                <Text style={s.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={resetToUpload}>
                <Text style={s.secondaryBtnText}>Change Image</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Limit Reached ─────────────────────────────────────────────────────
  if (screenState === 'limit_reached') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.centeredContainer}>
            <View style={[s.iconCircle, { backgroundColor: 'rgba(255,215,0,0.12)' }]}>
              <Ionicons name="hourglass-outline" size={56} color="#FFD700" />
            </View>
            <Text style={[s.centeredTitle, { color: '#FFD700' }]}>Weekly Limit Reached</Text>
            <Text style={s.centeredSubtitle}>{errorMessage || 'You have used all your weekly AI analyses.'}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <View style={s.planChip}><Text style={[s.planName, { color: '#00D4AA' }]}>Premium</Text><Text style={s.planLimit}>10/week</Text></View>
              <View style={[s.planChip, { borderColor: '#FFD700' }]}><Text style={[s.planName, { color: '#FFD700' }]}>VIP</Text><Text style={s.planLimit}>Unlimited</Text></View>
            </View>
            <View style={s.btnGroup}>
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#FFD700' }]} onPress={() => router.push('/subscription')} data-testid="upgrade-btn">
                <Ionicons name="arrow-up-circle" size={18} color="#0A0E17" />
                <Text style={s.primaryBtnText}>Upgrade Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={resetToUpload}>
                <Text style={s.secondaryBtnText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Result / History Detail ─────────────────────────────────────────────
  if ((screenState === 'result' || screenState === 'history_detail') && analysisResult) {
    const r = analysisResult;
    const marketBias = safeString(r.market_bias);
    const trendStructure = safeString(r.trend_structure);
    const tradeInsight = safeString(r.trade_insight);
    const disclaimer = safeString(r.disclaimer);
    const supportLevels = safeLevels(r.support_levels);
    const resistanceLevels = safeLevels(r.resistance_levels);
    const detectedPattern = safeString(r.detected_pattern);
    const isFromHistory = screenState === 'history_detail';

    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
        {/* Header */}
        <View style={s.resultHeader}>
          <TouchableOpacity style={s.headerBtn} onPress={resetToUpload} data-testid="result-back-button">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.resultHeaderTitle}>{isFromHistory ? 'Past Analysis' : 'Analysis Result'}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {r.analysis_id ? (
              <TouchableOpacity style={s.headerBtn} onPress={() => setShareModalVisible(true)} data-testid="share-button">
                <Ionicons name="share-outline" size={20} color="#00D4AA" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.headerBtn} onPress={startNewAnalysis} data-testid="new-analysis-button">
              <Ionicons name="add" size={22} color="#00D4AA" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
          {/* Chart preview */}
          {selectedImage && (
            <View style={s.chartCard}>
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                <View style={{ flex: 1 }}><Text style={s.chartLabel}>Pair</Text><Text style={s.chartValue}>{r.pair}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.chartLabel}>Timeframe</Text><Text style={s.chartValue}>{r.timeframe}</Text></View>
              </View>
              <Image source={{ uri: selectedImage }} style={s.chartImage} resizeMode="contain" />
            </View>
          )}

          {/* Trade Bias + Confidence hero */}
          <View style={s.heroCard} data-testid="result-hero-card">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={s.heroLabel}>Market Bias</Text>
                <Text style={[s.heroValue, { color: getBiasColor(marketBias) }]}>{marketBias}</Text>
              </View>
              <TradeBiasBadge bias={r.trade_bias} large />
            </View>
            <ConfidenceMeter score={r.confidence_score} />
            {detectedPattern && detectedPattern !== 'None' && (
              <View style={s.patternRow}>
                <Ionicons name="git-branch-outline" size={14} color="#8A8D98" />
                <Text style={s.patternText}>Pattern: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{detectedPattern}</Text></Text>
              </View>
            )}
          </View>

          {/* Trend Structure */}
          <View style={s.card}>
            <View style={s.cardHeader}><Ionicons name="analytics" size={18} color="#00D4AA" /><Text style={s.cardTitle}>Trend Structure</Text></View>
            <Text style={s.cardBody}>{trendStructure}</Text>
          </View>

          {/* Support & Resistance */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={[s.card, { flex: 1, marginBottom: 0 }]}>
              <View style={s.cardHeader}><Ionicons name="arrow-down" size={14} color="#00D4AA" /><Text style={s.cardTitle}>Support</Text></View>
              {supportLevels.length > 0 ? supportLevels.map((l, i) => <Text key={i} style={[s.levelVal, { color: '#00D4AA' }]}>{l}</Text>) : <Text style={s.noData}>None identified</Text>}
            </View>
            <View style={[s.card, { flex: 1, marginBottom: 0 }]}>
              <View style={s.cardHeader}><Ionicons name="arrow-up" size={14} color="#FF4757" /><Text style={s.cardTitle}>Resistance</Text></View>
              {resistanceLevels.length > 0 ? resistanceLevels.map((l, i) => <Text key={i} style={[s.levelVal, { color: '#FF4757' }]}>{l}</Text>) : <Text style={s.noData}>None identified</Text>}
            </View>
          </View>

          {/* Trade Insight */}
          <View style={s.card}>
            <View style={s.cardHeader}><Ionicons name="bulb" size={18} color="#FFD700" /><Text style={s.cardTitle}>Trade Insight</Text></View>
            <Text style={s.cardBody}>{tradeInsight}</Text>
          </View>

          {/* Remaining counter */}
          {r.remaining_analyses !== undefined && (
            <View style={s.remainingRow}>
              <Ionicons name="sparkles" size={16} color="#00D4AA" />
              <Text style={s.remainingText}>{r.remaining_analyses} analyses remaining this week</Text>
            </View>
          )}

          {/* Upgrade nudge */}
          {showUpgradeNudge && <UpgradeNudge onPress={() => router.push('/subscription')} />}

          {/* Disclaimer */}
          <View style={s.disclaimerRow}>
            <Ionicons name="information-circle-outline" size={14} color="#6A6D78" />
            <Text style={s.disclaimerText}>{disclaimer}</Text>
          </View>

          {/* Action */}
          <PressableScale style={s.ctaBtn} onPress={startNewAnalysis} data-testid="analyze-another-button">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={18} color="#0A0E17" />
              <Text style={s.ctaBtnText}>Analyze Another Chart</Text>
            </View>
          </PressableScale>
        </ScrollView>

        {/* Share Modal */}
        {r.analysis_id ? (
          <ShareModal
            visible={shareModalVisible}
            onClose={() => setShareModalVisible(false)}
            analysisId={r.analysis_id}
            result={r}
            getAuthToken={getAuthToken}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  // ─── Upload (Default) ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 20 }}>
          <Text style={[s.screenTitle, { color: theme.text }]}>AI Chart Analyzer</Text>
          <Text style={[s.screenSubtitle, { color: theme.textSecondary }]}>Upload a chart for instant analysis</Text>
        </View>

        {/* Usage bar */}
        <View style={[s.usageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="sparkles" size={18} color={theme.primary} />
            <Text style={[s.usageTitle, { color: theme.text }]}>Weekly Usage</Text>
          </View>
          <View style={[s.usageBarBg, { backgroundColor: theme.background }]}>
            <View style={[s.usageBarFill, {
              width: usage?.weekly_limit === 'unlimited' ? '0%'
                : `${((usage?.current_usage || 0) / (typeof usage?.weekly_limit === 'number' && usage.weekly_limit > 0 ? usage.weekly_limit : 1)) * 100}%`,
              backgroundColor: theme.primary,
            }]} />
          </View>
          <Text style={[s.usageText, { color: theme.textSecondary }]}>
            {usage?.weekly_limit === 'unlimited' ? 'Unlimited analyses available' : `${usage?.remaining ?? 0} of ${usage?.weekly_limit ?? 0} remaining`}
          </Text>
        </View>

        {/* Image upload */}
        <View style={{ marginBottom: 18 }}>
          {selectedImage ? (
            <View style={[s.imageContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Image source={{ uri: selectedImage }} style={s.selectedImage} resizeMode="contain" />
              <View style={s.imageActions}>
                <TouchableOpacity style={[s.imageActionBtn, { backgroundColor: theme.background }]} onPress={pickImage}>
                  <Ionicons name="images-outline" size={18} color={theme.text} /><Text style={[s.imageActionLabel, { color: theme.text }]}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.imageActionBtn, { backgroundColor: theme.background }]} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={18} color={theme.text} /><Text style={[s.imageActionLabel, { color: theme.text }]}>Camera</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[s.uploadArea, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[s.uploadTitle, { color: theme.text }]}>Upload Your Chart</Text>
              <Text style={[s.uploadSub, { color: theme.textSecondary }]}>Portrait or landscape - any platform</Text>
              <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginBottom: 14 }}>
                <TouchableOpacity style={[s.uploadBtn, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={pickImage}>
                  <View style={[s.uploadIconWrap, { backgroundColor: `${theme.primary}15` }]}><Ionicons name="images" size={28} color={theme.primary} /></View>
                  <Text style={[s.uploadBtnTitle, { color: theme.text }]}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.uploadBtn, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={takePhoto}>
                  <View style={[s.uploadIconWrap, { backgroundColor: `${theme.primary}15` }]}><Ionicons name="camera" size={28} color={theme.primary} /></View>
                  <Text style={[s.uploadBtnTitle, { color: theme.text }]}>Camera</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: '#5A5D68' }}>MT4 - MT5 - TradingView - Any chart</Text>
            </View>
          )}
        </View>

        {/* Pair / Timeframe pickers */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <TouchableOpacity style={[s.pickerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowPairPicker(!showPairPicker)}>
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>Pair</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{selectedPair}</Text>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[s.pickerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => setShowTimeframePicker(!showTimeframePicker)}>
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>Timeframe</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{selectedTimeframe}</Text>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {showPairPicker && (
          <View style={[s.pickerDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {PAIRS.map(p => (
              <TouchableOpacity key={p} style={[s.pickerItem, selectedPair === p && { backgroundColor: `${theme.primary}20` }]}
                onPress={() => { setSelectedPair(p); setShowPairPicker(false); }}>
                <Text style={[s.pickerItemText, { color: theme.text }, selectedPair === p && { color: theme.primary }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {showTimeframePicker && (
          <View style={[s.pickerDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity key={tf} style={[s.pickerItem, selectedTimeframe === tf && { backgroundColor: `${theme.primary}20` }]}
                onPress={() => { setSelectedTimeframe(tf); setShowTimeframePicker(false); }}>
                <Text style={[s.pickerItemText, { color: theme.text }, selectedTimeframe === tf && { color: theme.primary }]}>{tf}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Analyze button */}
        <PressableScale style={[s.analyzeBtn, !selectedImage && { opacity: 0.45 }]} onPress={analyzeChart} disabled={!selectedImage} data-testid="analyze-chart-button">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={18} color="#0A0E17" style={{ marginRight: 8 }} />
            <Text style={s.analyzeBtnText}>Analyze Chart</Text>
          </View>
        </PressableScale>

        {/* ── Recent Analyses (collapsible) ───────────────────────────── */}
        {history.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              style={s.historyHeader}
              onPress={() => setHistoryExpanded(!historyExpanded)}
              activeOpacity={0.7}
              data-testid="history-toggle"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time" size={18} color="#8A8D98" />
                <Text style={s.historyHeaderText}>Recent Analyses</Text>
                <View style={s.historyCount}><Text style={s.historyCountText}>{history.length}</Text></View>
              </View>
              <Ionicons name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#8A8D98" />
            </TouchableOpacity>

            {historyExpanded && (
              <View style={{ gap: 8, marginTop: 8 }}>
                {isLoadingHistory ? (
                  <ActivityIndicator size="small" color="#00D4AA" style={{ paddingVertical: 20 }} />
                ) : (
                  history.map(item => (
                    <HistoryCard key={item.analysis_id} item={item} onPress={() => fetchHistoryDetail(item.analysis_id)} />
                  ))
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  screenSubtitle: { fontSize: 13, marginTop: 4, opacity: 0.7 },

  // Usage
  usageCard: { borderRadius: 18, padding: 16, marginBottom: 18, borderWidth: 1 },
  usageTitle: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  usageBarBg: { height: 7, borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  usageBarFill: { height: '100%', borderRadius: 4 },
  usageText: { fontSize: 12 },

  // Upload area
  uploadArea: { borderRadius: 18, padding: 18, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center' },
  uploadTitle: { fontSize: 17, fontWeight: '700', marginBottom: 3 },
  uploadSub: { fontSize: 12, marginBottom: 16 },
  uploadBtn: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1 },
  uploadIconWrap: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  uploadBtnTitle: { fontSize: 13, fontWeight: '700' },

  // Selected image
  imageContainer: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  selectedImage: { width: '100%', height: 200, backgroundColor: '#0A0E17' },
  imageActions: { flexDirection: 'row', justifyContent: 'center', padding: 10, gap: 14, backgroundColor: '#0A0E17' },
  imageActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, gap: 5 },
  imageActionLabel: { fontSize: 12, fontWeight: '600' },

  // Pickers
  pickerBtn: { flex: 1, borderRadius: 12, padding: 11, borderWidth: 1 },
  pickerDropdown: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, padding: 6, marginBottom: 14, borderWidth: 1 },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, margin: 3 },
  pickerItemText: { fontSize: 13 },

  // Analyze button
  analyzeBtn: { backgroundColor: '#00D4AA', borderRadius: 16, padding: 15, marginBottom: 16 },
  analyzeBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0E17' },

  // Analyzing
  analyzingContainer: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  analyzingIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,212,170,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  analyzingTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  analyzingSubtitle: { fontSize: 13, color: '#8A8D98', marginBottom: 28 },
  stepsWrap: { width: '100%', maxWidth: 280, gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepText: { fontSize: 13, color: '#5A5D68' },
  analyzingNote: { fontSize: 11, color: '#5A5D68', marginTop: 28 },

  // Success
  successOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00D4AA', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  successText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },

  // Centered screens (error, limit)
  centeredContainer: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  centeredTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  centeredSubtitle: { fontSize: 13, color: '#8A8D98', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  btnGroup: { width: '100%', maxWidth: 280, gap: 10 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 15, gap: 7 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0E17' },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1F2E', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#2A2F3E' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  planChip: { flex: 1, backgroundColor: '#1A1F2E', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2A2F3E' },
  planName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  planLimit: { fontSize: 11, color: '#8A8D98' },

  // Result header
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1F2E' },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  resultHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  // Chart card
  chartCard: { backgroundColor: '#1A1F2E', borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#2A2F3E' },
  chartLabel: { fontSize: 11, color: '#8A8D98', marginBottom: 3 },
  chartValue: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  chartImage: { width: '100%', height: 140, borderRadius: 10, backgroundColor: '#0A0E17' },

  // Hero card (bias + confidence)
  heroCard: { backgroundColor: '#1A1F2E', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2A2F3E' },
  heroLabel: { fontSize: 12, color: '#8A8D98', marginBottom: 2 },
  heroValue: { fontSize: 24, fontWeight: '800' },
  patternRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2A2F3E' },
  patternText: { fontSize: 12, color: '#8A8D98' },

  // Trade bias badge
  biasBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  biasBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },

  // Generic card
  card: { backgroundColor: '#1A1F2E', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#2A2F3E' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  cardBody: { fontSize: 13, color: '#DADDE5', lineHeight: 20 },
  levelVal: { fontSize: 14, fontWeight: '700', marginBottom: 5 },
  noData: { fontSize: 11, color: '#5A5D68', fontStyle: 'italic' },

  // Remaining + disclaimer
  remainingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,170,0.08)', borderRadius: 10, padding: 12, gap: 8, marginBottom: 14 },
  remainingText: { fontSize: 13, color: '#00D4AA', fontWeight: '600' },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(138,141,152,0.08)', borderRadius: 10, padding: 12, gap: 8, marginBottom: 14 },
  disclaimerText: { flex: 1, fontSize: 11, color: '#6A6D78', lineHeight: 16 },

  // CTA
  ctaBtn: { backgroundColor: '#00D4AA', borderRadius: 14, padding: 15, marginBottom: 28 },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0E17', marginLeft: 7 },

  // Upgrade nudge
  nudgeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,215,0,0.06)', borderRadius: 14, padding: 14, gap: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)' },
  nudgeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,215,0,0.15)', justifyContent: 'center', alignItems: 'center' },
  nudgeTitle: { fontSize: 14, fontWeight: '700', color: '#FFD700' },
  nudgeSubtitle: { fontSize: 11, color: '#8A8D98', marginTop: 1 },

  // History section
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  historyHeaderText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  historyCount: { backgroundColor: 'rgba(0,212,170,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  historyCountText: { fontSize: 11, fontWeight: '700', color: '#00D4AA' },

  // History card
  historyCard: { flexDirection: 'row', backgroundColor: '#1A1F2E', borderRadius: 14, borderWidth: 1, borderColor: '#2A2F3E', overflow: 'hidden' },
  historyStripe: { width: 3 },
  historyBody: { flex: 1, padding: 12 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyPair: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  historyPreview: { fontSize: 12, color: '#8A8D98', lineHeight: 17, marginBottom: 8 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  historyMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  historyMetaText: { fontSize: 10, color: '#6A6D78' },
  historyConfScore: { fontSize: 11, fontWeight: '700', marginLeft: 'auto' },

  // Share Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#141824', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#3A3F4E', borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#8A8D98', textAlign: 'center', marginBottom: 4 },
  shareOption: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1A1F2E', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2A2F3E' },
  shareIconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  shareOptionTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  shareOptionSub: { fontSize: 11, color: '#8A8D98', marginTop: 1 },
  modalCloseBtn: { backgroundColor: '#2A2F3E', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
  modalCloseBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});

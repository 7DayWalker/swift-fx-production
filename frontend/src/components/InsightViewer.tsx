import React, { useRef, useCallback, useState, memo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
  Share,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SOUND_PREF_KEY = 'swiftfx_insights_sound';

interface InsightItem {
  id: string;
  title: string;
  type: 'video' | 'image';
  video_url?: string;
  thumbnail: string;
  duration: number;
  category: string;
  is_ad?: boolean;
  like_count?: number;
  is_liked?: boolean;
  comment_count?: number;
}

interface InsightViewerProps {
  items: InsightItem[];
  initialIndex?: number;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Risk: '#FF6B6B',
  Entry: '#3B82F6',
  News: '#F59E0B',
  Psychology: '#8B5CF6',
  Strategy: '#10B981',
  Analysis: '#06B6D4',
  Fundamentals: '#EC4899',
  Sponsored: '#8A8D98',
};

export default function InsightViewer({ items: initialItems, initialIndex = 0, onClose }: InsightViewerProps) {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);
  const [items, setItems] = useState(initialItems);
  const [commentModalId, setCommentModalId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SOUND_PREF_KEY).then((val) => {
      if (val === 'on') setIsMuted(false);
    });
  }, []);

  const toggleSound = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      AsyncStorage.setItem(SOUND_PREF_KEY, next ? 'off' : 'on');
      return next;
    });
  }, []);

  const handleLikeToggle = useCallback(async (insightId: string) => {
    // Optimistic update
    setItems((prev) => prev.map((item) => {
      if (item.id !== insightId) return item;
      const wasLiked = item.is_liked;
      return {
        ...item,
        is_liked: !wasLiked,
        like_count: (item.like_count || 0) + (wasLiked ? -1 : 1),
      };
    }));
    // API call
    try {
      await api.post(`/insights/${insightId}/like`);
    } catch {
      // Revert on failure
      setItems((prev) => prev.map((item) => {
        if (item.id !== insightId) return item;
        const wasLiked = item.is_liked;
        return {
          ...item,
          is_liked: !wasLiked,
          like_count: (item.like_count || 0) + (wasLiked ? -1 : 1),
        };
      }));
    }
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem = useCallback(({ item, index }: { item: InsightItem; index: number }) => {
    return (
      <InsightSlide
        item={item}
        isActive={index === activeIndex}
        isMuted={isMuted}
        onToggleSound={toggleSound}
        onLike={() => handleLikeToggle(item.id)}
        onComment={() => setCommentModalId(item.id)}
      />
    );
  }, [activeIndex, isMuted, toggleSound, handleLikeToggle]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClose}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        data-testid="insight-viewer-close"
      >
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        initialScrollIndex={initialIndex}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={3}
      />

      {/* Comments Modal */}
      {commentModalId && (
        <CommentsModal
          insightId={commentModalId}
          onClose={() => {
            // Update comment count after closing
            setCommentModalId(null);
          }}
        />
      )}
    </View>
  );
}

// ── Individual slide ──
const InsightSlide = memo(({ item, isActive, isMuted, onToggleSound, onLike, onComment }: {
  item: InsightItem;
  isActive: boolean;
  isMuted: boolean;
  onToggleSound: () => void;
  onLike: () => void;
  onComment: () => void;
}) => {
  const videoRef = useRef<Video>(null);
  const categoryColor = CATEGORY_COLORS[item.category] || '#8A8D98';
  const likeScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isActive) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
      setProgress(0);
    }
  }, [isActive, fadeAnim]);

  useEffect(() => {
    if (!videoRef.current || item.type !== 'video') return;
    if (isActive) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
      videoRef.current.setPositionAsync(0);
    }
  }, [isActive, item.type]);

  useEffect(() => {
    if (videoRef.current && item.type === 'video') {
      videoRef.current.setIsMutedAsync(isMuted);
    }
  }, [isMuted, item.type]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.durationMillis && status.positionMillis) {
      setProgress(status.positionMillis / status.durationMillis);
    }
  }, []);

  const handleLikePress = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 50 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onLike();
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `${item.title} — Swift FX Insights` });
    } catch { /* cancelled */ }
  };

  return (
    <Animated.View style={[styles.slide, { opacity: fadeAnim }]}>
      {item.type === 'video' && item.video_url ? (
        <Video
          ref={videoRef}
          source={{ uri: item.video_url }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={isMuted}
          shouldPlay={isActive}
          posterSource={{ uri: item.thumbnail }}
          usePoster
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      ) : (
        <Image source={{ uri: item.thumbnail }} style={styles.media} resizeMode="cover" />
      )}

      <View style={styles.darkOverlay} />

      {/* Video progress bar */}
      {item.type === 'video' && (
        <View style={styles.videoProgressContainer}>
          <View style={[styles.videoProgressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}

      {/* Category badge */}
      <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}DD` }]}>
        <Text style={styles.categoryBadgeText}>{item.category}</Text>
      </View>

      {/* Sponsored */}
      {item.is_ad && (
        <View style={styles.adBadge}>
          <Ionicons name="megaphone-outline" size={12} color="#FFFFFF" />
          <Text style={styles.adBadgeText}>Sponsored</Text>
        </View>
      )}

      {/* Engagement column */}
      <View style={styles.engagementColumn}>
        {/* Like */}
        <TouchableOpacity onPress={handleLikePress} style={styles.engagementBtn}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={item.is_liked ? 'heart' : 'heart-outline'}
              size={26}
              color={item.is_liked ? '#FF6B6B' : '#FFFFFF'}
            />
          </Animated.View>
          {(item.like_count || 0) > 0 && (
            <Text style={styles.engagementCount}>{item.like_count}</Text>
          )}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity onPress={onComment} style={styles.engagementBtn}>
          <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
          {(item.comment_count || 0) > 0 && (
            <Text style={styles.engagementCount}>{item.comment_count}</Text>
          )}
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity onPress={handleShare} style={styles.engagementBtn}>
          <Ionicons name="share-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Sound */}
        {item.type === 'video' && (
          <TouchableOpacity onPress={onToggleSound} style={styles.engagementBtn}>
            <Ionicons
              name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Caption */}
      <View style={styles.captionArea}>
        <Text style={styles.caption}>{item.title}</Text>
        <Text style={styles.duration}>
          {item.duration < 60 ? `${item.duration}s` : `${Math.round(item.duration / 60)} min`} read
        </Text>
      </View>
    </Animated.View>
  );
});

// ── Comments Modal ──
function CommentsModal({ insightId, onClose }: { insightId: string; onClose: () => void }) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/insights/${insightId}/comments`);
        setComments(res.data?.comments || []);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, [insightId]);

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const res = await api.post(`/insights/${insightId}/comment`, { text: trimmed });
      if (res.data?.comment) {
        setComments((prev) => [res.data.comment, ...prev]);
        setText('');
      }
    } catch { /* ignore */ }
    setPosting(false);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.commentModalWrap}
      >
        <TouchableOpacity style={styles.commentModalBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.commentModal}>
          {/* Header */}
          <View style={styles.commentHeader}>
            <Text style={styles.commentHeaderText}>Comments</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#8A8D98" />
            </TouchableOpacity>
          </View>

          {/* List */}
          {loading ? (
            <ActivityIndicator color="#00D4AA" style={{ marginTop: 24 }} />
          ) : comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Ionicons name="chatbubble-outline" size={32} color="#3A3F4E" />
              <Text style={styles.emptyCommentsText}>No comments yet. Be the first!</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(_, i) => String(i)}
              style={styles.commentList}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Text style={styles.commentAuthor}>{item.user_name}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                  <Text style={styles.commentTime}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              )}
            />
          )}

          {/* Input */}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="#8A8D98"
              value={text}
              onChangeText={setText}
              maxLength={500}
              multiline
              returnKeyType="send"
              onSubmitEditing={handlePost}
            />
            <TouchableOpacity
              onPress={handlePost}
              disabled={!text.trim() || posting}
              style={[styles.commentSendBtn, (!text.trim() || posting) && { opacity: 0.4 }]}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#00D4AA" />
              ) : (
                <Ionicons name="send" size={20} color="#00D4AA" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  closeButton: {
    position: 'absolute', top: 56, right: 16, zIndex: 30,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  slide: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'flex-end' },
  media: { ...StyleSheet.absoluteFillObject },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  videoProgressContainer: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 10,
  },
  videoProgressFill: { height: '100%', backgroundColor: '#00D4AA' },
  categoryBadge: {
    position: 'absolute', top: 60, left: 16,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  categoryBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  adBadge: {
    position: 'absolute', top: 60, right: 60,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  adBadgeText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
  engagementColumn: {
    position: 'absolute', right: 12, bottom: 160, alignItems: 'center', gap: 16,
  },
  engagementBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center',
  },
  engagementCount: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  captionArea: { paddingHorizontal: 20, paddingBottom: 80, paddingRight: 70 },
  caption: {
    fontSize: 17, fontWeight: '700', color: '#FFFFFF', lineHeight: 24, marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  duration: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  // Comments modal
  commentModalWrap: { flex: 1, justifyContent: 'flex-end' },
  commentModalBackdrop: { flex: 1 },
  commentModal: {
    backgroundColor: '#1A1F2E', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.6, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  commentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2A2F3E',
  },
  commentHeaderText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  commentList: { paddingHorizontal: 16, paddingTop: 8 },
  commentItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2F3E' },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  commentText: { fontSize: 14, color: '#D1D5DB', lineHeight: 20 },
  commentTime: { fontSize: 10, color: '#8A8D98', marginTop: 4 },
  emptyComments: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyCommentsText: { fontSize: 13, color: '#8A8D98' },
  commentInputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#2A2F3E', gap: 8,
  },
  commentInput: {
    flex: 1, backgroundColor: '#0A0E17', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: '#FFFFFF',
    fontSize: 14, maxHeight: 80,
  },
  commentSendBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});

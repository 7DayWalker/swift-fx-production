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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export default function InsightViewer({ items, initialIndex = 0, onClose }: InsightViewerProps) {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);

  // Load sound preference
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
      />
    );
  }, [activeIndex, isMuted, toggleSound]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={styles.container}>
      {/* Close button */}
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
    </View>
  );
}

// ── Individual slide with engagement sidebar ──
const InsightSlide = memo(({ item, isActive, isMuted, onToggleSound }: {
  item: InsightItem;
  isActive: boolean;
  isMuted: boolean;
  onToggleSound: () => void;
}) => {
  const videoRef = useRef<Video>(null);
  const categoryColor = CATEGORY_COLORS[item.category] || '#8A8D98';
  const [liked, setLiked] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in on active
  useEffect(() => {
    if (isActive) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isActive, fadeAnim]);

  // Play/pause video
  useEffect(() => {
    if (!videoRef.current || item.type !== 'video') return;
    if (isActive) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isActive, item.type]);

  // Mute/unmute
  useEffect(() => {
    if (videoRef.current && item.type === 'video') {
      videoRef.current.setIsMutedAsync(isMuted);
    }
  }, [isMuted, item.type]);

  const handleLike = () => {
    setLiked(!liked);
    // Pop animation
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 50 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${item.title} — Swift FX Insights`,
      });
    } catch { /* cancelled */ }
  };

  return (
    <Animated.View style={[styles.slide, { opacity: fadeAnim }]}>
      {/* Background media */}
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
        />
      ) : (
        <Image source={{ uri: item.thumbnail }} style={styles.media} resizeMode="cover" />
      )}

      {/* Dark overlay for readability */}
      <View style={styles.darkOverlay} />

      {/* Category tag — top left */}
      <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}DD` }]}>
        <Text style={styles.categoryBadgeText}>{item.category}</Text>
      </View>

      {/* Sponsored indicator */}
      {item.is_ad && (
        <View style={styles.adBadge}>
          <Ionicons name="megaphone-outline" size={12} color="#FFFFFF" />
          <Text style={styles.adBadgeText}>Sponsored</Text>
        </View>
      )}

      {/* Right-side engagement column */}
      <View style={styles.engagementColumn}>
        {/* Like */}
        <TouchableOpacity onPress={handleLike} style={styles.engagementBtn}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={26}
              color={liked ? '#FF6B6B' : '#FFFFFF'}
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.engagementBtn}>
          <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity onPress={handleShare} style={styles.engagementBtn}>
          <Ionicons name="share-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Sound toggle */}
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

      {/* Caption overlay at bottom */}
      <View style={styles.captionArea}>
        <Text style={styles.caption}>{item.title}</Text>
        <Text style={styles.duration}>
          {item.duration < 60 ? `${item.duration}s` : `${Math.round(item.duration / 60)} min`} read
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'flex-end',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  categoryBadge: {
    position: 'absolute',
    top: 60,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  adBadge: {
    position: 'absolute',
    top: 60,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Engagement column — right side
  engagementColumn: {
    position: 'absolute',
    right: 12,
    bottom: 160,
    alignItems: 'center',
    gap: 20,
  },
  engagementBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Caption
  captionArea: {
    paddingHorizontal: 20,
    paddingBottom: 80,
    paddingRight: 70,
  },
  caption: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  duration: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});

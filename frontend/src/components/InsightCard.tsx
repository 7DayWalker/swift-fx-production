import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InsightCardProps {
  id: string;
  title: string;
  thumbnail: string;
  category: string;
  duration: number;
  is_ad?: boolean;
  locked?: boolean;
  onPress: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Risk: '#FF6B6B',
  Entry: '#3B82F6',
  News: '#F59E0B',
  Psychology: '#8B5CF6',
  Strategy: '#10B981',
  Analysis: '#06B6D4',
  Fundamentals: '#EC4899',
};

function InsightCard({ title, thumbnail, category, duration, is_ad, locked, onPress }: InsightCardProps) {
  const categoryColor = CATEGORY_COLORS[category] || '#8A8D98';
  const durationLabel = duration < 60 ? `${duration}s` : `${Math.round(duration / 60)}m`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      data-testid={`insight-card-${is_ad ? 'ad' : 'content'}`}
    >
      <View style={styles.thumbnailWrap}>
        <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
        {/* Duration badge */}
        <View style={styles.durationBadge}>
          <Ionicons name="time-outline" size={10} color="#FFFFFF" />
          <Text style={styles.durationText}>{durationLabel}</Text>
        </View>
        {/* Lock overlay */}
        {locked && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
          </View>
        )}
        {/* Sponsored tag */}
        {is_ad && (
          <View style={styles.sponsoredBadge}>
            <Text style={styles.sponsoredText}>Sponsored</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <View style={[styles.categoryTag, { backgroundColor: `${categoryColor}20` }]}>
          <Text style={[styles.categoryText, { color: categoryColor }]}>{category}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default memo(InsightCard);

const styles = StyleSheet.create({
  card: {
    width: 200,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#1A1F2E',
    overflow: 'hidden',
  },
  thumbnailWrap: {
    width: '100%',
    height: 112,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sponsoredBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsoredText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  content: {
    padding: 10,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 18,
  },
});

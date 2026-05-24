import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';
import { TAB_BAR_HEIGHT } from './_layout';
import PressableScale from '../../src/components/ui/PressableScale';

const { width: screenWidth } = Dimensions.get('window');

interface Post {
  post_id: string;
  user_id: string;
  user_name: string;
  content: string;
  post_type: string;
  image?: string | null;
  likes: string[];
  comment_count?: number;
  created_at: string;
}

interface Comment {
  comment_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'trending', label: 'Trending' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'results', label: 'Results' },
  { key: 'question', label: 'Questions' },
];

const getPostTypeColor = (type: string) => {
  switch (type) {
    case 'analysis': return '#00D4AA';
    case 'ai_analysis': return '#6366F1';
    case 'results': return '#FFD700';
    case 'question': return '#FF6B6B';
    default: return '#8A8D98';
  }
};

const getPostTypeLabel = (type: string) => {
  switch (type) {
    case 'ai_analysis': return 'AI Analysis';
    case 'analysis': return 'Analysis';
    case 'results': return 'Results';
    case 'question': return 'Question';
    default: return 'General';
  }
};

const getPostTypeIcon = (type: string) => {
  switch (type) {
    case 'analysis': return 'analytics-outline';
    case 'ai_analysis': return 'sparkles';
    case 'results': return 'trophy-outline';
    case 'question': return 'help-circle-outline';
    default: return 'chatbubble-outline';
  }
};

const formatPostDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export default function CommunityScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState('analysis');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [newPostImageBase64, setNewPostImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [loadingComments, setLoadingComments] = useState(false);

  const BOOKMARKS_KEY = 'swiftfx_bookmarks';

  useEffect(() => { fetchPosts(); loadBookmarks(); }, []);

  const loadBookmarks = async () => {
    try {
      const stored = await AsyncStorage.getItem(BOOKMARKS_KEY);
      if (stored) setBookmarkedPosts(new Set(JSON.parse(stored)));
    } catch {}
  };

  const toggleBookmark = useCallback(async (postId: string) => {
    const newBookmarks = new Set(bookmarkedPosts);
    if (newBookmarks.has(postId)) {
      newBookmarks.delete(postId);
    } else {
      newBookmarks.add(postId);
    }
    setBookmarkedPosts(newBookmarks);
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...newBookmarks]));
  }, [bookmarkedPosts]);

  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;
    const canUploadImages = user?.role === 'premium' || user?.role === 'vip';

  const fetchPosts = async () => {
    try {
      const res = await api.get('/community/posts');
      setPosts(res.data || []);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  const filteredPosts = useCallback(() => {
    let filtered = [...posts];
    if (activeTab === 'trending') {
      return filtered.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }
    if (activeTab !== 'all') {
      filtered = filtered.filter(p => p.post_type === activeTab || (activeTab === 'analysis' && p.post_type === 'ai_analysis'));
    }
    return filtered;
  }, [posts, activeTab])();

  const createPost = async () => {
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Please enter some content');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', newPostContent.trim());
      formData.append('post_type', newPostType);
      if (newPostImage) {
        formData.append('image', { uri: newPostImage, type: 'image/jpeg', name: 'post_image.jpg' } as any);
      }
      await api.post('/community/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNewPostContent('');
      setNewPostImage(null);
      setNewPostImageBase64(null);
      setShowCreateModal(false);
      fetchPosts();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickPostImage = async () => {
    if (!canUploadImages) {
      Alert.alert('Premium Feature', 'Image uploads require Premium or VIP subscription', [{ text: 'OK' }]);
      return;
    }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setNewPostImage(asset.uri);
      if (asset.base64) setNewPostImageBase64(asset.base64);
    }
  };

  const toggleLike = async (postId: string) => {
    try {
      const res = await api.post(`/community/posts/${postId}/like`);
      const { liked } = res.data;
      setPosts(posts.map(post => {
        if (post.post_id === postId) {
          const userId = user?.user_id || '';
          const newLikes = liked
            ? [...(post.likes || []), userId]
            : (post.likes || []).filter((id: string) => id !== userId);
          return { ...post, likes: newLikes };
        }
        return post;
      }));
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  const openComments = async (post: Post) => {
    setSelectedPost(post);
    setLoadingComments(true);
    try {
      const res = await api.get(`/community/posts/${post.post_id}/comments`);
      setComments(res.data || []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedPost) return;
    try {
      const res = await api.post(`/community/posts/${selectedPost.post_id}/comments`, { content: newComment.trim() });
      setComments([...comments, res.data]);
      setNewComment('');
      // Update comment count locally
      setPosts(posts.map(p =>
        p.post_id === selectedPost.post_id
          ? { ...p, comment_count: (p.comment_count || 0) + 1 }
          : p
      ));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add comment');
    }
  };

  const sharePost = async (post: Post) => {
    try {
      await Share.share({
        message: `${post.user_name} on Swift FX:\n\n${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}`,
      });
    } catch {}
  };

  // ─── Post Card ────────────────────────────────────────────────────────────
  const renderPost = ({ item }: { item: Post }) => {
    const isLiked = item.likes?.includes(user?.user_id || '');
    const likesCount = item.likes?.length || 0;
    const commentCount = item.comment_count || 0;
    const hasImage = !!item.image;
    const typeColor = getPostTypeColor(item.post_type);

    return (
      <View style={[styles.postCard, { backgroundColor: theme.surface }]} data-testid={`post-${item.post_id}`}>
        {/* Author row */}
        <View style={styles.postHeader}>
          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: `${typeColor}25` }]}>
              <Text style={[styles.avatarText, { color: typeColor }]}>
                {item.user_name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, { color: theme.text }]} numberOfLines={1}>
                {item.user_name}
              </Text>
              <Text style={[styles.postTime, { color: theme.textSecondary }]}>
                {formatPostDate(item.created_at)}
              </Text>
            </View>
          </View>
          <View style={[styles.typePill, { backgroundColor: `${typeColor}18` }]}>
            <Ionicons name={getPostTypeIcon(item.post_type) as any} size={12} color={typeColor} />
            <Text style={[styles.typePillText, { color: typeColor }]}>
              {getPostTypeLabel(item.post_type)}
            </Text>
          </View>
        </View>

        {/* Image-first: show image before content text if present */}
        {hasImage && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setViewingImage(`data:image/jpeg;base64,${item.image}`)}
            style={styles.postImageWrap}
          >
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.image}` }}
              style={styles.postImage}
              resizeMode="cover"
            />
            <View style={styles.expandIcon}>
              <Ionicons name="expand-outline" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Content text */}
        <Text style={[styles.postContent, { color: theme.text }]} numberOfLines={hasImage ? 3 : 8}>
          {item.content}
        </Text>

        {/* Engagement bar */}
        <View style={[styles.engagementBar, { borderTopColor: `${theme.border}80` }]}>
          <TouchableOpacity
            style={styles.engageBtn}
            onPress={() => toggleLike(item.post_id)}
            data-testid={`like-btn-${item.post_id}`}
          >
            <Ionicons
              name={isLiked ? 'flame' : 'flame-outline'}
              size={20}
              color={isLiked ? '#FF6B35' : theme.textSecondary}
            />
            {likesCount > 0 && (
              <Text style={[styles.engageCount, isLiked ? { color: '#FF6B35' } : { color: theme.textSecondary }]}>
                {likesCount}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.engageBtn}
            onPress={() => openComments(item)}
            data-testid={`comment-btn-${item.post_id}`}
          >
            <Ionicons name="chatbubble-outline" size={18} color={theme.textSecondary} />
            {commentCount > 0 && (
              <Text style={[styles.engageCount, { color: theme.textSecondary }]}>{commentCount}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.engageBtn} onPress={() => sharePost(item)}>
            <Ionicons name="share-outline" size={18} color={theme.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.engageBtn} onPress={() => toggleBookmark(item.post_id)} data-testid={`bookmark-btn-${item.post_id}`}>
            <Ionicons name={bookmarkedPosts.has(item.post_id) ? 'bookmark' : 'bookmark-outline'} size={18} color={bookmarkedPosts.has(item.post_id) ? '#FFD700' : theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Main Layout ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Community</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feed */}
      <FlatList
        data={filteredPosts}
        renderItem={renderPost}
        keyExtractor={(item) => item.post_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Posts Yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Be the first to share!</Text>
          </View>
        }
      />

      {/* Create Post FAB */}
      {user && (
        <PressableScale
          style={[styles.fab, { bottom: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 16 }]}
          onPress={() => setShowCreateModal(true)}
          data-testid="create-post-fab"
        >
          <Ionicons name="add" size={26} color="#0A0E17" />
        </PressableScale>
      )}

      {/* ─── Create Post Modal ─────────────────────────────────────── */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setShowCreateModal(false); setNewPostImage(null); setNewPostImageBase64(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>New Post</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); setNewPostImage(null); setNewPostImageBase64(null); }}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.typeSelector}>
              {['analysis', 'results', 'question'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, newPostType === type && { backgroundColor: `${getPostTypeColor(type)}20`, borderColor: getPostTypeColor(type) }]}
                  onPress={() => setNewPostType(type)}
                >
                  <Ionicons name={getPostTypeIcon(type) as any} size={14} color={getPostTypeColor(type)} />
                  <Text style={[styles.typeChipText, { color: newPostType === type ? getPostTypeColor(type) : theme.textSecondary }]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.postInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Share your analysis, results, or question..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={4}
              value={newPostContent}
              onChangeText={setNewPostContent}
            />

            {/* Image section */}
            <View style={styles.imagePickerSection}>
              {newPostImage ? (
                <View style={[styles.imagePreviewContainer, { borderColor: theme.border }]}>
                  <Image source={{ uri: newPostImage }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => { setNewPostImage(null); setNewPostImageBase64(null); }}>
                    <Ionicons name="close-circle" size={24} color={theme.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addImageButton, { borderColor: canUploadImages ? theme.primary : theme.border }]}
                  onPress={pickPostImage}
                >
                  <Ionicons name="image-outline" size={22} color={canUploadImages ? theme.primary : theme.textSecondary} />
                  <Text style={[styles.addImageText, { color: canUploadImages ? theme.primary : theme.textSecondary }]}>
                    {canUploadImages ? 'Add Chart / Screenshot' : 'Upgrade to add images'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.primary }, isSubmitting && { opacity: 0.5 }]}
              onPress={createPost}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color="#0A0E17" /> : <Text style={styles.submitButtonText}>Post</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Comments Modal ────────────────────────────────────────── */}
      <Modal visible={!!selectedPost} animationType="slide" transparent onRequestClose={() => setSelectedPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.commentsSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Comments</Text>
              <TouchableOpacity onPress={() => setSelectedPost(null)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.comment_id}
                style={{ flex: 1 }}
                ListEmptyComponent={
                  <Text style={[styles.noComments, { color: theme.textSecondary }]}>No comments yet</Text>
                }
                renderItem={({ item }) => (
                  <View style={[styles.commentItem, { borderBottomColor: `${theme.border}60` }]}>
                    <View style={[styles.commentAvatar, { backgroundColor: `${theme.primary}20` }]}>
                      <Text style={[styles.commentAvatarText, { color: theme.primary }]}>
                        {item.user_name?.charAt(0)?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={[styles.commentAuthor, { color: theme.text }]}>{item.user_name}</Text>
                        <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
                          {formatPostDate(item.created_at)}
                        </Text>
                      </View>
                      <Text style={[styles.commentText, { color: theme.textSecondary }]}>{item.content}</Text>
                    </View>
                  </View>
                )}
              />
            )}

            {user && (
              <View style={[styles.commentInputRow, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
                <TextInput
                  style={[styles.commentInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  placeholder="Add a comment..."
                  placeholderTextColor={theme.textSecondary}
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <TouchableOpacity style={[styles.sendButton, { backgroundColor: `${theme.primary}18` }]} onPress={addComment}>
                  <Ionicons name="send" size={18} color={theme.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Image Viewer ──────────────────────────────────────────── */}
      <Modal visible={!!viewingImage} animationType="fade" transparent onRequestClose={() => setViewingImage(null)}>
        <View style={styles.imageViewer}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewingImage(null)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          {viewingImage && (
            <Image source={{ uri: viewingImage }} style={styles.fullScreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8D98',
  },
  tabTextActive: {
    color: '#0A0E17',
  },

  // Feed
  listContent: { paddingHorizontal: 12, paddingTop: 4 },

  // Post card
  postCard: {
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: { fontSize: 15, fontWeight: '700' },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '700' },
  postTime: { fontSize: 11, marginTop: 1 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  typePillText: { fontSize: 11, fontWeight: '600', marginLeft: 4 },

  // Image-first
  postImageWrap: {
    width: '100%',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: 240,
  },
  expandIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    padding: 5,
  },

  // Content text
  postContent: {
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },

  // Engagement bar
  engagementBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: 6,
  },
  engageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  engageCount: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Empty
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptyText: { fontSize: 13, marginTop: 4 },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '82%' },
  commentsSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '70%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  // Type selector
  typeSelector: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  typeChipText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },

  // Post input
  postInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: 14,
    borderWidth: 1,
  },

  // Image picker
  imagePickerSection: { marginBottom: 14 },
  imagePreviewContainer: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 140, borderRadius: 12 },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
  },
  addImageText: { marginLeft: 8, fontSize: 13, fontWeight: '500' },

  // Submit
  submitButton: { borderRadius: 12, padding: 15, alignItems: 'center' },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#0A0E17' },

  // Comments
  noComments: { fontSize: 14, textAlign: 'center', marginTop: 40 },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  commentAvatarText: { fontSize: 12, fontWeight: '700' },
  commentAuthor: { fontSize: 13, fontWeight: '700', marginRight: 8 },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    marginRight: 10,
    borderWidth: 1,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Image viewer
  imageViewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  fullScreenImage: {
    width: screenWidth,
    height: '80%',
  },
});

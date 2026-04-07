import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  created_at: string;
}

interface Comment {
  comment_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export default function CommunityScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState('analysis');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [newPostImageBase64, setNewPostImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;
  const [loadingComments, setLoadingComments] = useState(false);
  
  // Check if user can upload images (premium or vip)
  const canUploadImages = user?.role === 'premium' || user?.role === 'vip';

  useEffect(() => {
    fetchPosts();
  }, []);

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

      // Append image if selected
      if (newPostImage) {
        formData.append('image', {
          uri: newPostImage,
          type: 'image/jpeg',
          name: 'post_image.jpg',
        } as any);
      }

      await api.post('/community/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // Reset form
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
      Alert.alert(
        'Premium Feature',
        'Image uploads require Premium or VIP subscription',
        [{ text: 'OK' }]
      );
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
      if (asset.base64) {
        setNewPostImageBase64(asset.base64);
      }
    }
  };

  const removePostImage = () => {
    setNewPostImage(null);
    setNewPostImageBase64(null);
  };

  const toggleLike = async (postId: string) => {
    try {
      const res = await api.post(`/community/posts/${postId}/like`);
      const { liked, likes_count } = res.data;
      setPosts(posts.map(post => {
        if (post.post_id === postId) {
          const userId = user?.id || '';
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
      const res = await api.post(`/community/posts/${selectedPost.post_id}/comments`, {
        content: newComment.trim(),
      });
      setComments([...comments, res.data]);
      setNewComment('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add comment');
    }
  };

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'analysis': return 'analytics-outline';
      case 'results': return 'trophy-outline';
      case 'question': return 'help-circle-outline';
      default: return 'chatbubble-outline';
    }
  };

  const getPostTypeColor = (type: string) => {
    switch (type) {
      case 'analysis': return '#00D4AA';
      case 'results': return '#FFD700';
      case 'question': return '#FF6B6B';
      default: return '#8A8D98';
    }
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isLiked = item.likes?.includes(user?.user_id || '');
    
    return (
      <View style={[styles.postCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.postHeader}>
          <View style={styles.postAuthor}>
            <View style={[styles.avatar, { backgroundColor: `${theme.primary}20` }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{item.user_name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={[styles.authorName, { color: theme.text }]}>{item.user_name}</Text>
              <Text style={[styles.postTime, { color: theme.textSecondary }]}>
                {new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>
          </View>
          <View style={[styles.postTypeBadge, { backgroundColor: `${getPostTypeColor(item.post_type)}20` }]}>
            <Ionicons name={getPostTypeIcon(item.post_type) as any} size={14} color={getPostTypeColor(item.post_type)} />
            <Text style={[styles.postTypeText, { color: getPostTypeColor(item.post_type) }]}>
              {item.post_type?.charAt(0).toUpperCase() + item.post_type?.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={[styles.postContent, { color: theme.text }]}>{item.content}</Text>

        {/* Post Image */}
        {item.image && (
          <TouchableOpacity 
            style={styles.postImageContainer}
            onPress={() => setViewingImage(`data:image/jpeg;base64,${item.image}`)}
          >
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.image}` }}
              style={styles.postImage}
              resizeMode="cover"
            />
            <View style={styles.imageOverlay}>
              <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}

        <View style={[styles.postActions, { borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.post_id)}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={isLiked ? theme.error : theme.textSecondary}
            />
            <Text style={[styles.actionText, { color: theme.textSecondary }, isLiked && { color: theme.error }]}>
              {item.likes?.length || 0}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => openComments(item)}>
            <Ionicons name="chatbubble-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.actionText, { color: theme.textSecondary }]}>Comment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Community</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Share insights with fellow traders</Text>
      </View>

      {/* Community Rules Banner */}
      <View style={[styles.rulesBanner, { backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}30` }]}>
        <Ionicons name="information-circle" size={20} color={theme.primary} />
        <Text style={[styles.rulesText, { color: theme.textSecondary }]}>
          Be respectful. No financial advice. Share for educational purposes only.
        </Text>
      </View>

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.post_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Posts Yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Be the first to share with the community!</Text>
          </View>
        }
      />

      {/* Create Post FAB */}
      {user && (
        <PressableScale style={styles.fab} onPress={() => setShowCreateModal(true)} data-testid="create-post-fab">
          <Ionicons name="add" size={28} color="#0A0E17" />
        </PressableScale>
      )}

      {/* Create Post Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCreateModal(false);
          setNewPostImage(null);
          setNewPostImageBase64(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Create Post</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateModal(false);
                setNewPostImage(null);
                setNewPostImageBase64(null);
              }}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.postTypeSelector}>
              {['analysis', 'results', 'question'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.postTypeOption,
                    { borderColor: theme.border },
                    newPostType === type && { backgroundColor: `${getPostTypeColor(type)}20`, borderColor: getPostTypeColor(type) }
                  ]}
                  onPress={() => setNewPostType(type)}
                >
                  <Ionicons name={getPostTypeIcon(type) as any} size={16} color={getPostTypeColor(type)} />
                  <Text style={[styles.postTypeOptionText, { color: newPostType === type ? getPostTypeColor(type) : theme.textSecondary }]}>
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

            {/* Image Picker Section */}
            <View style={styles.imagePickerSection}>
              {newPostImage ? (
                <View style={[styles.imagePreviewContainer, { borderColor: theme.border }]}>
                  <Image source={{ uri: newPostImage }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={removePostImage}>
                    <Ionicons name="close-circle" size={24} color={theme.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[
                    styles.addImageButton,
                    { borderColor: theme.border },
                    !canUploadImages && styles.addImageButtonDisabled
                  ]} 
                  onPress={pickPostImage}
                >
                  <Ionicons 
                    name="image-outline" 
                    size={24} 
                    color={canUploadImages ? theme.primary : theme.textSecondary} 
                  />
                  <Text style={[
                    styles.addImageText,
                    { color: canUploadImages ? theme.primary : theme.textSecondary }
                  ]}>
                    {canUploadImages ? 'Add Chart/Screenshot' : 'Upgrade to add images'}
                  </Text>
                  {!canUploadImages && (
                    <Ionicons name="lock-closed" size={14} color={theme.textSecondary} style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.primary }, isSubmitting && styles.submitButtonDisabled]}
              onPress={createPost}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <Text style={styles.submitButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments Modal */}
      <Modal
        visible={!!selectedPost}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPost(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={[styles.commentsModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Comments</Text>
              <TouchableOpacity onPress={() => setSelectedPost(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.comment_id}
                style={styles.commentsList}
                ListEmptyComponent={
                  <Text style={[styles.noComments, { color: theme.textSecondary }]}>No comments yet. Be the first!</Text>
                }
                renderItem={({ item }) => (
                  <View style={[styles.commentItem, { borderBottomColor: theme.border }]}>
                    <View style={[styles.commentAvatar, { backgroundColor: `${theme.primary}20` }]}>
                      <Text style={[styles.commentAvatarText, { color: theme.primary }]}>{item.user_name?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.commentContent}>
                      <Text style={[styles.commentAuthor, { color: theme.text }]}>{item.user_name}</Text>
                      <Text style={[styles.commentText, { color: theme.textSecondary }]}>{item.content}</Text>
                    </View>
                  </View>
                )}
              />
            )}

            {user && (
              <View style={[styles.commentInputContainer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
                <TextInput
                  style={[styles.commentInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                  placeholder="Add a comment..."
                  placeholderTextColor={theme.textSecondary}
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <TouchableOpacity style={[styles.sendButton, { backgroundColor: `${theme.primary}15` }]} onPress={addComment}>
                  <Ionicons name="send" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full Screen Image Viewer */}
      <Modal
        visible={!!viewingImage}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity 
            style={styles.imageViewerClose} 
            onPress={() => setViewingImage(null)}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.7,
  },
  rulesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.06)',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  rulesText: {
    flex: 1,
    fontSize: 12,
    color: '#8A8D98',
    marginLeft: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  postCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  authorName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  postTime: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 2,
  },
  postTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  postTypeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  postContent: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 16,
  },
  postActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionText: {
    fontSize: 14,
    color: '#8A8D98',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 0,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1F2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  commentsModalContent: {
    backgroundColor: '#1A1F2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  postTypeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  postTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  postTypeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  postInput: {
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  commentsList: {
    flex: 1,
  },
  noComments: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginTop: 40,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
    paddingTop: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0A0E17',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 12,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Image styles
  postImageContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    padding: 6,
  },
  imagePickerSection: {
    marginBottom: 16,
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderWidth: 1,
    borderColor: '#00D4AA',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
  },
  addImageButtonDisabled: {
    backgroundColor: 'rgba(138, 141, 152, 0.1)',
    borderColor: '#8A8D98',
  },
  addImageText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#00D4AA',
  },
  addImageTextDisabled: {
    color: '#8A8D98',
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 8,
  },
  fullScreenImage: {
    width: screenWidth,
    height: '80%',
  },
});

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../../src/services/api';

interface Insight {
  id: string;
  title: string;
  type: 'video' | 'image';
  video_url?: string;
  thumbnail: string;
  duration: number;
  category: string;
  is_active: boolean;
  created_at?: string;
}

const CATEGORIES = ['Risk', 'Entry', 'News', 'Psychology', 'Strategy', 'Analysis', 'Fundamentals'];

const CATEGORY_COLORS: Record<string, string> = {
  Risk: '#FF6B6B',
  Entry: '#3B82F6',
  News: '#F59E0B',
  Psychology: '#8B5CF6',
  Strategy: '#10B981',
  Analysis: '#06B6D4',
  Fundamentals: '#EC4899',
};

export default function InsightsManagementScreen() {
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingInsight, setEditingInsight] = useState<Insight | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await api.get('/admin/insights', { params: { limit: 50 } });
      setInsights(res.data?.insights || []);
      setTotal(res.data?.total || 0);
    } catch (err: any) {
      console.error('[Admin Insights] Fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const handleDelete = (insight: Insight) => {
    Alert.alert(
      'Delete Insight',
      `Are you sure you want to delete "${insight.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/admin/insights/${insight.id}`);
              setInsights((prev) => prev.filter((i) => i.id !== insight.id));
              setTotal((t) => t - 1);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete');
            }
          },
        },
      ],
    );
  };

  const handleEdit = (insight: Insight) => {
    setEditingInsight(insight);
    setModalVisible(true);
  };

  const handleCreate = () => {
    setEditingInsight(null);
    setModalVisible(true);
  };

  const handleSave = async (data: Partial<Insight>) => {
    try {
      if (editingInsight) {
        const res = await api.put(`/admin/insights/${editingInsight.id}`, data);
        setInsights((prev) => prev.map((i) => i.id === editingInsight.id ? res.data.insight : i));
      } else {
        const res = await api.post('/admin/insights', data);
        setInsights((prev) => [res.data.insight, ...prev]);
        setTotal((t) => t + 1);
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#00D4AA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Insights Management</Text>
          <Text style={styles.headerSub}>{total} total insights</Text>
        </View>
        <TouchableOpacity onPress={handleCreate} style={styles.createBtn} data-testid="create-insight-btn">
          <Ionicons name="add" size={20} color="#0A0E17" />
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInsights(); }} tintColor="#00D4AA" />}
      >
        {insights.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="bulb-outline" size={48} color="#3A3F4E" />
            <Text style={styles.emptyText}>No insights yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first insight</Text>
          </View>
        ) : (
          insights.map((item) => (
            <InsightRow
              key={item.id}
              insight={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <InsightFormModal
        visible={modalVisible}
        insight={editingInsight}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

// ── Row Component ──
function InsightRow({ insight, onEdit, onDelete }: { insight: Insight; onEdit: () => void; onDelete: () => void }) {
  const categoryColor = CATEGORY_COLORS[insight.category] || '#8A8D98';
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowCategoryDot, { backgroundColor: categoryColor }]} />
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle} numberOfLines={1}>{insight.title}</Text>
          <View style={styles.rowMeta}>
            <Text style={styles.rowMetaText}>{insight.category}</Text>
            <Text style={styles.rowMetaText}>{insight.type}</Text>
            <Text style={styles.rowMetaText}>{insight.duration}s</Text>
            {!insight.is_active && <Text style={[styles.rowMetaText, { color: '#FF6B6B' }]}>Inactive</Text>}
          </View>
        </View>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity onPress={onEdit} style={styles.rowActionBtn}>
          <Ionicons name="create-outline" size={18} color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.rowActionBtn}>
          <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Form Modal ──
function InsightFormModal({ visible, insight, onClose, onSave }: {
  visible: boolean;
  insight: Insight | null;
  onClose: () => void;
  onSave: (data: Partial<Insight>) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'video' | 'image'>('image');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [duration, setDuration] = useState('30');
  const [category, setCategory] = useState('Strategy');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (insight) {
      setTitle(insight.title);
      setType(insight.type);
      setVideoUrl(insight.video_url || '');
      setThumbnail(insight.thumbnail);
      setDuration(String(insight.duration));
      setCategory(insight.category);
      setIsActive(insight.is_active);
    } else {
      setTitle('');
      setType('image');
      setVideoUrl('');
      setThumbnail('');
      setDuration('30');
      setCategory('Strategy');
      setIsActive(true);
    }
  }, [insight, visible]);

  const handleSubmit = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!thumbnail.trim()) { Alert.alert('Error', 'Thumbnail URL is required'); return; }
    if (type === 'video' && !videoUrl.trim()) { Alert.alert('Error', 'Video URL is required for video type'); return; }

    setSaving(true);
    await onSave({
      title: title.trim(),
      type,
      video_url: type === 'video' ? videoUrl.trim() : undefined,
      thumbnail: thumbnail.trim(),
      duration: parseInt(duration) || 30,
      category,
      is_active: isActive,
    });
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrap}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{insight ? 'Edit Insight' : 'Create Insight'}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color="#8A8D98" />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Insight title..."
              placeholderTextColor="#8A8D98"
              data-testid="insight-form-title"
            />

            {/* Type */}
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'image' && styles.typeBtnActive]}
                onPress={() => setType('image')}
              >
                <Ionicons name="image-outline" size={16} color={type === 'image' ? '#0A0E17' : '#8A8D98'} />
                <Text style={[styles.typeBtnText, type === 'image' && styles.typeBtnTextActive]}>Image</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'video' && styles.typeBtnActive]}
                onPress={() => setType('video')}
              >
                <Ionicons name="videocam-outline" size={16} color={type === 'video' ? '#0A0E17' : '#8A8D98'} />
                <Text style={[styles.typeBtnText, type === 'video' && styles.typeBtnTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>

            {/* Video URL */}
            {type === 'video' && (
              <>
                <Text style={styles.fieldLabel}>Video URL</Text>
                <TextInput
                  style={styles.input}
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  placeholder="https://cdn.example.com/video.mp4"
                  placeholderTextColor="#8A8D98"
                  autoCapitalize="none"
                />
              </>
            )}

            {/* Thumbnail */}
            <Text style={styles.fieldLabel}>Thumbnail URL</Text>
            <TextInput
              style={styles.input}
              value={thumbnail}
              onChangeText={setThumbnail}
              placeholder="https://cdn.example.com/thumb.jpg"
              placeholderTextColor="#8A8D98"
              autoCapitalize="none"
            />

            {/* Duration */}
            <Text style={styles.fieldLabel}>Duration (seconds)</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              placeholder="30"
              placeholderTextColor="#8A8D98"
              keyboardType="numeric"
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, category === cat && { backgroundColor: CATEGORY_COLORS[cat] + '30', borderColor: CATEGORY_COLORS[cat] }]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, category === cat && { color: CATEGORY_COLORS[cat] }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Active toggle */}
            <View style={styles.toggleRow}>
              <Text style={styles.fieldLabel}>Active</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#3A3F4E', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={saving}
              data-testid="insight-form-submit"
            >
              {saving ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <Text style={styles.submitBtnText}>{insight ? 'Save Changes' : 'Create Insight'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1F2E',
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1A1F2E', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  headerSub: { fontSize: 12, color: '#8A8D98', marginTop: 2 },
  createBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#00D4AA', justifyContent: 'center', alignItems: 'center' },
  // List
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  emptySubtext: { fontSize: 13, color: '#8A8D98' },
  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1F2E', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowCategoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 },
  rowMeta: { flexDirection: 'row', gap: 8 },
  rowMetaText: { fontSize: 11, color: '#8A8D98', fontWeight: '500' },
  rowActions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  rowActionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#0A0E17', justifyContent: 'center', alignItems: 'center' },
  // Modal
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1 },
  modalContent: {
    backgroundColor: '#1A1F2E', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2F3E', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  // Form
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#8A8D98', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#0A0E17', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2A2F3E',
  },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: '#0A0E17', borderWidth: 1, borderColor: '#2A2F3E',
  },
  typeBtnActive: { backgroundColor: '#00D4AA', borderColor: '#00D4AA' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#8A8D98' },
  typeBtnTextActive: { color: '#0A0E17' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#2A2F3E', backgroundColor: '#0A0E17',
  },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: '#8A8D98' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  submitBtn: {
    backgroundColor: '#00D4AA', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 24, marginBottom: 10,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0E17' },
});

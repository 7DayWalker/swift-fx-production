import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';

interface Signal {
  signal_id: string;
  pair: string;
  signal_type: 'buy' | 'sell';
  entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  status: 'pending' | 'active' | 'closed';
  visibility: 'free' | 'premium' | 'vip';
  analysis?: string;
  result_pips?: number;
  created_at: string;
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const VISIBILITIES = ['free', 'premium', 'vip'];
const STATUSES = ['pending', 'active', 'closed'];

export default function SignalManagement() {
  const router = useRouter();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    pair: 'EUR/USD',
    signal_type: 'buy' as 'buy' | 'sell',
    entry: '',
    stop_loss: '',
    take_profit: '',
    visibility: 'free' as 'free' | 'premium' | 'vip',
    analysis: '',
  });

  const [editStatus, setEditStatus] = useState<'pending' | 'active' | 'closed'>('pending');
  const [editResultPips, setEditResultPips] = useState('');

  useEffect(() => {
    fetchSignals();
  }, []);

  const fetchSignals = async () => {
    try {
      const response = await api.get('/signals');
      setSignals(response.data);
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSignals();
    setRefreshing(false);
  };

  const resetForm = () => {
    setFormData({
      pair: 'EUR/USD',
      signal_type: 'buy',
      entry: '',
      stop_loss: '',
      take_profit: '',
      visibility: 'free',
      analysis: '',
    });
  };

  const handleCreateSignal = async () => {
    if (!formData.entry || !formData.stop_loss || !formData.take_profit) {
      const msg = 'Please fill in all required fields';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/admin/signals', {
        pair: formData.pair,
        signal_type: formData.signal_type,
        entry: parseFloat(formData.entry),
        stop_loss: parseFloat(formData.stop_loss),
        take_profit: parseFloat(formData.take_profit),
        visibility: formData.visibility,
        analysis: formData.analysis || null,
      });
      
      setShowCreateModal(false);
      resetForm();
      fetchSignals();
      const msg = 'Signal created successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to create signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSignal = async () => {
    if (!selectedSignal) return;

    setIsSubmitting(true);
    try {
      const params: any = { status: editStatus };
      if (editStatus === 'closed' && editResultPips) {
        params.result_pips = parseFloat(editResultPips);
      }

      await api.put(`/admin/signals/${selectedSignal.signal_id}`, null, { params });
      
      setShowEditModal(false);
      setSelectedSignal(null);
      fetchSignals();
      const msg = 'Signal updated successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to update signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSignal = async (signalId: string) => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to delete this signal?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Signal',
            'Are you sure you want to delete this signal?',
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
            ]
          );
        });

    if (!confirmDelete) return;

    try {
      await api.delete(`/admin/signals/${signalId}`);
      fetchSignals();
      const msg = 'Signal deleted successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to delete signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const openEditModal = (signal: Signal) => {
    setSelectedSignal(signal);
    setEditStatus(signal.status);
    setEditResultPips(signal.result_pips?.toString() || '');
    setShowEditModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFD700';
      case 'active': return '#00D4AA';
      case 'closed': return '#8A8D98';
      default: return '#8A8D98';
    }
  };

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'vip': return '#FFD700';
      case 'premium': return '#00D4AA';
      default: return '#8A8D98';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D4AA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Signal Management</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={24} color="#0A0E17" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        showsVerticalScrollIndicator={false}
      >
        {signals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={64} color="#8A8D98" />
            <Text style={styles.emptyText}>No signals yet</Text>
            <Text style={styles.emptySubtext}>Create your first signal</Text>
          </View>
        ) : (
          signals.map((signal) => (
            <View key={signal.signal_id} style={styles.signalCard}>
              <View style={styles.signalHeader}>
                <View>
                  <Text style={styles.signalPair}>{signal.pair}</Text>
                  <View style={styles.badges}>
                    <View style={[styles.badge, { backgroundColor: `${getStatusColor(signal.status)}20` }]}>
                      <Text style={[styles.badgeText, { color: getStatusColor(signal.status) }]}>
                        {signal.status.toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${getVisibilityColor(signal.visibility)}20` }]}>
                      <Text style={[styles.badgeText, { color: getVisibilityColor(signal.visibility) }]}>
                        {signal.visibility.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={[
                  styles.typeBadge,
                  { backgroundColor: signal.signal_type === 'buy' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 71, 87, 0.2)' }
                ]}>
                  <Ionicons
                    name={signal.signal_type === 'buy' ? 'arrow-up' : 'arrow-down'}
                    size={20}
                    color={signal.signal_type === 'buy' ? '#00D4AA' : '#FF4757'}
                  />
                  <Text style={[
                    styles.typeText,
                    { color: signal.signal_type === 'buy' ? '#00D4AA' : '#FF4757' }
                  ]}>
                    {signal.signal_type.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.signalDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Entry</Text>
                  <Text style={styles.detailValue}>{signal.entry}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>SL</Text>
                  <Text style={[styles.detailValue, { color: '#FF4757' }]}>{signal.stop_loss}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TP</Text>
                  <Text style={[styles.detailValue, { color: '#00D4AA' }]}>{signal.take_profit}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>R:R</Text>
                  <Text style={styles.detailValue}>1:{signal.risk_reward}</Text>
                </View>
              </View>

              {signal.result_pips !== undefined && signal.status === 'closed' && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Result:</Text>
                  <Text style={[
                    styles.resultValue,
                    { color: signal.result_pips >= 0 ? '#00D4AA' : '#FF4757' }
                  ]}>
                    {signal.result_pips >= 0 ? '+' : ''}{signal.result_pips} pips
                  </Text>
                </View>
              )}

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(signal)}>
                  <Ionicons name="create-outline" size={18} color="#00D4AA" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteSignal(signal.signal_id)}>
                  <Ionicons name="trash-outline" size={18} color="#FF4757" />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Signal Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Signal</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Pair Selection */}
              <Text style={styles.inputLabel}>Trading Pair</Text>
              <View style={styles.optionsRow}>
                {PAIRS.slice(0, 4).map((pair) => (
                  <TouchableOpacity
                    key={pair}
                    style={[styles.optionButton, formData.pair === pair && styles.optionButtonActive]}
                    onPress={() => setFormData({ ...formData, pair })}
                  >
                    <Text style={[styles.optionText, formData.pair === pair && styles.optionTextActive]}>
                      {pair}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.optionsRow}>
                {PAIRS.slice(4).map((pair) => (
                  <TouchableOpacity
                    key={pair}
                    style={[styles.optionButton, formData.pair === pair && styles.optionButtonActive]}
                    onPress={() => setFormData({ ...formData, pair })}
                  >
                    <Text style={[styles.optionText, formData.pair === pair && styles.optionTextActive]}>
                      {pair}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Signal Type */}
              <Text style={styles.inputLabel}>Signal Type</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeButton, formData.signal_type === 'buy' && styles.buyButtonActive]}
                  onPress={() => setFormData({ ...formData, signal_type: 'buy' })}
                >
                  <Ionicons name="arrow-up" size={20} color={formData.signal_type === 'buy' ? '#0A0E17' : '#00D4AA'} />
                  <Text style={[styles.typeButtonText, formData.signal_type === 'buy' && { color: '#0A0E17' }]}>BUY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, formData.signal_type === 'sell' && styles.sellButtonActive]}
                  onPress={() => setFormData({ ...formData, signal_type: 'sell' })}
                >
                  <Ionicons name="arrow-down" size={20} color={formData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757'} />
                  <Text style={[styles.typeButtonText, { color: formData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757' }]}>SELL</Text>
                </TouchableOpacity>
              </View>

              {/* Price Inputs */}
              <Text style={styles.inputLabel}>Entry Price *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0850"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.entry}
                onChangeText={(text) => setFormData({ ...formData, entry: text })}
              />

              <Text style={styles.inputLabel}>Stop Loss *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0820"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.stop_loss}
                onChangeText={(text) => setFormData({ ...formData, stop_loss: text })}
              />

              <Text style={styles.inputLabel}>Take Profit *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0910"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.take_profit}
                onChangeText={(text) => setFormData({ ...formData, take_profit: text })}
              />

              {/* Visibility */}
              <Text style={styles.inputLabel}>Visibility</Text>
              <View style={styles.optionsRow}>
                {VISIBILITIES.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.optionButton, formData.visibility === v && styles.optionButtonActive]}
                    onPress={() => setFormData({ ...formData, visibility: v as any })}
                  >
                    <Text style={[styles.optionText, formData.visibility === v && styles.optionTextActive]}>
                      {v.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Analysis */}
              <Text style={styles.inputLabel}>Analysis (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Add technical analysis..."
                placeholderTextColor="#8A8D98"
                multiline
                numberOfLines={3}
                value={formData.analysis}
                onChangeText={(text) => setFormData({ ...formData, analysis: text })}
              />

              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleCreateSignal}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#0A0E17" />
                ) : (
                  <Text style={styles.submitButtonText}>Create Signal</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Signal Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Signal</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedSignal && (
                <>
                  <View style={styles.signalInfo}>
                    <Text style={styles.signalInfoPair}>{selectedSignal.pair}</Text>
                    <Text style={styles.signalInfoType}>
                      {selectedSignal.signal_type.toUpperCase()} @ {selectedSignal.entry}
                    </Text>
                  </View>

                  <Text style={styles.inputLabel}>Status</Text>
                  <View style={styles.optionsRow}>
                    {STATUSES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.optionButton, editStatus === s && styles.optionButtonActive]}
                        onPress={() => setEditStatus(s as any)}
                      >
                        <Text style={[styles.optionText, editStatus === s && styles.optionTextActive]}>
                          {s.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {editStatus === 'closed' && (
                    <>
                      <Text style={styles.inputLabel}>Result (Pips)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 50 or -30"
                        placeholderTextColor="#8A8D98"
                        keyboardType="numeric"
                        value={editResultPips}
                        onChangeText={setEditResultPips}
                      />
                    </>
                  )}

                  <TouchableOpacity
                    style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                    onPress={handleUpdateSignal}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#0A0E17" />
                    ) : (
                      <Text style={styles.submitButtonText}>Update Signal</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: '#00D4AA',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 8,
  },
  signalCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  signalPair: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  typeText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  signalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: '#8A8D98',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginRight: 8,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00D4AA',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF4757',
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalScroll: {
    padding: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0A0E17',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  optionButtonActive: {
    backgroundColor: '#00D4AA',
    borderColor: '#00D4AA',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8D98',
  },
  optionTextActive: {
    color: '#0A0E17',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0A0E17',
    borderWidth: 1,
    borderColor: '#2A2F3E',
    gap: 8,
  },
  buyButtonActive: {
    backgroundColor: '#00D4AA',
    borderColor: '#00D4AA',
  },
  sellButtonActive: {
    backgroundColor: '#FF4757',
    borderColor: '#FF4757',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  submitButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  signalInfo: {
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  signalInfoPair: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  signalInfoType: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 4,
  },
});

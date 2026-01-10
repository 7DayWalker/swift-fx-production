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
  tp1: number;
  tp2?: number;
  tp3?: number;
  tp_hit: number;
  risk_reward: number;
  status: 'pending' | 'active' | 'closed';
  visibility: 'free' | 'premium' | 'vip';
  analysis?: string;
  final_pips?: number;
  result_pips?: number; // Legacy support
  created_at: string;
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const VISIBILITIES = ['free', 'premium', 'vip'];

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
    tp1: '',
    tp2: '',
    tp3: '',
    visibility: 'free' as 'free' | 'premium' | 'vip',
    analysis: '',
  });

  // Edit state
  const [closePrice, setClosePrice] = useState('');
  const [finalPips, setFinalPips] = useState('');

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
      tp1: '',
      tp2: '',
      tp3: '',
      visibility: 'free',
      analysis: '',
    });
  };

  const handleCreateSignal = async () => {
    if (!formData.entry || !formData.stop_loss || !formData.tp1) {
      const msg = 'Please fill in Entry, Stop Loss, and TP1';
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
        tp1: parseFloat(formData.tp1),
        tp2: formData.tp2 ? parseFloat(formData.tp2) : null,
        tp3: formData.tp3 ? parseFloat(formData.tp3) : null,
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

  const handleActivateSignal = async (signalId: string) => {
    try {
      await api.post(`/admin/signals/${signalId}/activate`);
      fetchSignals();
      const msg = 'Signal activated!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to activate signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const handleMarkTP = async (signalId: string, tpLevel: number) => {
    try {
      await api.post(`/admin/signals/${signalId}/mark-tp?tp_level=${tpLevel}`);
      fetchSignals();
      const msg = tpLevel === 3 ? 'TP3 hit - Signal closed!' : `TP${tpLevel} marked as hit!`;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to mark TP';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const handleCloseSignal = async () => {
    if (!selectedSignal) return;

    setIsSubmitting(true);
    try {
      const params: any = {};
      if (closePrice) params.close_price = parseFloat(closePrice);
      else if (finalPips) params.final_pips = parseFloat(finalPips);

      await api.post(`/admin/signals/${selectedSignal.signal_id}/close`, null, { params });
      
      setShowEditModal(false);
      setSelectedSignal(null);
      setClosePrice('');
      setFinalPips('');
      fetchSignals();
      const msg = 'Signal closed successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to close signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSignal = async (signalId: string) => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to permanently delete this signal? This cannot be undone.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Signal',
            'Are you sure you want to permanently delete this signal? This cannot be undone.',
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
      const msg = 'Signal deleted permanently!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to delete signal';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const openEditModal = (signal: Signal) => {
    setSelectedSignal(signal);
    setClosePrice('');
    setFinalPips('');
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

  const getPipsValue = (signal: Signal) => {
    return signal.final_pips ?? signal.result_pips ?? null;
  };

  const renderTPBadge = (level: number, price: number | undefined, hit: number) => {
    if (!price) return null;
    const isHit = hit >= level;
    return (
      <View style={[styles.tpBadge, isHit && styles.tpBadgeHit]}>
        <Text style={[styles.tpBadgeText, isHit && styles.tpBadgeTextHit]}>
          TP{level}: {price} {isHit ? '✓' : ''}
        </Text>
      </View>
    );
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
                  <Text style={styles.detailLabel}>R:R</Text>
                  <Text style={styles.detailValue}>1:{signal.risk_reward}</Text>
                </View>
              </View>

              {/* TP Levels */}
              <View style={styles.tpContainer}>
                {renderTPBadge(1, signal.tp1, signal.tp_hit || 0)}
                {renderTPBadge(2, signal.tp2, signal.tp_hit || 0)}
                {renderTPBadge(3, signal.tp3, signal.tp_hit || 0)}
              </View>

              {getPipsValue(signal) !== null && signal.status === 'closed' && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Final Result:</Text>
                  <Text style={[
                    styles.resultValue,
                    { color: (getPipsValue(signal) || 0) >= 0 ? '#00D4AA' : '#FF4757' }
                  ]}>
                    {(getPipsValue(signal) || 0) >= 0 ? '+' : ''}{getPipsValue(signal)} pips
                  </Text>
                </View>
              )}

              {/* Quick Actions for Active Signals */}
              {signal.status === 'active' && (
                <View style={styles.tpActions}>
                  <Text style={styles.tpActionsLabel}>Mark TP Hit:</Text>
                  <View style={styles.tpButtonsRow}>
                    {signal.tp1 && (signal.tp_hit || 0) < 1 && (
                      <TouchableOpacity 
                        style={styles.tpButton} 
                        onPress={() => handleMarkTP(signal.signal_id, 1)}
                      >
                        <Text style={styles.tpButtonText}>TP1</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp2 && (signal.tp_hit || 0) < 2 && (
                      <TouchableOpacity 
                        style={styles.tpButton} 
                        onPress={() => handleMarkTP(signal.signal_id, 2)}
                      >
                        <Text style={styles.tpButtonText}>TP2</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp3 && (signal.tp_hit || 0) < 3 && (
                      <TouchableOpacity 
                        style={[styles.tpButton, styles.tp3Button]} 
                        onPress={() => handleMarkTP(signal.signal_id, 3)}
                      >
                        <Text style={styles.tpButtonText}>TP3 (Close)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.actionButtons}>
                {signal.status === 'pending' && (
                  <TouchableOpacity style={styles.activateButton} onPress={() => handleActivateSignal(signal.signal_id)}>
                    <Ionicons name="play" size={18} color="#00D4AA" />
                    <Text style={styles.activateButtonText}>Activate</Text>
                  </TouchableOpacity>
                )}
                {signal.status !== 'closed' && (
                  <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(signal)}>
                    <Ionicons name="close-circle-outline" size={18} color="#FFD700" />
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                )}
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

              <Text style={styles.inputLabel}>Take Profit 1 (TP1) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0880"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.tp1}
                onChangeText={(text) => setFormData({ ...formData, tp1: text })}
              />

              <Text style={styles.inputLabel}>Take Profit 2 (TP2) - Optional</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0910"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.tp2}
                onChangeText={(text) => setFormData({ ...formData, tp2: text })}
              />

              <Text style={styles.inputLabel}>Take Profit 3 (TP3) - Optional</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1.0950"
                placeholderTextColor="#8A8D98"
                keyboardType="decimal-pad"
                value={formData.tp3}
                onChangeText={(text) => setFormData({ ...formData, tp3: text })}
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

      {/* Close Signal Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Close Signal</Text>
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
                    <View style={styles.tpInfoRow}>
                      <Text style={styles.tpInfoText}>
                        TP Hit Level: {selectedSignal.tp_hit || 0}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Close Price (calculates pips)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 1.0920"
                    placeholderTextColor="#8A8D98"
                    keyboardType="decimal-pad"
                    value={closePrice}
                    onChangeText={setClosePrice}
                  />

                  <Text style={styles.orText}>— OR —</Text>

                  <Text style={styles.inputLabel}>Enter Final Pips Directly</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 50 or -30"
                    placeholderTextColor="#8A8D98"
                    keyboardType="numeric"
                    value={finalPips}
                    onChangeText={setFinalPips}
                  />

                  <TouchableOpacity
                    style={[styles.submitButton, styles.closeSubmitButton, isSubmitting && styles.submitButtonDisabled]}
                    onPress={handleCloseSignal}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.closeSubmitButtonText}>Close Signal</Text>
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
  tpContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tpBadge: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  tpBadgeHit: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    borderColor: '#00D4AA',
  },
  tpBadgeText: {
    fontSize: 12,
    color: '#8A8D98',
    fontWeight: '600',
  },
  tpBadgeTextHit: {
    color: '#00D4AA',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#0A0E17',
    padding: 12,
    borderRadius: 8,
  },
  resultLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginRight: 8,
  },
  resultValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tpActions: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  tpActionsLabel: {
    fontSize: 12,
    color: '#00D4AA',
    fontWeight: '600',
    marginBottom: 8,
  },
  tpButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tpButton: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tp3Button: {
    backgroundColor: '#FFD700',
  },
  tpButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  activateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  activateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00D4AA',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    padding: 12,
    borderRadius: 8,
    gap: 6,
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
  closeSubmitButton: {
    backgroundColor: '#FF4757',
  },
  closeSubmitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
  tpInfoRow: {
    marginTop: 8,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tpInfoText: {
    fontSize: 12,
    color: '#00D4AA',
    fontWeight: '600',
  },
  orText: {
    textAlign: 'center',
    color: '#8A8D98',
    marginVertical: 16,
    fontSize: 14,
  },
});

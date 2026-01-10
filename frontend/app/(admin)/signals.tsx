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
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Create form state
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

  // Edit form state
  const [editData, setEditData] = useState({
    pair: '',
    signal_type: 'buy' as 'buy' | 'sell',
    entry: '',
    stop_loss: '',
    tp1: '',
    tp2: '',
    tp3: '',
    tp_hit: 0,
    status: 'pending' as 'pending' | 'active' | 'closed',
    visibility: 'free' as 'free' | 'premium' | 'vip',
  });

  // Close modal state
  const [closePrice, setClosePrice] = useState('');
  const [finalPips, setFinalPips] = useState('');
  const [closeTpHit, setCloseTpHit] = useState(0);

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

  const resetCreateForm = () => {
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

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const confirmAction = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return window.confirm(`${title}\n\n${message}`);
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
        { text: 'Confirm', onPress: () => resolve(true), style: 'destructive' },
      ]);
    });
  };

  // ========== CREATE SIGNAL ==========
  const handleCreateSignal = async () => {
    if (!formData.entry || !formData.stop_loss || !formData.tp1) {
      showAlert('Error', 'Please fill in Entry, Stop Loss, and TP1');
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
      resetCreateForm();
      fetchSignals();
      showAlert('Success', 'Signal created successfully!');
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to create signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== EDIT SIGNAL ==========
  const openEditModal = (signal: Signal) => {
    setSelectedSignal(signal);
    setEditData({
      pair: signal.pair,
      signal_type: signal.signal_type,
      entry: signal.entry.toString(),
      stop_loss: signal.stop_loss.toString(),
      tp1: signal.tp1.toString(),
      tp2: signal.tp2?.toString() || '',
      tp3: signal.tp3?.toString() || '',
      tp_hit: signal.tp_hit || 0,
      status: signal.status,
      visibility: signal.visibility,
    });
    setShowEditModal(true);
  };

  const handleEditSignal = async () => {
    if (!selectedSignal || !editData.entry || !editData.stop_loss || !editData.tp1) {
      showAlert('Error', 'Please fill in Entry, Stop Loss, and TP1');
      return;
    }

    setIsSubmitting(true);
    try {
      // Use PUT to update the signal with all fields
      await api.put(`/admin/signals/${selectedSignal.signal_id}/full`, {
        pair: editData.pair,
        signal_type: editData.signal_type,
        entry: parseFloat(editData.entry),
        stop_loss: parseFloat(editData.stop_loss),
        tp1: parseFloat(editData.tp1),
        tp2: editData.tp2 ? parseFloat(editData.tp2) : null,
        tp3: editData.tp3 ? parseFloat(editData.tp3) : null,
        tp_hit: editData.tp_hit,
        status: editData.status,
        visibility: editData.visibility,
      });
      
      setShowEditModal(false);
      setSelectedSignal(null);
      fetchSignals();
      showAlert('Success', 'Signal updated successfully!');
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to update signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== ACTIVATE SIGNAL ==========
  const handleActivateSignal = async (signalId: string) => {
    try {
      await api.post(`/admin/signals/${signalId}/activate`);
      fetchSignals();
      showAlert('Success', 'Signal activated!');
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to activate signal');
    }
  };

  // ========== MARK TP HIT ==========
  const handleMarkTP = async (signalId: string, tpLevel: number) => {
    try {
      await api.post(`/admin/signals/${signalId}/mark-tp?tp_level=${tpLevel}`);
      fetchSignals();
      showAlert('Success', tpLevel === 3 ? 'TP3 hit - Signal closed!' : `TP${tpLevel} marked as hit!`);
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to mark TP');
    }
  };

  // ========== CLOSE SIGNAL ==========
  const openCloseModal = (signal: Signal) => {
    setSelectedSignal(signal);
    setClosePrice('');
    setFinalPips('');
    setCloseTpHit(signal.tp_hit || 0);
    setShowCloseModal(true);
  };

  const handleCloseSignal = async () => {
    if (!selectedSignal) return;

    setIsSubmitting(true);
    try {
      const params: any = { tp_hit: closeTpHit };
      if (closePrice) params.close_price = parseFloat(closePrice);
      else if (finalPips) params.final_pips = parseFloat(finalPips);

      await api.post(`/admin/signals/${selectedSignal.signal_id}/close`, null, { params });
      
      setShowCloseModal(false);
      setSelectedSignal(null);
      fetchSignals();
      showAlert('Success', 'Signal closed successfully!');
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to close signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== DELETE SIGNAL ==========
  const handleDeleteSignal = async (signalId: string) => {
    const confirmed = await confirmAction(
      'Delete Signal',
      'Are you sure you want to PERMANENTLY delete this signal? This cannot be undone and will remove it from all views including history.'
    );

    if (!confirmed) return;

    setIsDeleting(signalId);
    try {
      await api.delete(`/admin/signals/${signalId}`);
      // Remove from local state immediately
      setSignals(prev => prev.filter(s => s.signal_id !== signalId));
      showAlert('Success', 'Signal deleted permanently!');
    } catch (error: any) {
      console.error('Delete error:', error);
      showAlert('Error', error.response?.data?.detail || 'Failed to delete signal');
      // Refresh to get accurate state
      fetchSignals();
    } finally {
      setIsDeleting(null);
    }
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

  const getPipsValue = (signal: Signal) => signal.final_pips ?? signal.result_pips ?? null;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />}
        showsVerticalScrollIndicator={false}
      >
        {signals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={64} color="#8A8D98" />
            <Text style={styles.emptyText}>No signals yet</Text>
          </View>
        ) : (
          signals.map((signal) => (
            <View key={signal.signal_id} style={styles.signalCard}>
              {/* Signal Header */}
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
                  <Text style={[styles.typeText, { color: signal.signal_type === 'buy' ? '#00D4AA' : '#FF4757' }]}>
                    {signal.signal_type.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Signal Details */}
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

              {/* Result for closed signals */}
              {getPipsValue(signal) !== null && signal.status === 'closed' && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Final Result:</Text>
                  <Text style={[styles.resultValue, { color: (getPipsValue(signal) || 0) >= 0 ? '#00D4AA' : '#FF4757' }]}>
                    {(getPipsValue(signal) || 0) >= 0 ? '+' : ''}{getPipsValue(signal)} pips
                  </Text>
                </View>
              )}

              {/* Quick TP Actions for Active Signals */}
              {signal.status === 'active' && (
                <View style={styles.tpActions}>
                  <Text style={styles.tpActionsLabel}>Mark TP Hit:</Text>
                  <View style={styles.tpButtonsRow}>
                    {signal.tp1 && (signal.tp_hit || 0) < 1 && (
                      <TouchableOpacity style={styles.tpButton} onPress={() => handleMarkTP(signal.signal_id, 1)}>
                        <Text style={styles.tpButtonText}>TP1</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp2 && (signal.tp_hit || 0) < 2 && (
                      <TouchableOpacity style={styles.tpButton} onPress={() => handleMarkTP(signal.signal_id, 2)}>
                        <Text style={styles.tpButtonText}>TP2</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp3 && (signal.tp_hit || 0) < 3 && (
                      <TouchableOpacity style={[styles.tpButton, styles.tp3Button]} onPress={() => handleMarkTP(signal.signal_id, 3)}>
                        <Text style={styles.tpButtonText}>TP3 (Close)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                {signal.status === 'pending' && (
                  <TouchableOpacity style={styles.activateButton} onPress={() => handleActivateSignal(signal.signal_id)}>
                    <Ionicons name="play" size={16} color="#00D4AA" />
                    <Text style={styles.activateButtonText}>Activate</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(signal)}>
                  <Ionicons name="pencil" size={16} color="#00D4AA" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                
                {signal.status !== 'closed' && (
                  <TouchableOpacity style={styles.closeButton} onPress={() => openCloseModal(signal)}>
                    <Ionicons name="close-circle-outline" size={16} color="#FFD700" />
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={[styles.deleteButton, isDeleting === signal.signal_id && styles.deleteButtonDisabled]} 
                  onPress={() => handleDeleteSignal(signal.signal_id)}
                  disabled={isDeleting === signal.signal_id}
                >
                  {isDeleting === signal.signal_id ? (
                    <ActivityIndicator size="small" color="#FF4757" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color="#FF4757" />
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ========== CREATE SIGNAL MODAL ========== */}
      <Modal visible={showCreateModal} animationType="slide" transparent={true} onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Signal</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); resetCreateForm(); }}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Trading Pair</Text>
              <View style={styles.optionsRow}>
                {PAIRS.slice(0, 4).map((pair) => (
                  <TouchableOpacity key={pair} style={[styles.optionButton, formData.pair === pair && styles.optionButtonActive]} onPress={() => setFormData({ ...formData, pair })}>
                    <Text style={[styles.optionText, formData.pair === pair && styles.optionTextActive]}>{pair}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.optionsRow}>
                {PAIRS.slice(4).map((pair) => (
                  <TouchableOpacity key={pair} style={[styles.optionButton, formData.pair === pair && styles.optionButtonActive]} onPress={() => setFormData({ ...formData, pair })}>
                    <Text style={[styles.optionText, formData.pair === pair && styles.optionTextActive]}>{pair}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Signal Type</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity style={[styles.typeButton, formData.signal_type === 'buy' && styles.buyButtonActive]} onPress={() => setFormData({ ...formData, signal_type: 'buy' })}>
                  <Ionicons name="arrow-up" size={20} color={formData.signal_type === 'buy' ? '#0A0E17' : '#00D4AA'} />
                  <Text style={[styles.typeButtonText, formData.signal_type === 'buy' && { color: '#0A0E17' }]}>BUY</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeButton, formData.signal_type === 'sell' && styles.sellButtonActive]} onPress={() => setFormData({ ...formData, signal_type: 'sell' })}>
                  <Ionicons name="arrow-down" size={20} color={formData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757'} />
                  <Text style={[styles.typeButtonText, { color: formData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757' }]}>SELL</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Entry Price *</Text>
              <TextInput style={styles.input} placeholder="e.g. 1.0850" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={formData.entry} onChangeText={(text) => setFormData({ ...formData, entry: text })} />

              <Text style={styles.inputLabel}>Stop Loss *</Text>
              <TextInput style={styles.input} placeholder="e.g. 1.0820" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={formData.stop_loss} onChangeText={(text) => setFormData({ ...formData, stop_loss: text })} />

              <Text style={styles.inputLabel}>Take Profit 1 (TP1) *</Text>
              <TextInput style={styles.input} placeholder="e.g. 1.0880" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={formData.tp1} onChangeText={(text) => setFormData({ ...formData, tp1: text })} />

              <Text style={styles.inputLabel}>Take Profit 2 (TP2)</Text>
              <TextInput style={styles.input} placeholder="Optional" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={formData.tp2} onChangeText={(text) => setFormData({ ...formData, tp2: text })} />

              <Text style={styles.inputLabel}>Take Profit 3 (TP3)</Text>
              <TextInput style={styles.input} placeholder="Optional" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={formData.tp3} onChangeText={(text) => setFormData({ ...formData, tp3: text })} />

              <Text style={styles.inputLabel}>Visibility</Text>
              <View style={styles.optionsRow}>
                {VISIBILITIES.map((v) => (
                  <TouchableOpacity key={v} style={[styles.optionButton, formData.visibility === v && styles.optionButtonActive]} onPress={() => setFormData({ ...formData, visibility: v as any })}>
                    <Text style={[styles.optionText, formData.visibility === v && styles.optionTextActive]}>{v.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleCreateSignal} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="#0A0E17" /> : <Text style={styles.submitButtonText}>Create Signal</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== EDIT SIGNAL MODAL ========== */}
      <Modal visible={showEditModal} animationType="slide" transparent={true} onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Signal</Text>
              <TouchableOpacity onPress={() => { setShowEditModal(false); setSelectedSignal(null); }}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedSignal && (
                <>
                  <View style={styles.editSignalInfo}>
                    <Text style={styles.editSignalId}>ID: {selectedSignal.signal_id}</Text>
                  </View>

                  <Text style={styles.inputLabel}>Trading Pair</Text>
                  <View style={styles.optionsRow}>
                    {PAIRS.slice(0, 4).map((pair) => (
                      <TouchableOpacity key={pair} style={[styles.optionButton, editData.pair === pair && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, pair })}>
                        <Text style={[styles.optionText, editData.pair === pair && styles.optionTextActive]}>{pair}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.optionsRow}>
                    {PAIRS.slice(4).map((pair) => (
                      <TouchableOpacity key={pair} style={[styles.optionButton, editData.pair === pair && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, pair })}>
                        <Text style={[styles.optionText, editData.pair === pair && styles.optionTextActive]}>{pair}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Signal Type</Text>
                  <View style={styles.typeRow}>
                    <TouchableOpacity style={[styles.typeButton, editData.signal_type === 'buy' && styles.buyButtonActive]} onPress={() => setEditData({ ...editData, signal_type: 'buy' })}>
                      <Ionicons name="arrow-up" size={20} color={editData.signal_type === 'buy' ? '#0A0E17' : '#00D4AA'} />
                      <Text style={[styles.typeButtonText, editData.signal_type === 'buy' && { color: '#0A0E17' }]}>BUY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.typeButton, editData.signal_type === 'sell' && styles.sellButtonActive]} onPress={() => setEditData({ ...editData, signal_type: 'sell' })}>
                      <Ionicons name="arrow-down" size={20} color={editData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757'} />
                      <Text style={[styles.typeButtonText, { color: editData.signal_type === 'sell' ? '#FFFFFF' : '#FF4757' }]}>SELL</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Status</Text>
                  <View style={styles.optionsRow}>
                    {STATUSES.map((s) => (
                      <TouchableOpacity key={s} style={[styles.optionButton, editData.status === s && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, status: s as any })}>
                        <Text style={[styles.optionText, editData.status === s && styles.optionTextActive]}>{s.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Entry Price *</Text>
                  <TextInput style={styles.input} placeholder="Entry" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={editData.entry} onChangeText={(text) => setEditData({ ...editData, entry: text })} />

                  <Text style={styles.inputLabel}>Stop Loss *</Text>
                  <TextInput style={styles.input} placeholder="Stop Loss" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={editData.stop_loss} onChangeText={(text) => setEditData({ ...editData, stop_loss: text })} />

                  <Text style={styles.inputLabel}>Take Profit 1 (TP1) *</Text>
                  <TextInput style={styles.input} placeholder="TP1" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={editData.tp1} onChangeText={(text) => setEditData({ ...editData, tp1: text })} />

                  <Text style={styles.inputLabel}>Take Profit 2 (TP2)</Text>
                  <TextInput style={styles.input} placeholder="Optional" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={editData.tp2} onChangeText={(text) => setEditData({ ...editData, tp2: text })} />

                  <Text style={styles.inputLabel}>Take Profit 3 (TP3)</Text>
                  <TextInput style={styles.input} placeholder="Optional" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={editData.tp3} onChangeText={(text) => setEditData({ ...editData, tp3: text })} />

                  <Text style={styles.inputLabel}>TP Hit Level (0-3)</Text>
                  <View style={styles.optionsRow}>
                    {[0, 1, 2, 3].map((level) => (
                      <TouchableOpacity key={level} style={[styles.optionButton, editData.tp_hit === level && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, tp_hit: level })}>
                        <Text style={[styles.optionText, editData.tp_hit === level && styles.optionTextActive]}>{level}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Visibility</Text>
                  <View style={styles.optionsRow}>
                    {VISIBILITIES.map((v) => (
                      <TouchableOpacity key={v} style={[styles.optionButton, editData.visibility === v && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, visibility: v as any })}>
                        <Text style={[styles.optionText, editData.visibility === v && styles.optionTextActive]}>{v.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleEditSignal} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#0A0E17" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== CLOSE SIGNAL MODAL ========== */}
      <Modal visible={showCloseModal} animationType="slide" transparent={true} onRequestClose={() => setShowCloseModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Close Signal</Text>
              <TouchableOpacity onPress={() => setShowCloseModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedSignal && (
                <>
                  <View style={styles.closeSignalInfo}>
                    <Text style={styles.closeSignalPair}>{selectedSignal.pair}</Text>
                    <Text style={styles.closeSignalType}>{selectedSignal.signal_type.toUpperCase()} @ {selectedSignal.entry}</Text>
                  </View>

                  <Text style={styles.inputLabel}>Final TP Hit Level</Text>
                  <View style={styles.optionsRow}>
                    {[0, 1, 2, 3].map((level) => (
                      <TouchableOpacity key={level} style={[styles.optionButton, closeTpHit === level && styles.optionButtonActive]} onPress={() => setCloseTpHit(level)}>
                        <Text style={[styles.optionText, closeTpHit === level && styles.optionTextActive]}>{level === 0 ? 'SL Hit' : `TP${level}`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Close Price (calculates pips)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 1.0920" placeholderTextColor="#8A8D98" keyboardType="decimal-pad" value={closePrice} onChangeText={setClosePrice} />

                  <Text style={styles.orText}>— OR —</Text>

                  <Text style={styles.inputLabel}>Enter Final Pips Directly</Text>
                  <TextInput style={styles.input} placeholder="e.g. 50 or -30" placeholderTextColor="#8A8D98" keyboardType="numeric" value={finalPips} onChangeText={setFinalPips} />

                  <TouchableOpacity style={[styles.submitButton, styles.closeSubmitButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleCloseSignal} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.closeSubmitButtonText}>Close Signal</Text>}
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
  container: { flex: 1, backgroundColor: '#0A0E17' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2F3E' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  addButton: { width: 40, height: 40, backgroundColor: '#00D4AA', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginTop: 16 },
  signalCard: { backgroundColor: '#1A1F2E', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2A2F3E' },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  signalPair: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  typeText: { fontSize: 14, fontWeight: 'bold' },
  signalDetails: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#0A0E17', borderRadius: 12, padding: 12, marginBottom: 12 },
  detailRow: { alignItems: 'center' },
  detailLabel: { fontSize: 11, color: '#8A8D98', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  tpContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tpBadge: { backgroundColor: 'rgba(138, 141, 152, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2A2F3E' },
  tpBadgeHit: { backgroundColor: 'rgba(0, 212, 170, 0.2)', borderColor: '#00D4AA' },
  tpBadgeText: { fontSize: 12, color: '#8A8D98', fontWeight: '600' },
  tpBadgeTextHit: { color: '#00D4AA' },
  resultRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12, backgroundColor: '#0A0E17', padding: 12, borderRadius: 8 },
  resultLabel: { fontSize: 14, color: '#8A8D98', marginRight: 8 },
  resultValue: { fontSize: 18, fontWeight: 'bold' },
  tpActions: { backgroundColor: 'rgba(0, 212, 170, 0.1)', borderRadius: 12, padding: 12, marginBottom: 12 },
  tpActionsLabel: { fontSize: 12, color: '#00D4AA', fontWeight: '600', marginBottom: 8 },
  tpButtonsRow: { flexDirection: 'row', gap: 8 },
  tpButton: { backgroundColor: '#00D4AA', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  tp3Button: { backgroundColor: '#FFD700' },
  tpButtonText: { fontSize: 12, fontWeight: 'bold', color: '#0A0E17' },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 212, 170, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4 },
  activateButtonText: { fontSize: 12, fontWeight: '600', color: '#00D4AA' },
  editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 212, 170, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4 },
  editButtonText: { fontSize: 12, fontWeight: '600', color: '#00D4AA' },
  closeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4 },
  closeButtonText: { fontSize: 12, fontWeight: '600', color: '#FFD700' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 71, 87, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4 },
  deleteButtonDisabled: { opacity: 0.5 },
  deleteButtonText: { fontSize: 12, fontWeight: '600', color: '#FF4757' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1A1F2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#2A2F3E' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  modalScroll: { padding: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#0A0E17', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: '#2A2F3E' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0A0E17', borderWidth: 1, borderColor: '#2A2F3E' },
  optionButtonActive: { backgroundColor: '#00D4AA', borderColor: '#00D4AA' },
  optionText: { fontSize: 12, fontWeight: '600', color: '#8A8D98' },
  optionTextActive: { color: '#0A0E17' },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, backgroundColor: '#0A0E17', borderWidth: 1, borderColor: '#2A2F3E', gap: 8 },
  buyButtonActive: { backgroundColor: '#00D4AA', borderColor: '#00D4AA' },
  sellButtonActive: { backgroundColor: '#FF4757', borderColor: '#FF4757' },
  typeButtonText: { fontSize: 14, fontWeight: 'bold', color: '#00D4AA' },
  submitButton: { backgroundColor: '#00D4AA', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20, marginBottom: 40 },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontSize: 16, fontWeight: 'bold', color: '#0A0E17' },
  closeSubmitButton: { backgroundColor: '#FF4757' },
  closeSubmitButtonText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  editSignalInfo: { backgroundColor: '#0A0E17', borderRadius: 12, padding: 12, marginBottom: 8 },
  editSignalId: { fontSize: 12, color: '#8A8D98', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  closeSignalInfo: { backgroundColor: '#0A0E17', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  closeSignalPair: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  closeSignalType: { fontSize: 14, color: '#8A8D98', marginTop: 4 },
  orText: { textAlign: 'center', color: '#8A8D98', marginVertical: 16, fontSize: 14 },
});

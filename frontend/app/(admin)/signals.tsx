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
import { supabase } from '../../src/services/supabase';
import { useSignals } from '../../src/context/SignalContext';

interface Signal {
  signal_id: string;
  pair: string;
  signal_type: 'buy' | 'sell';
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  take_profit?: number; // Legacy field
  tp_hit?: number;
  risk_reward?: number;
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

// Safe string conversion - NEVER crashes
const safeStr = (value: any): string => {
  if (value === undefined || value === null) return '';
  return String(value);
};

// Safe number conversion
const safeNum = (value: any, fallback: number = 0): number => {
  if (value === undefined || value === null) return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
};

// Calculate risk/reward ratio
const calculateRiskReward = (
  entry: number,
  stopLoss: number,
  takeProfit: number,
  signalType: 'buy' | 'sell'
): number => {
  if (signalType === 'buy') {
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  } else {
    const risk = Math.abs(stopLoss - entry);
    const reward = Math.abs(entry - takeProfit);
    return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  }
};

export default function SignalManagement() {
  const router = useRouter();
  
  // Get signal event triggers from context for real-time propagation
  const { 
    onSignalCreated, 
    onSignalActivated, 
    onSignalClosed, 
    onSignalDeleted, 
    onSignalUpdated 
  } = useSignals();
  
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Create form state - INCLUDES STATUS SELECTION
  const [formData, setFormData] = useState({
    pair: 'EUR/USD',
    signal_type: 'buy' as 'buy' | 'sell',
    entry: '',
    stop_loss: '',
    tp1: '',
    tp2: '',
    tp3: '',
    status: 'pending' as 'pending' | 'active', // Can create as pending or active
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
    final_pips: '',
  });

  // Close modal state
  const [closePrice, setClosePrice] = useState('');
  const [finalPips, setFinalPips] = useState('');
  const [closeTpHit, setCloseTpHit] = useState(0);

  useEffect(() => {
    fetchSignals();
  }, []);

  /** Map a Supabase row to the local Signal interface */
  const mapRow = (row: any): Signal => ({
    signal_id: row.id,
    pair: row.pair,
    signal_type: row.signal_type,
    entry: row.entry_price != null ? Number(row.entry_price) : undefined,
    stop_loss: row.stop_loss != null ? Number(row.stop_loss) : undefined,
    tp1: row.take_profit_1 != null ? Number(row.take_profit_1) : undefined,
    tp2: row.take_profit_2 != null ? Number(row.take_profit_2) : undefined,
    tp3: row.take_profit_3 != null ? Number(row.take_profit_3) : undefined,
    take_profit: row.take_profit_1 != null ? Number(row.take_profit_1) : undefined,
    tp_hit: ['tp1','tp2','tp3'].indexOf(row.state) >= 0 ? ['tp1','tp2','tp3'].indexOf(row.state) + 1 : 0,
    risk_reward: row.risk_reward != null ? Number(row.risk_reward) : undefined,
    status: row.state === 'pending' ? 'pending' : row.state === 'closed' ? 'closed' : 'active',
    visibility: row.visibility,
    analysis: row.analysis,
    final_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
    result_pips: row.final_pips != null ? Number(row.final_pips) : undefined,
    created_at: row.created_at,
  });

  const fetchSignals = async () => {
    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSignals((data || []).map(mapRow));
    } catch (error) {
      console.error('Failed to fetch signals:', error);
      setSignals([]);
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
      status: 'pending',
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

  const confirmAction = (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
        { text: 'Confirm', onPress: () => resolve(true), style: 'destructive' },
      ]);
    });
  };

  // ========== CREATE SIGNAL (WITH STATUS CHOICE) ==========
  const handleCreateSignal = async () => {
    console.log("=== HANDLE CREATE SIGNAL CALLED ===");
    
    if (!formData.entry || !formData.stop_loss || !formData.tp1) {
      console.log("=== VALIDATION FAILED ===", { entry: formData.entry, stop_loss: formData.stop_loss, tp1: formData.tp1 });
      showAlert('Error', 'Please fill in Entry, Stop Loss, and TP1');
      return;
    }

    console.log("=== VALIDATION PASSED ===");
    setIsSubmitting(true);
    
    try {
      console.log("=== FETCHING AUTH USER ===");
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      console.log("=== SIGNAL CREATE DEBUG ===", authUser);
      console.log("Auth Error:", authError);

      if (!authUser) {
        console.error("NO AUTH USER - Cannot create signal");
        showAlert('Error', 'Not authenticated. Please log in again.');
        setIsSubmitting(false);
        return;
      }

      const entry = parseFloat(formData.entry);
      const stopLoss = parseFloat(formData.stop_loss);
      const tp1 = parseFloat(formData.tp1);
      const riskReward = calculateRiskReward(entry, stopLoss, tp1, formData.signal_type);

      const payload = {
        pair: formData.pair,
        signal_type: formData.signal_type,
        entry_price: entry,
        stop_loss: stopLoss,
        take_profit_1: tp1,
        take_profit_2: formData.tp2 ? parseFloat(formData.tp2) : null,
        take_profit_3: formData.tp3 ? parseFloat(formData.tp3) : null,
        risk_reward: riskReward,
        state: formData.status,
        visibility: formData.visibility,
        analysis: formData.analysis || null,
        created_by: authUser.id,
        activated_at: formData.status === 'active' ? new Date().toISOString() : null,
      };

      console.log("=== INSERT PAYLOAD ===", payload);

      const { data, error } = await supabase
        .from("signals")
        .insert(payload)
        .select();
      
      console.log("=== SUPABASE RESPONSE ===", { data, error });
      
      console.log('=== SUPABASE RESPONSE ===');
      console.log('Data:', data);
      console.log('Error:', error);
      if (error) {
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        console.error('Error Details:', error.details);
        console.error('Error Hint:', error.hint);
        console.error('Full Error Object:', JSON.stringify(error, null, 2));
      }

      if (error) {
        throw error;
      }
      
      console.log('=== SIGNAL CREATED SUCCESSFULLY ===');
      console.log('Created Signal:', data);
      
      setShowCreateModal(false);
      resetCreateForm();
      await fetchSignals();
      
      // Trigger real-time update for all users
      onSignalCreated();
      
      showAlert('Success', `Signal created as ${formData.status.toUpperCase()}!`);
    } catch (error: any) {
      console.error('=== SIGNAL CREATE ERROR ===');
      console.error('Error Type:', error?.constructor?.name);
      console.error('Error Message:', error?.message);
      console.error('Error Code:', error?.code);
      console.error('Error Details:', error?.details);
      console.error('Error Hint:', error?.hint);
      console.error('Full Error:', error);
      console.error('Error JSON:', JSON.stringify(error, null, 2));
      
      const errorMsg = error?.message || error?.details || 'Failed to create signal';
      showAlert('Error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== EDIT SIGNAL (SAFE - NO CRASHES) ==========
  const openEditModal = (signal: Signal) => {
    if (!signal) return;
    
    setSelectedSignal(signal);
    
    // SAFE defaults - never call toString() on undefined
    setEditData({
      pair: signal.pair || 'EUR/USD',
      signal_type: signal.signal_type || 'buy',
      entry: safeStr(signal.entry),
      stop_loss: safeStr(signal.stop_loss),
      tp1: safeStr(signal.tp1 || signal.take_profit), // Support legacy field
      tp2: safeStr(signal.tp2),
      tp3: safeStr(signal.tp3),
      tp_hit: safeNum(signal.tp_hit, 0),
      status: signal.status || 'pending',
      visibility: signal.visibility || 'free',
      final_pips: safeStr(signal.final_pips || signal.result_pips),
    });
    
    setShowEditModal(true);
  };

  const handleEditSignal = async () => {
    if (!selectedSignal) {
      showAlert('Error', 'No signal selected');
      return;
    }
    
    if (!editData.entry || !editData.stop_loss || !editData.tp1) {
      showAlert('Error', 'Please fill in Entry, Stop Loss, and TP1');
      return;
    }

    setIsSubmitting(true);
    try {
      // Map UI status back to DB state
      const stateMap: Record<string, string> = {
        pending: 'pending',
        active: 'active',
        closed: 'closed',
      };
      const dbState = stateMap[editData.status] || editData.status;

      const entry = parseFloat(editData.entry);
      const stopLoss = parseFloat(editData.stop_loss);
      const tp1 = parseFloat(editData.tp1);
      const riskReward = calculateRiskReward(entry, stopLoss, tp1, editData.signal_type as 'buy' | 'sell');

      const updatePayload: any = {
        pair: editData.pair,
        signal_type: editData.signal_type,
        entry_price: entry,
        stop_loss: stopLoss,
        take_profit_1: tp1,
        take_profit_2: editData.tp2 ? parseFloat(editData.tp2) : null,
        take_profit_3: editData.tp3 ? parseFloat(editData.tp3) : null,
        risk_reward: riskReward,
        state: dbState,
        visibility: editData.visibility,
      };
      
      // Include final_pips if provided and status is closed
      if (editData.status === 'closed' && editData.final_pips) {
        updatePayload.final_pips = parseFloat(editData.final_pips);
        updatePayload.closed_at = new Date().toISOString();
      }
      if (editData.status === 'active' && !selectedSignal.activated_at) {
        updatePayload.activated_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('signals')
        .update(updatePayload)
        .eq('id', selectedSignal.signal_id);
      if (error) throw error;
      
      setShowEditModal(false);
      setSelectedSignal(null);
      await fetchSignals();
      
      // Trigger real-time update for all users
      onSignalUpdated();
      
      showAlert('Success', 'Signal updated successfully!');
    } catch (error: any) {
      console.error('Edit error:', error);
      showAlert('Error', error.message || 'Failed to update signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== ACTIVATE SIGNAL ==========
  const handleActivateSignal = async (signalId: string) => {
    try {
      const { error } = await supabase
        .from('signals')
        .update({ state: 'active', activated_at: new Date().toISOString() })
        .eq('id', signalId);
      if (error) throw error;
      await fetchSignals();
      
      // Trigger real-time update for all users
      onSignalActivated();
      
      showAlert('Success', 'Signal activated!');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to activate signal');
    }
  };

  // ========== MARK TP HIT ==========
  const handleMarkTP = async (signalId: string, tpLevel: number) => {
    try {
      const stateValue = `tp${tpLevel}`;
      const updatePayload: any = { state: stateValue };
      // If TP3, also close the signal
      if (tpLevel === 3) {
        updatePayload.state = 'closed';
        updatePayload.closed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('signals')
        .update(updatePayload)
        .eq('id', signalId);
      if (error) throw error;
      await fetchSignals();
      
      // Trigger real-time update for all users (TP hit is like an update or close)
      if (tpLevel === 3) {
        onSignalClosed();
      } else {
        onSignalUpdated();
      }
      
      showAlert('Success', tpLevel === 3 ? 'TP3 hit - Signal closed!' : `TP${tpLevel} marked as hit!`);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to mark TP');
    }
  };

  // ========== CLOSE SIGNAL ==========
  const openCloseModal = (signal: Signal) => {
    setSelectedSignal(signal);
    setClosePrice('');
    setFinalPips('');
    setCloseTpHit(safeNum(signal.tp_hit, 0));
    setShowCloseModal(true);
  };

  const handleCloseSignal = async () => {
    if (!selectedSignal) return;

    setIsSubmitting(true);
    try {
      const updatePayload: any = {
        state: 'closed',
        closed_at: new Date().toISOString(),
      };
      if (closePrice) updatePayload.exit_price = parseFloat(closePrice);
      if (finalPips) updatePayload.final_pips = parseFloat(finalPips);

      const { error } = await supabase
        .from('signals')
        .update(updatePayload)
        .eq('id', selectedSignal.signal_id);
      if (error) throw error;
      
      setShowCloseModal(false);
      setSelectedSignal(null);
      await fetchSignals();
      
      // Trigger real-time update for all users
      onSignalClosed();
      
      showAlert('Success', 'Signal closed successfully!');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to close signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========== DELETE SIGNAL (FIXED - WORKS INDEPENDENTLY) ==========
  const handleDeleteSignal = async (signalId: string) => {
    if (!signalId) {
      showAlert('Error', 'Invalid signal ID');
      return;
    }
    
    const confirmed = await confirmAction(
      'DELETE SIGNAL',
      'Are you sure you want to PERMANENTLY delete this signal?\n\nThis cannot be undone and will remove it from all views including history.'
    );

    if (!confirmed) return;

    setIsDeleting(signalId);
    try {
      const { error } = await supabase
        .from('signals')
        .delete()
        .eq('id', signalId);
      if (error) throw error;
      
      // Remove from local state immediately for instant feedback
      setSignals(prev => prev.filter(s => s.signal_id !== signalId));
      
      // Trigger real-time update for all users
      onSignalDeleted();
      
      showAlert('Success', 'Signal deleted permanently!');
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMsg = error.message || 'Failed to delete signal';
      showAlert('Error', errorMsg);
      // Refresh to sync state
      await fetchSignals();
    } finally {
      setIsDeleting(null);
    }
  };

  // ========== HELPERS ==========
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

  const getTP1Value = (signal: Signal) => signal.tp1 || signal.take_profit;

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
            <Text style={styles.emptySubtext}>Tap + to create a signal</Text>
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
                        {(signal.status || 'unknown').toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${getVisibilityColor(signal.visibility)}20` }]}>
                      <Text style={[styles.badgeText, { color: getVisibilityColor(signal.visibility) }]}>
                        {(signal.visibility || 'free').toUpperCase()}
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
                    {(signal.signal_type || 'buy').toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Signal Details */}
              <View style={styles.signalDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Entry</Text>
                  <Text style={styles.detailValue}>{signal.entry ?? '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>SL</Text>
                  <Text style={[styles.detailValue, { color: '#FF4757' }]}>{signal.stop_loss ?? '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TP1</Text>
                  <Text style={[styles.detailValue, { color: '#00D4AA' }]}>{getTP1Value(signal) ?? '-'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>R:R</Text>
                  <Text style={styles.detailValue}>{signal.risk_reward ? `1:${signal.risk_reward}` : '-'}</Text>
                </View>
              </View>

              {/* TP Levels */}
              {(signal.tp2 || signal.tp3) && (
                <View style={styles.tpContainer}>
                  {signal.tp2 && (
                    <View style={[styles.tpBadge, safeNum(signal.tp_hit) >= 2 && styles.tpBadgeHit]}>
                      <Text style={[styles.tpBadgeText, safeNum(signal.tp_hit) >= 2 && styles.tpBadgeTextHit]}>
                        TP2: {signal.tp2} {safeNum(signal.tp_hit) >= 2 ? '✓' : ''}
                      </Text>
                    </View>
                  )}
                  {signal.tp3 && (
                    <View style={[styles.tpBadge, safeNum(signal.tp_hit) >= 3 && styles.tpBadgeHit]}>
                      <Text style={[styles.tpBadgeText, safeNum(signal.tp_hit) >= 3 && styles.tpBadgeTextHit]}>
                        TP3: {signal.tp3} {safeNum(signal.tp_hit) >= 3 ? '✓' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Result for closed signals */}
              {signal.status === 'closed' && getPipsValue(signal) !== null && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Final Result:</Text>
                  <Text style={[styles.resultValue, { color: (getPipsValue(signal) || 0) >= 0 ? '#00D4AA' : '#FF4757' }]}>
                    {(getPipsValue(signal) || 0) >= 0 ? '+' : ''}{getPipsValue(signal)} pips
                  </Text>
                </View>
              )}

              {/* Quick TP Actions for Active Signals */}
              {signal.status === 'active' && (signal.tp1 || signal.tp2 || signal.tp3) && (
                <View style={styles.tpActions}>
                  <Text style={styles.tpActionsLabel}>Mark TP Hit:</Text>
                  <View style={styles.tpButtonsRow}>
                    {getTP1Value(signal) && safeNum(signal.tp_hit) < 1 && (
                      <TouchableOpacity style={styles.tpButton} onPress={() => handleMarkTP(signal.signal_id, 1)}>
                        <Text style={styles.tpButtonText}>TP1</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp2 && safeNum(signal.tp_hit) < 2 && (
                      <TouchableOpacity style={styles.tpButton} onPress={() => handleMarkTP(signal.signal_id, 2)}>
                        <Text style={styles.tpButtonText}>TP2</Text>
                      </TouchableOpacity>
                    )}
                    {signal.tp3 && safeNum(signal.tp_hit) < 3 && (
                      <TouchableOpacity style={[styles.tpButton, styles.tp3Button]} onPress={() => handleMarkTP(signal.signal_id, 3)}>
                        <Text style={styles.tpButtonText}>TP3 (Close)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* ACTION BUTTONS - ALL VISIBLE */}
              <View style={styles.actionButtons}>
                {/* Activate - only for pending */}
                {signal.status === 'pending' && (
                  <TouchableOpacity style={styles.activateButton} onPress={() => handleActivateSignal(signal.signal_id)}>
                    <Ionicons name="play" size={16} color="#00D4AA" />
                    <Text style={styles.activateButtonText}>Activate</Text>
                  </TouchableOpacity>
                )}
                
                {/* EDIT - always available */}
                <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(signal)}>
                  <Ionicons name="pencil" size={16} color="#00D4AA" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                
                {/* Close - only for non-closed */}
                {signal.status !== 'closed' && (
                  <TouchableOpacity style={styles.closeButton} onPress={() => openCloseModal(signal)}>
                    <Ionicons name="close-circle-outline" size={16} color="#FFD700" />
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                )}
                
                {/* DELETE - always available, independent */}
                <TouchableOpacity 
                  style={[styles.deleteButton, isDeleting === signal.signal_id && styles.buttonDisabled]} 
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
        
        <View style={{ height: 40 }} />
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
              {/* SIGNAL STATUS AT CREATION */}
              <Text style={styles.inputLabel}>Signal Status</Text>
              <View style={styles.statusRow}>
                <TouchableOpacity 
                  style={[styles.statusButton, formData.status === 'pending' && styles.statusButtonActive]} 
                  onPress={() => setFormData({ ...formData, status: 'pending' })}
                >
                  <Ionicons name="time-outline" size={18} color={formData.status === 'pending' ? '#0A0E17' : '#FFD700'} />
                  <Text style={[styles.statusButtonText, formData.status === 'pending' && { color: '#0A0E17' }]}>PENDING</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.statusButton, styles.activeStatusButton, formData.status === 'active' && styles.activeStatusButtonActive]} 
                  onPress={() => setFormData({ ...formData, status: 'active' })}
                >
                  <Ionicons name="flash-outline" size={18} color={formData.status === 'active' ? '#0A0E17' : '#00D4AA'} />
                  <Text style={[styles.statusButtonText, { color: formData.status === 'active' ? '#0A0E17' : '#00D4AA' }]}>ACTIVE</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.statusHint}>
                {formData.status === 'pending' ? 'Signal will wait until entry price is reached' : 'Signal will be active immediately'}
              </Text>

              <Text style={styles.inputLabel}>Trading Pair</Text>
              <View style={styles.optionsRow}>
                {PAIRS.map((pair) => (
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

              <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.buttonDisabled]} onPress={handleCreateSignal} disabled={isSubmitting}>
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

                  <Text style={styles.inputLabel}>Status</Text>
                  <View style={styles.optionsRow}>
                    {STATUSES.map((s) => (
                      <TouchableOpacity key={s} style={[styles.optionButton, editData.status === s && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, status: s as any })}>
                        <Text style={[styles.optionText, editData.status === s && styles.optionTextActive]}>{s.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Trading Pair</Text>
                  <View style={styles.optionsRow}>
                    {PAIRS.map((pair) => (
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

                  <Text style={styles.inputLabel}>TP Hit Level</Text>
                  <View style={styles.optionsRow}>
                    {[0, 1, 2, 3].map((level) => (
                      <TouchableOpacity key={level} style={[styles.optionButton, editData.tp_hit === level && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, tp_hit: level })}>
                        <Text style={[styles.optionText, editData.tp_hit === level && styles.optionTextActive]}>{level === 0 ? 'None' : `TP${level}`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {editData.status === 'closed' && (
                    <>
                      <Text style={styles.inputLabel}>Final Pips (for closed signals)</Text>
                      <TextInput style={styles.input} placeholder="e.g. 50 or -30" placeholderTextColor="#8A8D98" keyboardType="numeric" value={editData.final_pips} onChangeText={(text) => setEditData({ ...editData, final_pips: text })} />
                    </>
                  )}

                  <Text style={styles.inputLabel}>Visibility</Text>
                  <View style={styles.optionsRow}>
                    {VISIBILITIES.map((v) => (
                      <TouchableOpacity key={v} style={[styles.optionButton, editData.visibility === v && styles.optionButtonActive]} onPress={() => setEditData({ ...editData, visibility: v as any })}>
                        <Text style={[styles.optionText, editData.visibility === v && styles.optionTextActive]}>{v.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.buttonDisabled]} onPress={handleEditSignal} disabled={isSubmitting}>
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
                    <Text style={styles.closeSignalType}>{selectedSignal.signal_type?.toUpperCase()} @ {selectedSignal.entry}</Text>
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

                  <TouchableOpacity style={[styles.submitButton, styles.closeSubmitButton, isSubmitting && styles.buttonDisabled]} onPress={handleCloseSignal} disabled={isSubmitting}>
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
  emptySubtext: { fontSize: 14, color: '#8A8D98', marginTop: 8 },
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
  editButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 212, 170, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4, borderWidth: 1, borderColor: 'rgba(0, 212, 170, 0.3)' },
  editButtonText: { fontSize: 12, fontWeight: '600', color: '#00D4AA' },
  closeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 215, 0, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4 },
  closeButtonText: { fontSize: 12, fontWeight: '600', color: '#FFD700' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 71, 87, 0.1)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, gap: 4, borderWidth: 1, borderColor: 'rgba(255, 71, 87, 0.3)' },
  deleteButtonText: { fontSize: 12, fontWeight: '600', color: '#FF4757' },
  buttonDisabled: { opacity: 0.5 },
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
  statusRow: { flexDirection: 'row', gap: 12 },
  statusButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, backgroundColor: '#0A0E17', borderWidth: 1, borderColor: '#FFD700', gap: 8 },
  statusButtonActive: { backgroundColor: '#FFD700' },
  activeStatusButton: { borderColor: '#00D4AA' },
  activeStatusButtonActive: { backgroundColor: '#00D4AA' },
  statusButtonText: { fontSize: 14, fontWeight: 'bold', color: '#FFD700' },
  statusHint: { fontSize: 12, color: '#8A8D98', marginTop: 8, fontStyle: 'italic' },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, backgroundColor: '#0A0E17', borderWidth: 1, borderColor: '#2A2F3E', gap: 8 },
  buyButtonActive: { backgroundColor: '#00D4AA', borderColor: '#00D4AA' },
  sellButtonActive: { backgroundColor: '#FF4757', borderColor: '#FF4757' },
  typeButtonText: { fontSize: 14, fontWeight: 'bold', color: '#00D4AA' },
  submitButton: { backgroundColor: '#00D4AA', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20, marginBottom: 40 },
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

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

// Status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: {
    label: 'Pending',
    color: '#F59E0B',
    icon: 'time-outline',
  },
  approved: {
    label: 'Approved',
    color: '#3B82F6',
    icon: 'checkmark-circle-outline',
  },
  paid: {
    label: 'Paid',
    color: '#10B981',
    icon: 'checkmark-done-circle-outline',
  },
  rejected: {
    label: 'Rejected',
    color: '#EF4444',
    icon: 'close-circle-outline',
  },
};

const FILTER_TABS = [
  { key: null, label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
];

interface Withdrawal {
  withdrawal_id: string;
  user_id: string;
  portfolio_id: string;
  full_name: string;
  email: string;
  amount: number;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
}

export default function AdminWithdrawalsScreen() {
  // GATED: Needs withdrawals table in Supabase
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0E17' }}>
      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.back()}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#00D4AA' }}>{'← Back'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🚧'}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>Withdrawals</Text>
        <Text style={{ fontSize: 15, color: '#8899AA', textAlign: 'center', lineHeight: 22 }}>This feature is under development and will be available in a future update.</Text>
      </View>
    </SafeAreaView>
  );
  const { theme } = useTheme();
  const router = useRouter();

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');

  const fetchWithdrawals = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const params = activeFilter ? { status: activeFilter } : {};
      const response = await api.get('/admin/investor/withdrawals', { params });
      setWithdrawals(response.data.withdrawals || []);
    } catch (error: any) {
      console.error('Failed to fetch withdrawals:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load withdrawals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWithdrawals(true);
  };

  const handleUpdateStatus = async (withdrawalId: string, newStatus: string) => {
    try {
      setUpdating(true);
      await api.put(
        `/admin/investor/withdrawal/${withdrawalId}?status=${newStatus}${adminNotes ? `&admin_notes=${encodeURIComponent(adminNotes)}` : ''}`
      );
      Alert.alert('Success', `Withdrawal ${newStatus}`);
      fetchWithdrawals();
      setSelectedWithdrawal(null);
      setAdminNotes('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update withdrawal');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  const filteredWithdrawals = withdrawals;

  // Get counts for each status
  const statusCounts = {
    all: withdrawals.length,
    pending: withdrawals.filter(w => w.status === 'pending').length,
    approved: withdrawals.filter(w => w.status === 'approved').length,
    paid: withdrawals.filter(w => w.status === 'paid').length,
    rejected: withdrawals.filter(w => w.status === 'rejected').length,
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Withdrawal Requests</Text>
        <View style={styles.headerRight}>
          <View style={[styles.countBadge, { backgroundColor: `${theme.primary}20` }]}>
            <Text style={[styles.countText, { color: theme.primary }]}>{statusCounts.pending}</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTER_TABS.map((tab) => {
            const count = tab.key === null ? statusCounts.all : statusCounts[tab.key as keyof typeof statusCounts];
            const isActive = activeFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key || 'all'}
                style={[
                  styles.filterTab,
                  { borderColor: theme.border },
                  isActive && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
                onPress={() => setActiveFilter(tab.key)}
              >
                <Text style={[styles.filterTabText, isActive ? { color: '#0A0E17' } : dynamicStyles.text]}>
                  {tab.label}
                </Text>
                <View style={[styles.filterCount, isActive ? { backgroundColor: 'rgba(0,0,0,0.2)' } : { backgroundColor: `${theme.primary}20` }]}>
                  <Text style={[styles.filterCountText, isActive ? { color: '#0A0E17' } : { color: theme.primary }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : filteredWithdrawals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cash-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No withdrawal requests {activeFilter ? `with status "${activeFilter}"` : ''}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          {filteredWithdrawals.map((withdrawal) => {
            const statusConfig = getStatusConfig(withdrawal.status);
            return (
              <TouchableOpacity
                key={withdrawal.withdrawal_id}
                style={[styles.withdrawalCard, dynamicStyles.card]}
                onPress={() => setSelectedWithdrawal(withdrawal)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, dynamicStyles.text]} numberOfLines={1}>
                      {withdrawal.full_name}
                    </Text>
                    <Text style={[styles.userEmail, dynamicStyles.textSecondary]} numberOfLines={1}>
                      {withdrawal.email}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
                    <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
                    <Text style={[styles.statusText, { color: statusConfig.color }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.amountContainer}>
                    <Ionicons name="cash-outline" size={20} color={theme.primary} />
                    <Text style={[styles.amountText, { color: theme.primary }]}>
                      {formatCurrency(withdrawal.amount)}
                    </Text>
                  </View>
                  <Text style={[styles.dateText, dynamicStyles.textSecondary]}>
                    {formatDate(withdrawal.created_at)}
                  </Text>
                </View>

                {withdrawal.notes && (
                  <Text style={[styles.notesText, dynamicStyles.textSecondary]} numberOfLines={1}>
                    Note: {withdrawal.notes}
                  </Text>
                )}

                <View style={styles.cardFooter}>
                  <Text style={[styles.idText, dynamicStyles.textSecondary]}>
                    {withdrawal.withdrawal_id}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal
        visible={selectedWithdrawal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setSelectedWithdrawal(null);
          setAdminNotes('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            {selectedWithdrawal && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, dynamicStyles.text]}>Withdrawal Details</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedWithdrawal(null);
                      setAdminNotes('');
                    }}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                  {/* Status Badge */}
                  <View style={styles.modalStatusContainer}>
                    <View
                      style={[
                        styles.modalStatusBadge,
                        { backgroundColor: `${getStatusConfig(selectedWithdrawal.status).color}20` },
                      ]}
                    >
                      <Ionicons
                        name={getStatusConfig(selectedWithdrawal.status).icon as any}
                        size={20}
                        color={getStatusConfig(selectedWithdrawal.status).color}
                      />
                      <Text
                        style={[
                          styles.modalStatusText,
                          { color: getStatusConfig(selectedWithdrawal.status).color },
                        ]}
                      >
                        {getStatusConfig(selectedWithdrawal.status).label}
                      </Text>
                    </View>
                  </View>

                  {/* Amount */}
                  <View style={[styles.amountCard, { backgroundColor: `${theme.primary}15` }]}>
                    <Text style={[styles.amountLabel, dynamicStyles.textSecondary]}>Requested Amount</Text>
                    <Text style={[styles.modalAmountText, { color: theme.primary }]}>
                      {formatCurrency(selectedWithdrawal.amount)}
                    </Text>
                  </View>

                  {/* User Details */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>User Name</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedWithdrawal.full_name}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Email</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedWithdrawal.email}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Portfolio ID</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedWithdrawal.portfolio_id}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Request Date</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text]}>
                      {formatDate(selectedWithdrawal.created_at)}
                    </Text>
                  </View>

                  {selectedWithdrawal.processed_at && (
                    <View style={styles.detailSection}>
                      <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Processed Date</Text>
                      <Text style={[styles.detailValue, dynamicStyles.text]}>
                        {formatDate(selectedWithdrawal.processed_at)}
                      </Text>
                    </View>
                  )}

                  {selectedWithdrawal.notes && (
                    <View style={styles.detailSection}>
                      <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>User Notes</Text>
                      <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedWithdrawal.notes}</Text>
                    </View>
                  )}

                  {selectedWithdrawal.admin_notes && (
                    <View style={styles.detailSection}>
                      <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Admin Notes</Text>
                      <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedWithdrawal.admin_notes}</Text>
                    </View>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Withdrawal ID</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text, { fontSize: 12 }]}>
                      {selectedWithdrawal.withdrawal_id}
                    </Text>
                  </View>

                  {/* Admin Actions - Only show for pending/approved */}
                  {(selectedWithdrawal.status === 'pending' || selectedWithdrawal.status === 'approved') && (
                    <>
                      <Text style={[styles.actionTitle, dynamicStyles.text]}>Admin Actions</Text>

                      {/* Admin Notes Input */}
                      <TextInput
                        style={[styles.notesInput, dynamicStyles.text, { borderColor: theme.border }]}
                        placeholder="Add a note (optional)"
                        placeholderTextColor={theme.textSecondary}
                        multiline
                        numberOfLines={2}
                        value={adminNotes}
                        onChangeText={setAdminNotes}
                      />

                      <View style={styles.actionButtons}>
                        {selectedWithdrawal.status === 'pending' && (
                          <>
                            <TouchableOpacity
                              style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                              onPress={() => handleUpdateStatus(selectedWithdrawal.withdrawal_id, 'approved')}
                              disabled={updating}
                            >
                              {updating ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                                  <Text style={styles.actionButtonText}>Approve</Text>
                                </>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                              onPress={() => handleUpdateStatus(selectedWithdrawal.withdrawal_id, 'rejected')}
                              disabled={updating}
                            >
                              {updating ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                                  <Text style={styles.actionButtonText}>Reject</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </>
                        )}

                        {selectedWithdrawal.status === 'approved' && (
                          <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#10B981', flex: 1 }]}
                            onPress={() => handleUpdateStatus(selectedWithdrawal.withdrawal_id, 'paid')}
                            disabled={updating}
                          >
                            {updating ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-done-circle" size={18} color="#FFFFFF" />
                                <Text style={styles.actionButtonText}>Mark as Paid</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  withdrawalCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 12,
  },
  notesText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  idText: {
    fontSize: 10,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 20,
  },
  modalStatusContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  modalStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  amountCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  modalAmountText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

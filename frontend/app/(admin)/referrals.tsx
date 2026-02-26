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

// Status configurations
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#F59E0B', icon: 'time-outline' },
  completed: { label: 'Completed', color: '#10B981', icon: 'checkmark-circle' },
  expired: { label: 'Expired', color: '#6B7280', icon: 'close-circle' },
  flagged: { label: 'Flagged', color: '#EF4444', icon: 'warning' },
};

const REWARD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  locked: { label: 'Locked', color: '#6B7280' },
  pending: { label: 'Pending', color: '#F59E0B' },
  applied: { label: 'Applied', color: '#10B981' },
  revoked: { label: 'Revoked', color: '#EF4444' },
};

const FILTER_TABS = [
  { key: null, label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'expired', label: 'Expired' },
  { key: 'flagged', label: 'Flagged' },
];

interface Referral {
  referral_id: string;
  referrer_id: string;
  referrer_name: string;
  referrer_email: string;
  referred_user_id: string;
  referred_name: string;
  referred_email: string;
  status: string;
  subscription_tier: string | null;
  reward_status: string;
  reward_type: string | null;
  flagged: boolean;
  flag_reason: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface ReferralStats {
  total: number;
  pending: number;
  completed: number;
  expired: number;
  flagged: number;
}

export default function AdminReferralsScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [processing, setProcessing] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const params: any = {};
      if (activeFilter) params.status = activeFilter;
      
      const response = await api.get('/admin/referrals', { params });
      setReferrals(response.data.referrals || []);
      setStats(response.data.stats || null);
    } catch (error: any) {
      console.error('Failed to fetch referrals:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You don\'t have permission to view referrals.');
      } else {
        Alert.alert('Error', 'Failed to load referrals');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleApprove = async (referralId: string) => {
    try {
      setProcessing(true);
      await api.put(`/admin/referrals/${referralId}/approve`);
      Alert.alert('Success', 'Referral reward approved');
      setSelectedReferral(null);
      fetchData(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to approve referral');
    } finally {
      setProcessing(false);
    }
  };

  const handleRevoke = async (referralId: string) => {
    Alert.alert(
      'Revoke Reward',
      'Are you sure you want to revoke this referral reward?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              await api.put(`/admin/referrals/${referralId}/revoke`, null, {
                params: { reason: 'Revoked by admin' }
              });
              Alert.alert('Success', 'Referral reward revoked');
              setSelectedReferral(null);
              fetchData(true);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to revoke');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleFlag = async (referralId: string) => {
    if (!flagReason.trim()) {
      Alert.alert('Required', 'Please provide a reason for flagging');
      return;
    }

    try {
      setProcessing(true);
      await api.put(`/admin/referrals/${referralId}/flag`, null, {
        params: { reason: flagReason }
      });
      Alert.alert('Success', 'Referral flagged for fraud');
      setShowFlagModal(false);
      setFlagReason('');
      setSelectedReferral(null);
      fetchData(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to flag referral');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRewardLabel = (rewardType: string | null) => {
    if (rewardType === 'premium_14_days') return '+14 Days';
    if (rewardType === 'premium_7_days') return '+7 Days';
    return '-';
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Referral Management</Text>
        <View style={styles.headerRight}>
          <View style={[styles.countBadge, { backgroundColor: `${theme.primary}20` }]}>
            <Text style={[styles.countText, { color: theme.primary }]}>{stats?.total || 0}</Text>
          </View>
        </View>
      </View>

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statItem, { backgroundColor: '#F59E0B20' }]}>
            <Text style={[styles.statItemValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
            <Text style={[styles.statItemLabel, dynamicStyles.textSecondary]}>Pending</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: '#10B98120' }]}>
            <Text style={[styles.statItemValue, { color: '#10B981' }]}>{stats.completed}</Text>
            <Text style={[styles.statItemLabel, dynamicStyles.textSecondary]}>Completed</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: '#6B728020' }]}>
            <Text style={[styles.statItemValue, { color: '#6B7280' }]}>{stats.expired}</Text>
            <Text style={[styles.statItemLabel, dynamicStyles.textSecondary]}>Expired</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: '#EF444420' }]}>
            <Text style={[styles.statItemValue, { color: '#EF4444' }]}>{stats.flagged}</Text>
            <Text style={[styles.statItemLabel, dynamicStyles.textSecondary]}>Flagged</Text>
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTER_TABS.map((tab) => {
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
      ) : referrals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="gift-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No referrals {activeFilter ? `with status "${activeFilter}"` : ''}
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
          {referrals.map((referral) => {
            const statusConfig = STATUS_CONFIG[referral.status] || STATUS_CONFIG.pending;
            const rewardConfig = REWARD_STATUS_CONFIG[referral.reward_status] || REWARD_STATUS_CONFIG.locked;

            return (
              <TouchableOpacity
                key={referral.referral_id}
                style={[styles.referralCard, dynamicStyles.card]}
                onPress={() => setSelectedReferral(referral)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.usersInfo}>
                    <View style={styles.userRow}>
                      <Ionicons name="person-circle" size={16} color={theme.primary} />
                      <Text style={[styles.userName, dynamicStyles.text]}>{referral.referrer_name}</Text>
                      <Ionicons name="arrow-forward" size={14} color={theme.textSecondary} />
                      <Text style={[styles.referredName, dynamicStyles.textSecondary]}>{referral.referred_name}</Text>
                    </View>
                    <Text style={[styles.userEmail, dynamicStyles.textSecondary]}>{referral.referred_email}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
                    <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
                    <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                  </View>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Tier</Text>
                    <Text style={[styles.detailValue, dynamicStyles.text]}>
                      {referral.subscription_tier?.toUpperCase() || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Reward</Text>
                    <Text style={[styles.detailValue, { color: rewardConfig.color }]}>
                      {getRewardLabel(referral.reward_type)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Status</Text>
                    <Text style={[styles.detailValue, { color: rewardConfig.color }]}>{rewardConfig.label}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={[styles.dateText, dynamicStyles.textSecondary]}>{formatDate(referral.created_at)}</Text>
                  {referral.flagged && (
                    <View style={styles.flagIndicator}>
                      <Ionicons name="flag" size={12} color="#EF4444" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal
        visible={selectedReferral !== null && !showFlagModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedReferral(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            {selectedReferral && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, dynamicStyles.text]}>Referral Details</Text>
                  <TouchableOpacity onPress={() => setSelectedReferral(null)}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll}>
                  {/* Status Badge */}
                  <View style={styles.modalStatusContainer}>
                    <View style={[styles.modalStatusBadge, { backgroundColor: `${STATUS_CONFIG[selectedReferral.status]?.color || '#6B7280'}20` }]}>
                      <Ionicons
                        name={STATUS_CONFIG[selectedReferral.status]?.icon as any || 'help-circle'}
                        size={20}
                        color={STATUS_CONFIG[selectedReferral.status]?.color || '#6B7280'}
                      />
                      <Text style={[styles.modalStatusText, { color: STATUS_CONFIG[selectedReferral.status]?.color || '#6B7280' }]}>
                        {STATUS_CONFIG[selectedReferral.status]?.label || selectedReferral.status}
                      </Text>
                    </View>
                  </View>

                  {/* Referrer */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, dynamicStyles.textSecondary]}>Referrer</Text>
                    <Text style={[styles.detailSectionValue, dynamicStyles.text]}>{selectedReferral.referrer_name}</Text>
                    <Text style={[styles.detailSectionSub, dynamicStyles.textSecondary]}>{selectedReferral.referrer_email}</Text>
                  </View>

                  {/* Referred User */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, dynamicStyles.textSecondary]}>Referred User</Text>
                    <Text style={[styles.detailSectionValue, dynamicStyles.text]}>{selectedReferral.referred_name}</Text>
                    <Text style={[styles.detailSectionSub, dynamicStyles.textSecondary]}>{selectedReferral.referred_email}</Text>
                  </View>

                  {/* Subscription */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, dynamicStyles.textSecondary]}>Subscription Tier</Text>
                    <Text style={[styles.detailSectionValue, { color: theme.primary }]}>
                      {selectedReferral.subscription_tier?.toUpperCase() || 'None'}
                    </Text>
                  </View>

                  {/* Reward */}
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailSectionTitle, dynamicStyles.textSecondary]}>Reward Status</Text>
                    <Text style={[styles.detailSectionValue, { color: REWARD_STATUS_CONFIG[selectedReferral.reward_status]?.color || '#6B7280' }]}>
                      {REWARD_STATUS_CONFIG[selectedReferral.reward_status]?.label || selectedReferral.reward_status}
                      {selectedReferral.reward_type && ` (${getRewardLabel(selectedReferral.reward_type)})`}
                    </Text>
                  </View>

                  {/* Flags/Notes */}
                  {selectedReferral.flagged && selectedReferral.flag_reason && (
                    <View style={[styles.flagSection, { backgroundColor: '#EF444420' }]}>
                      <Ionicons name="flag" size={16} color="#EF4444" />
                      <Text style={[styles.flagText, { color: '#EF4444' }]}>{selectedReferral.flag_reason}</Text>
                    </View>
                  )}

                  {selectedReferral.admin_notes && (
                    <View style={styles.detailSection}>
                      <Text style={[styles.detailSectionTitle, dynamicStyles.textSecondary]}>Admin Notes</Text>
                      <Text style={[styles.detailSectionValue, dynamicStyles.text]}>{selectedReferral.admin_notes}</Text>
                    </View>
                  )}

                  {/* Actions */}
                  {!selectedReferral.flagged && selectedReferral.status !== 'expired' && (
                    <View style={styles.actionButtons}>
                      {(selectedReferral.reward_status === 'locked' || selectedReferral.status === 'pending') && (
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                          onPress={() => handleApprove(selectedReferral.referral_id)}
                          disabled={processing}
                        >
                          {processing ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                              <Text style={styles.actionButtonText}>Approve Reward</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {selectedReferral.reward_status !== 'revoked' && (
                        <TouchableOpacity
                          style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                          onPress={() => handleRevoke(selectedReferral.referral_id)}
                          disabled={processing}
                        >
                          <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                          <Text style={styles.actionButtonText}>Revoke</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
                        onPress={() => setShowFlagModal(true)}
                        disabled={processing}
                      >
                        <Ionicons name="flag" size={18} color="#FFFFFF" />
                        <Text style={styles.actionButtonText}>Flag Fraud</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Flag Modal */}
      <Modal
        visible={showFlagModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFlagModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Flag as Fraud</Text>
              <TouchableOpacity onPress={() => setShowFlagModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalScroll}>
              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Reason for flagging</Text>
              <TextInput
                style={[styles.reasonInput, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="Describe the fraud reason..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                value={flagReason}
                onChangeText={setFlagReason}
              />

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#EF4444' }]}
                onPress={() => selectedReferral && handleFlag(selectedReferral.referral_id)}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Flag Referral</Text>
                )}
              </TouchableOpacity>
            </View>
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  statItemValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statItemLabel: {
    fontSize: 10,
    marginTop: 2,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
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
  referralCard: {
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
  usersInfo: {
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  referredName: {
    fontSize: 14,
  },
  userEmail: {
    fontSize: 11,
    marginTop: 4,
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
  cardDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 11,
  },
  flagIndicator: {
    padding: 4,
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
    maxHeight: '80%',
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
  detailSection: {
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailSectionValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  detailSectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  flagSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  flagText: {
    flex: 1,
    fontSize: 13,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    flex: 1,
    minWidth: '45%',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

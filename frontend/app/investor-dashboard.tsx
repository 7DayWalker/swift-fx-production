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
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';

const { width: screenWidth } = Dimensions.get('window');

// Status colors
const STATUS_COLORS = {
  active: '#10B981',
  paused: '#F59E0B',
  closed: '#EF4444',
  pending: '#F59E0B',
  approved: '#3B82F6',
  paid: '#10B981',
  rejected: '#EF4444',
};

// Notice type icons
const NOTICE_ICONS: Record<string, string> = {
  general: 'information-circle',
  risk: 'warning',
  update: 'megaphone',
};

interface Portfolio {
  portfolio_id: string;
  user_id: string;
  invested_capital: number;
  current_equity: number;
  total_return_pct: number;
  investment_tier: string;
  performance_fee: number;
  lockup_months: number;
  account_status: string;
  start_date: string;
}

interface PerformanceEntry {
  performance_id: string;
  month: string;
  return_percentage: number;
  equity_after: number;
}

interface Withdrawal {
  withdrawal_id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
}

interface Notice {
  notice_id: string;
  title: string;
  content: string;
  notice_type: string;
  created_at: string;
}

export default function InvestorDashboardScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [performance, setPerformance] = useState<PerformanceEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Withdrawal modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const response = await api.get('/investor/dashboard');
      
      setPortfolio(response.data.portfolio);
      setPerformance(response.data.performance_history || []);
      setWithdrawals(response.data.withdrawals || []);
      setNotices(response.data.notices || []);
    } catch (err: any) {
      console.error('Failed to fetch investor dashboard:', err);
      if (err.response?.status === 403) {
        // Not an approved investor - redirect to fund management
        router.replace('/fund-management');
      } else {
        setError(err.response?.data?.detail || 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard(true);
  };

  const handleWithdrawal = async () => {
    const amount = parseFloat(withdrawAmount);
    
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid withdrawal amount.');
      return;
    }

    if (portfolio && amount > portfolio.current_equity) {
      Alert.alert('Insufficient Equity', `Your current equity is $${portfolio.current_equity.toLocaleString()}`);
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/investor/withdraw', {
        amount,
        notes: withdrawNotes || null,
      });

      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawNotes('');

      Alert.alert(
        'Withdrawal Requested',
        response.data.message,
        [
          { text: 'OK', onPress: () => fetchDashboard(true) },
          {
            text: 'Notify Admin',
            onPress: () => {
              if (response.data.whatsapp_notify_url) {
                Linking.openURL(response.data.whatsapp_notify_url);
              }
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to submit withdrawal request');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorText, dynamicStyles.textSecondary]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={() => fetchDashboard()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Investor Dashboard</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[portfolio?.account_status || 'active']}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[portfolio?.account_status || 'active'] }]} />
          <Text style={[styles.statusText, { color: STATUS_COLORS[portfolio?.account_status || 'active'] }]}>
            {portfolio?.account_status?.toUpperCase() || 'ACTIVE'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Investment Overview Cards */}
        <View style={styles.overviewGrid}>
          <View style={[styles.overviewCard, dynamicStyles.card]}>
            <Ionicons name="wallet-outline" size={24} color="#3B82F6" />
            <Text style={[styles.overviewLabel, dynamicStyles.textSecondary]}>Invested Capital</Text>
            <Text style={[styles.overviewValue, dynamicStyles.text]}>
              {formatCurrency(portfolio?.invested_capital || 0)}
            </Text>
          </View>

          <View style={[styles.overviewCard, dynamicStyles.card]}>
            <Ionicons name="cash-outline" size={24} color="#10B981" />
            <Text style={[styles.overviewLabel, dynamicStyles.textSecondary]}>Current Equity</Text>
            <Text style={[styles.overviewValue, { color: '#10B981' }]}>
              {formatCurrency(portfolio?.current_equity || 0)}
            </Text>
          </View>

          <View style={[styles.overviewCard, dynamicStyles.card]}>
            <Ionicons name="trending-up-outline" size={24} color={portfolio?.total_return_pct >= 0 ? '#10B981' : '#EF4444'} />
            <Text style={[styles.overviewLabel, dynamicStyles.textSecondary]}>Total Return</Text>
            <Text style={[styles.overviewValue, { color: portfolio?.total_return_pct >= 0 ? '#10B981' : '#EF4444' }]}>
              {portfolio?.total_return_pct >= 0 ? '+' : ''}{portfolio?.total_return_pct?.toFixed(2) || '0.00'}%
            </Text>
          </View>

          <View style={[styles.overviewCard, dynamicStyles.card]}>
            <Ionicons name="shield-checkmark-outline" size={24} color={STATUS_COLORS[portfolio?.account_status || 'active']} />
            <Text style={[styles.overviewLabel, dynamicStyles.textSecondary]}>Account Status</Text>
            <Text style={[styles.overviewValue, { color: STATUS_COLORS[portfolio?.account_status || 'active'], textTransform: 'capitalize' }]}>
              {portfolio?.account_status || 'Active'}
            </Text>
          </View>
        </View>

        {/* Performance Snapshot */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Performance Snapshot</Text>
            <Ionicons name="analytics-outline" size={20} color={theme.textSecondary} />
          </View>

          {performance.length > 0 ? (
            <View style={styles.performanceList}>
              {performance.slice(0, 6).map((entry) => (
                <View key={entry.performance_id} style={styles.performanceRow}>
                  <Text style={[styles.performanceMonth, dynamicStyles.textSecondary]}>
                    {formatMonth(entry.month)}
                  </Text>
                  <Text style={[styles.performanceReturn, { color: entry.return_percentage >= 0 ? '#10B981' : '#EF4444' }]}>
                    {entry.return_percentage >= 0 ? '+' : ''}{entry.return_percentage.toFixed(2)}%
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
              No performance data available yet.
            </Text>
          )}
        </View>

        {/* Fund Details */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Fund Details</Text>
            <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
          </View>

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Investment Tier</Text>
              <Text style={[styles.detailValue, dynamicStyles.text, { textTransform: 'capitalize' }]}>
                {portfolio?.investment_tier || 'N/A'}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Start Date</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>
                {portfolio?.start_date ? formatDate(portfolio.start_date) : 'N/A'}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Performance Fee</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>
                {portfolio?.performance_fee || 20}%
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Lock-up Period</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>
                {portfolio?.lockup_months || 3} months
              </Text>
            </View>
          </View>
        </View>

        {/* Withdrawals Section */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Withdrawals</Text>
            <TouchableOpacity
              style={[styles.withdrawButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowWithdrawModal(true)}
              disabled={portfolio?.account_status !== 'active'}
            >
              <Ionicons name="arrow-up-outline" size={16} color="#0A0E17" />
              <Text style={styles.withdrawButtonText}>Request</Text>
            </TouchableOpacity>
          </View>

          {withdrawals.length > 0 ? (
            <View style={styles.withdrawalsList}>
              {withdrawals.slice(0, 5).map((withdrawal) => (
                <View key={withdrawal.withdrawal_id} style={styles.withdrawalRow}>
                  <View style={styles.withdrawalInfo}>
                    <Text style={[styles.withdrawalAmount, dynamicStyles.text]}>
                      {formatCurrency(withdrawal.amount)}
                    </Text>
                    <Text style={[styles.withdrawalDate, dynamicStyles.textSecondary]}>
                      {formatDate(withdrawal.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.withdrawalStatus, { backgroundColor: `${STATUS_COLORS[withdrawal.status]}20` }]}>
                    <Text style={[styles.withdrawalStatusText, { color: STATUS_COLORS[withdrawal.status] }]}>
                      {withdrawal.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
              No withdrawal history.
            </Text>
          )}
        </View>

        {/* Notices & Updates */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Notices & Updates</Text>
            <Ionicons name="notifications-outline" size={20} color={theme.textSecondary} />
          </View>

          {notices.length > 0 ? (
            <View style={styles.noticesList}>
              {notices.slice(0, 5).map((notice) => (
                <View key={notice.notice_id} style={[styles.noticeItem, { borderLeftColor: theme.primary }]}>
                  <View style={styles.noticeHeader}>
                    <Ionicons
                      name={NOTICE_ICONS[notice.notice_type] as any || 'information-circle'}
                      size={16}
                      color={theme.primary}
                    />
                    <Text style={[styles.noticeTitle, dynamicStyles.text]}>{notice.title}</Text>
                  </View>
                  <Text style={[styles.noticeContent, dynamicStyles.textSecondary]} numberOfLines={2}>
                    {notice.content}
                  </Text>
                  <Text style={[styles.noticeDate, dynamicStyles.textSecondary]}>
                    {formatDate(notice.created_at)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
              No notices at this time.
            </Text>
          )}
        </View>

        {/* Disclaimer */}
        <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}30` }]}>
          <Ionicons name="shield-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
            Performance data is updated periodically by fund administrators. Past performance does not guarantee future results.
          </Text>
        </View>
      </ScrollView>

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Request Withdrawal</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>
                Available: {formatCurrency(portfolio?.current_equity || 0)}
              </Text>

              <View style={[styles.inputContainer, { borderColor: theme.border }]}>
                <Text style={[styles.currencySymbol, dynamicStyles.text]}>$</Text>
                <TextInput
                  style={[styles.amountInput, dynamicStyles.text]}
                  placeholder="Enter amount"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                />
              </View>

              <TextInput
                style={[styles.notesInput, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="Notes (optional)"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                value={withdrawNotes}
                onChangeText={setWithdrawNotes}
              />

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleWithdrawal}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#0A0E17" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Request</Text>
                )}
              </TouchableOpacity>

              <Text style={[styles.modalNote, dynamicStyles.textSecondary]}>
                Withdrawals are processed within 24-48 hours. Admin will be notified via WhatsApp.
              </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#0A0E17',
    fontSize: 14,
    fontWeight: '600',
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  overviewCard: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  overviewLabel: {
    fontSize: 12,
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  performanceList: {
    gap: 8,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  performanceMonth: {
    fontSize: 14,
  },
  performanceReturn: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
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
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  withdrawButtonText: {
    color: '#0A0E17',
    fontSize: 13,
    fontWeight: '600',
  },
  withdrawalsList: {
    gap: 8,
  },
  withdrawalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  withdrawalInfo: {
    gap: 4,
  },
  withdrawalAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  withdrawalDate: {
    fontSize: 12,
  },
  withdrawalStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  withdrawalStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noticesList: {
    gap: 12,
  },
  noticeItem: {
    paddingLeft: 12,
    borderLeftWidth: 3,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  noticeContent: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  noticeDate: {
    fontSize: 11,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
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
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
  modalNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});

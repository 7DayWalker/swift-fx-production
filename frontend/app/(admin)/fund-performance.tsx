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

interface Portfolio {
  portfolio_id: string;
  user_id: string;
  full_name: string;
  email: string;
  invested_capital: number;
  current_equity: number;
  total_return_pct: number;
  investment_tier: string;
  account_status: string;
  start_date: string;
}

interface PerformanceEntry {
  performance_id: string;
  month: string;
  return_percentage: number;
  equity_before: number;
  equity_after: number;
}

export default function AdminFundPerformanceScreen() {
  // GATED: Needs investor_portfolios + portfolio_performance tables in Supabase
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0E17' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🚧'}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>Fund Performance</Text>
        <Text style={{ fontSize: 15, color: '#8899AA', textAlign: 'center', lineHeight: 22 }}>This feature is under development and will be available in a future update.</Text>
      </View>
    </SafeAreaView>
  );
  const { theme } = useTheme();
  const router = useRouter();

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceEntry[]>([]);

  // Performance entry modal
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [returnPercentage, setReturnPercentage] = useState('');
  const [performanceNotes, setPerformanceNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Portfolio edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCapital, setEditCapital] = useState('');
  const [editEquity, setEditEquity] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const fetchPortfolios = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const response = await api.get('/admin/investor/portfolios');
      setPortfolios(response.data.portfolios || []);
    } catch (error: any) {
      console.error('Failed to fetch portfolios:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load portfolios');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolios();
    // Generate current month in YYYY-MM format
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }, [fetchPortfolios]);

  const fetchPortfolioDetail = async (portfolioId: string) => {
    try {
      const response = await api.get(`/admin/investor/portfolio/${portfolioId}`);
      setSelectedPortfolio(response.data.portfolio);
      setPerformanceHistory(response.data.performance_history || []);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load portfolio details');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPortfolios(true);
  };

  const handleAddPerformance = async () => {
    if (!selectedPortfolio) return;

    const returnPct = parseFloat(returnPercentage);
    if (isNaN(returnPct)) {
      Alert.alert('Invalid Input', 'Please enter a valid return percentage.');
      return;
    }

    if (!selectedMonth.match(/^\d{4}-\d{2}$/)) {
      Alert.alert('Invalid Month', 'Please enter month in YYYY-MM format.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post(`/admin/investor/portfolio/${selectedPortfolio.portfolio_id}/performance`, {
        month: selectedMonth,
        return_percentage: returnPct,
        notes: performanceNotes || null,
      });

      Alert.alert('Success', response.data.message);
      setShowPerformanceModal(false);
      setReturnPercentage('');
      setPerformanceNotes('');

      // Refresh portfolio detail
      fetchPortfolioDetail(selectedPortfolio.portfolio_id);
      fetchPortfolios(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add performance entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePortfolio = async () => {
    if (!selectedPortfolio) return;

    setSubmitting(true);

    try {
      const updateData: any = {};
      
      if (editCapital) {
        const capital = parseFloat(editCapital);
        if (!isNaN(capital)) updateData.invested_capital = capital;
      }
      
      if (editEquity) {
        const equity = parseFloat(editEquity);
        if (!isNaN(equity)) updateData.current_equity = equity;
      }
      
      if (editStatus && ['active', 'paused', 'closed'].includes(editStatus)) {
        updateData.account_status = editStatus;
      }

      await api.put(`/admin/investor/portfolio/${selectedPortfolio.portfolio_id}`, updateData);

      Alert.alert('Success', 'Portfolio updated successfully');
      setShowEditModal(false);
      setEditCapital('');
      setEditEquity('');
      setEditStatus('');

      fetchPortfolioDetail(selectedPortfolio.portfolio_id);
      fetchPortfolios(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update portfolio');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = () => {
    if (selectedPortfolio) {
      setEditCapital(selectedPortfolio.invested_capital.toString());
      setEditEquity(selectedPortfolio.current_equity.toString());
      setEditStatus(selectedPortfolio.account_status);
      setShowEditModal(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const STATUS_COLORS: Record<string, string> = {
    active: '#10B981',
    paused: '#F59E0B',
    closed: '#EF4444',
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  // Detail view for selected portfolio
  const renderPortfolioDetail = () => {
    if (!selectedPortfolio) return null;

    return (
      <View style={styles.detailOverlay}>
        <View style={[styles.detailContent, dynamicStyles.card]}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setSelectedPortfolio(null)}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.detailTitle, dynamicStyles.text]} numberOfLines={1}>
              {selectedPortfolio.full_name}
            </Text>
            <TouchableOpacity onPress={openEditModal}>
              <Ionicons name="create-outline" size={24} color={theme.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailScroll}>
            {/* Portfolio Summary */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, dynamicStyles.textSecondary]}>Capital</Text>
                <Text style={[styles.summaryValue, dynamicStyles.text]}>
                  {formatCurrency(selectedPortfolio.invested_capital)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, dynamicStyles.textSecondary]}>Equity</Text>
                <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                  {formatCurrency(selectedPortfolio.current_equity)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, dynamicStyles.textSecondary]}>Return</Text>
                <Text style={[styles.summaryValue, { color: selectedPortfolio.total_return_pct >= 0 ? '#10B981' : '#EF4444' }]}>
                  {selectedPortfolio.total_return_pct >= 0 ? '+' : ''}{selectedPortfolio.total_return_pct?.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, dynamicStyles.textSecondary]}>Status</Text>
                <Text style={[styles.summaryValue, { color: STATUS_COLORS[selectedPortfolio.account_status], textTransform: 'capitalize' }]}>
                  {selectedPortfolio.account_status}
                </Text>
              </View>
            </View>

            {/* Add Performance Button */}
            <TouchableOpacity
              style={[styles.addPerformanceButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowPerformanceModal(true)}
            >
              <Ionicons name="add-circle-outline" size={20} color="#0A0E17" />
              <Text style={styles.addPerformanceText}>Add Monthly Performance</Text>
            </TouchableOpacity>

            {/* Performance History */}
            <Text style={[styles.sectionTitle, dynamicStyles.text]}>Performance History</Text>
            {performanceHistory.length > 0 ? (
              <View style={styles.performanceList}>
                {performanceHistory.map((entry) => (
                  <View key={entry.performance_id} style={[styles.performanceItem, { borderColor: theme.border }]}>
                    <View style={styles.performanceItemHeader}>
                      <Text style={[styles.performanceMonth, dynamicStyles.text]}>
                        {formatMonth(entry.month)}
                      </Text>
                      <Text style={[styles.performanceReturn, { color: entry.return_percentage >= 0 ? '#10B981' : '#EF4444' }]}>
                        {entry.return_percentage >= 0 ? '+' : ''}{entry.return_percentage.toFixed(2)}%
                      </Text>
                    </View>
                    <Text style={[styles.performanceEquity, dynamicStyles.textSecondary]}>
                      {formatCurrency(entry.equity_before)} → {formatCurrency(entry.equity_after)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
                No performance entries yet.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Fund Performance</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.countBadge, { color: theme.primary }]}>{portfolios.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : portfolios.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No investor portfolios yet.
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
          {portfolios.map((portfolio) => (
            <TouchableOpacity
              key={portfolio.portfolio_id}
              style={[styles.portfolioCard, dynamicStyles.card]}
              onPress={() => fetchPortfolioDetail(portfolio.portfolio_id)}
            >
              <View style={styles.portfolioHeader}>
                <View style={styles.portfolioInfo}>
                  <Text style={[styles.portfolioName, dynamicStyles.text]} numberOfLines={1}>
                    {portfolio.full_name}
                  </Text>
                  <Text style={[styles.portfolioTier, dynamicStyles.textSecondary, { textTransform: 'capitalize' }]}>
                    {portfolio.investment_tier} Tier
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[portfolio.account_status]}20` }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[portfolio.account_status] }]}>
                    {portfolio.account_status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.portfolioMetrics}>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, dynamicStyles.textSecondary]}>Capital</Text>
                  <Text style={[styles.metricValue, dynamicStyles.text]}>
                    {formatCurrency(portfolio.invested_capital)}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, dynamicStyles.textSecondary]}>Equity</Text>
                  <Text style={[styles.metricValue, { color: '#10B981' }]}>
                    {formatCurrency(portfolio.current_equity)}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, dynamicStyles.textSecondary]}>Return</Text>
                  <Text style={[styles.metricValue, { color: portfolio.total_return_pct >= 0 ? '#10B981' : '#EF4444' }]}>
                    {portfolio.total_return_pct >= 0 ? '+' : ''}{portfolio.total_return_pct?.toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.portfolioFooter}>
                <Text style={[styles.portfolioDate, dynamicStyles.textSecondary]}>
                  Started: {formatDate(portfolio.start_date)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Portfolio Detail View */}
      {selectedPortfolio && renderPortfolioDetail()}

      {/* Add Performance Modal */}
      <Modal
        visible={showPerformanceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPerformanceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Add Performance Entry</Text>
              <TouchableOpacity onPress={() => setShowPerformanceModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Month (YYYY-MM)</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="2025-01"
                placeholderTextColor={theme.textSecondary}
                value={selectedMonth}
                onChangeText={setSelectedMonth}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Return Percentage</Text>
              <View style={[styles.returnInputContainer, { borderColor: theme.border }]}>
                <TextInput
                  style={[styles.returnInput, dynamicStyles.text]}
                  placeholder="5.5"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  value={returnPercentage}
                  onChangeText={setReturnPercentage}
                />
                <Text style={[styles.percentSymbol, dynamicStyles.text]}>%</Text>
              </View>

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Notes (optional)</Text>
              <TextInput
                style={[styles.notesInput, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="Performance notes..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
                value={performanceNotes}
                onChangeText={setPerformanceNotes}
              />

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleAddPerformance}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#0A0E17" />
                ) : (
                  <Text style={styles.submitButtonText}>Add Entry</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Portfolio Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Edit Portfolio</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Invested Capital</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="10000"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={editCapital}
                onChangeText={setEditCapital}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Current Equity</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="12500"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={editEquity}
                onChangeText={setEditEquity}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Account Status</Text>
              <View style={styles.statusButtons}>
                {['active', 'paused', 'closed'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusButton,
                      { borderColor: STATUS_COLORS[status] },
                      editStatus === status && { backgroundColor: STATUS_COLORS[status] },
                    ]}
                    onPress={() => setEditStatus(status)}
                  >
                    <Text style={[styles.statusButtonText, { color: editStatus === status ? '#0A0E17' : STATUS_COLORS[status] }]}>
                      {status.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleUpdatePortfolio}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#0A0E17" />
                ) : (
                  <Text style={styles.submitButtonText}>Save Changes</Text>
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
    fontSize: 14,
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
  portfolioCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  portfolioInfo: {
    flex: 1,
    marginRight: 12,
  },
  portfolioName: {
    fontSize: 16,
    fontWeight: '600',
  },
  portfolioTier: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  portfolioMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  portfolioFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portfolioDate: {
    fontSize: 11,
  },
  // Detail View
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  detailContent: {
    flex: 1,
    marginTop: 50,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 16,
  },
  detailScroll: {
    padding: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  summaryItem: {
    width: '50%',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPerformanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  addPerformanceText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  performanceList: {
    gap: 8,
  },
  performanceItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  performanceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  performanceMonth: {
    fontSize: 14,
    fontWeight: '500',
  },
  performanceReturn: {
    fontSize: 15,
    fontWeight: '600',
  },
  performanceEquity: {
    fontSize: 12,
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
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  returnInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingRight: 14,
    marginBottom: 16,
  },
  returnInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
  },
  percentSymbol: {
    fontSize: 16,
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
  statusButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
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
});

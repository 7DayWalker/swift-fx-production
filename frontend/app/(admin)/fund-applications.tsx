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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

// Status configuration
const STATUS_CONFIG = {
  pending_review: {
    label: 'Pending',
    color: '#F59E0B',
    icon: 'time-outline',
  },
  contacted: {
    label: 'Contacted',
    color: '#3B82F6',
    icon: 'call-outline',
  },
  approved: {
    label: 'Approved',
    color: '#10B981',
    icon: 'checkmark-circle-outline',
  },
  rejected: {
    label: 'Rejected',
    color: '#EF4444',
    icon: 'close-circle-outline',
  },
};

const STATUS_OPTIONS = ['pending_review', 'contacted', 'approved', 'rejected'];

interface FundApplication {
  application_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  country: string;
  investment_tier: string;
  intended_amount: number;
  trading_experience: string;
  status: string;
  source: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function AdminFundApplicationsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [applications, setApplications] = useState<FundApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<FundApplication | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchApplications = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const params = activeFilter ? { status: activeFilter } : {};
      const response = await api.get('/admin/fund/applications', { params });
      setApplications(response.data.applications || []);
    } catch (error: any) {
      console.error('Failed to fetch applications:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchApplications(true);
  };

  const handleUpdateStatus = async (applicationId: string, newStatus: string) => {
    try {
      setUpdating(true);
      await api.put(`/admin/fund/applications/${applicationId}?status=${newStatus}`);
      Alert.alert('Success', `Application ${newStatus.replace('_', ' ')}`);
      fetchApplications();
      setSelectedApp(null);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update application');
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

  const formatAmount = (amount: number) => {
    return `$${amount.toLocaleString()}`;
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  // Render application detail modal
  const renderApplicationDetail = () => {
    if (!selectedApp) return null;
    
    const status = STATUS_CONFIG[selectedApp.status as keyof typeof STATUS_CONFIG];
    
    return (
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, dynamicStyles.card]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, dynamicStyles.text]}>Application Details</Text>
            <TouchableOpacity onPress={() => setSelectedApp(null)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalScroll}>
            {/* Status Badge */}
            <View style={[styles.statusBadgeLarge, { backgroundColor: `${status?.color}20` }]}>
              <Ionicons name={status?.icon as any} size={20} color={status?.color} />
              <Text style={[styles.statusBadgeText, { color: status?.color }]}>
                {status?.label}
              </Text>
            </View>
            
            {/* Application Info */}
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Application ID</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedApp.application_id}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Full Name</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedApp.full_name}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Email</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedApp.email}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Phone / WhatsApp</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedApp.phone}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Country</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{selectedApp.country}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <View style={styles.detailHalf}>
                <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Investment Tier</Text>
                <Text style={[styles.detailValue, dynamicStyles.text, { textTransform: 'capitalize' }]}>
                  {selectedApp.investment_tier}
                </Text>
              </View>
              <View style={styles.detailHalf}>
                <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Amount</Text>
                <Text style={[styles.detailValue, { color: '#10B981' }]}>
                  {formatAmount(selectedApp.intended_amount)}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Trading Experience</Text>
              <Text style={[styles.detailValue, dynamicStyles.text, { textTransform: 'capitalize' }]}>
                {selectedApp.trading_experience}
              </Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Applied On</Text>
              <Text style={[styles.detailValue, dynamicStyles.text]}>{formatDate(selectedApp.created_at)}</Text>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, dynamicStyles.textSecondary]}>Source</Text>
              <View style={styles.sourceRow}>
                <Ionicons 
                  name={selectedApp.source === 'whatsapp' ? 'logo-whatsapp' : 'phone-portrait-outline'} 
                  size={16} 
                  color={selectedApp.source === 'whatsapp' ? '#25D366' : theme.primary} 
                />
                <Text style={[styles.detailValue, dynamicStyles.text, { textTransform: 'capitalize' }]}>
                  {selectedApp.source || 'App'}
                </Text>
              </View>
            </View>
            
            {/* Action Buttons */}
            <Text style={[styles.actionTitle, dynamicStyles.text]}>Update Status</Text>
            <View style={styles.actionButtons}>
              {STATUS_OPTIONS.map((statusOption) => {
                const statusConfig = STATUS_CONFIG[statusOption as keyof typeof STATUS_CONFIG];
                const isActive = selectedApp.status === statusOption;
                return (
                  <TouchableOpacity
                    key={statusOption}
                    style={[
                      styles.actionButton,
                      { borderColor: statusConfig.color },
                      isActive && { backgroundColor: statusConfig.color },
                    ]}
                    onPress={() => !isActive && handleUpdateStatus(selectedApp.application_id, statusOption)}
                    disabled={isActive || updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color={isActive ? '#FFF' : statusConfig.color} />
                    ) : (
                      <>
                        <Ionicons 
                          name={statusConfig.icon as any} 
                          size={16} 
                          color={isActive ? '#FFF' : statusConfig.color} 
                        />
                        <Text style={[
                          styles.actionButtonText, 
                          { color: isActive ? '#FFF' : statusConfig.color }
                        ]}>
                          {statusConfig.label}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Fund Applications</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.countBadge, { color: theme.primary }]}>{applications.length}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[
            styles.filterChip,
            { borderColor: theme.primary },
            !activeFilter && { backgroundColor: theme.primary },
          ]}
          onPress={() => setActiveFilter(null)}
        >
          <Text style={[
            styles.filterChipText,
            { color: !activeFilter ? '#0A0E17' : theme.primary },
          ]}>
            All
          </Text>
        </TouchableOpacity>
        {STATUS_OPTIONS.map((status) => {
          const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
          return (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterChip,
                { borderColor: config.color },
                activeFilter === status && { backgroundColor: config.color },
              ]}
              onPress={() => setActiveFilter(status)}
            >
              <Text style={[
                styles.filterChipText,
                { color: activeFilter === status ? '#0A0E17' : config.color },
              ]}>
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : applications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No applications found
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          {applications.map((app) => {
            const status = STATUS_CONFIG[app.status as keyof typeof STATUS_CONFIG];
            return (
              <TouchableOpacity
                key={app.application_id}
                style={[styles.applicationCard, dynamicStyles.card]}
                onPress={() => setSelectedApp(app)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.applicantName, dynamicStyles.text]} numberOfLines={1}>
                      {app.full_name}
                    </Text>
                    <Text style={[styles.applicantEmail, dynamicStyles.textSecondary]} numberOfLines={1}>
                      {app.email}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${status?.color}20` }]}>
                    <Ionicons name={status?.icon as any} size={12} color={status?.color} />
                    <Text style={[styles.statusText, { color: status?.color }]}>
                      {status?.label}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <View style={styles.cardInfo}>
                    <Ionicons name="cash-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.cardInfoText, { color: '#10B981' }]}>
                      {formatAmount(app.intended_amount)}
                    </Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Ionicons name="layers-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.cardInfoText, dynamicStyles.textSecondary, { textTransform: 'capitalize' }]}>
                      {app.investment_tier}
                    </Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.cardInfoText, dynamicStyles.textSecondary]}>
                      {app.country}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardDate, dynamicStyles.textSecondary]}>
                    {formatDate(app.created_at)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Application Detail Modal */}
      {selectedApp && renderApplicationDetail()}
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
  filterContainer: {
    maxHeight: 50,
    marginBottom: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
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
  },
  applicationCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  applicantName: {
    fontSize: 15,
    fontWeight: '600',
  },
  applicantEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardInfoText: {
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 11,
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 16,
    maxHeight: '90%',
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 16,
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  detailHalf: {
    flex: 1,
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
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

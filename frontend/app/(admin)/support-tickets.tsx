/**
 * Admin Support Tickets Management Screen
 * For Customer Support and Super Admin roles
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';

// Types
interface SupportTicket {
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  replies: Array<{
    reply_id: string;
    admin_id: string;
    admin_name: string;
    message: string;
    created_at: string;
  }>;
  admin_notes: Array<{
    note_id: string;
    admin_id: string;
    admin_name: string;
    admin_role: string;
    note: string;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
}

interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

interface UserInfo {
  name: string;
  email: string;
  subscription: string;
  created_at?: string;
}

// Status colors
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: '#F59E0B', icon: 'time-outline' },
  in_progress: { label: 'In Progress', color: '#3B82F6', icon: 'sync-outline' },
  resolved: { label: 'Resolved', color: '#10B981', icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', color: '#6B7280', icon: 'close-circle-outline' },
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  billing: 'Billing',
  signals: 'Signals',
  fund: 'Fund Management',
  referral: 'Referral',
  technical: 'Technical',
  other: 'Other',
};

export default function AdminSupportTicketsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  
  // State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  // Selected ticket state
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedUserInfo, setSelectedUserInfo] = useState<UserInfo | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  
  // Action states
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check permissions
  const canManageTickets = user?.admin_role === 'super_admin' || user?.admin_role === 'customer_support';

  useEffect(() => {
    if (!canManageTickets) {
      Alert.alert('Access Denied', 'You do not have permission to access this page.');
      router.back();
      return;
    }
    fetchTickets();
  }, [activeFilter]);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (activeFilter) {
        params.status = activeFilter;
      }
      
      const response = await api.get('/admin/support/tickets', { params });
      setTickets(response.data.tickets || []);
      setStats(response.data.stats || null);
    } catch (error: any) {
      console.error('Failed to fetch tickets:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    try {
      setLoadingTicket(true);
      const response = await api.get(`/admin/support/tickets/${ticket.ticket_id}`);
      setSelectedTicket(response.data.ticket);
      setSelectedUserInfo(response.data.user_info);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load ticket details');
    } finally {
      setLoadingTicket(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return;
    
    try {
      setSubmitting(true);
      await api.put(`/admin/support/tickets/${selectedTicket.ticket_id}/status?new_status=${newStatus}`);
      
      Alert.alert('Success', `Ticket status updated to ${STATUS_CONFIG[newStatus].label}`);
      setShowStatusModal(false);
      
      // Refresh ticket and list
      await handleSelectTicket(selectedTicket);
      fetchTickets();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    
    try {
      setSubmitting(true);
      await api.post(`/admin/support/tickets/${selectedTicket.ticket_id}/reply`, {
        message: replyText.trim(),
      });
      
      Alert.alert('Success', 'Reply added successfully');
      setShowReplyModal(false);
      setReplyText('');
      
      // Refresh ticket
      await handleSelectTicket(selectedTicket);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedTicket || !noteText.trim()) return;
    
    try {
      setSubmitting(true);
      await api.post(`/admin/support/tickets/${selectedTicket.ticket_id}/note`, {
        note: noteText.trim(),
      });
      
      Alert.alert('Success', 'Note added successfully');
      setShowNoteModal(false);
      setNoteText('');
      
      // Refresh ticket
      await handleSelectTicket(selectedTicket);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    input: { backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text },
  };

  const renderStatsRow = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsRow}
    >
      {[
        { key: null, label: 'All', value: stats?.total || 0, color: theme.primary },
        { key: 'open', label: 'Open', value: stats?.open || 0, color: '#F59E0B' },
        { key: 'in_progress', label: 'In Progress', value: stats?.in_progress || 0, color: '#3B82F6' },
        { key: 'resolved', label: 'Resolved', value: stats?.resolved || 0, color: '#10B981' },
        { key: 'closed', label: 'Closed', value: stats?.closed || 0, color: '#6B7280' },
      ].map((stat) => (
        <TouchableOpacity
          key={stat.key || 'all'}
          style={[
            styles.statCard,
            dynamicStyles.card,
            activeFilter === stat.key && { borderColor: stat.color, borderWidth: 2 },
          ]}
          onPress={() => setActiveFilter(stat.key)}
        >
          <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>{stat.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderTicketList = () => (
    <View style={styles.ticketList}>
      {tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="ticket-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, dynamicStyles.text]}>No Tickets Found</Text>
          <Text style={[styles.emptyDesc, dynamicStyles.textSecondary]}>
            {activeFilter ? `No ${STATUS_CONFIG[activeFilter]?.label.toLowerCase()} tickets` : 'No support tickets yet'}
          </Text>
        </View>
      ) : (
        tickets.map((ticket) => (
          <TouchableOpacity
            key={ticket.ticket_id}
            style={[styles.ticketCard, dynamicStyles.card]}
            onPress={() => handleSelectTicket(ticket)}
          >
            <View style={styles.ticketHeader}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: `${STATUS_CONFIG[ticket.status]?.color || '#666'}20` }
              ]}>
                <Ionicons
                  name={STATUS_CONFIG[ticket.status]?.icon as any || 'help'}
                  size={14}
                  color={STATUS_CONFIG[ticket.status]?.color || '#666'}
                />
                <Text style={[styles.statusText, { color: STATUS_CONFIG[ticket.status]?.color || '#666' }]}>
                  {STATUS_CONFIG[ticket.status]?.label || ticket.status}
                </Text>
              </View>
              <Text style={[styles.ticketId, dynamicStyles.textSecondary]}>
                {ticket.ticket_id}
              </Text>
            </View>
            
            <Text style={[styles.ticketSubject, dynamicStyles.text]} numberOfLines={1}>
              {ticket.subject}
            </Text>
            
            <View style={styles.ticketMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.metaText, dynamicStyles.textSecondary]} numberOfLines={1}>
                  {ticket.user_name}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="pricetag-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.metaText, dynamicStyles.textSecondary]}>
                  {CATEGORY_LABELS[ticket.category] || ticket.category}
                </Text>
              </View>
            </View>
            
            <View style={styles.ticketFooter}>
              <Text style={[styles.ticketDate, dynamicStyles.textSecondary]}>
                {new Date(ticket.created_at).toLocaleString()}
              </Text>
              {ticket.replies?.length > 0 && (
                <View style={styles.replyBadge}>
                  <Ionicons name="chatbubble" size={12} color={theme.primary} />
                  <Text style={[styles.replyCount, { color: theme.primary }]}>
                    {ticket.replies.length}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderTicketDetailModal = () => (
    <Modal
      visible={!!selectedTicket}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        setSelectedTicket(null);
        setSelectedUserInfo(null);
      }}
    >
      <SafeAreaView style={[styles.modalContainer, dynamicStyles.container]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => {
            setSelectedTicket(null);
            setSelectedUserInfo(null);
          }}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, dynamicStyles.text]}>Ticket Details</Text>
          <View style={{ width: 24 }} />
        </View>

        {loadingTicket ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : selectedTicket && (
          <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
            {/* Status & Actions */}
            <View style={styles.detailHeader}>
              <TouchableOpacity
                style={[
                  styles.statusBadgeLarge,
                  { backgroundColor: `${STATUS_CONFIG[selectedTicket.status]?.color}20` }
                ]}
                onPress={() => setShowStatusModal(true)}
              >
                <Ionicons
                  name={STATUS_CONFIG[selectedTicket.status]?.icon as any}
                  size={18}
                  color={STATUS_CONFIG[selectedTicket.status]?.color}
                />
                <Text style={[styles.statusTextLarge, { color: STATUS_CONFIG[selectedTicket.status]?.color }]}>
                  {STATUS_CONFIG[selectedTicket.status]?.label}
                </Text>
                <Ionicons name="chevron-down" size={16} color={STATUS_CONFIG[selectedTicket.status]?.color} />
              </TouchableOpacity>
              <Text style={[styles.detailTicketId, dynamicStyles.textSecondary]}>
                {selectedTicket.ticket_id}
              </Text>
            </View>

            {/* User Info Card */}
            <View style={[styles.userInfoCard, dynamicStyles.card]}>
              <View style={styles.userInfoHeader}>
                <Ionicons name="person-circle" size={40} color={theme.primary} />
                <View style={styles.userInfoText}>
                  <Text style={[styles.userName, dynamicStyles.text]}>
                    {selectedUserInfo?.name || selectedTicket.user_name}
                  </Text>
                  <Text style={[styles.userEmail, dynamicStyles.textSecondary]}>
                    {selectedUserInfo?.email || selectedTicket.user_email}
                  </Text>
                </View>
                <View style={[styles.subscriptionBadge, { backgroundColor: `${theme.primary}15` }]}>
                  <Text style={[styles.subscriptionText, { color: theme.primary }]}>
                    {(selectedUserInfo?.subscription || 'free').toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Subject & Category */}
            <Text style={[styles.detailSubject, dynamicStyles.text]}>
              {selectedTicket.subject}
            </Text>
            <View style={[styles.categoryBadge, { backgroundColor: `${theme.textSecondary}15` }]}>
              <Ionicons name="pricetag-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.categoryText, dynamicStyles.textSecondary]}>
                {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
              </Text>
            </View>

            {/* Original Message */}
            <View style={[styles.messageCard, dynamicStyles.card]}>
              <View style={styles.messageHeader}>
                <Text style={[styles.messageSender, dynamicStyles.text]}>
                  {selectedTicket.user_name}
                </Text>
                <Text style={[styles.messageDate, dynamicStyles.textSecondary]}>
                  {new Date(selectedTicket.created_at).toLocaleString()}
                </Text>
              </View>
              <Text style={[styles.messageText, dynamicStyles.textSecondary]}>
                {selectedTicket.message}
              </Text>
            </View>

            {/* Replies */}
            {selectedTicket.replies?.map((reply) => (
              <View key={reply.reply_id} style={[styles.messageCard, styles.replyCard, { borderLeftColor: theme.primary }]}>
                <View style={styles.messageHeader}>
                  <View style={styles.adminBadge}>
                    <Ionicons name="shield-checkmark" size={14} color={theme.primary} />
                    <Text style={[styles.messageSender, { color: theme.primary }]}>
                      {reply.admin_name}
                    </Text>
                  </View>
                  <Text style={[styles.messageDate, dynamicStyles.textSecondary]}>
                    {new Date(reply.created_at).toLocaleString()}
                  </Text>
                </View>
                <Text style={[styles.messageText, dynamicStyles.textSecondary]}>
                  {reply.message}
                </Text>
              </View>
            ))}

            {/* Admin Notes (Internal) */}
            {selectedTicket.admin_notes?.length > 0 && (
              <View style={styles.notesSection}>
                <Text style={[styles.notesSectionTitle, dynamicStyles.text]}>
                  <Ionicons name="lock-closed" size={14} color={theme.textSecondary} /> Internal Notes
                </Text>
                {selectedTicket.admin_notes.map((note) => (
                  <View key={note.note_id} style={[styles.noteCard, { backgroundColor: `${theme.textSecondary}10` }]}>
                    <View style={styles.noteHeader}>
                      <Text style={[styles.noteSender, dynamicStyles.textSecondary]}>
                        {note.admin_name} ({note.admin_role})
                      </Text>
                      <Text style={[styles.noteDate, dynamicStyles.textSecondary]}>
                        {new Date(note.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={[styles.noteText, dynamicStyles.textSecondary]}>
                      {note.note}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowReplyModal(true)}
              >
                <Ionicons name="chatbubble" size={18} color="#0A0E17" />
                <Text style={styles.actionButtonText}>Reply</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton, dynamicStyles.card]}
                onPress={() => setShowNoteModal(true)}
              >
                <Ionicons name="document-text" size={18} color={theme.text} />
                <Text style={[styles.actionButtonText, { color: theme.text }]}>Add Note</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderStatusModal = () => (
    <Modal
      visible={showStatusModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowStatusModal(false)}
    >
      <TouchableOpacity
        style={styles.statusModalOverlay}
        activeOpacity={1}
        onPress={() => setShowStatusModal(false)}
      >
        <View style={[styles.statusModalContent, dynamicStyles.card]}>
          <Text style={[styles.statusModalTitle, dynamicStyles.text]}>Change Status</Text>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.statusOption,
                selectedTicket?.status === key && { backgroundColor: `${config.color}15` }
              ]}
              onPress={() => handleUpdateStatus(key)}
              disabled={submitting}
            >
              <View style={styles.statusOptionLeft}>
                <Ionicons name={config.icon as any} size={20} color={config.color} />
                <Text style={[styles.statusOptionText, dynamicStyles.text]}>{config.label}</Text>
              </View>
              {selectedTicket?.status === key && (
                <Ionicons name="checkmark" size={20} color={config.color} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderReplyModal = () => (
    <Modal
      visible={showReplyModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowReplyModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, dynamicStyles.container]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowReplyModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, dynamicStyles.text]}>Add Reply</Text>
            <TouchableOpacity onPress={handleAddReply} disabled={submitting || !replyText.trim()}>
              {submitting ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.sendButton, { color: replyText.trim() ? theme.primary : theme.textSecondary }]}>
                  Send
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.replyFormContainer}>
            <Text style={[styles.replyNote, dynamicStyles.textSecondary]}>
              This reply will be visible to the user.
            </Text>
            <TextInput
              style={[styles.replyInput, dynamicStyles.input]}
              placeholder="Type your reply..."
              placeholderTextColor={theme.textSecondary}
              value={replyText}
              onChangeText={setReplyText}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderNoteModal = () => (
    <Modal
      visible={showNoteModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowNoteModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, dynamicStyles.container]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, dynamicStyles.text]}>Add Internal Note</Text>
            <TouchableOpacity onPress={handleAddNote} disabled={submitting || !noteText.trim()}>
              {submitting ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.sendButton, { color: noteText.trim() ? theme.primary : theme.textSecondary }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.replyFormContainer}>
            <View style={[styles.noteWarning, { backgroundColor: `${theme.primary}10` }]}>
              <Ionicons name="lock-closed" size={16} color={theme.primary} />
              <Text style={[styles.noteWarningText, { color: theme.primary }]}>
                This note is internal and will NOT be visible to the user.
              </Text>
            </View>
            <TextInput
              style={[styles.replyInput, dynamicStyles.input]}
              placeholder="Type your internal note..."
              placeholderTextColor={theme.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>Loading tickets...</Text>
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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Support Tickets</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      {renderStatsRow()}

      {/* Ticket List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {renderTicketList()}
      </ScrollView>

      {/* Modals */}
      {renderTicketDetailModal()}
      {renderStatusModal()}
      {renderReplyModal()}
      {renderNoteModal()}
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
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  statCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 80,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  ticketList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  ticketCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketId: {
    fontSize: 11,
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  ticketMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketDate: {
    fontSize: 11,
  },
  replyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  sendButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusTextLarge: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailTicketId: {
    fontSize: 12,
  },
  userInfoCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  userInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userInfoText: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  subscriptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  subscriptionText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailSubject: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginBottom: 16,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  messageCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  replyCard: {
    borderLeftWidth: 3,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '600',
  },
  messageDate: {
    fontSize: 11,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notesSection: {
    marginTop: 16,
  },
  notesSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  noteCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  noteSender: {
    fontSize: 12,
    fontWeight: '500',
  },
  noteDate: {
    fontSize: 10,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '600',
  },
  // Status Modal
  statusModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusModalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 8,
  },
  statusModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    textAlign: 'center',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
  },
  statusOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusOptionText: {
    fontSize: 15,
  },
  // Reply/Note Modal
  replyFormContainer: {
    flex: 1,
    padding: 16,
  },
  replyNote: {
    fontSize: 13,
    marginBottom: 12,
  },
  replyInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 200,
  },
  noteWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  noteWarningText: {
    flex: 1,
    fontSize: 13,
  },
});

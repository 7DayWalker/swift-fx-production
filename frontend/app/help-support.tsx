/**
 * Help & Support Screen
 * User-facing support page with FAQs, contact options, and ticket management
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
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import api from '../src/services/api';

// Types
interface FAQ {
  faq_id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
}

interface FAQCategory {
  id: string;
  name: string;
}

interface SupportTicket {
  ticket_id: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  replies: Array<{
    reply_id: string;
    admin_name: string;
    message: string;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface SupportInfo {
  whatsapp_number: string;
  whatsapp_url: string;
  email: string;
  email_subject: string;
}

// Status colors
const STATUS_COLORS: Record<string, string> = {
  open: '#F59E0B',
  in_progress: '#3B82F6',
  resolved: '#10B981',
  closed: '#6B7280',
};

// Ticket categories
const TICKET_CATEGORIES = [
  { id: 'billing', name: 'Billing' },
  { id: 'signals', name: 'Signals' },
  { id: 'fund', name: 'Fund Management' },
  { id: 'referral', name: 'Referral Program' },
  { id: 'technical', name: 'Technical Issue' },
  { id: 'other', name: 'Other' },
];

export default function HelpSupportScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  
  // State
  const [activeTab, setActiveTab] = useState<'faq' | 'contact' | 'tickets'>('faq');
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [faqCategories, setFaqCategories] = useState<FAQCategory[]>([]);
  const [activeFaqCategory, setActiveFaqCategory] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Ticket form state
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  
  // Selected ticket for viewing
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch FAQs
      const faqResponse = await api.get('/support/faqs');
      setFaqs(faqResponse.data.faqs || []);
      setFaqCategories(faqResponse.data.categories || []);
      if (faqResponse.data.categories?.length > 0) {
        setActiveFaqCategory(faqResponse.data.categories[0].id);
      }
      
      // Fetch support info
      const infoResponse = await api.get('/support/info');
      setSupportInfo(infoResponse.data);
      
      // Fetch user's tickets
      const ticketsResponse = await api.get('/support/tickets');
      setTickets(ticketsResponse.data.tickets || []);
    } catch (error) {
      console.error('Failed to fetch support data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleSubmitTicket = async () => {
    if (!ticketCategory) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!ticketSubject.trim()) {
      Alert.alert('Error', 'Please enter a subject');
      return;
    }
    if (!ticketMessage.trim()) {
      Alert.alert('Error', 'Please enter your message');
      return;
    }

    try {
      setSubmittingTicket(true);
      const response = await api.post('/support/tickets', {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        message: ticketMessage.trim(),
      });

      Alert.alert(
        'Ticket Submitted',
        `Your ticket has been created.\n\nTicket ID: ${response.data.ticket_id}\n\nOur team will respond shortly.`,
        [{ text: 'OK', onPress: () => {
          setShowTicketForm(false);
          setTicketCategory('');
          setTicketSubject('');
          setTicketMessage('');
          fetchData();
          setActiveTab('tickets');
        }}]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit ticket');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleWhatsAppSupport = () => {
    if (supportInfo?.whatsapp_url) {
      Linking.openURL(supportInfo.whatsapp_url);
    }
  };

  const handleEmailSupport = () => {
    if (supportInfo?.email) {
      const subject = encodeURIComponent(supportInfo.email_subject || 'Support Request');
      Linking.openURL(`mailto:${supportInfo.email}?subject=${subject}`);
    }
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    input: { backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text },
  };

  const renderFAQSection = () => {
    const filteredFaqs = activeFaqCategory 
      ? faqs.filter(f => f.category === activeFaqCategory)
      : faqs;

    return (
      <View style={styles.section}>
        {/* Category Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryTabs}
        >
          {faqCategories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryTab,
                activeFaqCategory === cat.id && { backgroundColor: theme.primary },
                activeFaqCategory !== cat.id && dynamicStyles.card,
              ]}
              onPress={() => setActiveFaqCategory(cat.id)}
            >
              <Text style={[
                styles.categoryTabText,
                activeFaqCategory === cat.id ? { color: '#0A0E17' } : dynamicStyles.text,
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* FAQ List */}
        <View style={styles.faqList}>
          {filteredFaqs.map((faq) => (
            <TouchableOpacity
              key={faq.faq_id}
              style={[styles.faqItem, dynamicStyles.card]}
              onPress={() => setExpandedFaq(expandedFaq === faq.faq_id ? null : faq.faq_id)}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQuestion, dynamicStyles.text]} numberOfLines={expandedFaq === faq.faq_id ? undefined : 2}>
                  {faq.question}
                </Text>
                <Ionicons
                  name={expandedFaq === faq.faq_id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textSecondary}
                />
              </View>
              {expandedFaq === faq.faq_id && (
                <Text style={[styles.faqAnswer, dynamicStyles.textSecondary]}>
                  {faq.answer}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderContactSection = () => (
    <View style={styles.section}>
      {/* In-App Ticket */}
      <TouchableOpacity
        style={[styles.contactCard, dynamicStyles.card]}
        onPress={() => setShowTicketForm(true)}
      >
        <View style={[styles.contactIconBox, { backgroundColor: `${theme.primary}15` }]}>
          <Ionicons name="document-text" size={28} color={theme.primary} />
        </View>
        <View style={styles.contactInfo}>
          <Text style={[styles.contactTitle, dynamicStyles.text]}>Submit a Support Ticket</Text>
          <Text style={[styles.contactDesc, dynamicStyles.textSecondary]}>
            Create a ticket and we'll respond within 24 hours
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </TouchableOpacity>

      {/* WhatsApp Support */}
      <TouchableOpacity
        style={[styles.contactCard, dynamicStyles.card]}
        onPress={handleWhatsAppSupport}
      >
        <View style={[styles.contactIconBox, { backgroundColor: '#25D36615' }]}>
          <Ionicons name="logo-whatsapp" size={28} color="#25D366" />
        </View>
        <View style={styles.contactInfo}>
          <Text style={[styles.contactTitle, dynamicStyles.text]}>Chat on WhatsApp</Text>
          <Text style={[styles.contactDesc, dynamicStyles.textSecondary]}>
            Get instant support via WhatsApp
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </TouchableOpacity>

      {/* Email Support */}
      <TouchableOpacity
        style={[styles.contactCard, dynamicStyles.card]}
        onPress={handleEmailSupport}
      >
        <View style={[styles.contactIconBox, { backgroundColor: '#EA433515' }]}>
          <Ionicons name="mail" size={28} color="#EA4335" />
        </View>
        <View style={styles.contactInfo}>
          <Text style={[styles.contactTitle, dynamicStyles.text]}>Email Support</Text>
          <Text style={[styles.contactDesc, dynamicStyles.textSecondary]}>
            {supportInfo?.email || 'support@swiftfx.app'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </TouchableOpacity>

      {/* Support Hours */}
      <View style={[styles.supportHours, dynamicStyles.card]}>
        <Ionicons name="time-outline" size={20} color={theme.primary} />
        <Text style={[styles.supportHoursText, dynamicStyles.textSecondary]}>
          Support available 24/7 • Response time: 2-24 hours
        </Text>
      </View>
    </View>
  );

  const renderTicketsSection = () => (
    <View style={styles.section}>
      {tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="ticket-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, dynamicStyles.text]}>No Support Tickets</Text>
          <Text style={[styles.emptyDesc, dynamicStyles.textSecondary]}>
            You haven't submitted any support tickets yet.
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowTicketForm(true)}
          >
            <Text style={styles.emptyButtonText}>Create Ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.ticketList}>
          {tickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.ticket_id}
              style={[styles.ticketCard, dynamicStyles.card]}
              onPress={() => setSelectedTicket(ticket)}
            >
              <View style={styles.ticketHeader}>
                <View style={[
                  styles.ticketStatusBadge,
                  { backgroundColor: `${STATUS_COLORS[ticket.status]}20` }
                ]}>
                  <View style={[styles.ticketStatusDot, { backgroundColor: STATUS_COLORS[ticket.status] }]} />
                  <Text style={[styles.ticketStatusText, { color: STATUS_COLORS[ticket.status] }]}>
                    {ticket.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.ticketId, dynamicStyles.textSecondary]}>
                  {ticket.ticket_id}
                </Text>
              </View>
              <Text style={[styles.ticketSubject, dynamicStyles.text]} numberOfLines={1}>
                {ticket.subject}
              </Text>
              <Text style={[styles.ticketMessage, dynamicStyles.textSecondary]} numberOfLines={2}>
                {ticket.message}
              </Text>
              <View style={styles.ticketFooter}>
                <Text style={[styles.ticketDate, dynamicStyles.textSecondary]}>
                  {new Date(ticket.created_at).toLocaleDateString()}
                </Text>
                {ticket.replies?.length > 0 && (
                  <View style={styles.replyBadge}>
                    <Ionicons name="chatbubble" size={12} color={theme.primary} />
                    <Text style={[styles.replyCount, { color: theme.primary }]}>
                      {ticket.replies.length} {ticket.replies.length === 1 ? 'reply' : 'replies'}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderTicketForm = () => (
    <Modal
      visible={showTicketForm}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowTicketForm(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, dynamicStyles.container]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTicketForm(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, dynamicStyles.text]}>New Support Ticket</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
            {/* Category Selection */}
            <Text style={[styles.formLabel, dynamicStyles.text]}>Category *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categorySelector}
            >
              {TICKET_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryOption,
                    ticketCategory === cat.id && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ticketCategory !== cat.id && dynamicStyles.card,
                  ]}
                  onPress={() => setTicketCategory(cat.id)}
                >
                  <Text style={[
                    styles.categoryOptionText,
                    ticketCategory === cat.id ? { color: '#0A0E17' } : dynamicStyles.text,
                  ]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Subject */}
            <Text style={[styles.formLabel, dynamicStyles.text]}>Subject *</Text>
            <TextInput
              style={[styles.textInput, dynamicStyles.input]}
              placeholder="Brief description of your issue"
              placeholderTextColor={theme.textSecondary}
              value={ticketSubject}
              onChangeText={setTicketSubject}
              maxLength={100}
            />

            {/* Message */}
            <Text style={[styles.formLabel, dynamicStyles.text]}>Message *</Text>
            <TextInput
              style={[styles.textArea, dynamicStyles.input]}
              placeholder="Please describe your issue in detail..."
              placeholderTextColor={theme.textSecondary}
              value={ticketMessage}
              onChangeText={setTicketMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={[styles.charCount, dynamicStyles.textSecondary]}>
              {ticketMessage.length}/2000
            </Text>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: theme.primary },
                submittingTicket && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitTicket}
              disabled={submittingTicket}
            >
              {submittingTicket ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#0A0E17" />
                  <Text style={styles.submitButtonText}>Submit Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderTicketDetail = () => (
    <Modal
      visible={!!selectedTicket}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setSelectedTicket(null)}
    >
      <SafeAreaView style={[styles.modalContainer, dynamicStyles.container]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setSelectedTicket(null)}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, dynamicStyles.text]}>Ticket Details</Text>
          <View style={{ width: 24 }} />
        </View>

        {selectedTicket && (
          <ScrollView style={styles.ticketDetailContainer}>
            {/* Status & ID */}
            <View style={styles.ticketDetailHeader}>
              <View style={[
                styles.ticketStatusBadge,
                { backgroundColor: `${STATUS_COLORS[selectedTicket.status]}20` }
              ]}>
                <View style={[styles.ticketStatusDot, { backgroundColor: STATUS_COLORS[selectedTicket.status] }]} />
                <Text style={[styles.ticketStatusText, { color: STATUS_COLORS[selectedTicket.status] }]}>
                  {selectedTicket.status.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.ticketDetailId, dynamicStyles.textSecondary]}>
                {selectedTicket.ticket_id}
              </Text>
            </View>

            {/* Subject */}
            <Text style={[styles.ticketDetailSubject, dynamicStyles.text]}>
              {selectedTicket.subject}
            </Text>

            {/* Original Message */}
            <View style={[styles.messageCard, dynamicStyles.card]}>
              <View style={styles.messageHeader}>
                <Text style={[styles.messageSender, dynamicStyles.text]}>You</Text>
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
                      {reply.admin_name} (Support)
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

            {/* Note for resolved/closed tickets */}
            {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
              <View style={[styles.closedNote, { backgroundColor: `${theme.primary}10` }]}>
                <Ionicons name="information-circle" size={20} color={theme.primary} />
                <Text style={[styles.closedNoteText, dynamicStyles.textSecondary]}>
                  This ticket has been {selectedTicket.status}. If you need further assistance, please create a new ticket.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>Loading...</Text>
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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {[
          { id: 'faq', icon: 'help-circle', label: 'FAQ' },
          { id: 'contact', icon: 'chatbubbles', label: 'Contact' },
          { id: 'tickets', icon: 'ticket', label: 'My Tickets' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              activeTab === tab.id && { borderBottomColor: theme.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <Ionicons
              name={tab.icon as any}
              size={20}
              color={activeTab === tab.id ? theme.primary : theme.textSecondary}
            />
            <Text style={[
              styles.tabText,
              { color: activeTab === tab.id ? theme.primary : theme.textSecondary },
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {activeTab === 'faq' && renderFAQSection()}
        {activeTab === 'contact' && renderContactSection()}
        {activeTab === 'tickets' && renderTicketsSection()}
      </ScrollView>

      {/* Modals */}
      {renderTicketForm()}
      {renderTicketDetail()}
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    flex: 1,
  },
  // FAQ Styles
  categoryTabs: {
    paddingBottom: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  faqList: {
    gap: 12,
  },
  faqItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  faqAnswer: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
  },
  // Contact Styles
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 14,
  },
  contactIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactDesc: {
    fontSize: 13,
  },
  supportHours: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  supportHoursText: {
    fontSize: 13,
    flex: 1,
  },
  // Tickets Styles
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
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#0A0E17',
    fontSize: 14,
    fontWeight: '600',
  },
  ticketList: {
    gap: 12,
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
  ticketStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  ticketStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ticketStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketId: {
    fontSize: 11,
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  ticketMessage: {
    fontSize: 13,
    lineHeight: 20,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  ticketDate: {
    fontSize: 12,
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
  formContainer: {
    flex: 1,
    padding: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  categorySelector: {
    flexDirection: 'row',
  },
  categoryOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 10,
  },
  categoryOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 150,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 40,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
  // Ticket Detail Styles
  ticketDetailContainer: {
    flex: 1,
    padding: 16,
  },
  ticketDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ticketDetailId: {
    fontSize: 12,
  },
  ticketDetailSubject: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
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
  closedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    marginTop: 12,
  },
  closedNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
});

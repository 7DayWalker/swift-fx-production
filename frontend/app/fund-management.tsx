import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../src/context/ThemeContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';

// Investment tiers configuration
const INVESTMENT_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    minInvestment: 500,
    maxInvestment: 5000,
    expectedReturn: '5-10%',
    description: 'Perfect for beginners',
    capitalRange: '$500 - $5,000',
  },
  {
    id: 'professional',
    name: 'Professional',
    minInvestment: 5000,
    maxInvestment: 25000,
    expectedReturn: '10-20%',
    description: 'For experienced investors',
    capitalRange: '$5,000 - $25,000',
  },
  {
    id: 'elite',
    name: 'Elite',
    minInvestment: 25000,
    maxInvestment: 100000,
    expectedReturn: '20-35%',
    description: 'Premium management',
    capitalRange: '$25,000 - $100,000',
  },
];

// Performance metrics data
const PERFORMANCE_METRICS = [
  {
    id: 'totalReturn',
    label: 'Total Return',
    value: '+127.4%',
    color: '#10B981',
    icon: 'trending-up',
  },
  {
    id: 'monthlyAvg',
    label: 'Monthly Avg',
    value: '+8.2%',
    color: '#00D4AA',
    icon: 'analytics',
  },
  {
    id: 'winRate',
    label: 'Win Rate',
    value: '73%',
    color: '#8B5CF6',
    icon: 'stats-chart',
  },
  {
    id: 'clients',
    label: 'Active Clients',
    value: '500+',
    color: '#F59E0B',
    icon: 'people',
  },
];

// WhatsApp contact details
const FUND_MANAGER_PHONE = '2348169427440';

export default function FundManagementScreen() {
  // GATED: Needs fund_applications table in Supabase
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0E17' }}>
      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.back()}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#00D4AA' }}>{'← Back'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🚧'}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>Fund Management</Text>
        <Text style={{ fontSize: 15, color: '#8899AA', textAlign: 'center', lineHeight: 22 }}>This feature is under development and will be available in a future update.</Text>
      </View>
    </SafeAreaView>
  );
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { status, refreshStatus } = useSubscription();

  // State for tier selection modal
  const [showTierModal, setShowTierModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<typeof INVESTMENT_TIERS[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get subscription from backend status (authoritative source)
  const subscription = status?.subscription || 'free';
  
  // Entitlement check: Premium and VIP users can apply
  const canApply = subscription === 'premium' || subscription === 'vip';

  // Re-check subscription on screen focus (not only on mount)
  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus])
  );

  // Get user plan display name (uppercase for message)
  const getUserPlanUpperCase = (): string => {
    if (subscription === 'vip') return 'VIP';
    if (subscription === 'premium') return 'PREMIUM';
    return 'FREE';
  };

  // Open WhatsApp for general enquiry (Contact Fund Manager button)
  const handleContactFundManager = () => {
    const message = encodeURIComponent(
      `Hello Swift FX Fund Team,\nI have an enquiry about your Fund Management service.`
    );
    const whatsappUrl = `https://wa.me/${FUND_MANAGER_PHONE}?text=${message}`;
    Linking.openURL(whatsappUrl);
  };

  // Show tier selection modal when user taps "Apply via WhatsApp"
  const handleApplyPress = () => {
    setSelectedTier(null);
    setShowTierModal(true);
  };

  // Submit application to backend, then open WhatsApp
  const handleSubmitApplication = async () => {
    if (!selectedTier || !user) return;

    setIsSubmitting(true);

    try {
      // Create application in database FIRST
      const response = await api.post('/fund/apply', {
        full_name: user.name || 'Not provided',
        email: user.email,
        phone: 'WhatsApp',
        country: 'Not specified',
        investment_tier: selectedTier.id,
        intended_amount: selectedTier.minInvestment,
        trading_experience: 'intermediate',
        risk_agreement: true,
        source: 'whatsapp',
      });

      const applicationId = response.data.application_id;

      // Close modal
      setShowTierModal(false);

      // THEN open WhatsApp with the application ID
      const message = encodeURIComponent(
        `Hello Swift FX Fund Team,\nI want to apply for Fund Management.\n\nName: ${user.name || 'Not provided'}\nEmail: ${user.email}\nSelected Tier: ${selectedTier.name}\nCapital Range: ${selectedTier.capitalRange}\nUser ID: ${user.user_id}\nApplication ID: ${applicationId}`
      );
      const whatsappUrl = `https://wa.me/${FUND_MANAGER_PHONE}?text=${message}`;
      
      // Small delay to ensure modal closes before opening WhatsApp
      setTimeout(() => {
        Linking.openURL(whatsappUrl);
      }, 300);

    } catch (error: any) {
      console.error('Failed to submit application:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to submit application. Please try again.';
      Alert.alert('Application Error', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  // Tier Selection Modal
  const renderTierSelectionModal = () => (
    <Modal
      visible={showTierModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowTierModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, dynamicStyles.card]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, dynamicStyles.text]}>Select Investment Tier</Text>
            <TouchableOpacity onPress={() => setShowTierModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Tier Options */}
          <ScrollView style={styles.modalScroll}>
            {INVESTMENT_TIERS.map((tier) => (
              <TouchableOpacity
                key={tier.id}
                style={[
                  styles.tierOption,
                  { borderColor: selectedTier?.id === tier.id ? theme.primary : theme.border },
                  selectedTier?.id === tier.id && { backgroundColor: `${theme.primary}15` },
                ]}
                onPress={() => setSelectedTier(tier)}
              >
                <View style={styles.tierOptionHeader}>
                  <View style={styles.tierOptionLeft}>
                    <View style={[
                      styles.radioOuter,
                      { borderColor: selectedTier?.id === tier.id ? theme.primary : theme.textSecondary }
                    ]}>
                      {selectedTier?.id === tier.id && (
                        <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
                      )}
                    </View>
                    <Text style={[styles.tierOptionName, dynamicStyles.text]}>{tier.name}</Text>
                  </View>
                  <Text style={[styles.tierOptionReturn, { color: '#10B981' }]}>{tier.expectedReturn}</Text>
                </View>
                <Text style={[styles.tierOptionCapital, dynamicStyles.textSecondary]}>
                  {tier.capitalRange}
                </Text>
                <Text style={[styles.tierOptionDesc, dynamicStyles.textSecondary]}>
                  {tier.description}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: selectedTier ? theme.primary : theme.border },
              ]}
              onPress={handleSubmitApplication}
              disabled={!selectedTier || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <>
                  <Ionicons name="logo-whatsapp" size={20} color="#0A0E17" />
                  <Text style={styles.submitButtonText}>
                    {selectedTier ? 'Continue to WhatsApp' : 'Select a Tier'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.modalNote, dynamicStyles.textSecondary]}>
              Your application will be recorded and a team member will contact you via WhatsApp.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Fund Management</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro Section */}
        <View style={[styles.introCard, { backgroundColor: `${theme.primary}15` }]}>
          <View style={[styles.introIcon, { backgroundColor: `${theme.primary}25` }]}>
            <Ionicons name="briefcase" size={32} color={theme.primary} />
          </View>
          <Text style={[styles.introTitle, dynamicStyles.text]}>Professional Fund Management</Text>
          <Text style={[styles.introText, dynamicStyles.textSecondary]}>
            Let our expert traders manage your investments. Hands-off approach with transparent reporting.
          </Text>
        </View>

        {/* Performance Metrics - Card Grid */}
        <Text style={[styles.sectionTitle, dynamicStyles.text]}>Fund Performance</Text>
        <View style={styles.metricsGrid}>
          {PERFORMANCE_METRICS.map((metric) => (
            <View key={metric.id} style={[styles.metricCard, dynamicStyles.card]}>
              <View style={[styles.metricIconContainer, { backgroundColor: `${metric.color}20` }]}>
                <Ionicons name={metric.icon as any} size={20} color={metric.color} />
              </View>
              <Text style={[styles.metricValue, { color: metric.color }]}>{metric.value}</Text>
              <Text style={[styles.metricLabel, dynamicStyles.textSecondary]}>{metric.label}</Text>
            </View>
          ))}
        </View>

        {/* Investment Tiers */}
        <View style={[styles.card, dynamicStyles.card]}>
          <Text style={[styles.cardTitle, dynamicStyles.text]}>Investment Tiers</Text>
          {INVESTMENT_TIERS.map((tier, index) => (
            <View key={tier.id} style={[styles.tierCard, index < INVESTMENT_TIERS.length - 1 && styles.tierCardBorder]}>
              <View style={styles.tierHeader}>
                <Text style={[styles.tierCardName, dynamicStyles.text]}>{tier.name}</Text>
                <Text style={[styles.tierReturn, { color: '#10B981' }]}>{tier.expectedReturn}</Text>
              </View>
              <Text style={[styles.tierDescription, dynamicStyles.textSecondary]}>{tier.description}</Text>
              <Text style={[styles.tierInvestment, dynamicStyles.textSecondary]}>
                ${tier.minInvestment.toLocaleString()} - ${tier.maxInvestment.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>

        {/* Action Section - Based on Subscription Entitlement */}
        {canApply ? (
          // Premium/VIP users: Show Apply + Contact buttons
          <View style={styles.actionButtonsContainer}>
            {/* Apply via WhatsApp - Creates DB record FIRST */}
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.primary }]}
              onPress={handleApplyPress}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#0A0E17" />
              <Text style={styles.applyButtonText}>Apply via WhatsApp</Text>
            </TouchableOpacity>

            {/* Contact Fund Manager - General enquiry only, NO DB record */}
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: '#25D366' }]}
              onPress={handleContactFundManager}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
              <Text style={styles.contactButtonText}>Contact Fund Manager</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Free users only: Show locked section with Upgrade CTA
          <View style={[styles.upgradeCard, { backgroundColor: `${theme.primary}15` }]}>
            <Ionicons name="lock-closed" size={24} color={theme.primary} />
            <Text style={[styles.upgradeText, dynamicStyles.text]}>
              Upgrade to Premium or VIP to apply for Fund Management
            </Text>
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Legal Disclaimers - Always visible */}
        <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}30` }]}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="warning-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.disclaimerTitle, dynamicStyles.textSecondary]}>Important Disclaimers</Text>
          </View>
          <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
            • Past performance is not indicative of future results.{'\n'}
            • This is not financial advice.{'\n'}
            • Swift FX does not hold client funds. All trading is conducted via third-party brokers.{'\n'}
            • Trading involves significant risk of loss.
          </Text>
        </View>
      </ScrollView>

      {/* Tier Selection Modal */}
      {renderTierSelectionModal()}
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  introCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  introText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  // Metric Cards Grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  metricIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Card styles
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  // Tier styles
  tierCard: {
    paddingVertical: 12,
  },
  tierCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tierCardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  tierReturn: {
    fontSize: 14,
    fontWeight: '600',
  },
  tierDescription: {
    fontSize: 13,
    marginBottom: 4,
  },
  tierInvestment: {
    fontSize: 12,
  },
  // Action Buttons (Premium/VIP users)
  actionButtonsContainer: {
    marginBottom: 16,
    gap: 12,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  applyButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Upgrade CTA (Free users only)
  upgradeCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 20,
  },
  upgradeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: '#0A0E17',
    fontSize: 14,
    fontWeight: '600',
  },
  // Disclaimer
  disclaimerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
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
  tierOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tierOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierOptionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  tierOptionReturn: {
    fontSize: 14,
    fontWeight: '600',
  },
  tierOptionCapital: {
    fontSize: 14,
    marginBottom: 4,
    marginLeft: 32,
  },
  tierOptionDesc: {
    fontSize: 12,
    marginLeft: 32,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
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
    marginBottom: 20,
    lineHeight: 18,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import api from '../src/services/api';

// Investment tiers configuration
const INVESTMENT_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    minInvestment: 500,
    maxInvestment: 5000,
    expectedReturn: '5-10%',
    description: 'Perfect for beginners',
  },
  {
    id: 'professional',
    name: 'Professional',
    minInvestment: 5000,
    maxInvestment: 25000,
    expectedReturn: '10-20%',
    description: 'For experienced investors',
  },
  {
    id: 'elite',
    name: 'Elite',
    minInvestment: 25000,
    maxInvestment: 100000,
    expectedReturn: '20-35%',
    description: 'Premium management',
  },
];

// Performance data (historical)
const PERFORMANCE_DATA = {
  totalReturn: '+127.4%',
  monthlyAvg: '+8.2%',
  winRate: '73%',
  clientCount: '500+',
};

// Experience levels
const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Beginner (< 1 year)' },
  { id: 'intermediate', label: 'Intermediate (1-3 years)' },
  { id: 'advanced', label: 'Advanced (3+ years)' },
];

// Country list (common)
const COUNTRIES = [
  'Nigeria', 'United States', 'United Kingdom', 'Canada', 'Ghana', 
  'South Africa', 'Kenya', 'India', 'Australia', 'Germany', 'France',
  'UAE', 'Singapore', 'Malaysia', 'Other'
];

// Application status display config
const STATUS_CONFIG = {
  pending_review: {
    label: 'Under Review',
    color: '#F59E0B',
    icon: 'time-outline',
    message: 'Your application is being reviewed by our team.',
  },
  contacted: {
    label: 'Contacted',
    color: '#3B82F6',
    icon: 'call-outline',
    message: 'Our team has reached out to you. Please check your messages.',
  },
  approved: {
    label: 'Approved',
    color: '#10B981',
    icon: 'checkmark-circle-outline',
    message: 'Congratulations! Your fund manager will guide you through the next steps.',
  },
  rejected: {
    label: 'Not Approved',
    color: '#EF4444',
    icon: 'close-circle-outline',
    message: 'Unfortunately, your application was not approved at this time.',
  },
};

// WhatsApp contact details
const FUND_MANAGER_PHONE = '+2348169427440';

export default function FundManagementScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { subscription } = useSubscription();
  
  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingApplication, setExistingApplication] = useState<any>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    country: '',
    investment_tier: '',
    intended_amount: '',
    trading_experience: '',
    risk_agreement: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);

  // Check if user can apply (Premium or VIP)
  const canApply = subscription === 'premium' || subscription === 'vip';

  // Fetch existing application
  useEffect(() => {
    fetchMyApplication();
  }, []);

  const fetchMyApplication = async () => {
    try {
      setLoading(true);
      const response = await api.get('/fund/my-application');
      if (response.data.has_application) {
        setExistingApplication(response.data.application);
      }
    } catch (error) {
      console.error('Failed to fetch application:', error);
    } finally {
      setLoading(false);
    }
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) errors.email = 'Invalid email format';
    if (!formData.phone.trim()) errors.phone = 'Phone/WhatsApp is required';
    if (!formData.country) errors.country = 'Country is required';
    if (!formData.investment_tier) errors.investment_tier = 'Select an investment tier';
    if (!formData.intended_amount) errors.intended_amount = 'Investment amount is required';
    else if (isNaN(Number(formData.intended_amount)) || Number(formData.intended_amount) < 500) {
      errors.intended_amount = 'Minimum investment is $500';
    }
    if (!formData.trading_experience) errors.trading_experience = 'Select your experience level';
    if (!formData.risk_agreement) errors.risk_agreement = 'You must agree to the risk disclaimer';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit application
  const handleSubmitApplication = async () => {
    if (!validateForm()) return;
    
    try {
      setSubmitting(true);
      const response = await api.post('/fund/apply', {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        country: formData.country,
        investment_tier: formData.investment_tier,
        intended_amount: parseFloat(formData.intended_amount),
        trading_experience: formData.trading_experience,
        risk_agreement: formData.risk_agreement,
      });
      
      Alert.alert(
        'Application Submitted',
        response.data.message,
        [{ text: 'OK', onPress: () => {
          setShowApplicationForm(false);
          fetchMyApplication();
        }}]
      );
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to submit application'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Open WhatsApp
  const handleContactFundManager = () => {
    const applicationId = existingApplication?.application_id || 'N/A';
    const message = encodeURIComponent(
      `Hello, I applied for Swift FX Fund Management. My application ID is ${applicationId}.`
    );
    const whatsappUrl = `https://wa.me/${FUND_MANAGER_PHONE.replace('+', '')}?text=${message}`;
    Linking.openURL(whatsappUrl);
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    input: { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
  };

  // Render application status card
  const renderApplicationStatus = () => {
    if (!existingApplication) return null;
    
    const status = STATUS_CONFIG[existingApplication.status as keyof typeof STATUS_CONFIG];
    if (!status) return null;
    
    return (
      <View style={[styles.statusCard, dynamicStyles.card, { borderColor: status.color }]}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusIconContainer, { backgroundColor: `${status.color}20` }]}>
            <Ionicons name={status.icon as any} size={24} color={status.color} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={[styles.statusLabel, { color: status.color }]}>
              {status.label}
            </Text>
            <Text style={[styles.statusId, dynamicStyles.textSecondary]}>
              ID: {existingApplication.application_id}
            </Text>
          </View>
        </View>
        <Text style={[styles.statusMessage, dynamicStyles.text]}>
          {status.message}
        </Text>
        
        {/* Contact Fund Manager button */}
        {(existingApplication.status === 'contacted' || existingApplication.status === 'approved') && (
          <TouchableOpacity
            style={[styles.whatsappButton, { backgroundColor: '#25D366' }]}
            onPress={handleContactFundManager}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.whatsappButtonText}>Contact Fund Manager</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render application form
  const renderApplicationForm = () => (
    <View style={styles.formContainer}>
      <Text style={[styles.formTitle, dynamicStyles.text]}>Fund Management Application</Text>
      <Text style={[styles.formSubtitle, dynamicStyles.textSecondary]}>
        Complete the form below to apply for managed fund services
      </Text>
      
      {/* Full Name */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Full Name *</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, formErrors.full_name && styles.inputError]}
          placeholder="Enter your full name"
          placeholderTextColor={theme.textSecondary}
          value={formData.full_name}
          onChangeText={(text) => setFormData({ ...formData, full_name: text })}
        />
        {formErrors.full_name && <Text style={styles.errorText}>{formErrors.full_name}</Text>}
      </View>
      
      {/* Email */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Email *</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, formErrors.email && styles.inputError]}
          placeholder="Enter your email"
          placeholderTextColor={theme.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
        />
        {formErrors.email && <Text style={styles.errorText}>{formErrors.email}</Text>}
      </View>
      
      {/* Phone */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Phone / WhatsApp *</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, formErrors.phone && styles.inputError]}
          placeholder="Enter your phone number"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          value={formData.phone}
          onChangeText={(text) => setFormData({ ...formData, phone: text })}
        />
        {formErrors.phone && <Text style={styles.errorText}>{formErrors.phone}</Text>}
      </View>
      
      {/* Country */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Country *</Text>
        <TouchableOpacity
          style={[styles.input, dynamicStyles.input, styles.picker, formErrors.country && styles.inputError]}
          onPress={() => setShowCountryPicker(!showCountryPicker)}
        >
          <Text style={formData.country ? dynamicStyles.text : { color: theme.textSecondary }}>
            {formData.country || 'Select your country'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        {showCountryPicker && (
          <View style={[styles.pickerDropdown, dynamicStyles.card]}>
            <ScrollView style={{ maxHeight: 200 }}>
              {COUNTRIES.map((country) => (
                <TouchableOpacity
                  key={country}
                  style={styles.pickerItem}
                  onPress={() => {
                    setFormData({ ...formData, country });
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={dynamicStyles.text}>{country}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        {formErrors.country && <Text style={styles.errorText}>{formErrors.country}</Text>}
      </View>
      
      {/* Investment Tier */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Investment Tier *</Text>
        <View style={styles.tierContainer}>
          {INVESTMENT_TIERS.map((tier) => (
            <TouchableOpacity
              key={tier.id}
              style={[
                styles.tierOption,
                dynamicStyles.card,
                formData.investment_tier === tier.id && { borderColor: theme.primary, borderWidth: 2 },
              ]}
              onPress={() => setFormData({ ...formData, investment_tier: tier.id })}
            >
              <Text style={[styles.tierName, dynamicStyles.text]}>{tier.name}</Text>
              <Text style={[styles.tierRange, dynamicStyles.textSecondary]}>
                ${tier.minInvestment.toLocaleString()} - ${tier.maxInvestment.toLocaleString()}
              </Text>
              {formData.investment_tier === tier.id && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} style={styles.tierCheck} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        {formErrors.investment_tier && <Text style={styles.errorText}>{formErrors.investment_tier}</Text>}
      </View>
      
      {/* Investment Amount */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Intended Investment Amount (USD) *</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, formErrors.intended_amount && styles.inputError]}
          placeholder="Enter amount (min $500)"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numeric"
          value={formData.intended_amount}
          onChangeText={(text) => setFormData({ ...formData, intended_amount: text })}
        />
        {formErrors.intended_amount && <Text style={styles.errorText}>{formErrors.intended_amount}</Text>}
      </View>
      
      {/* Trading Experience */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, dynamicStyles.text]}>Trading Experience *</Text>
        <TouchableOpacity
          style={[styles.input, dynamicStyles.input, styles.picker, formErrors.trading_experience && styles.inputError]}
          onPress={() => setShowExperiencePicker(!showExperiencePicker)}
        >
          <Text style={formData.trading_experience ? dynamicStyles.text : { color: theme.textSecondary }}>
            {EXPERIENCE_LEVELS.find(e => e.id === formData.trading_experience)?.label || 'Select your experience'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        {showExperiencePicker && (
          <View style={[styles.pickerDropdown, dynamicStyles.card]}>
            {EXPERIENCE_LEVELS.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.pickerItem}
                onPress={() => {
                  setFormData({ ...formData, trading_experience: exp.id });
                  setShowExperiencePicker(false);
                }}
              >
                <Text style={dynamicStyles.text}>{exp.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {formErrors.trading_experience && <Text style={styles.errorText}>{formErrors.trading_experience}</Text>}
      </View>
      
      {/* Risk Agreement */}
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setFormData({ ...formData, risk_agreement: !formData.risk_agreement })}
      >
        <View style={[styles.checkbox, formData.risk_agreement && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
          {formData.risk_agreement && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={[styles.checkboxLabel, dynamicStyles.text]}>
          I understand trading involves significant risk and returns are not guaranteed *
        </Text>
      </TouchableOpacity>
      {formErrors.risk_agreement && <Text style={styles.errorText}>{formErrors.risk_agreement}</Text>}
      
      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, { backgroundColor: theme.primary }, submitting && styles.buttonDisabled]}
        onPress={handleSubmitApplication}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#0A0E17" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Application</Text>
        )}
      </TouchableOpacity>
      
      {/* Cancel Button */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => setShowApplicationForm(false)}
      >
        <Text style={[styles.cancelButtonText, dynamicStyles.textSecondary]}>Cancel</Text>
      </TouchableOpacity>
    </View>
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

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : showApplicationForm ? (
            renderApplicationForm()
          ) : (
            <>
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

              {/* Application Status (if exists) */}
              {existingApplication && renderApplicationStatus()}

              {/* Performance Stats */}
              <View style={[styles.card, dynamicStyles.card]}>
                <Text style={[styles.cardTitle, dynamicStyles.text]}>Fund Performance</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: '#10B981' }]}>{PERFORMANCE_DATA.totalReturn}</Text>
                    <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Total Return</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: theme.primary }]}>{PERFORMANCE_DATA.monthlyAvg}</Text>
                    <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Monthly Avg</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: '#8B5CF6' }]}>{PERFORMANCE_DATA.winRate}</Text>
                    <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Win Rate</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: '#F59E0B' }]}>{PERFORMANCE_DATA.clientCount}</Text>
                    <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Clients</Text>
                  </View>
                </View>
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

              {/* Apply Now Button OR Upgrade Message */}
              {!existingApplication && (
                canApply ? (
                  <TouchableOpacity
                    style={[styles.applyButton, { backgroundColor: theme.primary }]}
                    onPress={() => setShowApplicationForm(true)}
                  >
                    <Text style={styles.applyButtonText}>Apply Now</Text>
                    <Ionicons name="arrow-forward" size={20} color="#0A0E17" />
                  </TouchableOpacity>
                ) : (
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
                )
              )}

              {/* Contact Fund Manager (for existing applications) */}
              {existingApplication && (
                <TouchableOpacity
                  style={[styles.contactButton, { backgroundColor: '#25D366' }]}
                  onPress={handleContactFundManager}
                >
                  <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
                  <Text style={styles.contactButtonText}>Contact Fund Manager via WhatsApp</Text>
                </TouchableOpacity>
              )}

              {/* Legal Disclaimers */}
              <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}30` }]}>
                <Text style={[styles.disclaimerTitle, dynamicStyles.textSecondary]}>Important Disclaimers</Text>
                <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
                  • Past performance is not indicative of future results.{'\n'}
                  • This is not financial advice.{'\n'}
                  • Swift FX does not hold client funds. All trading is conducted via third-party brokers.{'\n'}
                  • Trading involves significant risk of loss.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  introCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
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
  statusCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusId: {
    fontSize: 12,
    marginTop: 2,
  },
  statusMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  applyButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
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
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  // Form styles
  formContainer: {
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerDropdown: {
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tierContainer: {
    gap: 10,
  },
  tierOption: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierName: {
    fontSize: 15,
    fontWeight: '600',
  },
  tierRange: {
    fontSize: 12,
  },
  tierCheck: {
    marginLeft: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#8A8D98',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
  },
});

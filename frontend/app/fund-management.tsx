import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../src/context/ThemeContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { useAuth } from '../src/context/AuthContext';

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
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { status, refreshStatus } = useSubscription();

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

  // Get user email
  const getUserEmail = (): string => {
    return user?.email || 'Not available';
  };

  // Open WhatsApp with pre-filled message (per spec)
  const handleWhatsAppApplication = () => {
    const userPlan = getUserPlanUpperCase();
    const userEmail = getUserEmail();
    
    // Message template as per spec
    const message = encodeURIComponent(
      `Hello Swift FX Team 👋\nI'm a ${userPlan} member and I'd like to apply for Fund Management.\nMy registered email is: ${userEmail}`
    );
    
    const whatsappUrl = `https://wa.me/${FUND_MANAGER_PHONE}?text=${message}`;
    Linking.openURL(whatsappUrl);
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
          // Premium/VIP users: Show Apply + Contact buttons (both open WhatsApp)
          // IMPORTANT: Do NOT show upgrade CTA for premium/vip users
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.primary }]}
              onPress={handleWhatsAppApplication}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#0A0E17" />
              <Text style={styles.applyButtonText}>Apply via WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: '#25D366' }]}
              onPress={handleWhatsAppApplication}
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
});

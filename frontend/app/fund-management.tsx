import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useSubscription } from '../src/context/SubscriptionContext';

export default function FundManagementScreen() {
  const { user } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Check VIP access using subscription context
  const effectiveSubscription = subscriptionStatus?.subscription || user?.role || 'free';
  const isVIP = effectiveSubscription === 'vip';

  const handleApply = () => {
    // VIP-only action - redirect to subscription if not VIP
    if (!isVIP) {
      router.push('/subscription');
      return;
    }
    
    const msg = 'Applications are currently being reviewed. Our team will contact you within 48 hours.';
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('Application Submitted', msg);
    }
  };

  const handleContact = () => {
    // VIP-only action - redirect to subscription if not VIP
    if (!isVIP) {
      router.push('/subscription');
      return;
    }
    
    const msg = 'Contact us at funds@swiftfxsignals.com for inquiries.';
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('Contact Us', msg);
    }
  };

  // PREVIEW-FIRST: Show all content to all users, but lock actions
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fund Management</Text>
        {isVIP ? (
          <View style={styles.vipBadge}>
            <Ionicons name="star" size={14} color="#FFD700" />
          </View>
        ) : (
          <View style={styles.lockedBadge}>
            <Ionicons name="lock-closed" size={14} color="#8A8D98" />
          </View>
        )}
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* VIP Banner for non-VIP users */}
        {!isVIP && (
          <TouchableOpacity 
            style={styles.vipBanner}
            onPress={() => router.push('/subscription')}
          >
            <View style={styles.vipBannerContent}>
              <Ionicons name="lock-closed" size={20} color="#FFD700" />
              <View style={styles.vipBannerText}>
                <Text style={styles.vipBannerTitle}>VIP Exclusive Feature</Text>
                <Text style={styles.vipBannerSubtitle}>Upgrade to access fund management actions</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFD700" />
          </TouchableOpacity>
        )}

        {/* Intro Section */}
        <View style={styles.introSection}>
          <View style={styles.introIcon}>
            <Ionicons name="briefcase" size={32} color="#00D4AA" />
          </View>
          <Text style={styles.introTitle}>Swift FX Fund Management</Text>
          <Text style={styles.introText}>
            Let our experienced traders manage your capital with proven strategies. 
            Our fund management service provides hands-off investing with transparent 
            performance tracking and professional risk management.
          </Text>
        </View>

        {/* Performance Overview */}
        <Text style={styles.sectionTitle}>Performance Overview</Text>
        <View style={styles.performanceGrid}>
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>+47.8%</Text>
            <Text style={styles.performanceLabel}>YTD Return</Text>
            <View style={[styles.performanceTrend, { backgroundColor: 'rgba(0, 212, 170, 0.2)' }]}>
              <Ionicons name="trending-up" size={12} color="#00D4AA" />
              <Text style={[styles.performanceTrendText, { color: '#00D4AA' }]}>+3.2%</Text>
            </View>
          </View>
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>68%</Text>
            <Text style={styles.performanceLabel}>Win Rate</Text>
            <View style={[styles.performanceTrend, { backgroundColor: 'rgba(0, 212, 170, 0.2)' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#00D4AA" />
              <Text style={[styles.performanceTrendText, { color: '#00D4AA' }]}>Consistent</Text>
            </View>
          </View>
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>12.4%</Text>
            <Text style={styles.performanceLabel}>Max Drawdown</Text>
            <View style={[styles.performanceTrend, { backgroundColor: 'rgba(255, 215, 0, 0.2)' }]}>
              <Ionicons name="shield-checkmark" size={12} color="#FFD700" />
              <Text style={[styles.performanceTrendText, { color: '#FFD700' }]}>Managed</Text>
            </View>
          </View>
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>2.8</Text>
            <Text style={styles.performanceLabel}>Sharpe Ratio</Text>
            <View style={[styles.performanceTrend, { backgroundColor: 'rgba(0, 212, 170, 0.2)' }]}>
              <Ionicons name="star" size={12} color="#00D4AA" />
              <Text style={[styles.performanceTrendText, { color: '#00D4AA' }]}>Excellent</Text>
            </View>
          </View>
        </View>

        {/* Monthly Performance Chart Placeholder */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Monthly Performance</Text>
            <Text style={styles.chartPeriod}>Last 6 Months</Text>
          </View>
          <View style={styles.chartPlaceholder}>
            <View style={styles.chartBars}>
              {[5.2, 3.8, 7.1, -2.3, 4.6, 6.2].map((value, index) => (
                <View key={index} style={styles.chartBarContainer}>
                  <View 
                    style={[
                      styles.chartBar, 
                      { 
                        height: Math.abs(value) * 8,
                        backgroundColor: value >= 0 ? '#00D4AA' : '#FF4757',
                      }
                    ]} 
                  />
                  <Text style={styles.chartBarLabel}>
                    {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* How It Works */}
        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.stepsContainer}>
          {[
            { icon: 'document-text-outline', title: 'Apply', description: 'Submit your application with investment amount and goals' },
            { icon: 'shield-checkmark-outline', title: 'Verification', description: 'Our team reviews and verifies your application' },
            { icon: 'wallet-outline', title: 'Fund Account', description: 'Deposit funds to your managed account' },
            { icon: 'trending-up-outline', title: 'Start Trading', description: 'Our traders execute strategies on your behalf' },
            { icon: 'bar-chart-outline', title: 'Track & Withdraw', description: 'Monitor performance and withdraw anytime' },
          ].map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.stepIconContainer}>
                <Ionicons name={step.icon as any} size={24} color="#00D4AA" />
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Investment Tiers */}
        <Text style={styles.sectionTitle}>Investment Tiers</Text>
        <View style={styles.tiersContainer}>
          {[
            { name: 'Starter', min: '$5,000', fee: '25%', features: ['Monthly reports', 'Standard support'] },
            { name: 'Professional', min: '$25,000', fee: '20%', features: ['Weekly reports', 'Priority support', 'Lower fees'] },
            { name: 'Elite', min: '$100,000', fee: '15%', features: ['Daily reports', 'Dedicated manager', 'Lowest fees', 'Custom strategies'] },
          ].map((tier, index) => (
            <View key={index} style={[styles.tierCard, index === 1 && styles.tierCardFeatured]}>
              {index === 1 && <View style={styles.featuredBadge}><Text style={styles.featuredBadgeText}>POPULAR</Text></View>}
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierMin}>Min: {tier.min}</Text>
              <Text style={styles.tierFee}>Performance Fee: {tier.fee}</Text>
              <View style={styles.tierFeatures}>
                {tier.features.map((feature, fIndex) => (
                  <View key={fIndex} style={styles.tierFeatureItem}>
                    <Ionicons name="checkmark" size={14} color="#00D4AA" />
                    <Text style={styles.tierFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Risk Disclaimer */}
        <View style={styles.disclaimerCard}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="warning-outline" size={24} color="#FFD700" />
            <Text style={styles.disclaimerTitle}>Risk Disclaimer</Text>
          </View>
          <Text style={styles.disclaimerText}>
            Trading forex and CFDs involves significant risk and can result in the loss of your invested capital. 
            Past performance is not indicative of future results. You should not invest money that you cannot 
            afford to lose. Please ensure you fully understand the risks involved before investing.
          </Text>
          <View style={styles.disclaimerPoints}>
            <Text style={styles.disclaimerPoint}>• Capital at risk - losses may exceed deposits</Text>
            <Text style={styles.disclaimerPoint}>• Past performance doesn't guarantee future results</Text>
            <Text style={styles.disclaimerPoint}>• Withdrawals subject to terms and conditions</Text>
            <Text style={styles.disclaimerPoint}>• Not financial advice - consult a professional</Text>
          </View>
        </View>

        {/* Terms Summary */}
        <View style={styles.termsCard}>
          <Text style={styles.termsTitle}>Key Terms</Text>
          <View style={styles.termsGrid}>
            <View style={styles.termItem}>
              <Text style={styles.termLabel}>Lock-up Period</Text>
              <Text style={styles.termValue}>30 Days</Text>
            </View>
            <View style={styles.termItem}>
              <Text style={styles.termLabel}>Withdrawal Notice</Text>
              <Text style={styles.termValue}>5 Business Days</Text>
            </View>
            <View style={styles.termItem}>
              <Text style={styles.termLabel}>Reporting</Text>
              <Text style={styles.termValue}>Weekly</Text>
            </View>
            <View style={styles.termItem}>
              <Text style={styles.termLabel}>Audit</Text>
              <Text style={styles.termValue}>Quarterly</Text>
            </View>
          </View>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Ionicons name="rocket-outline" size={20} color="#0A0E17" />
            <Text style={styles.applyButtonText}>Apply Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactButton} onPress={handleContact}>
            <Ionicons name="chatbubble-outline" size={20} color="#00D4AA" />
            <Text style={styles.contactButtonText}>Contact Fund Manager</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <Text style={styles.footerNote}>
          Swift FX Signals Fund Management is operated by licensed professionals. 
          All investments are subject to our terms of service.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  vipBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  // Locked screen styles
  lockedContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  lockIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  lockedSubtitle: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  benefitsCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 12,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
    marginLeft: 8,
  },
  lockedNote: {
    fontSize: 12,
    color: '#8A8D98',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // Main content styles
  introSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  introIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  introText: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    marginTop: 8,
  },
  performanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  performanceCard: {
    width: '48%',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  performanceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 8,
  },
  performanceTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  performanceTrendText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  chartCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chartPeriod: {
    fontSize: 12,
    color: '#8A8D98',
  },
  chartPlaceholder: {
    height: 120,
    justifyContent: 'flex-end',
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 100,
  },
  chartBarContainer: {
    alignItems: 'center',
  },
  chartBar: {
    width: 32,
    borderRadius: 4,
    marginBottom: 8,
  },
  chartBarLabel: {
    fontSize: 10,
    color: '#8A8D98',
  },
  stepsContainer: {
    marginBottom: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  stepIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#8A8D98',
    lineHeight: 18,
  },
  tiersContainer: {
    marginBottom: 24,
  },
  tierCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  tierCardFeatured: {
    borderColor: '#00D4AA',
    backgroundColor: 'rgba(0, 212, 170, 0.05)',
  },
  featuredBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#00D4AA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tierMin: {
    fontSize: 14,
    color: '#00D4AA',
    marginBottom: 2,
  },
  tierFee: {
    fontSize: 13,
    color: '#8A8D98',
    marginBottom: 12,
  },
  tierFeatures: {
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
    paddingTop: 12,
  },
  tierFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tierFeatureText: {
    fontSize: 13,
    color: '#FFFFFF',
    marginLeft: 8,
  },
  disclaimerCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 12,
  },
  disclaimerPoints: {
    gap: 4,
  },
  disclaimerPoint: {
    fontSize: 12,
    color: '#8A8D98',
  },
  termsCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  termsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  termItem: {
    width: '50%',
    marginBottom: 12,
  },
  termLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 2,
  },
  termValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ctaContainer: {
    marginBottom: 16,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4AA',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
    marginLeft: 8,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1F2E',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00D4AA',
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00D4AA',
    marginLeft: 8,
  },
  footerNote: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
});

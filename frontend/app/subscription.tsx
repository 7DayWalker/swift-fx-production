import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useSubscription } from '../src/context/SubscriptionContext';
import { useTheme } from '../src/context/ThemeContext';
import { SubscriptionBadge } from '../src/components/SubscriptionBadge';
import { api } from '../src/services/api';
import IAPService, { isIAPAvailable, PurchaseResult } from '../src/services/iapService';

type BillingCycle = 'weekly' | 'monthly' | 'yearly';

interface Plan {
  id: string;
  name: string;
  description: string;
  features: string[];
  pricing: {
    weekly: number;
    monthly: number;
    yearly: number;
  };
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { status: subscriptionStatus, refreshStatus, isLoading: subLoading } = useSubscription();
  
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [iapInitialized, setIapInitialized] = useState(false);

  // Initialize IAP on mount (mobile only)
  useEffect(() => {
    const initializeIAP = async () => {
      if (isIAPAvailable()) {
        try {
          const success = await IAPService.initIAP();
          setIapInitialized(success);
          console.log('[Subscription] IAP initialized:', success);
        } catch (error) {
          console.error('[Subscription] IAP init error:', error);
        }
      }
    };
    initializeIAP();

    return () => {
      if (isIAPAvailable()) {
        IAPService.endIAP();
      }
    };
  }, []);

  // Fetch plans from backend API (single source of truth)
  const fetchData = useCallback(async () => {
    try {
      const response = await api.get('/subscription/plans');
      const data = response.data;
      const backendPlans = data.plans || data;

      if (Array.isArray(backendPlans) && backendPlans.length > 0) {
        const mapped: Plan[] = backendPlans
          .filter((p: any) => p.id !== 'free')
          .map((p: any) => ({
            id: p.id || p.tier,
            name: p.name || (p.tier === 'vip' ? 'VIP' : 'Premium'),
            description: p.description || '',
            features: Array.isArray(p.features) ? p.features : [],
            pricing: p.pricing || { weekly: 0, monthly: 0, yearly: 0 },
          }));
        setPlans(mapped);
      }
    } catch (error) {
      console.error('[Subscription] Failed to fetch plans:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshStatus();
    fetchData();
  }, [fetchData, refreshStatus]);

  // Handle upgrade with native IAP (iOS/Android) or web checkout
  const handleUpgrade = async (planId: string) => {
    if (isPurchasing) return;
    
    // Check if user already has this or higher plan
    const planHierarchy: Record<string, number> = { free: 0, premium: 1, vip: 2 };
    const currentLevel = planHierarchy[subscriptionStatus?.subscription || 'free'] || 0;
    const targetLevel = planHierarchy[planId] || 0;
    
    if (currentLevel >= targetLevel) {
      Alert.alert('Already Subscribed', `You already have ${subscriptionStatus?.subscription?.toUpperCase()} or higher.`);
      return;
    }

    // Use native IAP on mobile
    if (isIAPAvailable() && Platform.OS !== 'web') {
      setIsPurchasing(true);
      try {
        const plan = planId as 'premium' | 'vip';
        const result = await IAPService.purchaseSubscription(plan, selectedCycle);
        
        if (result.success) {
          // Wait for backend verification via purchaseUpdatedListener,
          // then refresh status from the authoritative backend.
          setTimeout(async () => {
            await refreshStatus();
          }, 2000);
          Alert.alert(
            'Purchase Initiated',
            'Verifying your subscription with the server...',
            [{ text: 'OK', onPress: () => refreshStatus() }]
          );
        } else {
          if (result.message !== 'Purchase cancelled.' && result.message !== 'Purchase cancelled') {
            Alert.alert('Purchase Failed', result.message);
          }
        }
      } catch (error: any) {
        console.error('[Subscription] Purchase error:', error);
        Alert.alert('Purchase Error', error.message || 'Something went wrong. Please try again.');
      } finally {
        setIsPurchasing(false);
      }
    } else {
      // Web — no IAP available
      Alert.alert(
        'Contact Support',
        'To upgrade your plan, please use the mobile app for in-app purchase, or contact support@swiftfx.app.',
      );
    }
  };

  // Restore purchases (mobile only)
  const handleRestorePurchases = async () => {
    if (!isIAPAvailable() || Platform.OS === 'web') {
      Alert.alert('Not Available', 'Restore purchases is only available on mobile devices.');
      return;
    }

    setIsRestoring(true);
    try {
      const result = await IAPService.restorePurchases();
      
      if (result.success) {
        Alert.alert(
          'Purchases Restored! 🎉',
          `Your ${result.plan?.toUpperCase()} subscription has been restored.`,
          [{ text: 'OK', onPress: () => refreshStatus() }]
        );
      } else {
        Alert.alert('No Purchases Found', result.message);
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message || 'Unable to restore purchases.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Open subscription management (Apple/Google settings)
  const handleManageSubscription = async () => {
    if (isIAPAvailable() && Platform.OS !== 'web') {
      try {
        await IAPService.openSubscriptionManagement();
      } catch (error) {
        // Fallback to manual URL
        if (Platform.OS === 'ios') {
          Linking.openURL('https://apps.apple.com/account/subscriptions');
        } else {
          Linking.openURL('https://play.google.com/store/account/subscriptions');
        }
      }
    } else {
      // Web - show contact support
      Alert.alert('Manage Subscription', 'Please contact support to manage your subscription.');
    }
  };

  const getCyclePrice = (plan: Plan, cycle: BillingCycle) => {
    return plan.pricing[cycle] || 0;
  };

  const getCycleSavings = (plan: Plan, cycle: BillingCycle) => {
    if (cycle !== 'yearly') return 0;
    const monthlyTotal = plan.pricing.monthly * 12;
    const yearlyPrice = plan.pricing.yearly;
    return Math.round((1 - yearlyPrice / monthlyTotal) * 100);
  };

  const getPlanIcon = (planId: string) => {
    if (planId === 'vip') return 'diamond';
    if (planId === 'premium') return 'star';
    return 'person';
  };

  const getPlanColor = (planId: string) => {
    if (planId === 'vip') return '#8B5CF6';
    if (planId === 'premium') return '#F59E0B';
    return '#6B7280';
  };

  const isCurrentPlan = (planId: string) => {
    return subscriptionStatus?.subscription === planId;
  };

  if (isLoading || subLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading subscription plans...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Subscription</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Current Plan Card */}
        <View style={[styles.currentPlanCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.currentPlanLabel, { color: theme.textSecondary }]}>Current Plan</Text>
          <View style={styles.currentPlanRow}>
            <SubscriptionBadge size="large" showIcon={true} />
            {subscriptionStatus?.subscription_expiry && (
              <Text style={[styles.expiryText, { color: theme.textSecondary }]}>
                Expires: {new Date(subscriptionStatus.subscription_expiry).toLocaleDateString()}
              </Text>
            )}
          </View>
          
          {/* Feature Summary */}
          <View style={styles.featureSummary}>
            <View style={styles.featureItem}>
              <Ionicons 
                name={subscriptionStatus?.features.ai_analyzer ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={subscriptionStatus?.features.ai_analyzer ? theme.success : theme.error} 
              />
              <Text style={[styles.featureText, { color: theme.textSecondary }]}>
                AI Analyzer: {subscriptionStatus?.features.ai_used}/{subscriptionStatus?.features.ai_limit === 'unlimited' ? '∞' : subscriptionStatus?.features.ai_limit}
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons 
                name={subscriptionStatus?.features.fund_management ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={subscriptionStatus?.features.fund_management ? theme.success : theme.error} 
              />
              <Text style={[styles.featureText, { color: theme.textSecondary }]}>Fund Management</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons 
                name={subscriptionStatus?.features.academy ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={subscriptionStatus?.features.academy ? theme.success : theme.error} 
              />
              <Text style={[styles.featureText, { color: theme.textSecondary }]}>Academy</Text>
            </View>
          </View>
        </View>

        {/* Billing Cycle Selector */}
        <View style={styles.cycleSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Choose Billing Cycle</Text>
          <View style={[styles.cycleSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {(['weekly', 'monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
              <TouchableOpacity
                key={cycle}
                style={[styles.cycleOption, selectedCycle === cycle && { backgroundColor: theme.primary }]}
                onPress={() => setSelectedCycle(cycle)}
              >
                <Text style={[styles.cycleText, { color: theme.textSecondary }, selectedCycle === cycle && { color: '#0A0E17' }]}>
                  {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                </Text>
                {cycle === 'yearly' && (
                  <View style={[styles.saveBadge, { backgroundColor: theme.success }]}>
                    <Text style={styles.saveBadgeText}>SAVE</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Plans */}
        <View style={styles.plansSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Available Plans</Text>
          
          {plans.map((plan) => {
            const isCurrent = isCurrentPlan(plan.id);
            const isHighlighted = highlight === plan.id;
            const price = getCyclePrice(plan, selectedCycle);
            const savings = getCycleSavings(plan, selectedCycle);
            
            return (
              <View 
                key={plan.id} 
                style={[
                  styles.planCard,
                  plan.id === 'vip' && styles.planCardVip,
                  isCurrent && styles.planCardCurrent,
                  isHighlighted && styles.planCardHighlighted
                ]}
              >
                {plan.id === 'vip' && (
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </View>
                )}
                
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>CURRENT</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <View style={[styles.planIcon, { backgroundColor: getPlanColor(plan.id) }]}>
                    <Ionicons name={getPlanIcon(plan.id)} size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={[styles.planName, plan.id === 'vip' && { color: '#FFD700' }]}>
                      {plan.name}
                    </Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.priceAmount}>${price}</Text>
                  <Text style={styles.pricePeriod}>
                    /{selectedCycle === 'yearly' ? 'year' : selectedCycle === 'monthly' ? 'month' : 'week'}
                  </Text>
                  {savings > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>Save {savings}%</Text>
                    </View>
                  )}
                </View>

                <View style={styles.featuresList}>
                  {plan.features.map((feature, i) => (
                    <View key={i} style={styles.planFeature}>
                      <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                      <Text style={styles.planFeatureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent ? (
                  <TouchableOpacity
                    style={[
                      styles.upgradeButton,
                      plan.id === 'vip' && styles.upgradeButtonVip,
                      isPurchasing && styles.upgradeButtonDisabled
                    ]}
                    onPress={() => handleUpgrade(plan.id)}
                    disabled={isPurchasing}
                  >
                    {isPurchasing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.upgradeButtonText}>Upgrade to {plan.name}</Text>
                        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.currentPlanButton}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.currentPlanButtonText}>Your Current Plan</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Security Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={20} color="#10B981" />
          <Text style={[styles.securityText, { color: theme.textSecondary }]}>
            {isIAPAvailable() && Platform.OS !== 'web'
              ? 'Secure payment through Apple App Store or Google Play. Your subscription activates immediately after purchase.'
              : 'Secure checkout. Your subscription activates only after payment confirmation.'}
          </Text>
        </View>

        {/* Restore Purchases (Mobile only) */}
        {isIAPAvailable() && Platform.OS !== 'web' && (
          <TouchableOpacity 
            style={[styles.restoreButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={handleRestorePurchases}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={20} color={theme.primary} />
                <Text style={[styles.restoreButtonText, { color: theme.primary }]}>Restore Purchases</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Manage Subscription (for existing subscribers) */}
        {subscriptionStatus?.subscription && subscriptionStatus.subscription !== 'free' && (
          <TouchableOpacity 
            style={[styles.manageButton, { borderColor: theme.border }]}
            onPress={handleManageSubscription}
          >
            <Ionicons name="settings-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.manageButtonText, { color: theme.textSecondary }]}>Manage Subscription</Text>
          </TouchableOpacity>
        )}

        {/* Legal Compliance (Apple/Google required) */}
        <View style={styles.legalSection}>
          <Text style={[styles.legalAutoRenew, { color: theme.textSecondary }]}>
            Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. Your {Platform.OS === 'ios' ? 'Apple ID' : 'Google'} account will be charged for renewal. You can manage and cancel subscriptions in your {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL('https://swiftfx.app/terms')}>
              <Text style={[styles.legalLink, { color: theme.primary }]}>Terms of Use</Text>
            </TouchableOpacity>
            <Text style={[styles.legalSeparator, { color: theme.textSecondary }]}> | </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://swiftfx.app/privacy')}>
              <Text style={[styles.legalLink, { color: theme.primary }]}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact Support */}
        <View style={[styles.supportSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.supportTitle, { color: theme.text }]}>Need Help?</Text>
          <Text style={[styles.supportText, { color: theme.textSecondary }]}>
            Contact support for special offers, or any questions about your subscription.
          </Text>
          <TouchableOpacity style={[styles.supportButton, { backgroundColor: `${theme.primary}15` }]}>
            <Ionicons name="mail-outline" size={18} color={theme.primary} />
            <Text style={[styles.supportButtonText, { color: theme.primary }]}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8A8D98',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  
  // Current Plan Card
  currentPlanCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.3)',
  },
  currentPlanLabel: {
    color: '#8A8D98',
    fontSize: 14,
    marginBottom: 12,
  },
  currentPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  expiryText: {
    color: '#F59E0B',
    fontSize: 12,
  },
  featureSummary: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 14,
  },

  // Legal Compliance
  legalSection: {
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  legalAutoRenew: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  legalSeparator: {
    fontSize: 13,
  },

  // Billing Cycle
  cycleSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  cycleSelector: {
    flexDirection: 'row',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 4,
  },
  cycleOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  cycleOptionActive: {
    backgroundColor: '#00D4AA',
  },
  cycleText: {
    color: '#8A8D98',
    fontSize: 14,
    fontWeight: '600',
  },
  cycleTextActive: {
    color: '#0A0E17',
  },
  saveBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Plans
  plansSection: {
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  planCardVip: {
    borderColor: '#8B5CF6',
    borderWidth: 2,
  },
  planCardCurrent: {
    borderColor: '#10B981',
    borderWidth: 2,
  },
  planCardHighlighted: {
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bestValueText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    left: 16,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  planDescription: {
    color: '#8A8D98',
    fontSize: 14,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  priceAmount: {
    color: '#00D4AA',
    fontSize: 32,
    fontWeight: 'bold',
  },
  pricePeriod: {
    color: '#8A8D98',
    fontSize: 16,
    marginLeft: 4,
  },
  savingsBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 12,
  },
  savingsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  featuresList: {
    marginBottom: 16,
  },
  planFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  planFeatureText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  upgradeButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  upgradeButtonVip: {
    backgroundColor: '#8B5CF6',
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentPlanButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  currentPlanButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },

  // Security Notice
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  securityText: {
    flex: 1,
    color: '#10B981',
    fontSize: 13,
    lineHeight: 18,
  },

  // Restore Purchases Button
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Manage Subscription Button
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Support
  supportSection: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  supportTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  supportText: {
    color: '#8A8D98',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  supportButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

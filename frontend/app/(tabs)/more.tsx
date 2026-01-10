import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';
import { TAB_BAR_HEIGHT } from './_layout';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  features: string[];
  pricing: {
    weekly: number;
    monthly: number;
    yearly: number;
  };
  ai_limit_note?: string;
}

type BillingCycle = 'weekly' | 'monthly' | 'yearly';

export default function MoreScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [isUpgrading, setIsUpgrading] = useState(false);
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/subscription/plans');
      setPlans(response.data.plans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: confirmLogout,
          },
        ]
      );
    }
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    router.replace('/(auth)/login');
  };

  const handleUpgrade = async () => {
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a plan');
      return;
    }

    setIsUpgrading(true);
    try {
      await api.post('/subscription/upgrade', {
        plan: selectedPlan,
        billing_cycle: selectedCycle,
      });
      
      await refreshUser();
      setShowSubscriptionModal(false);
      Alert.alert('Success', `You have been upgraded to ${selectedPlan.toUpperCase()}!`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to upgrade subscription');
    } finally {
      setIsUpgrading(false);
    }
  };

  const menuItems = [
    {
      section: 'Trading',
      items: [
        { icon: 'school-outline', label: 'Academy', badge: 'VIP', locked: user?.role !== 'vip' },
        { icon: 'briefcase-outline', label: 'Fund Management', badge: 'VIP', locked: user?.role !== 'vip' },
        { icon: 'business-outline', label: 'Recommended Brokers', badge: null, locked: false },
        { icon: 'calendar-outline', label: 'Economic Calendar', badge: null, locked: false },
        { icon: 'newspaper-outline', label: 'News', badge: null, locked: false },
      ],
    },
    {
      section: 'Account',
      items: [
        { icon: 'card-outline', label: 'Subscription', badge: user?.role?.toUpperCase(), locked: false, action: () => setShowSubscriptionModal(true) },
        { icon: 'gift-outline', label: 'Referral Program', badge: null, locked: false },
        { icon: 'help-circle-outline', label: 'Help & Support', badge: null, locked: false },
        { icon: 'settings-outline', label: 'Settings', badge: null, locked: false },
      ],
    },
  ];

  const getCyclePrice = (plan: SubscriptionPlan, cycle: BillingCycle) => {
    return plan.pricing[cycle];
  };

  const getCycleSavings = (plan: SubscriptionPlan, cycle: BillingCycle) => {
    if (cycle === 'yearly') {
      const monthlyTotal = plan.pricing.monthly * 12;
      const savings = monthlyTotal - plan.pricing.yearly;
      return Math.round((savings / monthlyTotal) * 100);
    }
    return 0;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={[
              styles.roleBadge,
              user?.role === 'vip' && styles.vipBadge,
              user?.role === 'premium' && styles.premiumBadge
            ]}>
              <Text style={styles.roleText}>{user?.role?.toUpperCase() || 'FREE'}</Text>
            </View>
          </View>
        </View>

        {/* Notification Toggle */}
        <View style={styles.notificationCard}>
          <View style={styles.notificationLeft}>
            <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
            <Text style={styles.notificationText}>Push Notifications</Text>
          </View>
          <Switch
            value={notificationEnabled}
            onValueChange={setNotificationEnabled}
            trackColor={{ false: '#2A2F3E', true: '#00D4AA' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Menu Sections */}
        {menuItems.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{section.section}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex < section.items.length - 1 && styles.menuItemBorder
                  ]}
                  onPress={item.action}
                  disabled={item.locked}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={[styles.menuIconContainer, item.locked && styles.menuIconLocked]}>
                      <Ionicons name={item.icon as any} size={20} color={item.locked ? '#8A8D98' : '#00D4AA'} />
                    </View>
                    <Text style={[styles.menuItemText, item.locked && styles.menuItemTextLocked]}>
                      {item.label}
                    </Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.badge && (
                      <View style={[
                        styles.menuBadge,
                        item.badge === 'VIP' && styles.vipMenuBadge,
                        item.badge === 'PREMIUM' && styles.premiumMenuBadge
                      ]}>
                        <Text style={styles.menuBadgeText}>{item.badge}</Text>
                      </View>
                    )}
                    {item.locked ? (
                      <Ionicons name="lock-closed" size={16} color="#8A8D98" />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color="#8A8D98" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF4757" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Swift FX Signals v1.0.0</Text>
      </ScrollView>

      {/* Subscription Modal */}
      <Modal
        visible={showSubscriptionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSubscriptionModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upgrade Your Plan</Text>
              <TouchableOpacity onPress={() => setShowSubscriptionModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Billing Cycle Selector */}
            <View style={styles.cycleSelector}>
              {(['weekly', 'monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
                <TouchableOpacity
                  key={cycle}
                  style={[styles.cycleOption, selectedCycle === cycle && styles.cycleOptionActive]}
                  onPress={() => setSelectedCycle(cycle)}
                >
                  <Text style={[styles.cycleText, selectedCycle === cycle && styles.cycleTextActive]}>
                    {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.plansContainer} showsVerticalScrollIndicator={false}>
              {plans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    selectedPlan === plan.id && styles.planCardSelected,
                    plan.id === 'vip' && styles.planCardVip
                  ]}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  {plan.id === 'vip' && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularBadgeText}>BEST VALUE</Text>
                    </View>
                  )}
                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, plan.id === 'vip' && { color: '#FFD700' }]}>
                      {plan.name}
                    </Text>
                    <View style={styles.priceContainer}>
                      <Text style={styles.priceAmount}>${getCyclePrice(plan, selectedCycle)}</Text>
                      <Text style={styles.pricePeriod}>/{selectedCycle === 'yearly' ? 'year' : selectedCycle === 'monthly' ? 'month' : 'week'}</Text>
                    </View>
                    {selectedCycle === 'yearly' && getCycleSavings(plan, selectedCycle) > 0 && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>Save {getCycleSavings(plan, selectedCycle)}%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                  <View style={styles.featuresList}>
                    {plan.features.map((feature, i) => (
                      <View key={i} style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                  {plan.ai_limit_note && (
                    <Text style={styles.aiLimitNote}>{plan.ai_limit_note}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.upgradeButton, (!selectedPlan || isUpgrading) && styles.upgradeButtonDisabled]}
              onPress={handleUpgrade}
              disabled={!selectedPlan || isUpgrading}
            >
              {isUpgrading ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <Text style={styles.upgradeButtonText}>
                  {selectedPlan ? `Upgrade to ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}` : 'Select a Plan'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.mockPaymentNote}>
              This is a mock payment for demo purposes
            </Text>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.logoutModalContainer}>
          <View style={styles.logoutModalContent}>
            <Ionicons name="log-out-outline" size={48} color="#FF4757" style={{ marginBottom: 16 }} />
            <Text style={styles.logoutModalTitle}>Logout</Text>
            <Text style={styles.logoutModalText}>Are you sure you want to logout?</Text>
            <View style={styles.logoutModalButtons}>
              <TouchableOpacity 
                style={styles.logoutCancelButton} 
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.logoutCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.logoutConfirmButton} 
                onPress={confirmLogout}
              >
                <Text style={styles.logoutConfirmButtonText}>Logout</Text>
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
    backgroundColor: '#0A0E17',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileEmail: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  premiumBadge: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
  },
  vipBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  roleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  notificationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
  },
  menuSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#8A8D98',
    marginBottom: 12,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuIconLocked: {
    backgroundColor: 'rgba(138, 141, 152, 0.1)',
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  menuItemTextLocked: {
    color: '#8A8D98',
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBadge: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  vipMenuBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  premiumMenuBadge: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    marginBottom: 20,
  },
  logoutText: {
    fontSize: 16,
    color: '#FF4757',
    fontWeight: '600',
    marginLeft: 8,
  },
  versionText: {
    fontSize: 12,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1F2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cycleSelector: {
    flexDirection: 'row',
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  cycleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  cycleOptionActive: {
    backgroundColor: '#00D4AA',
  },
  cycleText: {
    fontSize: 14,
    color: '#8A8D98',
  },
  cycleTextActive: {
    color: '#0A0E17',
    fontWeight: 'bold',
  },
  plansContainer: {
    maxHeight: 400,
  },
  planCard: {
    backgroundColor: '#0A0E17',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#2A2F3E',
  },
  planCardSelected: {
    borderColor: '#00D4AA',
  },
  planCardVip: {
    borderColor: '#FFD700',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  planHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00D4AA',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  pricePeriod: {
    fontSize: 14,
    color: '#8A8D98',
    marginLeft: 4,
  },
  savingsBadge: {
    backgroundColor: 'rgba(0, 212, 170, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  savingsText: {
    fontSize: 12,
    color: '#00D4AA',
    fontWeight: 'bold',
  },
  planDescription: {
    fontSize: 14,
    color: '#8A8D98',
    marginBottom: 16,
  },
  featuresList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 8,
  },
  aiLimitNote: {
    fontSize: 11,
    color: '#8A8D98',
    fontStyle: 'italic',
    marginTop: 12,
  },
  upgradeButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  upgradeButtonDisabled: {
    opacity: 0.5,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  mockPaymentNote: {
    fontSize: 12,
    color: '#8A8D98',
    textAlign: 'center',
    marginTop: 12,
  },
  logoutModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutModalContent: {
    backgroundColor: '#1A1F2E',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 32,
    minWidth: 280,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  logoutModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  logoutModalText: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 24,
  },
  logoutModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  logoutCancelButton: {
    flex: 1,
    backgroundColor: '#2A2F3E',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutConfirmButton: {
    flex: 1,
    backgroundColor: '#FF4757',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

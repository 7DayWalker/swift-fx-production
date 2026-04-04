import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme, ThemeType } from '../../src/context/ThemeContext';
import { SubscriptionBadge, SubscriptionCard } from '../../src/components/SubscriptionBadge';
import { AdBanner, AD_BANNER_HEIGHT } from '../../src/components/ads';
import { TAB_BAR_HEIGHT } from './_layout';
import PressableScale from '../../src/components/ui/PressableScale';

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const { theme, themeType, setThemeType, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [isApprovedInvestor, setIsApprovedInvestor] = useState(false);
  
  // Investor status — not yet available in Supabase (needs table migration)
  // Defaults to false until fund-related tables are created
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8 + AD_BANNER_HEIGHT;

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    surface: { backgroundColor: theme.surface },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    border: { borderColor: theme.border },
    card: { backgroundColor: theme.cardBackground },
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
  };

  const menuItems = [
    {
      section: 'Trading',
      items: [
        { icon: 'school-outline', label: 'Academy', badge: null, locked: false, action: () => router.push('/academy') },
        // Conditionally show Investor Dashboard or Fund Management based on approval status
        isApprovedInvestor 
          ? { icon: 'stats-chart-outline', label: 'Investor Dashboard', badge: 'INVESTOR', locked: false, action: () => router.push('/investor-dashboard') }
          : { icon: 'briefcase-outline', label: 'Fund Management', badge: 'VIP', locked: false, action: () => router.push('/fund-management') },
        { icon: 'business-outline', label: 'Recommended Brokers', badge: null, locked: false, action: () => router.push('/brokers') },
        { icon: 'calendar-outline', label: 'Economic Calendar', badge: null, locked: false, action: () => router.push('/calendar') },
        { icon: 'newspaper-outline', label: 'News', badge: null, locked: false, action: () => router.push('/news') },
      ],
    },
    {
      section: 'Account',
      items: [
        { icon: 'card-outline', label: 'Subscription', badge: user?.role?.toUpperCase(), locked: false, action: () => router.push('/subscription') },
        { icon: 'gift-outline', label: 'Referral Program', badge: null, locked: false, action: () => router.push('/referrals') },
        { icon: 'help-circle-outline', label: 'Help & Support', badge: null, locked: false, action: () => router.push('/help-support') },
        { icon: 'settings-outline', label: 'Settings', badge: null, locked: false, action: () => router.push('/settings') },
      ],
    },
  ];

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={[styles.profileHeader, dynamicStyles.card]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={[styles.profileName, dynamicStyles.text]}>{user?.name || 'User'}</Text>
              <SubscriptionBadge size="small" showIcon={true} />
            </View>
            <Text style={[styles.profileEmail, dynamicStyles.textSecondary]}>{user?.email}</Text>
          </View>
        </View>

        {/* Subscription Status Card - Routes to /subscription */}
        <SubscriptionCard onUpgradePress={() => router.push('/subscription')} />

        {/* Notification Toggle */}
        <View style={[styles.notificationCard, dynamicStyles.card]}>
          <View style={styles.notificationLeft}>
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
            <Text style={[styles.notificationText, dynamicStyles.text]}>Push Notifications</Text>
          </View>
          <Switch
            value={notificationEnabled}
            onValueChange={setNotificationEnabled}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Theme Toggle */}
        <TouchableOpacity 
          style={[styles.notificationCard, dynamicStyles.card]} 
          onPress={() => setShowThemeModal(true)}
        >
          <View style={styles.notificationLeft}>
            <Ionicons 
              name={isDark ? "moon-outline" : "sunny-outline"} 
              size={24} 
              color={theme.text} 
            />
            <Text style={[styles.notificationText, dynamicStyles.text]}>Theme</Text>
          </View>
          <View style={styles.themeValueContainer}>
            <Text style={[styles.themeValueText, { color: theme.textSecondary }]}>
              {themeType === 'system' ? 'System' : themeType === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Menu Sections */}
        {menuItems.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{section.section}</Text>
            <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex < section.items.length - 1 && [styles.menuItemBorder, { borderBottomColor: theme.border }]
                  ]}
                  onPress={item.action}
                  disabled={item.locked}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={[styles.menuIconContainer, { backgroundColor: `${theme.primary}15` }, item.locked && { backgroundColor: `${theme.textSecondary}15` }]}>
                      <Ionicons name={item.icon as any} size={20} color={item.locked ? theme.textSecondary : theme.primary} />
                    </View>
                    <Text style={[styles.menuItemText, { color: theme.text }, item.locked && { color: theme.textSecondary }]}>
                      {item.label}
                    </Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.badge && (
                      <View style={[
                        styles.menuBadge,
                        item.badge === 'VIP' && { backgroundColor: `${theme.warning}20` },
                        item.badge === 'PREMIUM' && { backgroundColor: `${theme.primary}20` }
                      ]}>
                        <Text style={[styles.menuBadgeText, { color: item.badge === 'VIP' ? theme.warning : theme.primary }]}>{item.badge}</Text>
                      </View>
                    )}
                    {item.locked ? (
                      <Ionicons name="lock-closed" size={16} color={theme.textSecondary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: `${theme.error}10` }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Logout</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: theme.textMuted }]}>Swift FX Signals v1.0.4</Text>
      </ScrollView>

      {/* Fixed bottom ad banner — free users only */}
      <AdBanner />

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.logoutModalContainer}>
          <View style={[styles.logoutModalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="log-out-outline" size={48} color={theme.error} style={{ marginBottom: 16 }} />
            <Text style={[styles.logoutModalTitle, { color: theme.text }]}>Logout</Text>
            <Text style={[styles.logoutModalText, { color: theme.textSecondary }]}>Are you sure you want to logout?</Text>
            <View style={styles.logoutModalButtons}>
              <TouchableOpacity 
                style={[styles.logoutCancelButton, { backgroundColor: theme.surfaceSecondary }]} 
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.logoutCancelButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.logoutConfirmButton, { backgroundColor: theme.error }]} 
                onPress={confirmLogout}
              >
                <Text style={styles.logoutConfirmButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Theme Selection Modal */}
      <Modal
        visible={showThemeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowThemeModal(false)}
      >
        <View style={styles.logoutModalContainer}>
          <View style={[styles.themeModalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.themeModalHeader}>
              <Text style={[styles.themeModalTitle, { color: theme.text }]}>Choose Theme</Text>
              <TouchableOpacity onPress={() => setShowThemeModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            {(['light', 'dark', 'system'] as ThemeType[]).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.themeOption,
                  { borderColor: theme.border },
                  themeType === option && { borderColor: theme.primary, backgroundColor: `${theme.primary}15` }
                ]}
                onPress={() => {
                  setThemeType(option);
                  setShowThemeModal(false);
                }}
              >
                <View style={styles.themeOptionLeft}>
                  <Ionicons 
                    name={option === 'light' ? 'sunny-outline' : option === 'dark' ? 'moon-outline' : 'phone-portrait-outline'} 
                    size={24} 
                    color={themeType === option ? theme.primary : theme.text} 
                  />
                  <Text style={[
                    styles.themeOptionText, 
                    { color: themeType === option ? theme.primary : theme.text }
                  ]}>
                    {option === 'system' ? 'System Default' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </View>
                {themeType === option && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
            
            <Text style={[styles.themeNote, { color: theme.textSecondary }]}>
              {themeType === 'system' 
                ? 'Theme will automatically match your device settings' 
                : `${themeType.charAt(0).toUpperCase() + themeType.slice(1)} theme is always applied`}
            </Text>
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
    borderRadius: 20,
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
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
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
    borderRadius: 20,
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
    backgroundColor: 'rgba(255, 71, 87, 0.08)',
    borderRadius: 18,
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
  // Read-only subscription modal styles
  currentPlanContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  currentPlanLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 8,
  },
  planCardReadOnly: {
    opacity: 0.85,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  // Plan upgrade button styles
  planUpgradeButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  planUpgradeButtonVip: {
    backgroundColor: '#8B5CF6',
  },
  planUpgradeButtonDisabled: {
    opacity: 0.5,
  },
  planUpgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Security notice
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  securityNoticeText: {
    fontSize: 12,
    color: '#10B981',
  },
  upgradeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  upgradeNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#3B82F6',
    lineHeight: 18,
  },
  closeModalButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
  // Theme toggle styles
  themeValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  themeValueText: {
    fontSize: 14,
  },
  themeModalContent: {
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  themeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  themeModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  themeNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});

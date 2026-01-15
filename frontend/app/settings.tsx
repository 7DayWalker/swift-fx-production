/**
 * Settings Screen
 * Complete user settings with profile, security, notifications, privacy & account controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';
import api from '../src/services/api';

// Types
interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  subscription: string;
  subscription_expiry?: string;
  admin_role?: string;
  is_admin: boolean;
  account_status: string;
  created_at?: string;
  last_login?: string;
}

interface NotificationPreferences {
  push_enabled: boolean;
  email_enabled: boolean;
  signals: boolean;
  fund_updates: boolean;
  referral_rewards: boolean;
  support_replies: boolean;
}

interface LegalDocument {
  title: string;
  last_updated: string;
  content: string;
}

// Theme colors (consistent Swift FX dark theme)
const COLORS = {
  background: '#0A0E17',
  surface: '#1A1F2E',
  border: '#2A2F3E',
  primary: '#00D4AA',
  text: '#FFFFFF',
  textSecondary: '#8A8D98',
  danger: '#EF4444',
  warning: '#F59E0B',
};

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal states
  const [showEditName, setShowEditName] = useState(false);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLegalDocument, setShowLegalDocument] = useState<string | null>(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // Form states
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  
  // Legal document content
  const [legalContent, setLegalContent] = useState<LegalDocument | null>(null);
  const [loadingLegal, setLoadingLegal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch profile
      const profileRes = await api.get('/settings/profile');
      setProfile(profileRes.data);
      setEditName(profileRes.data.name || '');
      setEditPhone(profileRes.data.phone || '');
      
      // Fetch notification preferences
      const notifRes = await api.get('/settings/notifications');
      setNotifications(notifRes.data.preferences);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpdateName = async () => {
    if (!editName.trim() || editName.trim().length < 2) {
      Alert.alert('Error', 'Name must be at least 2 characters');
      return;
    }
    
    try {
      setSaving(true);
      await api.put('/settings/profile', { name: editName.trim() });
      setProfile(prev => prev ? { ...prev, name: editName.trim() } : null);
      setShowEditName(false);
      Alert.alert('Success', 'Name updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePhone = async () => {
    try {
      setSaving(true);
      await api.put('/settings/profile', { phone: editPhone.trim() });
      setProfile(prev => prev ? { ...prev, phone: editPhone.trim() } : null);
      setShowEditPhone(false);
      Alert.alert('Success', 'Phone number updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update phone');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    
    try {
      setSaving(true);
      await api.put('/settings/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Success', 'Password changed successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!notifications) return;
    
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);
    
    try {
      await api.put('/settings/notifications', { [key]: value });
    } catch (error) {
      // Revert on error
      setNotifications(notifications);
      Alert.alert('Error', 'Failed to update notification setting');
    }
  };

  const handleViewLegal = async (docType: string) => {
    try {
      setLoadingLegal(true);
      setShowLegalDocument(docType);
      const res = await api.get(`/settings/legal/${docType}`);
      setLegalContent(res.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load document');
      setShowLegalDocument(null);
    } finally {
      setLoadingLegal(false);
    }
  };

  const handleClearAppData = async () => {
    Alert.alert(
      'Clear App Data',
      'This will clear all locally cached data. You will remain logged in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear non-auth storage
              const keys = await AsyncStorage.getAllKeys();
              const nonAuthKeys = keys.filter(k => !k.includes('token') && !k.includes('user'));
              await AsyncStorage.multiRemove(nonAuthKeys);
              Alert.alert('Success', 'App data cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear app data');
            }
          },
        },
      ]
    );
  };

  const handleDeactivateAccount = async () => {
    try {
      setSaving(true);
      await api.post('/settings/deactivate', { reason: 'User requested deactivation' });
      setShowDeactivateConfirm(false);
      Alert.alert(
        'Account Deactivated',
        'Your account has been deactivated. Contact support to reactivate.',
        [{ text: 'OK', onPress: () => logout() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to deactivate account');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = async () => {
    try {
      setSaving(true);
      const res = await api.post('/settings/delete-request');
      setShowDeleteConfirm(false);
      Alert.alert(
        'Deletion Request Submitted',
        `Your request has been submitted (Ticket: ${res.data.ticket_id}). Our team will process it within 30 days.`
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit deletion request');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: confirmLogout },
      ]
    );
  };

  const confirmLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderSettingItem = (
    icon: string,
    label: string,
    value?: string,
    onPress?: () => void,
    showArrow = true,
    valueColor?: string
  ) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingLeft}>
        <View style={styles.settingIconBox}>
          <Ionicons name={icon as any} size={20} color={COLORS.primary} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <View style={styles.settingRight}>
        {value && (
          <Text style={[styles.settingValue, valueColor && { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
        )}
        {showArrow && onPress && (
          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  const renderToggleItem = (
    icon: string,
    label: string,
    description: string,
    value: boolean,
    onToggle: (value: boolean) => void
  ) => (
    <View style={styles.toggleItem}>
      <View style={styles.toggleLeft}>
        <View style={styles.settingIconBox}>
          <Ionicons name={icon as any} size={20} color={COLORS.primary} />
        </View>
        <View style={styles.toggleTextContainer}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.toggleDescription}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          {renderSettingItem('person-outline', 'Name', profile?.name, () => setShowEditName(true))}
          {renderSettingItem('mail-outline', 'Email', profile?.email, undefined, false)}
          {renderSettingItem('call-outline', 'Phone', profile?.phone || 'Not set', () => setShowEditPhone(true))}
          {renderSettingItem(
            'shield-checkmark-outline',
            'Role',
            profile?.is_admin ? `Admin (${profile.admin_role?.replace('_', ' ')})` : profile?.role?.toUpperCase(),
            undefined,
            false,
            COLORS.primary
          )}
          {renderSettingItem(
            'card-outline',
            'Subscription',
            profile?.subscription?.toUpperCase(),
            undefined,
            false,
            profile?.subscription === 'vip' ? '#FFD700' : profile?.subscription === 'premium' ? COLORS.primary : undefined
          )}
        </View>

        {/* Security Section */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          {renderSettingItem('lock-closed-outline', 'Change Password', undefined, () => setShowChangePassword(true))}
          {renderSettingItem('time-outline', 'Last Login', formatDate(profile?.last_login), undefined, false)}
          {renderSettingItem('calendar-outline', 'Member Since', formatDate(profile?.created_at), undefined, false)}
        </View>

        {/* Notification Preferences */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          {notifications && (
            <>
              {renderToggleItem(
                'notifications-outline',
                'Push Notifications',
                'Receive push notifications on your device',
                notifications.push_enabled,
                (v) => handleNotificationToggle('push_enabled', v)
              )}
              {renderToggleItem(
                'mail-outline',
                'Email Notifications',
                'Receive updates via email',
                notifications.email_enabled,
                (v) => handleNotificationToggle('email_enabled', v)
              )}
            </>
          )}
        </View>

        {/* Granular Notification Toggles */}
        {notifications && (
          <View style={styles.card}>
            <Text style={styles.subSectionTitle}>Notification Types</Text>
            {renderToggleItem(
              'trending-up-outline',
              'Trading Signals',
              'New signal alerts and updates',
              notifications.signals,
              (v) => handleNotificationToggle('signals', v)
            )}
            {renderToggleItem(
              'briefcase-outline',
              'Fund Updates',
              'Portfolio and investment updates',
              notifications.fund_updates,
              (v) => handleNotificationToggle('fund_updates', v)
            )}
            {renderToggleItem(
              'gift-outline',
              'Referral Rewards',
              'When you earn referral rewards',
              notifications.referral_rewards,
              (v) => handleNotificationToggle('referral_rewards', v)
            )}
            {renderToggleItem(
              'chatbubble-outline',
              'Support Replies',
              'When support responds to tickets',
              notifications.support_replies,
              (v) => handleNotificationToggle('support_replies', v)
            )}
          </View>
        )}

        {/* Privacy & Legal */}
        <Text style={styles.sectionTitle}>Privacy & Legal</Text>
        <View style={styles.card}>
          {renderSettingItem('document-text-outline', 'Privacy Policy', undefined, () => handleViewLegal('privacy_policy'))}
          {renderSettingItem('document-outline', 'Terms of Service', undefined, () => handleViewLegal('terms_of_service'))}
          {renderSettingItem('warning-outline', 'Risk Disclaimer', undefined, () => handleViewLegal('risk_disclaimer'))}
        </View>

        {/* Account Controls */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {renderSettingItem('trash-outline', 'Clear App Data', 'Free up storage', handleClearAppData)}
          {renderSettingItem('log-out-outline', 'Logout', undefined, handleLogout)}
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>Danger Zone</Text>
        <View style={[styles.card, { borderColor: `${COLORS.danger}30` }]}>
          <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeactivateConfirm(true)}>
            <View style={[styles.settingIconBox, { backgroundColor: `${COLORS.warning}15` }]}>
              <Ionicons name="pause-circle-outline" size={20} color={COLORS.warning} />
            </View>
            <View style={styles.dangerTextContainer}>
              <Text style={[styles.settingLabel, { color: COLORS.warning }]}>Deactivate Account</Text>
              <Text style={styles.dangerDescription}>Temporarily disable your account</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeleteConfirm(true)}>
            <View style={[styles.settingIconBox, { backgroundColor: `${COLORS.danger}15` }]}>
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </View>
            <View style={styles.dangerTextContainer}>
              <Text style={[styles.settingLabel, { color: COLORS.danger }]}>Delete Account</Text>
              <Text style={styles.dangerDescription}>Permanently delete your account and data</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          {renderSettingItem('information-circle-outline', 'App Version', '1.0.0', undefined, false)}
          {renderSettingItem('code-slash-outline', 'Build', '2025.01', undefined, false)}
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal visible={showEditName} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Your name"
              placeholderTextColor={COLORS.textSecondary}
              value={editName}
              onChangeText={setEditName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setShowEditName(false)}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleUpdateName} disabled={saving}>
                {saving ? <ActivityIndicator color="#0A0E17" size="small" /> : <Text style={styles.modalButtonPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Phone Modal */}
      <Modal visible={showEditPhone} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Phone Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Phone number"
              placeholderTextColor={COLORS.textSecondary}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setShowEditPhone(false)}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleUpdatePhone} disabled={saving}>
                {saving ? <ActivityIndicator color="#0A0E17" size="small" /> : <Text style={styles.modalButtonPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Current Password"
                placeholderTextColor={COLORS.textSecondary}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showPasswords}
              />
            </View>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="New Password"
                placeholderTextColor={COLORS.textSecondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPasswords}
              />
            </View>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm New Password"
                placeholderTextColor={COLORS.textSecondary}
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                secureTextEntry={!showPasswords}
              />
              <TouchableOpacity onPress={() => setShowPasswords(!showPasswords)} style={styles.showPasswordButton}>
                <Ionicons name={showPasswords ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => {
                setShowChangePassword(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
              }}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleChangePassword} disabled={saving}>
                {saving ? <ActivityIndicator color="#0A0E17" size="small" /> : <Text style={styles.modalButtonPrimaryText}>Change</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Legal Document Modal */}
      <Modal visible={!!showLegalDocument} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.legalModalContainer}>
          <View style={styles.legalHeader}>
            <TouchableOpacity onPress={() => {
              setShowLegalDocument(null);
              setLegalContent(null);
            }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.legalTitle}>{legalContent?.title || 'Loading...'}</Text>
            <View style={{ width: 24 }} />
          </View>
          {loadingLegal ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView style={styles.legalContent} showsVerticalScrollIndicator={false}>
              {legalContent?.last_updated && (
                <Text style={styles.legalDate}>Last updated: {legalContent.last_updated}</Text>
              )}
              <Text style={styles.legalText}>{legalContent?.content}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal visible={showDeactivateConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmIconBox, { backgroundColor: `${COLORS.warning}15` }]}>
              <Ionicons name="pause-circle" size={48} color={COLORS.warning} />
            </View>
            <Text style={styles.confirmTitle}>Deactivate Account?</Text>
            <Text style={styles.confirmDescription}>
              Your account will be temporarily disabled. You can contact support to reactivate it later.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmButtonCancel} onPress={() => setShowDeactivateConfirm(false)}>
                <Text style={styles.confirmButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButtonAction, { backgroundColor: COLORS.warning }]}
                onPress={handleDeactivateAccount}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmButtonActionText}>Deactivate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmIconBox, { backgroundColor: `${COLORS.danger}15` }]}>
              <Ionicons name="trash" size={48} color={COLORS.danger} />
            </View>
            <Text style={styles.confirmTitle}>Delete Account?</Text>
            <Text style={styles.confirmDescription}>
              This will submit a deletion request. Our team will process it within 30 days. This action cannot be undone.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmButtonCancel} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.confirmButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButtonAction, { backgroundColor: COLORS.danger }]}
                onPress={handleDeleteRequest}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmButtonActionText}>Request Deletion</Text>}
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
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
    marginTop: 16,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '50%',
  },
  settingValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dangerTextContainer: {
    flex: 1,
  },
  dangerDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonSecondary: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalButtonSecondaryText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonPrimary: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalButtonPrimaryText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '600',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  showPasswordButton: {
    padding: 14,
  },
  // Legal Modal
  legalModalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  legalContent: {
    flex: 1,
    padding: 20,
  },
  legalDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  legalText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 24,
  },
  // Confirm Modal
  confirmModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  confirmIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  confirmDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmButtonCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  confirmButtonCancelText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButtonAction: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

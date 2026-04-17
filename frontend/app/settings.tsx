/**
 * Settings Screen
 * Complete user settings with profile, security, notifications, theme, privacy & account controls
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
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';
import { useTheme, ThemeType } from '../src/context/ThemeContext';
import { supabase } from '../src/services/supabase';
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


export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { theme, themeType, setThemeType, isDark } = useTheme();
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
  const [showLegalDocument, setShowLegalDocument] = useState<string | null>(null); // kept for modal compat
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  
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
      if (!user) return;
      
      // Fetch profile from Supabase
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.user_id)
        .single();
      
      if (profile && !error) {
        setProfile({
          user_id: profile.id,
          name: profile.name || user.email,
          email: user.email,
          role: profile.role,
          subscription: profile.role === 'admin' ? 'vip' : profile.role,
          admin_role: profile.admin_role,
          is_admin: profile.role === 'admin',
          account_status: 'active',
          created_at: profile.created_at,
        });
        setEditName(profile.name || '');
      }
      
      // Fetch notification preferences from backend (source of truth)
      try {
        const notifRes = await api.get('/settings/notifications');
        if (notifRes.data?.preferences) {
          setNotifications(notifRes.data.preferences);
          // Cache locally as fallback
          await AsyncStorage.setItem('notification_prefs', JSON.stringify(notifRes.data.preferences));
        }
      } catch (notifErr) {
        // Fallback to local cache if backend unreachable
        const storedNotifs = await AsyncStorage.getItem('notification_prefs');
        if (storedNotifs) {
          setNotifications(JSON.parse(storedNotifs));
        } else {
          setNotifications({
            push_enabled: true, email_enabled: true, signals: true,
            fund_updates: true, referral_rewards: true, support_replies: true,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleUpdateName = async () => {
    if (!editName.trim() || editName.trim().length < 2) {
      Alert.alert('Error', 'Name must be at least 2 characters');
      return;
    }
    
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ name: editName.trim() })
        .eq('id', user?.user_id);
      if (error) throw error;
      setProfile(prev => prev ? { ...prev, name: editName.trim() } : null);
      setShowEditName(false);
      Alert.alert('Success', 'Name updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePhone = async () => {
    try {
      setSaving(true);
      // Phone field not in profiles table yet — store locally
      setProfile(prev => prev ? { ...prev, phone: editPhone.trim() } : null);
      setShowEditPhone(false);
      Alert.alert('Success', 'Phone number updated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update phone');
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Success', 'Password changed successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!notifications) return;
    
    const updated = { ...notifications, [key]: value };
    setNotifications(updated);
    
    try {
      // Persist to backend (Supabase profiles.notification_preferences)
      await api.put('/settings/notifications', updated);
      // Update local cache
      await AsyncStorage.setItem('notification_prefs', JSON.stringify(updated));
    } catch (error) {
      // Revert on error
      setNotifications(notifications);
      Alert.alert('Error', 'Failed to update notification setting');
    }
  };

  const handleThemeChange = (newTheme: ThemeType) => {
    setThemeType(newTheme);
    setShowThemeModal(false);
  };

  const getThemeLabel = (type: ThemeType) => {
    switch (type) {
      case 'dark': return 'Dark';
      case 'light': return 'Light';
      case 'system': return 'System';
    }
  };

  const getThemeIcon = (type: ThemeType) => {
    switch (type) {
      case 'dark': return 'moon';
      case 'light': return 'sunny';
      case 'system': return 'phone-portrait-outline';
    }
  };

  const openLegalUrl = (url: string) => {
    Linking.openURL(url);
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
      // Sign out and inform user (actual deactivation needs admin action)
      setShowDeactivateConfirm(false);
      Alert.alert(
        'Account Deactivation',
        'Please contact support@swiftfx.online to deactivate your account.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to deactivate account');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = async () => {
    try {
      setSaving(true);
      setShowDeleteConfirm(false);
      Alert.alert(
        'Deletion Request',
        'Please contact support@swiftfx.online to request account deletion. We will process your request within 30 days.'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit deletion request');
    } finally {
      setSaving(false);
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
          { text: 'Logout', style: 'destructive', onPress: confirmLogout },
        ]
      );
    }
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
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

  // Dynamic styles based on theme
  const styles = createStyles(theme);

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
          <Ionicons name={icon as any} size={20} color={theme.primary} />
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
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
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
          <Ionicons name={icon as any} size={20} color={theme.primary} />
        </View>
        <View style={styles.toggleTextContainer}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.toggleDescription}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
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
          <Ionicons name="arrow-back" size={24} color={theme.text} />
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
            theme.primary
          )}
          {renderSettingItem(
            'card-outline',
            'Subscription',
            profile?.subscription?.toUpperCase(),
            undefined,
            false,
            profile?.subscription === 'vip' ? '#FFD700' : profile?.subscription === 'premium' ? theme.primary : undefined
          )}
        </View>

        {/* Security Section */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          {renderSettingItem('lock-closed-outline', 'Change Password', undefined, () => setShowChangePassword(true))}
          {renderSettingItem('time-outline', 'Last Login', formatDate(profile?.last_login), undefined, false)}
          {renderSettingItem('calendar-outline', 'Member Since', formatDate(profile?.created_at), undefined, false)}
        </View>

        {/* Appearance Section */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowThemeModal(true)}>
            <View style={styles.settingLeft}>
              <View style={styles.settingIconBox}>
                <Ionicons name={getThemeIcon(themeType) as any} size={20} color={theme.primary} />
              </View>
              <Text style={styles.settingLabel}>Theme</Text>
            </View>
            <View style={styles.settingRight}>
              <View style={styles.themePreview}>
                <Ionicons 
                  name={isDark ? 'moon' : 'sunny'} 
                  size={16} 
                  color={isDark ? '#FFD700' : '#F59E0B'} 
                />
                <Text style={styles.settingValue}>{getThemeLabel(themeType)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
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

        {/* Test Notification */}
        <View style={styles.card}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}
            onPress={async () => {
              try {
                const res = await api.post('/notifications/test');
                const data = res.data;
                if (data.status === 'no_tokens') {
                  Alert.alert('No Token', data.message);
                } else {
                  const results = data.results?.map((r: any) =>
                    `${r.platform}: ${r.expo_status || r.status}${r.error ? ` (${r.error})` : ''}`
                  ).join('\n') || 'No details';
                  Alert.alert('Test Sent', `Tokens: ${data.tokens_found}\n\n${results}\n\nCheck your device for the notification.`);
                }
              } catch (error: any) {
                Alert.alert('Error', error.response?.data?.detail || 'Failed to send test notification');
              }
            }}
            data-testid="send-test-notification-btn"
          >
            <Ionicons name="paper-plane-outline" size={20} color={theme.primary} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>Send Test Notification</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>Verify push delivery to your device</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Privacy & Legal */}
        <Text style={styles.sectionTitle}>Privacy & Legal</Text>
        <View style={styles.card}>
          {renderSettingItem('document-text-outline', 'Privacy Policy', undefined, () => openLegalUrl('https://swiftfx.online/privacy-policy'))}
          {renderSettingItem('document-outline', 'Terms of Service', undefined, () => openLegalUrl('https://swiftfx.online/terms'))}
          {renderSettingItem('warning-outline', 'Risk Disclaimer', undefined, () => openLegalUrl('https://swiftfx.online/risk-disclaimer'))}
        </View>

        {/* Account Controls */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {renderSettingItem('trash-outline', 'Clear App Data', 'Free up storage', handleClearAppData)}
          {renderSettingItem('log-out-outline', 'Logout', undefined, handleLogout)}
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: theme.error }]}>Danger Zone</Text>
        <View style={[styles.card, { borderColor: `${theme.error}30` }]}>
          <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeactivateConfirm(true)}>
            <View style={[styles.settingIconBox, { backgroundColor: `${theme.warning}15` }]}>
              <Ionicons name="pause-circle-outline" size={20} color={theme.warning} />
            </View>
            <View style={styles.dangerTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.warning }]}>Deactivate Account</Text>
              <Text style={styles.dangerDescription}>Temporarily disable your account</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeleteConfirm(true)}>
            <View style={[styles.settingIconBox, { backgroundColor: `${theme.error}15` }]}>
              <Ionicons name="trash-outline" size={20} color={theme.error} />
            </View>
            <View style={styles.dangerTextContainer}>
              <Text style={[styles.settingLabel, { color: theme.error }]}>Delete Account</Text>
              <Text style={styles.dangerDescription}>Permanently delete your account and data</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          {renderSettingItem('information-circle-outline', 'App Version', '1.0.4', undefined, false)}
          {renderSettingItem('code-slash-outline', 'Build', '2026.04', undefined, false)}
        </View>
      </ScrollView>

      {/* Theme Selection Modal */}
      <Modal visible={showThemeModal} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowThemeModal(false)}
        >
          <View style={styles.themeModalContent}>
            <Text style={styles.themeModalTitle}>Choose Theme</Text>
            
            {(['dark', 'light', 'system'] as ThemeType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.themeOption,
                  themeType === type && styles.themeOptionActive,
                ]}
                onPress={() => handleThemeChange(type)}
              >
                <View style={styles.themeOptionLeft}>
                  <View style={[
                    styles.themeIconBox,
                    themeType === type && { backgroundColor: `${theme.primary}20` }
                  ]}>
                    <Ionicons 
                      name={getThemeIcon(type) as any} 
                      size={24} 
                      color={themeType === type ? theme.primary : theme.textSecondary} 
                    />
                  </View>
                  <View>
                    <Text style={[
                      styles.themeOptionLabel,
                      themeType === type && { color: theme.primary }
                    ]}>
                      {getThemeLabel(type)}
                    </Text>
                    <Text style={styles.themeOptionDesc}>
                      {type === 'dark' && 'Always use dark theme'}
                      {type === 'light' && 'Always use light theme'}
                      {type === 'system' && 'Match device settings'}
                    </Text>
                  </View>
                </View>
                {themeType === type && (
                  <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Name Modal */}
      <Modal visible={showEditName} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
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
              placeholderTextColor={theme.textSecondary}
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
                placeholderTextColor={theme.textSecondary}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showPasswords}
              />
            </View>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="New Password"
                placeholderTextColor={theme.textSecondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPasswords}
              />
            </View>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm New Password"
                placeholderTextColor={theme.textSecondary}
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                secureTextEntry={!showPasswords}
              />
              <TouchableOpacity onPress={() => setShowPasswords(!showPasswords)} style={styles.showPasswordButton}>
                <Ionicons name={showPasswords ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.textSecondary} />
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

      {/* Deactivate Confirmation Modal */}
      <Modal visible={showDeactivateConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmIconBox, { backgroundColor: `${theme.warning}15` }]}>
              <Ionicons name="pause-circle" size={48} color={theme.warning} />
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
                style={[styles.confirmButtonAction, { backgroundColor: theme.warning }]}
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
            <View style={[styles.confirmIconBox, { backgroundColor: `${theme.error}15` }]}>
              <Ionicons name="trash" size={48} color={theme.error} />
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
                style={[styles.confirmButtonAction, { backgroundColor: theme.error }]}
                onPress={handleDeleteRequest}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmButtonActionText}>Request Deletion</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal (for web) */}
      <Modal visible={showLogoutModal} animationType="fade" transparent={true} onRequestClose={() => setShowLogoutModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmIconBox, { backgroundColor: `${theme.error}15` }]}>
              <Ionicons name="log-out-outline" size={48} color={theme.error} />
            </View>
            <Text style={styles.confirmTitle}>Logout</Text>
            <Text style={styles.confirmDescription}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmButtonCancel} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.confirmButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButtonAction, { backgroundColor: theme.error }]}
                onPress={confirmLogout}
              >
                <Text style={styles.confirmButtonActionText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Dynamic styles function based on theme
const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 10,
    marginTop: 16,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
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
    backgroundColor: `${theme.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    color: theme.text,
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
    color: theme.textSecondary,
  },
  themePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
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
    color: theme.textSecondary,
    marginTop: 2,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dangerTextContainer: {
    flex: 1,
  },
  dangerDescription: {
    fontSize: 12,
    color: theme.textSecondary,
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
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: theme.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    fontSize: 16,
    color: theme.text,
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
    borderColor: theme.border,
    alignItems: 'center',
  },
  modalButtonSecondaryText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonPrimary: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: theme.primary,
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
    backgroundColor: theme.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: theme.text,
  },
  showPasswordButton: {
    padding: 14,
  },
  // Theme Modal
  themeModalContent: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  themeModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  themeOptionActive: {
    backgroundColor: `${theme.primary}10`,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  themeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  themeOptionDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  // Legal Modal
  legalModalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  legalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.text,
  },
  legalContent: {
    flex: 1,
    padding: 20,
  },
  legalDate: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  legalText: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 24,
  },
  // Confirm Modal
  confirmModalContent: {
    backgroundColor: theme.surface,
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
    color: theme.text,
    marginBottom: 8,
  },
  confirmDescription: {
    fontSize: 14,
    color: theme.textSecondary,
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
    borderColor: theme.border,
    alignItems: 'center',
  },
  confirmButtonCancelText: {
    color: theme.text,
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

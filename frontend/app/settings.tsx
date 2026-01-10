import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import NotificationService from '../src/services/notificationService';

export default function SettingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const enabled = await NotificationService.isNotificationEnabled();
      setPushNotificationsEnabled(enabled);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePushNotifications = async (value: boolean) => {
    setPushNotificationsEnabled(value);
    
    try {
      await NotificationService.setNotificationEnabled(value);
      
      const message = value 
        ? 'You will now receive notifications for new trading signals.' 
        : 'You will no longer receive push notifications for new signals.';
      
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert(
          value ? 'Notifications Enabled' : 'Notifications Disabled',
          message
        );
      }
    } catch (error) {
      console.error('Failed to toggle notifications:', error);
      // Revert UI on error
      setPushNotificationsEnabled(!value);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="notifications-outline" size={20} color="#00D4AA" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive alerts for new trading signals
                </Text>
              </View>
            </View>
            <Switch
              value={pushNotificationsEnabled}
              onValueChange={handleTogglePushNotifications}
              trackColor={{ false: '#2A2F3E', true: '#00D4AA' }}
              thumbColor="#FFFFFF"
              disabled={isLoading}
            />
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#00D4AA" />
          <Text style={styles.infoText}>
            When enabled, you'll receive instant alerts when new trading signals are posted. 
            {user?.role === 'free' && ' Free users receive notifications for free signals only.'}
            {user?.role === 'vip' && ' VIP users receive notifications for all signals including VIP-exclusive ones.'}
          </Text>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsCard}>
          <View style={styles.accountInfo}>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Email</Text>
              <Text style={styles.accountValue}>{user?.email}</Text>
            </View>
            <View style={[styles.accountRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.accountLabel}>Membership</Text>
              <View style={[
                styles.roleBadge,
                user?.role === 'vip' && styles.vipBadge,
                user?.role === 'premium' && styles.premiumBadge,
              ]}>
                <Text style={styles.roleText}>{user?.role?.toUpperCase() || 'FREE'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* App Info */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.settingsCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.aboutLabel}>Build</Text>
            <Text style={styles.aboutValue}>2024.01</Text>
          </View>
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
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8D98',
    marginBottom: 12,
    marginTop: 8,
    marginLeft: 4,
  },
  settingsCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    overflow: 'hidden',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#8A8D98',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 20,
    marginLeft: 12,
  },
  accountInfo: {
    padding: 16,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  accountLabel: {
    fontSize: 14,
    color: '#8A8D98',
  },
  accountValue: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  roleBadge: {
    backgroundColor: 'rgba(138, 141, 152, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
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
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  aboutLabel: {
    fontSize: 14,
    color: '#8A8D98',
  },
  aboutValue: {
    fontSize: 14,
    color: '#FFFFFF',
  },
});

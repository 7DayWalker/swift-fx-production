import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api } from './api';

const NOTIFICATION_ENABLED_KEY = '@notification_enabled';
const CALENDAR_NOTIFICATION_KEY = '@calendar_notification_enabled';
const CALENDAR_NOTIFICATION_MINUTES_KEY = '@calendar_notification_minutes';

// Notification subscriptions
let responseListener: Notifications.Subscription | null = null;
let receivedListener: Notifications.Subscription | null = null;

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Initialize push notifications
 * - Request permissions
 * - Register device token with backend
 * - Set up notification tap handlers
 */
export async function initializeNotifications(): Promise<void> {
  try {
    // Check if notifications are enabled in user settings
    const isEnabled = await isNotificationEnabled();
    if (!isEnabled) {
      console.log('Push notifications disabled by user');
      return;
    }

    // Request permissions and get token
    const token = await registerForPushNotifications();
    if (token) {
      await registerTokenWithBackend(token);
    }

    // Set up notification tap handler
    setupNotificationListeners();
  } catch (error) {
    console.error('Failed to initialize notifications:', error);
  }
}

/**
 * Request push notification permissions and get Expo Push Token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Only works on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'tradersignals', // Using the tunnel subdomain as project ID
    });

    console.log('Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register push token with backend
 */
export async function registerTokenWithBackend(token: string): Promise<void> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    
    await api.post('/notifications/register-token', {
      token,
      platform,
    });
    
    console.log('Push token registered with backend');
  } catch (error) {
    console.error('Failed to register token with backend:', error);
  }
}

/**
 * Set up listeners for notification events
 */
export function setupNotificationListeners(): void {
  // Clean up existing listeners
  cleanupNotifications();

  // Handle notification received while app is foregrounded
  receivedListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
  });

  // Handle notification tap (when user taps the notification)
  responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification tapped:', response);
    
    const data = response.notification.request.content.data;
    
    // Navigate to Signals screen when notification is tapped
    if (data?.type === 'new_signal') {
      router.push('/(tabs)/signals');
    }
  });
}

/**
 * Clean up notification listeners
 * Defensive cleanup - never crashes even if notifications were never set up
 */
export function cleanupNotifications(): void {
  try {
    if (responseListener) {
      // Use .remove() method on the subscription object (correct API)
      if (typeof responseListener.remove === 'function') {
        responseListener.remove();
      }
      responseListener = null;
    }
    if (receivedListener) {
      // Use .remove() method on the subscription object (correct API)
      if (typeof receivedListener.remove === 'function') {
        receivedListener.remove();
      }
      receivedListener = null;
    }
  } catch (error) {
    // Silently handle cleanup errors - logout must never crash
    console.log('Notification cleanup skipped:', error);
    responseListener = null;
    receivedListener = null;
  }
}

/**
 * Check if notifications are enabled in user settings
 */
export async function isNotificationEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_ENABLED_KEY);
    // Default to true if not set
    return value === null ? true : value === 'true';
  } catch (error) {
    console.error('Error reading notification setting:', error);
    return true;
  }
}

/**
 * Set notification enabled state
 */
export async function setNotificationEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_ENABLED_KEY, enabled.toString());
    
    // Update backend preferences
    try {
      await api.put('/notifications/preferences', {
        signals: enabled,
      });
    } catch (apiError) {
      console.error('Failed to update backend preferences:', apiError);
    }

    if (enabled) {
      // Re-initialize notifications
      await initializeNotifications();
    } else {
      // Cleanup listeners
      cleanupNotifications();
    }
  } catch (error) {
    console.error('Error saving notification setting:', error);
  }
}

/**
 * Unregister device token (call on logout)
 */
export function unregisterToken(): void {
  cleanupNotifications();
  // Note: Token is still stored on backend but won't receive notifications
  // if user preferences are updated
}

// Default export for convenience
const NotificationService = {
  initialize: initializeNotifications,
  cleanup: cleanupNotifications,
  isNotificationEnabled,
  setNotificationEnabled,
  unregisterToken,
};

export default NotificationService;

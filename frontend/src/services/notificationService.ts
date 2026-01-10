import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api } from './api';

const NOTIFICATION_ENABLED_KEY = '@notification_enabled';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotificationService {
  private static responseListener: Notifications.Subscription | null = null;
  private static receivedListener: Notifications.Subscription | null = null;

  /**
   * Initialize push notifications
   * - Request permissions
   * - Register device token with backend
   * - Set up notification tap handlers
   */
  static async initialize(): Promise<void> {
    try {
      // Check if notifications are enabled in user settings
      const isEnabled = await this.isNotificationEnabled();
      if (!isEnabled) {
        console.log('Push notifications disabled by user');
        return;
      }

      // Request permissions and get token
      const token = await this.registerForPushNotifications();
      if (token) {
        await this.registerTokenWithBackend(token);
      }

      // Set up notification tap handler
      this.setupNotificationListeners();
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  }

  /**
   * Request push notification permissions and get Expo Push Token
   */
  static async registerForPushNotifications(): Promise<string | null> {
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
  static async registerTokenWithBackend(token: string): Promise<void> {
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
  static setupNotificationListeners(): void {
    // Clean up existing listeners
    this.cleanup();

    // Handle notification received while app is foregrounded
    this.receivedListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Handle notification tap (when user taps the notification)
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
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
   */
  static cleanup(): void {
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
    if (this.receivedListener) {
      Notifications.removeNotificationSubscription(this.receivedListener);
      this.receivedListener = null;
    }
  }

  /**
   * Check if notifications are enabled in user settings
   */
  static async isNotificationEnabled(): Promise<boolean> {
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
  static async setNotificationEnabled(enabled: boolean): Promise<void> {
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
        await this.initialize();
      } else {
        // Cleanup listeners
        this.cleanup();
      }
    } catch (error) {
      console.error('Error saving notification setting:', error);
    }
  }

  /**
   * Unregister device token (call on logout)
   */
  static async unregisterToken(): Promise<void> {
    this.cleanup();
    // Note: Token is still stored on backend but won't receive notifications
    // if user preferences are updated
  }
}

export default NotificationService;

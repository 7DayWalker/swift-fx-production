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
  // Calendar notifications
  isCalendarNotificationEnabled,
  setCalendarNotificationEnabled,
  getCalendarNotificationMinutes,
  setCalendarNotificationMinutes,
  scheduleCalendarEventNotification,
  cancelAllCalendarNotifications,
};

export default NotificationService;

// =====================================================
// CALENDAR EVENT NOTIFICATIONS (High-Impact Only)
// =====================================================

/**
 * Check if calendar notifications are enabled
 */
export async function isCalendarNotificationEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(CALENDAR_NOTIFICATION_KEY);
    // Default to false - opt-in only
    return value === 'true';
  } catch (error) {
    console.error('Error reading calendar notification setting:', error);
    return false;
  }
}

/**
 * Set calendar notification enabled state
 */
export async function setCalendarNotificationEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CALENDAR_NOTIFICATION_KEY, enabled.toString());
    
    if (!enabled) {
      // Cancel all scheduled calendar notifications
      await cancelAllCalendarNotifications();
    }
    
    console.log(`Calendar notifications ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('Error saving calendar notification setting:', error);
  }
}

/**
 * Get minutes before event to notify (default: 15)
 */
export async function getCalendarNotificationMinutes(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(CALENDAR_NOTIFICATION_MINUTES_KEY);
    return value ? parseInt(value, 10) : 15;
  } catch (error) {
    console.error('Error reading notification minutes:', error);
    return 15;
  }
}

/**
 * Set minutes before event to notify
 */
export async function setCalendarNotificationMinutes(minutes: number): Promise<void> {
  try {
    await AsyncStorage.setItem(CALENDAR_NOTIFICATION_MINUTES_KEY, minutes.toString());
  } catch (error) {
    console.error('Error saving notification minutes:', error);
  }
}

/**
 * Schedule a local notification for a high-impact calendar event
 * INFORMATIONAL ONLY - No trading advice
 */
export async function scheduleCalendarEventNotification(event: {
  id: string;
  title: string;
  country: string;
  date: string;
  impact: string;
}): Promise<string | null> {
  try {
    // Only schedule for high-impact events
    if (event.impact.toLowerCase() !== 'high') {
      return null;
    }

    // Check if calendar notifications are enabled
    const isEnabled = await isCalendarNotificationEnabled();
    if (!isEnabled) {
      return null;
    }

    // Get notification timing
    const minutesBefore = await getCalendarNotificationMinutes();
    const eventDate = new Date(event.date);
    const notificationDate = new Date(eventDate.getTime() - minutesBefore * 60 * 1000);

    // Don't schedule if notification time has passed
    if (notificationDate <= new Date()) {
      console.log('Event notification time has passed, skipping:', event.title);
      return null;
    }

    // Currency flag mapping
    const flags: { [key: string]: string } = {
      USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
      AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭', CNY: '🇨🇳',
    };
    const flag = flags[event.country] || '🌍';

    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${flag} High-Impact Event`,
        body: `${event.country}: ${event.title} in ${minutesBefore} minutes`,
        data: { 
          type: 'calendar_event',
          eventId: event.id,
        },
        sound: true,
      },
      trigger: {
        date: notificationDate,
      },
    });

    console.log(`Scheduled notification for ${event.title} at ${notificationDate.toISOString()}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling calendar notification:', error);
    return null;
  }
}

/**
 * Cancel all scheduled calendar notifications
 */
export async function cancelAllCalendarNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const calendarNotifications = scheduled.filter(
      n => n.content.data?.type === 'calendar_event'
    );
    
    for (const notification of calendarNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
    
    console.log(`Cancelled ${calendarNotifications.length} calendar notifications`);
  } catch (error) {
    console.error('Error cancelling calendar notifications:', error);
  }
}

import React, { useEffect, useState, useRef } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { SignalProvider } from '../src/context/SignalContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import NotificationService from '../src/services/notificationService';
import {
  isCalendarNotificationEnabled,
  scheduleCalendarEventNotification,
  cancelCalendarNotificationsForEventIds,
} from '../src/services/notificationService';
import { initDeepLinkListener } from '../src/services/referralService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../src/services/api';
import AppAnnouncementModal, { AppAnnouncement } from '../src/components/AppAnnouncementModal';

// ─── GLOBAL notification handler (must run before any notification arrives) ───
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Android notification channel (must exist before first push) ───
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00D4AA',
  });
}

function RootLayoutContent() {
  const { theme, isDark } = useTheme();
  const { user, isLoading, isPasswordRecovery } = useAuth();
  const segments = useSegments();
  const userId = user?.user_id;

  const DISMISSED_ANNOUNCEMENT_ID_KEY = '@dismissed_app_announcement_id';

  const [appAnnouncement, setAppAnnouncement] = useState<AppAnnouncement | null>(null);
  const [appAnnouncementVisible, setAppAnnouncementVisible] = useState(false);
  const [appAnnouncementCheckDone, setAppAnnouncementCheckDone] = useState(false);

  const dismissAppAnnouncement = async () => {
    const id = appAnnouncement?.id;
    setAppAnnouncementVisible(false);
    setAppAnnouncement(null);

    try {
      if (id) {
        await AsyncStorage.setItem(DISMISSED_ANNOUNCEMENT_ID_KEY, id);
      }
    } catch (err) {
      // fail closed: never block navigation/UI
    }
  };

  // ── SINGLE source of navigation truth ──
  useEffect(() => {
    if (isLoading) return;

    const topSegment = segments[0];

    if (isPasswordRecovery) {
      if (topSegment !== 'reset-password') {
        router.replace('/reset-password');
      }
      return;
    }

    // Preserve standalone deep-link / checkout / callback routes
    if (topSegment === 'invite' || topSegment === 'pay' || topSegment === 'checkout-flutterwave') {
      return;
    }

    if (userId) {
      // Only redirect to dashboard when sitting on root index or auth screens
      if (!topSegment || topSegment === 'index' || topSegment === '(auth)' || topSegment === 'auth' || topSegment === 'reset-password') {
        router.replace('/(tabs)/dashboard');
      }
    } else {
      // Guest routing (frontend-only)
      void (async () => {
        try {
          const guestFlag = await AsyncStorage.getItem('swiftfx_guest');
          if (guestFlag === 'true') {
            if (!topSegment || topSegment === 'index' || topSegment === '(auth)') {
              router.replace('/(tabs)/signals');
            }
            return;
          }
        } catch {
          // fail-closed: fall back to login
        }
        if (topSegment !== '(auth)' && topSegment !== 'auth') {
          router.replace('/(auth)/login');
        }
      })();
    }
  }, [isLoading, userId, isPasswordRecovery, segments[0]]);

  // ── App announcement popup (show once, after auth stabilization) ──
  useEffect(() => {
    if (appAnnouncementCheckDone) return;
    if (isLoading) return;
    if (isPasswordRecovery) return;
    if (!user) return;

    void (async () => {
      try {
        // Wait a beat so auth routing (router.replace) has time to settle.
        await new Promise(resolve => setTimeout(resolve, 300));

        const dismissedId = await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENT_ID_KEY);

        const res = await api.get('/announcements/active');
        const latest = res.data as AppAnnouncement | null;

        if (!latest?.id) return;

        if (dismissedId !== latest.id) {
          setAppAnnouncement(latest);
          setAppAnnouncementVisible(true);
        }
      } catch (err) {
        // fail closed: silently ignore fetch/storage errors
      } finally {
        setAppAnnouncementCheckDone(true);
      }
    })();
  }, [appAnnouncementCheckDone, isLoading, isPasswordRecovery, user]);

  // Request notification permissions early (Android needs this before notifications arrive)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      Notifications.requestPermissionsAsync();
    }
  }, []);

  // Initialize push notifications when user is logged in
  useEffect(() => {
    if (user) {
      NotificationService.initialize();
    }
    return () => {
      NotificationService.cleanup();
    };
  }, [user]);

  // Lightweight startup rehydration for calendar reminders
  // (recreate upcoming high-impact local notifications when enabled)
  const calendarRemindersRehydratedRef = useRef(false);

  useEffect(() => {
    if (calendarRemindersRehydratedRef.current) return;
    if (Platform.OS === 'web') return;
    if (isLoading) return;
    if (isPasswordRecovery) return;
    if (!user) return;

    calendarRemindersRehydratedRef.current = true;

    void (async () => {
      try {
        const enabled = await isCalendarNotificationEnabled();
        if (!enabled) return;

        const res = await api.get('/calendar/events', {
          params: { filter: 'week' },
        });

        const events = res.data?.events ?? [];
        const highImpactEvents = events.filter(
          (e: any) => (e?.impact || '').trim().toLowerCase() === 'high',
        );

        const eventIds = highImpactEvents.map((e: any) => e?.id).filter(Boolean);

        await cancelCalendarNotificationsForEventIds(eventIds);

        for (const event of highImpactEvents) {
          await scheduleCalendarEventNotification(event);
        }
      } catch (err) {
        console.log('[Calendar Reminders] Startup rehydration failed:', err);
      }
    })();
  }, [isLoading, isPasswordRecovery, user]);
  
  // Initialize deep link listener for referrals
  useEffect(() => {
    const cleanup = initDeepLinkListener((code) => {
      console.log('[App] Referral code detected from deep link:', code);
    });
    return cleanup;
  }, []);
  
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppAnnouncementModal
        visible={appAnnouncementVisible}
        announcement={appAnnouncement}
        onDismiss={() => {
          void dismissAppAnnouncement();
        }}
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="pay" />
        <Stack.Screen name="checkout-flutterwave" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="signal-history" />
        <Stack.Screen name="journal" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="chart" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Load Ionicons font for web compatibility
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <SignalProvider>
                <RootLayoutContent />
              </SignalProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

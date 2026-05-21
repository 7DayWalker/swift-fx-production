import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
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

    if (isPasswordRecovery) {
      router.replace('/reset-password');
      return;
    }

    if (user) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/(auth)/login');
    }
  }, [isLoading, user, isPasswordRecovery]);

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
        <Stack.Screen name="register" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="signal-history" />
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

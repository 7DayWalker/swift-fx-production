import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { SignalProvider } from '../src/context/SignalContext';
import { SubscriptionProvider } from '../src/context/SubscriptionContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import NotificationService from '../src/services/notificationService';
import { initDeepLinkListener } from '../src/services/referralService';

function RootLayoutContent() {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  
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
        <Stack.Screen name="register" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="signal-history" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
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

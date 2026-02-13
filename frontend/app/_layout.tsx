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
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import NotificationService from '../src/services/notificationService';
import { initDeepLinkListener } from '../src/services/referralService';

// Prevent splash screen from auto-hiding (top-level, outside component)
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  // Load Ionicons font for web compatibility
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore errors
      });
    }
  }, [fontsLoaded, fontError]);

  // Show loading indicator while fonts are loading
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
  },
});

import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function AdminLayout() {
  const { user, isLoading, isProfileLoading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until BOTH session check and profile role enrichment have finished
    if (isLoading || isProfileLoading) return;
    if (!user) {
      router.replace('/(auth)/login');
    } else if (!isAdmin) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isLoading, isProfileLoading, user, isAdmin]);

  if (isLoading || isProfileLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </View>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0E17' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="signals" />
      <Stack.Screen name="users" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="support-tickets" />
      <Stack.Screen name="fund-applications" />
      <Stack.Screen name="fund-performance" />
      <Stack.Screen name="referrals" />
      <Stack.Screen name="withdrawals" />
      <Stack.Screen name="admin-management" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="app-announcements" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0E17',
  },
});

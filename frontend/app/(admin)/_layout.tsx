import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function AdminLayout() {
  const { user, isLoading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Protect admin routes - redirect non-admins
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/(auth)/login');
    }
  }, [isLoading, user, isAdmin]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </View>
    );
  }

  if (!isAdmin) {
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

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const adminMenuItems = [
  {
    title: 'User Management',
    icon: 'people-outline' as const,
    description: 'Manage platform users',
    route: '/(admin)/admin-management',
    color: '#2563EB',
  },
  {
    title: 'App Announcements',
    icon: 'megaphone-outline' as const,
    description: 'Publish app update announcements',
    route: '/(admin)/app-announcements',
    color: '#D97706',
  },
  {
    title: 'Analytics',
    icon: 'analytics-outline' as const,
    description: 'View platform analytics',
    route: '/(admin)/analytics',
    color: '#7C3AED',
  },
  {
    title: 'Settings',
    icon: 'settings-outline' as const,
    description: 'Configure platform settings',
    route: '/(admin)/settings',
    color: '#059669',
  },
  {
    title: 'System Reports',
    icon: 'document-text-outline' as const,
    description: 'View detailed reports',
    route: '/(admin)/reports',
    color: '#EA580C',
  },
];

export default function AdminDashboard() {
  const router = useRouter();

  const handleMenuPress = (route: string) => {
    if (route === '/(admin)/analytics' || route === '/(admin)/settings' || route === '/(admin)/reports') {
      Alert.alert('Coming Soon', 'This feature will be available in a future update.');
      return;
    }

    router.push(route as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>Manage platform operations and settings</Text>
        </View>

        <View style={styles.menuGrid}>
          {adminMenuItems.map((item) => (
            <TouchableOpacity key={item.title} style={styles.menuItem} onPress={() => handleMenuPress(item.route)}>
              <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Quick Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>1,234</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>567</Text>
              <Text style={styles.statLabel}>Active Investors</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>89%</Text>
              <Text style={styles.statLabel}>Platform Health</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  menuItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
  },
  menuDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
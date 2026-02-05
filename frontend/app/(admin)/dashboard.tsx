import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/services/supabase';

interface AdminStats {
  total_users: number;
  premium_users: number;
  vip_users: number;
  total_signals: number;
  total_ai_analyses: number;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
      // Fallback: count signals directly (admin can see all via RLS)
      try {
        const { count } = await supabase
          .from('signals')
          .select('*', { count: 'exact', head: true });
        setStats({
          total_users: 0,
          premium_users: 0,
          vip_users: 0,
          total_signals: count || 0,
          total_ai_analyses: 0,
        });
      } catch { /* ignore */ }
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const menuItems = [
    {
      icon: 'trending-up',
      label: 'Signal Management',
      description: 'Create, edit & delete signals',
      route: '/(admin)/signals',
      color: '#00D4AA',
    },
    {
      icon: 'people',
      label: 'User Management',
      description: 'View users & manage roles',
      route: '/(admin)/users',
      color: '#FFD700',
    },
    {
      icon: 'briefcase',
      label: 'Fund Applications',
      description: 'Review & manage fund requests',
      route: '/(admin)/fund-applications',
      color: '#3B82F6',
    },
    {
      icon: 'stats-chart',
      label: 'Fund Performance',
      description: 'Manage investor portfolios',
      route: '/(admin)/fund-performance',
      color: '#10B981',
    },
    {
      icon: 'cash-outline',
      label: 'Withdrawal Requests',
      description: 'Review & approve withdrawals',
      route: '/(admin)/withdrawals',
      color: '#F59E0B',
    },
    {
      icon: 'gift-outline',
      label: 'Referral Management',
      description: 'Track & manage referrals',
      route: '/(admin)/referrals',
      color: '#EC4899',
    },
    {
      icon: 'headset',
      label: 'Support Tickets',
      description: 'Handle user support requests',
      route: '/(admin)/support-tickets',
      color: '#06B6D4',
    },
    {
      icon: 'shield-checkmark',
      label: 'Admin Management',
      description: 'Manage admin accounts & roles',
      route: '/(admin)/admin-management',
      color: '#8B5CF6',
    },
    {
      icon: 'analytics',
      label: 'AI Usage Metrics',
      description: 'View AI analysis statistics',
      route: '/(admin)/analytics',
      color: '#FF6B6B',
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D4AA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Admin Panel</Text>
            <Text style={styles.userName}>{user?.name || 'Admin'}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#FFD700" />
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#FF4757" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(0, 212, 170, 0.15)' }]}>
              <Ionicons name="people" size={24} color="#00D4AA" />
            </View>
            <Text style={styles.statValue}>{stats?.total_users || 0}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(0, 212, 170, 0.15)' }]}>
              <Ionicons name="star" size={24} color="#00D4AA" />
            </View>
            <Text style={styles.statValue}>{stats?.premium_users || 0}</Text>
            <Text style={styles.statLabel}>Premium</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
              <Ionicons name="diamond" size={24} color="#FFD700" />
            </View>
            <Text style={styles.statValue}>{stats?.vip_users || 0}</Text>
            <Text style={styles.statLabel}>VIP</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: 'rgba(255, 107, 107, 0.15)' }]}>
              <Ionicons name="trending-up" size={24} color="#FF6B6B" />
            </View>
            <Text style={styles.statValue}>{stats?.total_signals || 0}</Text>
            <Text style={styles.statLabel}>Signals</Text>
          </View>
        </View>

        {/* AI Usage Card */}
        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <Ionicons name="sparkles" size={24} color="#00D4AA" />
            <Text style={styles.aiCardTitle}>AI Analyses</Text>
          </View>
          <Text style={styles.aiCardValue}>{stats?.total_ai_analyses || 0}</Text>
          <Text style={styles.aiCardLabel}>Total AI chart analyses performed</Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon as any} size={24} color={item.color} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDescription}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8A8D98" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Go to User App */}
        <TouchableOpacity
          style={styles.userAppButton}
          onPress={() => router.push('/(tabs)/dashboard')}
        >
          <Ionicons name="phone-portrait-outline" size={20} color="#00D4AA" />
          <Text style={styles.userAppButtonText}>View User App</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 14,
    color: '#8A8D98',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 71, 87, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  aiCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiCardValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  aiCardLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  menuContainer: {
    gap: 12,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuDescription: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 2,
  },
  userAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: '#00D4AA',
  },
  userAppButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00D4AA',
  },
});

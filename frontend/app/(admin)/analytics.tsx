import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';

interface User {
  user_id: string;
  name: string;
  email: string;
  role: 'free' | 'premium' | 'vip';
  ai_usage_count?: number;
  ai_usage_reset_date?: string;
}

interface AdminStats {
  total_users: number;
  premium_users: number;
  vip_users: number;
  total_signals: number;
  total_ai_analyses: number;
}

export default function AnalyticsScreen() {
  // GATED: Needs ai_analyses table in Supabase
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0E17' }}>
      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.back()}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#00D4AA' }}>{'← Back'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🚧'}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>AI Analytics</Text>
        <Text style={{ fontSize: 15, color: '#8899AA', textAlign: 'center', lineHeight: 22 }}>This feature is under development and will be available in a future update.</Text>
      </View>
    </SafeAreaView>
  );
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getAIUsageByRole = () => {
    const premium = users.filter(u => u.role === 'premium');
    const vip = users.filter(u => u.role === 'vip');

    const premiumUsage = premium.reduce((sum, u) => sum + (u.ai_usage_count || 0), 0);
    const vipUsage = vip.reduce((sum, u) => sum + (u.ai_usage_count || 0), 0);

    return { premiumUsage, vipUsage, total: premiumUsage + vipUsage };
  };

  const getTopAIUsers = () => {
    return users
      .filter(u => (u.ai_usage_count || 0) > 0)
      .sort((a, b) => (b.ai_usage_count || 0) - (a.ai_usage_count || 0))
      .slice(0, 5);
  };

  const aiUsage = getAIUsageByRole();
  const topUsers = getTopAIUsers();

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'vip': return '#FFD700';
      case 'premium': return '#00D4AA';
      default: return '#8A8D98';
    }
  };

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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>AI Usage Metrics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Total AI Analyses Card */}
        <View style={styles.totalCard}>
          <View style={styles.totalIconContainer}>
            <Ionicons name="sparkles" size={32} color="#00D4AA" />
          </View>
          <Text style={styles.totalValue}>{stats?.total_ai_analyses || 0}</Text>
          <Text style={styles.totalLabel}>Total AI Analyses</Text>
          <Text style={styles.totalSubtext}>All-time chart analyses performed</Text>
        </View>

        {/* Usage by Role */}
        <Text style={styles.sectionTitle}>Usage by Subscription</Text>
        <View style={styles.usageCards}>
          <View style={styles.usageCard}>
            <View style={[styles.usageIconContainer, { backgroundColor: 'rgba(0, 212, 170, 0.15)' }]}>
              <Ionicons name="star" size={24} color="#00D4AA" />
            </View>
            <Text style={styles.usageValue}>{aiUsage.premiumUsage}</Text>
            <Text style={styles.usageLabel}>Premium</Text>
            <Text style={styles.usageSubtext}>5 per week limit</Text>
          </View>
          <View style={styles.usageCard}>
            <View style={[styles.usageIconContainer, { backgroundColor: 'rgba(255, 215, 0, 0.15)' }]}>
              <Ionicons name="diamond" size={24} color="#FFD700" />
            </View>
            <Text style={styles.usageValue}>{aiUsage.vipUsage}</Text>
            <Text style={styles.usageLabel}>VIP</Text>
            <Text style={styles.usageSubtext}>20 per week limit</Text>
          </View>
        </View>

        {/* Platform Stats */}
        <Text style={styles.sectionTitle}>Platform Overview</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#00D4AA" />
            <Text style={styles.statValue}>{stats?.total_users || 0}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={24} color="#FF6B6B" />
            <Text style={styles.statValue}>{stats?.total_signals || 0}</Text>
            <Text style={styles.statLabel}>Total Signals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star" size={24} color="#00D4AA" />
            <Text style={styles.statValue}>{stats?.premium_users || 0}</Text>
            <Text style={styles.statLabel}>Premium</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="diamond" size={24} color="#FFD700" />
            <Text style={styles.statValue}>{stats?.vip_users || 0}</Text>
            <Text style={styles.statLabel}>VIP</Text>
          </View>
        </View>

        {/* Top AI Users */}
        <Text style={styles.sectionTitle}>Top AI Users</Text>
        {topUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={48} color="#8A8D98" />
            <Text style={styles.emptyText}>No AI usage data yet</Text>
          </View>
        ) : (
          <View style={styles.topUsersContainer}>
            {topUsers.map((user, index) => (
              <View key={user.user_id} style={styles.topUserCard}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <View style={styles.topUserInfo}>
                  <Text style={styles.topUserName}>{user.name}</Text>
                  <View style={[styles.topUserRole, { backgroundColor: `${getRoleColor(user.role)}20` }]}>
                    <Text style={[styles.topUserRoleText, { color: getRoleColor(user.role) }]}>
                      {user.role?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.topUserUsage}>
                  <Text style={styles.topUserUsageValue}>{user.ai_usage_count}</Text>
                  <Text style={styles.topUserUsageLabel}>analyses</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#00D4AA" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>AI Usage Limits</Text>
            <Text style={styles.infoText}>
              Premium users: 5 analyses per week{"\n"}
              VIP users: 20 analyses per week{"\n"}
              Free users: No AI access
            </Text>
          </View>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  totalCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  totalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  totalSubtext: {
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
  usageCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  usageCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  usageIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  usageValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  usageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 4,
  },
  usageSubtext: {
    fontSize: 10,
    color: '#8A8D98',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  topUsersContainer: {
    gap: 10,
    marginBottom: 24,
  },
  topUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  topUserInfo: {
    flex: 1,
  },
  topUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topUserRole: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  topUserRoleText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  topUserUsage: {
    alignItems: 'flex-end',
  },
  topUserUsageValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00D4AA',
  },
  topUserUsageLabel: {
    fontSize: 10,
    color: '#8A8D98',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 12,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00D4AA',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#8A8D98',
    lineHeight: 18,
  },
});

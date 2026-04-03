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
import api from '../../src/services/api';

interface AdminStats {
  total_users: number;
  premium_users: number;
  vip_users: number;
  total_signals: number;
  active_signals: number;
  closed_signals: number;
  pending_signals: number;
  total_ai_analyses: number;
  total_posts: number;
}

interface HealthData {
  engine_status: string;
  engine_detail: string | null;
  engine_error_count: number;
  last_signal_time: string | null;
  api_response_ms: number;
  mongo_connected: boolean;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchHealth();
    }
  }, [user]);

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await api.get('/admin/health');
      setHealth(res.data);
    } catch (e) {
      console.warn('[AdminDash] Health fetch failed:', e);
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data);
    } catch (error) {
      console.error('[AdminDash] Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchHealth()]);
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
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

        {/* Signal Breakdown */}
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Signal Breakdown</Text>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#00D4AA' }]} />
              <Text style={styles.breakdownLabel}>Active</Text>
              <Text style={[styles.breakdownValue, { color: '#00D4AA' }]}>{stats?.active_signals || 0}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#8A8D98' }]} />
              <Text style={styles.breakdownLabel}>Closed</Text>
              <Text style={[styles.breakdownValue, { color: '#8A8D98' }]}>{stats?.closed_signals || 0}</Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#FFD700' }]} />
              <Text style={styles.breakdownLabel}>Pending</Text>
              <Text style={[styles.breakdownValue, { color: '#FFD700' }]}>{stats?.pending_signals || 0}</Text>
            </View>
          </View>
          {stats && stats.total_signals > 0 && (
            <View style={styles.breakdownBar}>
              <View style={[styles.barSegment, { flex: stats.active_signals || 0.01, backgroundColor: '#00D4AA' }]} />
              <View style={[styles.barSegment, { flex: stats.closed_signals || 0.01, backgroundColor: '#8A8D98' }]} />
              <View style={[styles.barSegment, { flex: stats.pending_signals || 0.01, backgroundColor: '#FFD700' }]} />
            </View>
          )}
        </View>

        {/* AI + Posts Row */}
        <View style={styles.miniRow}>
          <View style={[styles.miniCard, { borderColor: 'rgba(0,212,170,0.2)' }]}>
            <Ionicons name="sparkles" size={22} color="#00D4AA" />
            <Text style={styles.miniValue}>{stats?.total_ai_analyses || 0}</Text>
            <Text style={styles.miniLabel}>AI Analyses</Text>
          </View>
          <View style={[styles.miniCard, { borderColor: 'rgba(88,101,242,0.2)' }]}>
            <Ionicons name="chatbubbles" size={22} color="#5865F2" />
            <Text style={styles.miniValue}>{stats?.total_posts || 0}</Text>
            <Text style={styles.miniLabel}>Community Posts</Text>
          </View>
        </View>

        {/* Backend Health Widget */}
        <View style={styles.healthSection} data-testid="backend-health-widget">
          <Text style={styles.healthTitle}>Backend Health</Text>
          {healthLoading && !health ? (
            <View style={styles.healthGrid}>
              {['Signal Engine', 'Last Signal', 'API Latency', 'MongoDB'].map(label => (
                <View key={label} style={styles.healthCard}>
                  <View style={[styles.healthDot, { backgroundColor: '#3A3F4E' }]} />
                  <Text style={styles.healthLabel}>{label}</Text>
                  <ActivityIndicator size="small" color="#8A8D98" style={{ marginTop: 4 }} />
                </View>
              ))}
            </View>
          ) : health ? (
            <View style={styles.healthGrid}>
              <View style={styles.healthCard}>
                <View style={[styles.healthDot, { backgroundColor: health.engine_status === 'Running' ? '#00D4AA' : health.engine_status === 'Paused' ? '#FFD700' : '#FF4757' }]} />
                <Text style={styles.healthLabel}>Signal Engine</Text>
                <Text style={[styles.healthValue, { color: health.engine_status === 'Running' ? '#00D4AA' : health.engine_status === 'Paused' ? '#FFD700' : '#FF4757' }]}>
                  {health.engine_status}
                </Text>
                {health.engine_detail && <Text style={styles.healthDetail} numberOfLines={1}>{health.engine_detail}</Text>}
              </View>
              <View style={styles.healthCard}>
                <View style={[styles.healthDot, { backgroundColor: health.last_signal_time ? '#00D4AA' : '#8A8D98' }]} />
                <Text style={styles.healthLabel}>Last Signal</Text>
                <Text style={styles.healthValue}>
                  {health.last_signal_time ? new Date(health.last_signal_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'None'}
                </Text>
              </View>
              <View style={styles.healthCard}>
                <View style={[styles.healthDot, { backgroundColor: health.api_response_ms < 500 ? '#00D4AA' : health.api_response_ms < 1000 ? '#FFD700' : '#FF4757' }]} />
                <Text style={styles.healthLabel}>API Latency</Text>
                <Text style={[styles.healthValue, { color: health.api_response_ms < 500 ? '#00D4AA' : health.api_response_ms < 1000 ? '#FFD700' : '#FF4757' }]}>
                  {health.api_response_ms}ms
                </Text>
              </View>
              <View style={styles.healthCard}>
                <View style={[styles.healthDot, { backgroundColor: health.mongo_connected ? '#00D4AA' : '#FF4757' }]} />
                <Text style={styles.healthLabel}>MongoDB</Text>
                <Text style={[styles.healthValue, { color: health.mongo_connected ? '#00D4AA' : '#FF4757' }]}>
                  {health.mongo_connected ? 'Connected' : 'Down'}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.healthRetry} onPress={fetchHealth} data-testid="health-retry-button">
              <Ionicons name="refresh" size={18} color="#8A8D98" />
              <Text style={{ color: '#8A8D98', fontSize: 13, marginLeft: 8 }}>Tap to load health data</Text>
            </TouchableOpacity>
          )}
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
          onPress={() => router.push({ pathname: '/(tabs)/dashboard', params: { forceUserView: 'true' } })}
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
  // Health Widget
  healthSection: {
    marginBottom: 20,
  },
  healthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  healthCard: {
    width: '48%',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    flexGrow: 1,
    flexBasis: '46%',
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  healthLabel: {
    fontSize: 11,
    color: '#8A8D98',
    marginBottom: 4,
  },
  healthValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthDetail: {
    fontSize: 10,
    color: '#5A5D68',
    marginTop: 3,
  },
  healthRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  // Signal Breakdown
  breakdownCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#8A8D98',
    marginBottom: 4,
  },
  breakdownValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
  },
  // Mini cards row
  miniRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  miniValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  miniLabel: {
    fontSize: 11,
    color: '#8A8D98',
    marginTop: 4,
  },
});

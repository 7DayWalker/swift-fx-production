import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabase';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/context/AuthContext';

interface User {
  user_id: string;
  name: string;
  email: string;
  role: 'free' | 'premium' | 'vip';
  subscription_status?: string;
  is_admin?: boolean;
  admin_role?: string;
  created_at: string;
  ai_usage_count?: number;
}

interface OverrideStatus {
  has_override: boolean;
  override: {
    tier: string;
    is_active: boolean;
    expires_at: string;
    granted_by: string;
    granted_at: string;
  } | null;
}

interface OverrideLog {
  log_id: string;
  action: string;
  performed_by: string;
  target_user: string;
  tier: string | null;
  duration_days: number | null;
  expires_at: string | null;
  timestamp: string;
}

const ROLES = ['free', 'premium', 'vip'];

export default function UserManagement() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.admin_role === 'super_admin';
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'free' | 'premium' | 'vip'>('free');
  const [isUpdating, setIsUpdating] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | 'free' | 'premium' | 'vip'>('all');

  // Override state
  const [overrideStatus, setOverrideStatus] = useState<OverrideStatus | null>(null);
  const [overrideLogs, setOverrideLogs] = useState<OverrideLog[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [isOverrideLoading, setIsOverrideLoading] = useState(false);
  const [isOverrideAction, setIsOverrideAction] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery, roleFilter]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_users');
      if (error) throw error;
      const mapped = (data || []).map((u: any) => ({
        user_id: u.user_id,
        name: u.name || u.email,
        email: u.email,
        role: u.role === 'admin' ? 'admin' : u.role,
        is_admin: u.role === 'admin',
        admin_role: u.admin_role,
        created_at: u.created_at,
      }));
      setUsers(mapped);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        user => user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query)
      );
    }
    
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }
    
    setFilteredUsers(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setSelectedRole(user.role);
    setOverrideStatus(null);
    setShowEditModal(true);
    if (isSuperAdmin) {
      fetchOverrideStatus(user.user_id);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: selectedRole })
        .eq('id', selectedUser.user_id);
      if (error) throw error;
      
      setShowEditModal(false);
      fetchUsers();
      const msg = 'User role updated successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.message || 'Failed to update user role';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'vip': return '#FFD700';
      case 'premium': return '#00D4AA';
      default: return '#8A8D98';
    }
  };

  // Override functions (SUPER_ADMIN only)
  const fetchOverrideStatus = async (userId: string) => {
    setIsOverrideLoading(true);
    try {
      const { data } = await api.get(`/admin/override-status/${userId}`);
      setOverrideStatus(data);
    } catch (err) {
      console.error('Failed to fetch override status:', err);
      setOverrideStatus(null);
    } finally {
      setIsOverrideLoading(false);
    }
  };

  const handleGrantOverride = async (tier: string, days: number) => {
    if (!selectedUser) return;
    setIsOverrideAction(true);
    try {
      await api.post('/admin/override-subscription', {
        user_id: selectedUser.user_id,
        tier,
        duration_days: days,
      });
      const msg = `Override granted: ${tier.toUpperCase()} for ${days} days`;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
      fetchOverrideStatus(selectedUser.user_id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to grant override';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsOverrideAction(false);
    }
  };

  const handleRevokeOverride = async () => {
    if (!selectedUser) return;
    setIsOverrideAction(true);
    try {
      await api.post('/admin/revoke-override', { user_id: selectedUser.user_id });
      const msg = 'Override revoked successfully';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
      fetchOverrideStatus(selectedUser.user_id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to revoke override';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    } finally {
      setIsOverrideAction(false);
    }
  };

  const fetchOverrideLogs = async () => {
    if (!selectedUser) return;
    try {
      const { data } = await api.get(`/admin/override-logs/${selectedUser.user_id}`);
      setOverrideLogs(data.logs || []);
      setShowLogsModal(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to fetch logs';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  const getStats = () => {
    const free = users.filter(u => u.role === 'free').length;
    const premium = users.filter(u => u.role === 'premium').length;
    const vip = users.filter(u => u.role === 'vip').length;
    return { free, premium, vip, total: users.length };
  };

  const stats = getStats();

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userCard} onPress={() => openEditModal(item)}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{item.name}</Text>
          {item.is_admin && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#FFD700" />
            </View>
          )}
        </View>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userDate}>
          Joined {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.userRight}>
        <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(item.role)}20` }]}>
          <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
            {item.role?.toUpperCase()}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#8A8D98" style={{ marginTop: 8 }} />
      </View>
    </TouchableOpacity>
  );

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
        <Text style={styles.title}>User Management</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#8A8D98' }]}>{stats.free}</Text>
          <Text style={styles.statLabel}>Free</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#00D4AA' }]}>{stats.premium}</Text>
          <Text style={styles.statLabel}>Premium</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FFD700' }]}>{stats.vip}</Text>
          <Text style={styles.statLabel}>VIP</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#8A8D98" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email"
            placeholderTextColor="#8A8D98"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#8A8D98" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Role Filter */}
      <View style={styles.filterContainer}>
        {['all', 'free', 'premium', 'vip'].map((role) => (
          <TouchableOpacity
            key={role}
            style={[styles.filterButton, roleFilter === role && styles.filterButtonActive]}
            onPress={() => setRoleFilter(role as any)}
          >
            <Text style={[styles.filterText, roleFilter === role && styles.filterTextActive]}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* User List */}
      <FlatList
        data={filteredUsers}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D4AA" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#8A8D98" />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      {/* Edit Role Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change User Role</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.modalBody}>
                <View style={styles.selectedUserInfo}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.selectedUserName}>{selectedUser.name}</Text>
                    <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Select New Role</Text>
                <View style={styles.roleOptions}>
                  {ROLES.map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOption,
                        selectedRole === role && styles.roleOptionActive,
                        selectedRole === role && { borderColor: getRoleColor(role) }
                      ]}
                      onPress={() => setSelectedRole(role as any)}
                    >
                      <View style={[styles.roleOptionIcon, { backgroundColor: `${getRoleColor(role)}20` }]}>
                        <Ionicons
                          name={role === 'vip' ? 'diamond' : role === 'premium' ? 'star' : 'person'}
                          size={24}
                          color={getRoleColor(role)}
                        />
                      </View>
                      <Text style={[styles.roleOptionText, { color: getRoleColor(role) }]}>
                        {role.toUpperCase()}
                      </Text>
                      {selectedRole === role && (
                        <Ionicons name="checkmark-circle" size={20} color={getRoleColor(role)} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.updateButton, isUpdating && styles.updateButtonDisabled]}
                  onPress={handleUpdateRole}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#0A0E17" />
                  ) : (
                    <Text style={styles.updateButtonText}>Update Role</Text>
                  )}
                </TouchableOpacity>

                {/* Subscription Override Section - SUPER_ADMIN only */}
                {isSuperAdmin && (
                  <View style={overrideStyles.section} data-testid="override-section">
                    <View style={overrideStyles.sectionHeader}>
                      <Ionicons name="shield-checkmark" size={18} color="#FF6B35" />
                      <Text style={overrideStyles.sectionTitle}>Subscription Override</Text>
                      <View style={overrideStyles.superAdminBadge}>
                        <Text style={overrideStyles.superAdminBadgeText}>SUPER ADMIN</Text>
                      </View>
                    </View>

                    {/* Current Override Status */}
                    {isOverrideLoading ? (
                      <ActivityIndicator size="small" color="#00D4AA" style={{ marginVertical: 12 }} />
                    ) : overrideStatus?.has_override ? (
                      <View style={overrideStyles.statusCard} data-testid="override-status-active">
                        <View style={overrideStyles.statusRow}>
                          <View style={overrideStyles.statusDot} />
                          <Text style={overrideStyles.statusLabel}>Active Override</Text>
                        </View>
                        <View style={overrideStyles.statusDetails}>
                          <View style={overrideStyles.statusDetail}>
                            <Text style={overrideStyles.detailLabel}>Tier</Text>
                            <View style={[overrideStyles.tierBadge, { backgroundColor: `${getRoleColor(overrideStatus.override?.tier || 'free')}20` }]}>
                              <Text style={[overrideStyles.tierBadgeText, { color: getRoleColor(overrideStatus.override?.tier || 'free') }]}>
                                {overrideStatus.override?.tier?.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <View style={overrideStyles.statusDetail}>
                            <Text style={overrideStyles.detailLabel}>Expires</Text>
                            <Text style={overrideStyles.detailValue}>
                              {overrideStatus.override?.expires_at ? formatDate(overrideStatus.override.expires_at) : 'N/A'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={overrideStyles.noOverride} data-testid="override-status-none">
                        <Text style={overrideStyles.noOverrideText}>No active override</Text>
                      </View>
                    )}

                    {/* Override Action Buttons */}
                    <View style={overrideStyles.actionRow}>
                      <TouchableOpacity
                        style={[overrideStyles.actionBtn, overrideStyles.premiumBtn]}
                        onPress={() => handleGrantOverride('premium', 7)}
                        disabled={isOverrideAction}
                        data-testid="grant-premium-btn"
                      >
                        {isOverrideAction ? <ActivityIndicator size="small" color="#0A0E17" /> : (
                          <>
                            <Ionicons name="star" size={14} color="#0A0E17" />
                            <Text style={overrideStyles.actionBtnText}>Premium 7d</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[overrideStyles.actionBtn, overrideStyles.vipBtn]}
                        onPress={() => handleGrantOverride('vip', 7)}
                        disabled={isOverrideAction}
                        data-testid="grant-vip-btn"
                      >
                        {isOverrideAction ? <ActivityIndicator size="small" color="#0A0E17" /> : (
                          <>
                            <Ionicons name="diamond" size={14} color="#0A0E17" />
                            <Text style={overrideStyles.actionBtnText}>VIP 7d</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[overrideStyles.actionBtn, overrideStyles.revokeBtn, !overrideStatus?.has_override && { opacity: 0.4 }]}
                        onPress={handleRevokeOverride}
                        disabled={isOverrideAction || !overrideStatus?.has_override}
                        data-testid="revoke-override-btn"
                      >
                        {isOverrideAction ? <ActivityIndicator size="small" color="#FF4444" /> : (
                          <>
                            <Ionicons name="close-circle" size={14} color="#FF4444" />
                            <Text style={[overrideStyles.actionBtnText, { color: '#FF4444' }]}>Revoke</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* View Audit Logs Button */}
                    <TouchableOpacity
                      style={overrideStyles.logsBtn}
                      onPress={fetchOverrideLogs}
                      data-testid="view-override-logs-btn"
                    >
                      <Ionicons name="document-text-outline" size={16} color="#8A8D98" />
                      <Text style={overrideStyles.logsBtnText}>View Override History</Text>
                      <Ionicons name="chevron-forward" size={14} color="#8A8D98" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Override Audit Logs Modal */}
      <Modal
        visible={showLogsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLogsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Override History</Text>
              <TouchableOpacity onPress={() => setShowLogsModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400, padding: 16 }}>
              {overrideLogs.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name="document-text-outline" size={48} color="#8A8D98" />
                  <Text style={{ color: '#8A8D98', marginTop: 12 }}>No override history</Text>
                </View>
              ) : (
                overrideLogs.map((log, idx) => (
                  <View key={log.log_id || idx} style={overrideStyles.logCard} data-testid={`override-log-${idx}`}>
                    <View style={overrideStyles.logHeader}>
                      <View style={[
                        overrideStyles.logActionBadge,
                        { backgroundColor: log.action === 'GRANT_OVERRIDE' ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 68, 68, 0.15)' }
                      ]}>
                        <Ionicons
                          name={log.action === 'GRANT_OVERRIDE' ? 'add-circle' : 'remove-circle'}
                          size={12}
                          color={log.action === 'GRANT_OVERRIDE' ? '#00D4AA' : '#FF4444'}
                        />
                        <Text style={[
                          overrideStyles.logActionText,
                          { color: log.action === 'GRANT_OVERRIDE' ? '#00D4AA' : '#FF4444' }
                        ]}>
                          {log.action === 'GRANT_OVERRIDE' ? 'GRANTED' : 'REVOKED'}
                        </Text>
                      </View>
                      <Text style={overrideStyles.logTimestamp}>{formatDate(log.timestamp)}</Text>
                    </View>
                    {log.tier && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <Text style={overrideStyles.logDetail}>Tier: {log.tier.toUpperCase()}</Text>
                        {log.duration_days && (
                          <Text style={overrideStyles.logDetail}>Duration: {log.duration_days}d</Text>
                        )}
                      </View>
                    )}
                    {log.expires_at && (
                      <Text style={[overrideStyles.logDetail, { marginTop: 4 }]}>
                        Expires: {formatDate(log.expires_at)}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#1A1F2E',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 10,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1F2E',
  },
  filterButtonActive: {
    backgroundColor: '#00D4AA',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8D98',
  },
  filterTextActive: {
    color: '#0A0E17',
  },
  listContent: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00D4AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  adminBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: 4,
    borderRadius: 4,
  },
  userEmail: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 2,
  },
  userDate: {
    fontSize: 10,
    color: '#8A8D98',
    marginTop: 4,
  },
  userRight: {
    alignItems: 'flex-end',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#8A8D98',
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1F2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalBody: {
    padding: 24,
  },
  selectedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0E17',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  selectedUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  selectedUserEmail: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  roleOptions: {
    gap: 12,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleOptionActive: {
    backgroundColor: 'rgba(0, 212, 170, 0.05)',
  },
  roleOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roleOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
  },
  updateButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  updateButtonDisabled: {
    opacity: 0.5,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
});

const overrideStyles = StyleSheet.create({
  section: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FF6B35',
    flex: 1,
  },
  superAdminBadge: {
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  superAdminBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  statusCard: {
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.2)',
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D4AA',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#00D4AA',
  },
  statusDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  statusDetail: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    color: '#8A8D98',
  },
  detailValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  noOverride: {
    backgroundColor: '#0A0E17',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  noOverrideText: {
    fontSize: 12,
    color: '#8A8D98',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  premiumBtn: {
    backgroundColor: '#00D4AA',
  },
  vipBtn: {
    backgroundColor: '#FFD700',
  },
  revokeBtn: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  logsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#0A0E17',
    borderRadius: 10,
  },
  logsBtnText: {
    flex: 1,
    fontSize: 13,
    color: '#8A8D98',
  },
  logCard: {
    backgroundColor: '#0A0E17',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  logActionText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  logTimestamp: {
    fontSize: 10,
    color: '#8A8D98',
  },
  logDetail: {
    fontSize: 11,
    color: '#B0B3BC',
  },
});

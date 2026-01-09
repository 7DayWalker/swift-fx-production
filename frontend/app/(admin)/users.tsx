import React, { useEffect, useState } from 'react';
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
  subscription_status?: string;
  is_admin?: boolean;
  created_at: string;
  ai_usage_count?: number;
}

const ROLES = ['free', 'premium', 'vip'];

export default function UserManagement() {
  const router = useRouter();
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

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery, roleFilter]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
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
    setShowEditModal(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    setIsUpdating(true);
    try {
      await api.put(`/admin/users/${selectedUser.user_id}/role`, null, {
        params: { role: selectedRole }
      });
      
      setShowEditModal(false);
      fetchUsers();
      const msg = 'User role updated successfully!';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Success', msg);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to update user role';
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
              </View>
            )}
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

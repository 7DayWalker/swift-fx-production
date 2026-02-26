import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

// Admin role configuration
const ADMIN_ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: '#EF4444', description: 'Full system access' },
  { value: 'signal_admin', label: 'Signal Admin', color: '#00D4AA', description: 'Signals only' },
  { value: 'fund_admin', label: 'Fund Admin', color: '#3B82F6', description: 'Fund & withdrawals' },
  { value: 'account_manager', label: 'Account Manager', color: '#F59E0B', description: 'User accounts' },
  { value: 'customer_support', label: 'Customer Support', color: '#8B5CF6', description: 'Read-only support' },
];

interface AdminUser {
  user_id: string;
  email: string;
  name: string;
  admin_role: string | null;
  admin_enabled: boolean;
  is_protected: boolean;
  created_at: string;
}

interface AdminInfo {
  user_id: string;
  admin_role: string | null;
  is_super_admin: boolean;
  permissions: Record<string, string[]>;
}

export default function AdminManagementScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [myInfo, setMyInfo] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);

  // Create admin modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('signal_admin');
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRole, setEditRole] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      // Get current admin info
      const meResponse = await api.get('/admin/rbac/me');
      setMyInfo(meResponse.data);

      // Only Super Admins can list all admins
      if (meResponse.data.is_super_admin) {
        const adminsResponse = await api.get('/admin/rbac/admins');
        setAdmins(adminsResponse.data.admins || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch admin data:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'Only Super Admins can access admin management.');
      } else {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to load admin data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleCreateAdmin = async () => {
    if (!newAdminEmail || !newAdminName || !newAdminPassword) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    try {
      setCreating(true);
      await api.post('/admin/rbac/admins', {
        email: newAdminEmail,
        name: newAdminName,
        password: newAdminPassword,
        admin_role: newAdminRole,
      });

      Alert.alert('Success', 'Admin account created successfully');
      setShowCreateModal(false);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      setNewAdminRole('signal_admin');
      fetchData(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateAdmin = async () => {
    if (!selectedAdmin) return;

    try {
      setUpdating(true);
      await api.put(`/admin/rbac/admins/${selectedAdmin.user_id}`, {
        admin_role: editRole,
        admin_enabled: editEnabled,
      });

      Alert.alert('Success', 'Admin updated successfully');
      setShowEditModal(false);
      setSelectedAdmin(null);
      fetchData(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update admin');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteAdmin = (admin: AdminUser) => {
    if (admin.is_protected) {
      Alert.alert('Protected', 'Cannot delete protected Super Admin accounts');
      return;
    }

    Alert.alert(
      'Delete Admin',
      `Are you sure you want to delete ${admin.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/admin/rbac/admins/${admin.user_id}`);
              Alert.alert('Success', 'Admin deleted successfully');
              fetchData(true);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete admin');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (admin: AdminUser) => {
    setSelectedAdmin(admin);
    setEditRole(admin.admin_role || 'signal_admin');
    setEditEnabled(admin.admin_enabled);
    setShowEditModal(true);
  };

  const getRoleConfig = (role: string | null) => {
    return ADMIN_ROLES.find((r) => r.value === role) || ADMIN_ROLES[1];
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  // Non-Super Admin view
  if (!loading && myInfo && !myInfo.is_super_admin) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, dynamicStyles.text]}>Admin Management</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color={theme.textSecondary} />
          <Text style={[styles.accessDeniedTitle, dynamicStyles.text]}>Super Admin Only</Text>
          <Text style={[styles.accessDeniedText, dynamicStyles.textSecondary]}>
            Only Super Admins can manage admin accounts and roles.
          </Text>

          {/* Show current admin's info */}
          <View style={[styles.myRoleCard, { borderColor: getRoleConfig(myInfo.admin_role).color }]}>
            <Text style={[styles.myRoleLabel, dynamicStyles.textSecondary]}>Your Role</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${getRoleConfig(myInfo.admin_role).color}20` }]}>
              <Text style={[styles.roleBadgeText, { color: getRoleConfig(myInfo.admin_role).color }]}>
                {getRoleConfig(myInfo.admin_role).label}
              </Text>
            </View>
            <Text style={[styles.roleDescription, dynamicStyles.textSecondary]}>
              {getRoleConfig(myInfo.admin_role).description}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Admin Management</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add-circle" size={28} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          {/* Role Legend */}
          <View style={[styles.legendCard, dynamicStyles.card]}>
            <Text style={[styles.legendTitle, dynamicStyles.text]}>Admin Roles</Text>
            <View style={styles.legendGrid}>
              {ADMIN_ROLES.map((role) => (
                <View key={role.value} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: role.color }]} />
                  <Text style={[styles.legendLabel, dynamicStyles.textSecondary]}>{role.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Admin List */}
          {admins.map((admin) => {
            const roleConfig = getRoleConfig(admin.admin_role);
            return (
              <View key={admin.user_id} style={[styles.adminCard, dynamicStyles.card]}>
                <View style={styles.adminHeader}>
                  <View style={styles.adminInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.adminName, dynamicStyles.text]}>{admin.name}</Text>
                      {admin.is_protected && (
                        <View style={[styles.protectedBadge, { backgroundColor: '#EF444420' }]}>
                          <Ionicons name="shield-checkmark" size={12} color="#EF4444" />
                        </View>
                      )}
                      {!admin.admin_enabled && (
                        <View style={[styles.disabledBadge, { backgroundColor: '#6B728020' }]}>
                          <Text style={styles.disabledText}>DISABLED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.adminEmail, dynamicStyles.textSecondary]}>{admin.email}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: `${roleConfig.color}20` }]}>
                    <Text style={[styles.roleBadgeText, { color: roleConfig.color }]}>{roleConfig.label}</Text>
                  </View>
                </View>

                <View style={styles.adminActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, { borderColor: theme.primary }]}
                    onPress={() => openEditModal(admin)}
                    disabled={admin.is_protected && admin.admin_role === 'super_admin'}
                  >
                    <Ionicons name="create-outline" size={16} color={theme.primary} />
                    <Text style={[styles.actionButtonText, { color: theme.primary }]}>Edit</Text>
                  </TouchableOpacity>

                  {!admin.is_protected && (
                    <TouchableOpacity
                      style={[styles.actionButton, { borderColor: '#EF4444' }]}
                      onPress={() => handleDeleteAdmin(admin)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Create Admin Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Create Admin</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Email</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="admin@swiftfx.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newAdminEmail}
                onChangeText={setNewAdminEmail}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Name</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="Admin Name"
                placeholderTextColor={theme.textSecondary}
                value={newAdminName}
                onChangeText={setNewAdminName}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Password</Text>
              <TextInput
                style={[styles.input, dynamicStyles.text, { borderColor: theme.border }]}
                placeholder="Secure password"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                value={newAdminPassword}
                onChangeText={setNewAdminPassword}
              />

              <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Role</Text>
              <View style={styles.roleOptions}>
                {ADMIN_ROLES.filter((r) => r.value !== 'super_admin').map((role) => (
                  <TouchableOpacity
                    key={role.value}
                    style={[
                      styles.roleOption,
                      { borderColor: role.color },
                      newAdminRole === role.value && { backgroundColor: `${role.color}20` },
                    ]}
                    onPress={() => setNewAdminRole(role.value)}
                  >
                    <View style={[styles.radioOuter, { borderColor: role.color }]}>
                      {newAdminRole === role.value && (
                        <View style={[styles.radioInner, { backgroundColor: role.color }]} />
                      )}
                    </View>
                    <View>
                      <Text style={[styles.roleOptionLabel, { color: role.color }]}>{role.label}</Text>
                      <Text style={[styles.roleOptionDesc, dynamicStyles.textSecondary]}>{role.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleCreateAdmin}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#0A0E17" />
                ) : (
                  <Text style={styles.submitButtonText}>Create Admin</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Admin Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, dynamicStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Edit Admin</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedAdmin && (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.editInfo}>
                  <Text style={[styles.editName, dynamicStyles.text]}>{selectedAdmin.name}</Text>
                  <Text style={[styles.editEmail, dynamicStyles.textSecondary]}>{selectedAdmin.email}</Text>
                </View>

                {!selectedAdmin.is_protected && (
                  <>
                    <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Role</Text>
                    <View style={styles.roleOptions}>
                      {ADMIN_ROLES.filter((r) => r.value !== 'super_admin').map((role) => (
                        <TouchableOpacity
                          key={role.value}
                          style={[
                            styles.roleOption,
                            { borderColor: role.color },
                            editRole === role.value && { backgroundColor: `${role.color}20` },
                          ]}
                          onPress={() => setEditRole(role.value)}
                        >
                          <View style={[styles.radioOuter, { borderColor: role.color }]}>
                            {editRole === role.value && (
                              <View style={[styles.radioInner, { backgroundColor: role.color }]} />
                            )}
                          </View>
                          <View>
                            <Text style={[styles.roleOptionLabel, { color: role.color }]}>{role.label}</Text>
                            <Text style={[styles.roleOptionDesc, dynamicStyles.textSecondary]}>{role.description}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <Text style={[styles.inputLabel, dynamicStyles.textSecondary]}>Account Status</Text>
                <View style={styles.statusOptions}>
                  <TouchableOpacity
                    style={[styles.statusOption, { borderColor: '#10B981' }, editEnabled && { backgroundColor: '#10B98120' }]}
                    onPress={() => setEditEnabled(true)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={[styles.statusOptionText, { color: '#10B981' }]}>Enabled</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusOption, { borderColor: '#EF4444' }, !editEnabled && { backgroundColor: '#EF444420' }]}
                    onPress={() => setEditEnabled(false)}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                    <Text style={[styles.statusOptionText, { color: '#EF4444' }]}>Disabled</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: theme.primary }]}
                  onPress={handleUpdateAdmin}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator color="#0A0E17" />
                  ) : (
                    <Text style={styles.submitButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  accessDeniedText: {
    fontSize: 14,
    textAlign: 'center',
  },
  myRoleCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
    width: '80%',
  },
  myRoleLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 12,
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  legendCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
  },
  adminCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  adminInfo: {
    flex: 1,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  adminName: {
    fontSize: 16,
    fontWeight: '600',
  },
  protectedBadge: {
    padding: 4,
    borderRadius: 4,
  },
  disabledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  disabledText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6B7280',
  },
  adminEmail: {
    fontSize: 12,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  adminActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  roleOptions: {
    gap: 10,
    marginBottom: 20,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  roleOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  roleOptionDesc: {
    fontSize: 11,
  },
  editInfo: {
    marginBottom: 20,
  },
  editName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  editEmail: {
    fontSize: 13,
    marginTop: 4,
  },
  statusOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statusOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '600',
  },
});

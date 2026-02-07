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
  Share,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';

// Status configurations
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#F59E0B', icon: 'time-outline' },
  completed: { label: 'Completed', color: '#10B981', icon: 'checkmark-circle' },
  expired: { label: 'Expired', color: '#6B7280', icon: 'close-circle' },
  flagged: { label: 'Flagged', color: '#EF4444', icon: 'warning' },
};

const REWARD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  locked: { label: 'Locked', color: '#6B7280' },
  pending: { label: 'Claimable', color: '#10B981' },
  applied: { label: 'Applied', color: '#3B82F6' },
  revoked: { label: 'Revoked', color: '#EF4444' },
};

interface Referral {
  referral_id: string;
  referred_name: string;
  referred_email: string;
  status: string;
  subscription_tier: string | null;
  reward_status: string;
  reward_type: string | null;
  created_at: string;
}

interface ReferralStats {
  total_referrals: number;
  successful_referrals: number;
  pending_rewards: number;
  rewards_applied: number;
  total_reward_days: number;
}

export default function ReferralScreen() {
  // GATED: Needs referrals + referral_rewards tables in Supabase
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0E17' }}>
      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.back()}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#00D4AA' }}>{'← Back'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🚧'}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>Referrals</Text>
        <Text style={{ fontSize: 15, color: '#8899AA', textAlign: 'center', lineHeight: 22 }}>This feature is under development and will be available in a future update.</Text>
      </View>
    </SafeAreaView>
  );
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const response = await api.get('/referral/my-code');
      setReferralCode(response.data.referral_code);
      setReferralLink(response.data.referral_link);
      setStats(response.data.stats);
      setReferrals(response.data.referrals || []);
    } catch (error: any) {
      console.error('Failed to fetch referral data:', error);
      Alert.alert('Error', 'Failed to load referral data');
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

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(referralCode);
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(referralLink);
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  const handleShareWhatsApp = () => {
    const message = `Join Swift FX and start your trading journey! Use my referral code: ${referralCode}\n\nSign up here: ${referralLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    Linking.openURL(whatsappUrl);
  };

  const handleShareTelegram = () => {
    const message = `Join Swift FX and start your trading journey! Use my referral code: ${referralCode}\n\nSign up here: ${referralLink}`;
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`;
    Linking.openURL(telegramUrl);
  };

  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: `Join Swift FX and start your trading journey! Use my referral code: ${referralCode}\n\nSign up here: ${referralLink}`,
        title: 'Join Swift FX',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleClaimReward = async (referralId: string) => {
    try {
      setClaiming(referralId);
      const response = await api.post(`/referral/claim-reward/${referralId}`);
      Alert.alert('🎉 Reward Claimed!', response.data.message);
      fetchData(true);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to claim reward');
    } finally {
      setClaiming(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getRewardLabel = (rewardType: string | null) => {
    if (rewardType === 'premium_14_days') return '+14 Days Premium';
    if (rewardType === 'premium_7_days') return '+7 Days Premium';
    return 'Reward';
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Referral Program</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Referral Code Card */}
        <View style={[styles.codeCard, { backgroundColor: `${theme.primary}15` }]}>
          <View style={[styles.codeIconContainer, { backgroundColor: `${theme.primary}25` }]}>
            <Ionicons name="gift" size={32} color={theme.primary} />
          </View>
          <Text style={[styles.codeLabel, dynamicStyles.textSecondary]}>Your Referral Code</Text>
          <TouchableOpacity style={styles.codeBox} onPress={handleCopyCode}>
            <Text style={[styles.codeText, { color: theme.primary }]}>{referralCode}</Text>
            <Ionicons name="copy-outline" size={20} color={theme.primary} />
          </TouchableOpacity>
          <Text style={[styles.codeHint, dynamicStyles.textSecondary]}>
            Tap to copy • Earn rewards when friends subscribe
          </Text>
        </View>

        {/* Share Buttons */}
        <View style={styles.shareSection}>
          <Text style={[styles.sectionTitle, dynamicStyles.text]}>Share via</Text>
          <View style={styles.shareButtons}>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: '#25D366' }]} onPress={handleShareWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: '#0088cc' }]} onPress={handleShareTelegram}>
              <Ionicons name="paper-plane" size={24} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>Telegram</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: theme.border }]} onPress={handleCopyLink}>
              <Ionicons name="link" size={24} color={theme.text} />
              <Text style={[styles.shareButtonText, { color: theme.text }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.primary }]} onPress={handleNativeShare}>
              <Ionicons name="share-social" size={24} color="#0A0E17" />
              <Text style={[styles.shareButtonText, { color: '#0A0E17' }]}>More</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, dynamicStyles.card]}>
              <Text style={[styles.statValue, { color: theme.primary }]}>{stats.total_referrals}</Text>
              <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Total Referrals</Text>
            </View>
            <View style={[styles.statCard, dynamicStyles.card]}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.successful_referrals}</Text>
              <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Successful</Text>
            </View>
            <View style={[styles.statCard, dynamicStyles.card]}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.pending_rewards}</Text>
              <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Pending Rewards</Text>
            </View>
            <View style={[styles.statCard, dynamicStyles.card]}>
              <Text style={[styles.statValue, { color: '#3B82F6' }]}>{stats.total_reward_days}</Text>
              <Text style={[styles.statLabel, dynamicStyles.textSecondary]}>Days Earned</Text>
            </View>
          </View>
        )}

        {/* How It Works */}
        <View style={[styles.card, dynamicStyles.card]}>
          <Text style={[styles.cardTitle, dynamicStyles.text]}>How It Works</Text>
          <View style={styles.stepsContainer}>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: `${theme.primary}20` }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, dynamicStyles.text]}>Share Your Code</Text>
                <Text style={[styles.stepDesc, dynamicStyles.textSecondary]}>Share your referral code with friends</Text>
              </View>
            </View>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: `${theme.primary}20` }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, dynamicStyles.text]}>Friend Subscribes</Text>
                <Text style={[styles.stepDesc, dynamicStyles.textSecondary]}>They sign up and subscribe to Premium or VIP</Text>
              </View>
            </View>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: `${theme.primary}20` }]}>
                <Text style={[styles.stepNumberText, { color: theme.primary }]}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, dynamicStyles.text]}>Earn Rewards</Text>
                <Text style={[styles.stepDesc, dynamicStyles.textSecondary]}>Premium: +7 days • VIP: +14 days Premium</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Referrals List */}
        <View style={[styles.card, dynamicStyles.card]}>
          <Text style={[styles.cardTitle, dynamicStyles.text]}>Your Referrals</Text>
          {referrals.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={theme.textSecondary} />
              <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>No referrals yet. Start sharing your code!</Text>
            </View>
          ) : (
            referrals.map((referral) => {
              const statusConfig = STATUS_CONFIG[referral.status] || STATUS_CONFIG.pending;
              const rewardConfig = REWARD_STATUS_CONFIG[referral.reward_status] || REWARD_STATUS_CONFIG.locked;
              const canClaim = referral.reward_status === 'pending';

              return (
                <View key={referral.referral_id} style={[styles.referralItem, { borderColor: theme.border }]}>
                  <View style={styles.referralHeader}>
                    <View style={styles.referralInfo}>
                      <Text style={[styles.referralName, dynamicStyles.text]}>{referral.referred_name}</Text>
                      <Text style={[styles.referralEmail, dynamicStyles.textSecondary]}>{referral.referred_email}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
                      <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                    </View>
                  </View>

                  <View style={styles.referralDetails}>
                    <Text style={[styles.referralDate, dynamicStyles.textSecondary]}>
                      Joined {formatDate(referral.created_at)}
                    </Text>
                    {referral.subscription_tier && (
                      <Text style={[styles.referralTier, { color: theme.primary }]}>
                        {referral.subscription_tier.toUpperCase()} Subscriber
                      </Text>
                    )}
                  </View>

                  {/* Reward Section */}
                  <View style={styles.rewardSection}>
                    <View style={[styles.rewardBadge, { backgroundColor: `${rewardConfig.color}15` }]}>
                      <Text style={[styles.rewardLabel, { color: rewardConfig.color }]}>
                        {rewardConfig.label}
                      </Text>
                      {referral.reward_type && (
                        <Text style={[styles.rewardType, { color: rewardConfig.color }]}>
                          {getRewardLabel(referral.reward_type)}
                        </Text>
                      )}
                    </View>

                    {canClaim && (
                      <TouchableOpacity
                        style={[styles.claimButton, { backgroundColor: '#10B981' }]}
                        onPress={() => handleClaimReward(referral.referral_id)}
                        disabled={claiming === referral.referral_id}
                      >
                        {claiming === referral.referral_id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="gift" size={16} color="#FFFFFF" />
                            <Text style={styles.claimButtonText}>Claim</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Terms Notice */}
        <View style={[styles.termsCard, { backgroundColor: `${theme.border}30` }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.termsText, dynamicStyles.textSecondary]}>
            Referral rewards unlock 7 days after your friend subscribes. Referrals expire after 30 days if no subscription.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  codeCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 14,
    marginBottom: 12,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  codeText: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  codeHint: {
    fontSize: 12,
    marginTop: 12,
  },
  shareSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  shareButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    flex: 1,
    minWidth: '45%',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  stepsContainer: {
    gap: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  referralItem: {
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 15,
    fontWeight: '600',
  },
  referralEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  referralDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  referralDate: {
    fontSize: 12,
  },
  referralTier: {
    fontSize: 11,
    fontWeight: '600',
  },
  rewardSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rewardLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  rewardType: {
    fontSize: 10,
    marginTop: 2,
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  termsText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
});

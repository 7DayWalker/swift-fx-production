import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_xp: number;
  rank: number;
}

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myXp, setMyXp] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await api.get('/academy/leaderboard');
      setLeaderboard(data.leaderboard || []);
      setMyRank(data.my_rank);
      setMyXp(data.my_xp || 0);
    } catch { }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchLeaderboard(); }, [fetchLeaderboard]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeaderboard();
    setRefreshing(false);
  };

  const getTrophyColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return theme.textSecondary;
  };

  const getTrophyIcon = (rank: number): string => {
    if (rank <= 3) return 'trophy';
    return 'medal-outline';
  };

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* My Rank Card */}
        <View style={[styles.myRankCard, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="leaderboard-my-rank">
          <Ionicons name="person" size={20} color="#FFD700" />
          <View style={styles.myRankInfo}>
            <Text style={[styles.myRankLabel, { color: theme.textSecondary }]}>Your Rank</Text>
            <Text style={[styles.myRankValue, { color: theme.text }]}>
              {myRank ? `#${myRank}` : 'Unranked'}
            </Text>
          </View>
          <View style={styles.myRankDivider} />
          <View style={styles.myRankInfo}>
            <Text style={[styles.myRankLabel, { color: theme.textSecondary }]}>Total XP</Text>
            <Text style={[styles.myRankValue, { color: '#FFD700' }]}>{myXp}</Text>
          </View>
        </View>

        {/* Top 3 Podium */}
        {top3.length > 0 && (
          <View style={styles.podiumSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Top Learners</Text>
            <View style={styles.podium}>
              {[1, 0, 2].map((idx) => {
                const entry = top3[idx];
                if (!entry) return <View key={idx} style={styles.podiumSlot} />;
                const isFirst = idx === 0;
                return (
                  <View key={entry.user_id} style={[styles.podiumSlot, isFirst && styles.podiumFirst]}>
                    <View style={[styles.podiumAvatar, { backgroundColor: `${getTrophyColor(entry.rank)}30`, borderColor: getTrophyColor(entry.rank) }]}>
                      <Ionicons name={getTrophyIcon(entry.rank) as any} size={isFirst ? 28 : 22} color={getTrophyColor(entry.rank)} />
                    </View>
                    <Text style={[styles.podiumRank, { color: getTrophyColor(entry.rank) }]}>#{entry.rank}</Text>
                    <Text style={[styles.podiumName, { color: theme.text }]} numberOfLines={1}>
                      {entry.display_name}
                    </Text>
                    <Text style={[styles.podiumXp, { color: theme.textSecondary }]}>{entry.total_xp} XP</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Rest of Rankings */}
        {rest.length > 0 && (
          <View style={styles.listSection}>
            <Text style={[styles.sectionTitle, { color: theme.text, paddingHorizontal: 16 }]}>Rankings</Text>
            {rest.map((entry) => (
              <View key={entry.user_id} style={[styles.rankRow, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid={`leaderboard-rank-${entry.rank}`}>
                <Text style={[styles.rankNum, { color: theme.textSecondary }]}>{entry.rank}</Text>
                <View style={[styles.rankAvatar, { backgroundColor: `${theme.primary}20` }]}>
                  <Ionicons name="person-outline" size={18} color={theme.primary} />
                </View>
                <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>{entry.display_name}</Text>
                <Text style={[styles.rankXp, { color: '#FFD700' }]}>{entry.total_xp} XP</Text>
              </View>
            ))}
          </View>
        )}

        {loading && leaderboard.length === 0 && (
          <View style={styles.emptyState}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.skeleton, { backgroundColor: theme.surface }]} />
            ))}
          </View>
        )}

        {!loading && leaderboard.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Rankings Yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Complete quizzes to earn XP and climb the leaderboard!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  myRankCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
  myRankInfo: { flex: 1, alignItems: 'center' },
  myRankLabel: { fontSize: 12, marginBottom: 4 },
  myRankValue: { fontSize: 22, fontWeight: 'bold' },
  myRankDivider: { width: 1, height: 32, backgroundColor: '#2A2F3E', marginHorizontal: 8 },
  podiumSection: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' },
  podiumSlot: { flex: 1, alignItems: 'center', paddingTop: 16 },
  podiumFirst: { marginTop: -16 },
  podiumAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 8 },
  podiumRank: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  podiumName: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 2, maxWidth: 90 },
  podiumXp: { fontSize: 12 },
  listSection: { marginBottom: 24 },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  rankNum: { fontSize: 14, fontWeight: 'bold', width: 30, textAlign: 'center' },
  rankAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rankName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rankXp: { fontSize: 14, fontWeight: 'bold' },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  skeleton: { height: 56, borderRadius: 12, marginHorizontal: 16, marginBottom: 8 },
});

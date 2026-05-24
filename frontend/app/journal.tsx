import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import api from '../src/services/api';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';

type JournalType = 'signal' | 'manual';
type JournalDirection = 'buy' | 'sell';

type JournalEntry = {
  journal_id: string;
  type: JournalType;
  symbol: string;
  direction: JournalDirection;
  entry?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number | null;
  tp3?: number | null;
  notes?: string | null;
  emotions?: string | null;
  confidence?: number | null;
  // signal snapshot fields
  source_signal_id?: string;
  pips?: number | null;
  rr?: number | null;
  outcome?: string | null;
  // manual fields
  analysis?: string | null;
  screenshot_base64?: string | null;
  timestamp?: string;
  created_at?: string;
};

type JournalStats = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pips: number;
};

export default function JournalScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);

  // Manual create form (V1 minimal)
  const [typeMode, setTypeMode] = useState<JournalType>('manual');
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<JournalDirection>('buy');
  const [entry, setEntry] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [tp1, setTp1] = useState<string>('');
  const [tp2, setTp2] = useState<string>('');
  const [tp3, setTp3] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [confidence, setConfidence] = useState<string>('');
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const canSubmitManual = useMemo(() => {
    const symOk = symbol.trim().length > 0;
    const nums = [entry, stopLoss, tp1].every((v) => {
      const n = Number(v);
      return Number.isFinite(n) && !Number.isNaN(n);
    });
    return symOk && nums;
  }, [symbol, entry, stopLoss, tp1]);

  const fetchJournal = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/journal/list'),
        api.get('/journal/stats'),
      ]);

      setEntries((listRes.data?.entries as JournalEntry[]) || []);
      setStats((statsRes.data as JournalStats) || null);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to load journal';
      Alert.alert('Journal Error', detail);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  const onRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await fetchJournal();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getNumberOrNull = (s: string): number | null => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || Number.isNaN(n)) return null;
    return n;
  };

  const pickScreenshot = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      Alert.alert('Permission Required', 'Allow photo library access to upload a screenshot.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      base64: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      setScreenshot(result.assets[0]);
    }
  };

  const submitManual = async () => {
    if (!user) return;

    if (!canSubmitManual) {
      Alert.alert('Missing fields', 'Symbol, Entry, Stop Loss and TP1 are required.');
      return;
    }

    try {
      const form = new FormData();
      form.append('symbol', symbol.trim());
      form.append('direction', direction);
      form.append('entry', String(Number(entry)));
      form.append('stop_loss', String(Number(stopLoss)));
      form.append('tp1', String(Number(tp1)));

      const tp2Num = getNumberOrNull(tp2);
      const tp3Num = getNumberOrNull(tp3);
      if (tp2Num !== null) form.append('tp2', String(tp2Num));
      if (tp3Num !== null) form.append('tp3', String(tp3Num));

      if (notes.trim().length > 0) form.append('notes', notes.trim());
      if (analysis.trim().length > 0) form.append('analysis', analysis.trim());
      if (confidence.trim().length > 0) form.append('confidence', String(Number(confidence)));

      if (screenshot?.uri) {
        // RN FormData file shape
        const fileName = screenshot.fileName || `screenshot-${Date.now()}.jpg`;
        const fileType = screenshot.type || 'image/jpeg';
        form.append('screenshot', {
          uri: screenshot.uri,
          name: fileName,
          type: fileType,
        } as any);
      }

      await api.post('/journal/manual', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('Saved', 'Manual journal entry created.');
      // Reset minimal fields
      setSymbol('');
      setEntry('');
      setStopLoss('');
      setTp1('');
      setTp2('');
      setTp3('');
      setNotes('');
      setAnalysis('');
      setConfidence('');
      setScreenshot(null);

      await fetchJournal();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to create manual journal entry';
      Alert.alert('Journal Error', detail);
    }
  };

  const winRateText = stats ? `${stats.win_rate}%` : '0%';

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Journal</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Stats */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Basic Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.text }]}>
                {stats?.total_trades ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Trades</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.success }]}>{stats?.wins ?? 0}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Wins</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.error }]}>{stats?.losses ?? 0}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Losses</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.primary }]}>{winRateText}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Win Rate</Text>
            </View>
            <View style={styles.statBox}>
              <Text
                style={[
                  styles.statValue,
                  { color: (stats?.total_pips ?? 0) >= 0 ? theme.success : theme.error },
                ]}
              >
                {(stats?.total_pips ?? 0) >= 0 ? '+' : ''}
                {stats?.total_pips ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Pips</Text>
            </View>
          </View>
        </View>

        {/* Manual create */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 14 }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Manual Trade Analysis (V1)</Text>

          <View style={styles.segmentRow}>
            <TouchableOpacity
              style={[
                styles.segment,
                typeMode === 'manual' && { backgroundColor: `${theme.primary}33`, borderColor: `${theme.primary}66` },
              ]}
              onPress={() => setTypeMode('manual')}
            >
              <Text style={[styles.segmentText, typeMode === 'manual' && { color: theme.primary }]}>Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                { opacity: 0.5, borderColor: theme.border },
              ]}
              disabled
              onPress={() => Alert.alert('Signal Journal', 'Use “Add To Journal” on a closed signal.')}
            >
              <Text style={styles.segmentText}>Signal</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGrid}>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="Symbol (e.g. EUR/USD)"
              placeholderTextColor={theme.textSecondary}
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
            />

            <View style={styles.row2}>
              <TouchableOpacity
                style={[
                  styles.dirBtn,
                  direction === 'buy' && { backgroundColor: `${theme.success}22`, borderColor: theme.success },
                ]}
                onPress={() => setDirection('buy')}
              >
                <Text style={[styles.dirBtnText, direction === 'buy' && { color: theme.success }]}>BUY</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dirBtn,
                  direction === 'sell' && { backgroundColor: `${theme.error}22`, borderColor: theme.error },
                ]}
                onPress={() => setDirection('sell')}
              >
                <Text style={[styles.dirBtnText, direction === 'sell' && { color: theme.error }]}>SELL</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="Entry"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={entry}
              onChangeText={setEntry}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="Stop Loss"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={stopLoss}
              onChangeText={setStopLoss}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="TP1"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={tp1}
              onChangeText={setTp1}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="TP2 (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={tp2}
              onChangeText={setTp2}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="TP3 (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={tp3}
              onChangeText={setTp3}
            />
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="Confidence (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={confidence}
              onChangeText={setConfidence}
            />
            <TextInput
              style={[styles.textArea, { borderColor: theme.border, color: theme.text }]}
              placeholder="Notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <TextInput
              style={[styles.textArea, { borderColor: theme.border, color: theme.text }]}
              placeholder="Analysis (optional)"
              placeholderTextColor={theme.textSecondary}
              value={analysis}
              onChangeText={setAnalysis}
              multiline
            />

            <TouchableOpacity style={[styles.uploadBtn, { borderColor: theme.border }]} onPress={pickScreenshot}>
              <Ionicons name="image-outline" size={18} color={theme.primary} />
              <Text style={[styles.uploadBtnText, { color: theme.primary }]}>
                {screenshot ? 'Screenshot Selected' : 'Add Screenshot (optional)'}
              </Text>
            </TouchableOpacity>

            {screenshot?.uri ? (
              <View style={[styles.previewWrap, { borderColor: theme.border }]}>
                <Image source={{ uri: screenshot.uri }} style={styles.previewImg} resizeMode="cover" />
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: canSubmitManual ? theme.primary : `${theme.primary}44`,
                },
              ]}
              onPress={submitManual}
              disabled={!canSubmitManual}
            >
              <Text style={[styles.submitBtnText, { color: canSubmitManual ? '#0A0E17' : theme.textSecondary }]}>Save Manual Entry</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Entries list */}
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 8 }]}>Your Journal Entries</Text>

          {entries.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No entries yet</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Tap “Add To Journal” on a closed signal to create signal entries.
              </Text>
            </View>
          ) : (
            entries.map((e) => {
              const pips = e.pips ?? null;
              const pipsColor = pips === null ? theme.textSecondary : pips >= 0 ? theme.success : theme.error;

              const dateStr = (e.timestamp ?? e.created_at ?? '');

              return (
                <View key={e.journal_id} style={[styles.entryCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <View style={styles.entryTop}>
                    <View>
                      <Text style={[styles.entrySymbol, { color: theme.text }]}>{e.symbol}</Text>
                      <Text style={[styles.entryMeta, { color: theme.textSecondary }]}>
                        {e.type.toUpperCase()} • {e.direction.toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.outcomePill, { borderColor: theme.border }]}>
                      <Text style={[styles.outcomePillText, { color: pipsColor }]}>
                        {pips === null || pips === undefined ? '—' : `${pips >= 0 ? '+' : ''}${pips} pips`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.entryFields}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Entry</Text>
                    <Text style={[styles.fieldValue, { color: theme.text }]}>{e.entry ?? '—'}</Text>

                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>SL</Text>
                    <Text style={[styles.fieldValue, { color: theme.error }]}>{e.stop_loss ?? '—'}</Text>

                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>TP1</Text>
                    <Text style={[styles.fieldValue, { color: theme.success }]}>{e.tp1 ?? '—'}</Text>
                  </View>

                  {e.notes ? <Text style={[styles.notes, { color: theme.textSecondary }]} numberOfLines={2}>Notes: {e.notes}</Text> : null}

                  {e.type === 'manual' && e.analysis ? (
                    <Text style={[styles.notes, { color: theme.textSecondary }]} numberOfLines={2}>Analysis: {e.analysis}</Text>
                  ) : null}

                  {e.screenshot_base64 ? (
                    <View style={[styles.previewWrap, { borderColor: theme.border, marginTop: 10 }]}>
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${e.screenshot_base64}` }}
                        style={styles.previewImg}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}

                  <Text style={[styles.entryDate, { color: theme.textSecondary }]}>
                    {dateStr ? `Saved: ${dateStr}` : `Saved: ${e.created_at ?? ''}`}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  backBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '900', marginBottom: 10 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  segmentRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  segment: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  segmentText: { fontWeight: '900' },

  formGrid: { gap: 10 },
  row2: { flexDirection: 'row', gap: 10 },
  dirBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  dirBtnText: { fontWeight: '900' },

  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },

  uploadBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploadBtnText: { fontWeight: '800' },

  previewWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  previewImg: { width: '100%', height: 140 },

  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  submitBtnText: { fontWeight: '900', fontSize: 14 },

  empty: {
    marginHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  emptyTitle: { fontWeight: '900', fontSize: 16 },
  emptyText: { marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 18 },

  entryCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  entrySymbol: { fontSize: 16, fontWeight: '900' },
  entryMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  outcomePill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  outcomePillText: { fontWeight: '900' },

  entryFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', width: 60 },
  fieldValue: { fontSize: 13, fontWeight: '900' },

  notes: { marginTop: 10, fontSize: 12, fontWeight: '600' },

  entryDate: { marginTop: 10, fontSize: 12, fontWeight: '600' },
});

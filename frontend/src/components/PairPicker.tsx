import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PAIR_CATEGORIES, PRIORITY_PAIRS } from '../constants/tradingPairs';

interface PairPickerProps {
  selected: string;
  onSelect: (pair: string) => void;
  theme: any;
}

export const PairPicker = ({ selected, onSelect, theme }: PairPickerProps) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const toggleCategory = (name: string) => {
    setExpandedCategory(prev => (prev === name ? null : name));
  };

  return (
    <View style={[st.container, { backgroundColor: theme.surface, borderColor: theme.border }]} data-testid="pair-picker">
      {/* Priority Quick Access Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.quickRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
        {PRIORITY_PAIRS.map(p => (
          <TouchableOpacity
            key={p}
            style={[st.quickChip, selected === p && { backgroundColor: theme.primary, borderColor: theme.primary }]}
            onPress={() => onSelect(p)}
          >
            <Text style={[st.quickChipText, { color: theme.textSecondary }, selected === p && { color: '#0A0E17' }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category Sections */}
      {PAIR_CATEGORIES.map(cat => {
        const isExpanded = expandedCategory === cat.name;
        const hasSelected = cat.pairs.some(p => p.symbol === selected);
        return (
          <View key={cat.name}>
            <TouchableOpacity
              style={[st.categoryHeader, hasSelected && !isExpanded && { borderLeftColor: theme.primary, borderLeftWidth: 2 }]}
              onPress={() => toggleCategory(cat.name)}
              activeOpacity={0.7}
            >
              <Ionicons name={cat.icon as any} size={16} color={hasSelected ? theme.primary : theme.textSecondary} />
              <Text style={[st.categoryName, { color: theme.text }]}>{cat.name}</Text>
              <Text style={[st.categoryCount, { color: theme.textSecondary }]}>{cat.pairs.length}</Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
            </TouchableOpacity>
            {isExpanded && (
              <View style={st.pairGrid}>
                {cat.pairs.map(pair => (
                  <TouchableOpacity
                    key={pair.symbol}
                    style={[
                      st.pairChip,
                      { backgroundColor: theme.background, borderColor: theme.border },
                      selected === pair.symbol && { backgroundColor: `${theme.primary}20`, borderColor: theme.primary },
                    ]}
                    onPress={() => { onSelect(pair.symbol); setExpandedCategory(null); }}
                  >
                    <Text style={[st.pairSymbol, { color: theme.text }, selected === pair.symbol && { color: theme.primary }]}>
                      {pair.symbol}
                    </Text>
                    {pair.label && (
                      <Text style={[st.pairLabel, { color: theme.textSecondary }]}>{pair.label}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const st = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  quickRow: { paddingVertical: 10, paddingHorizontal: 10 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    backgroundColor: '#1A1F2E',
  },
  quickChipText: { fontSize: 12, fontWeight: '700' },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1A1F2E',
  },
  categoryName: { fontSize: 13, fontWeight: '700', flex: 1 },
  categoryCount: { fontSize: 11, marginRight: 4 },
  pairGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingBottom: 10, gap: 6 },
  pairChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minWidth: 72, alignItems: 'center' },
  pairSymbol: { fontSize: 12, fontWeight: '700' },
  pairLabel: { fontSize: 9, marginTop: 1 },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

interface GuestUpgradePromptProps {
  icon: keyof typeof Ionicons.glyphMap | string;
  title: string;
  description: string;
  buttonLabel: string;
}

const GUEST_FLAG_KEY = 'swiftfx_guest';

export default function GuestUpgradePrompt({
  icon,
  title,
  description,
  buttonLabel,
}: GuestUpgradePromptProps) {
  const router = useRouter();
  const { theme } = useTheme();

  const onPress = async () => {
    // Guest users are NOT authenticated users.
    // Convert user by clearing guest mode locally, then route to auth login.
    try {
      await AsyncStorage.removeItem(GUEST_FLAG_KEY);
    } catch {
      // fail-closed: routing still should proceed
    }
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.primary}15` }]}>
          <Ionicons name={icon as any} size={22} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      </View>

      <Text style={[styles.desc, { color: theme.textSecondary }]}>{description}</Text>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: theme.primary }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        testID="guest-upgrade-cta"
      >
        <Text style={[styles.ctaText, { color: '#0A0E17' }]}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
  },
});

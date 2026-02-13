import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../context/SubscriptionContext';
import { useTheme } from '../context/ThemeContext';

// Color palette for subscription tiers
const TIER_COLORS = {
  free: {
    bg: 'rgba(107, 114, 128, 0.15)', // subtle grey
    text: '#9CA3AF',
    border: 'rgba(107, 114, 128, 0.3)',
  },
  premium: {
    bg: 'rgba(217, 119, 6, 0.12)', // subtle amber/gold
    text: '#D97706',
    border: 'rgba(217, 119, 6, 0.25)',
  },
  vip: {
    bg: 'rgba(124, 58, 237, 0.12)', // subtle deep purple
    text: '#8B5CF6',
    border: 'rgba(124, 58, 237, 0.25)',
  },
};

interface SubscriptionBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  onPress?: () => void;
  variant?: 'default' | 'minimal'; // minimal = text only, very subtle
}

export function SubscriptionBadge({ 
  size = 'medium', 
  showIcon = true,
  onPress,
  variant = 'default',
}: SubscriptionBadgeProps) {
  const { status, getPlanDisplayName, isLoading } = useSubscription();
  const { theme } = useTheme();

  if (isLoading || !status) {
    return (
      <View style={[styles.badge, styles[`badge_${size}`], { backgroundColor: TIER_COLORS.free.bg }]}>
        <Text style={[styles.badgeText, styles[`text_${size}`], { color: TIER_COLORS.free.text }]}>
          ...
        </Text>
      </View>
    );
  }

  const tier = status.subscription || 'free';
  const colors = TIER_COLORS[tier] || TIER_COLORS.free;
  const planName = getPlanDisplayName();

  const getIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (tier) {
      case 'vip':
        return 'diamond-outline';
      case 'premium':
        return 'star-outline';
      case 'free':
      default:
        return 'person-outline';
    }
  };

  // Minimal variant - just text, very subtle
  if (variant === 'minimal') {
    const minimalContent = (
      <View style={[styles.minimalBadge, { borderColor: colors.border }]}>
        <Text style={[styles.minimalText, styles[`text_${size}`], { color: colors.text }]}>
          {planName}
        </Text>
      </View>
    );

    if (onPress) {
      return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          {minimalContent}
        </TouchableOpacity>
      );
    }
    return minimalContent;
  }

  // Default variant - subtle pill badge
  const content = (
    <View style={[
      styles.badge, 
      styles[`badge_${size}`], 
      { 
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
      }
    ]}>
      {showIcon && (
        <Ionicons 
          name={getIcon()} 
          size={size === 'small' ? 10 : size === 'medium' ? 12 : 14} 
          color={colors.text} 
          style={styles.icon}
        />
      )}
      <Text style={[styles.badgeText, styles[`text_${size}`], { color: colors.text }]}>
        {planName}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// Full subscription card for profile/settings screen
interface SubscriptionCardProps {
  onUpgradePress?: () => void;
}

export function SubscriptionCard({ onUpgradePress }: SubscriptionCardProps) {
  const { status, getPlanBadgeColor, isLoading } = useSubscription();
  const { theme } = useTheme();

  if (isLoading || !status) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Loading subscription...</Text>
      </View>
    );
  }

  const badgeColor = getPlanBadgeColor();
  const isExpiring = status.subscription_expiry && new Date(status.subscription_expiry) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: badgeColor, borderWidth: 2 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Current Plan</Text>
          <SubscriptionBadge size="medium" />
        </View>
        {status.subscription !== 'vip' && onUpgradePress && (
          <TouchableOpacity 
            style={[styles.upgradeButton, { backgroundColor: '#10B981' }]}
            onPress={onUpgradePress}
          >
            <Ionicons name="arrow-up-circle" size={16} color="#FFFFFF" />
            <Text style={styles.upgradeText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.featuresList}>
        <FeatureRow 
          icon="pulse" 
          label="Signal Access" 
          value={status.features.signals_access.toUpperCase()} 
          theme={theme}
        />
        <FeatureRow 
          icon="analytics" 
          label="AI Analyzer" 
          value={`${status.features.ai_used}/${status.features.ai_limit === 'unlimited' ? '∞' : status.features.ai_limit}`} 
          theme={theme}
          warning={status.features.ai_limit_reached}
        />
        <FeatureRow 
          icon="briefcase" 
          label="Fund Management" 
          value={status.features.fund_management ? '✓' : '✗'} 
          theme={theme}
          enabled={status.features.fund_management}
        />
        <FeatureRow 
          icon="school" 
          label="Academy" 
          value={status.features.academy ? '✓' : '✗'} 
          theme={theme}
          enabled={status.features.academy}
        />
      </View>

      {status.subscription_expiry && (
        <View style={[styles.expiryRow, isExpiring && { backgroundColor: '#FEF3C7' }]}>
          <Ionicons 
            name={isExpiring ? 'warning' : 'calendar'} 
            size={16} 
            color={isExpiring ? '#D97706' : theme.textSecondary} 
          />
          <Text style={[
            styles.expiryText, 
            { color: isExpiring ? '#D97706' : theme.textSecondary }
          ]}>
            {isExpiring ? 'Expiring soon: ' : 'Expires: '}
            {new Date(status.subscription_expiry).toLocaleDateString()}
          </Text>
        </View>
      )}
    </View>
  );
}

function FeatureRow({ 
  icon, 
  label, 
  value, 
  theme, 
  enabled = true,
  warning = false 
}: { 
  icon: string; 
  label: string; 
  value: string; 
  theme: any;
  enabled?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureLabel}>
        <Ionicons 
          name={icon as any} 
          size={16} 
          color={enabled ? theme.primary : theme.textSecondary} 
        />
        <Text style={[
          styles.featureLabelText, 
          { color: enabled ? theme.text : theme.textSecondary }
        ]}>
          {label}
        </Text>
      </View>
      <Text style={[
        styles.featureValue, 
        { 
          color: warning ? '#EF4444' : enabled ? theme.primary : theme.textSecondary,
          fontWeight: warning ? '700' : '600'
        }
      ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Badge styles
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badge_small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badge_medium: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badge_large: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  icon: {
    marginRight: 4,
  },
  badgeText: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  text_small: {
    fontSize: 10,
  },
  text_medium: {
    fontSize: 11,
  },
  text_large: {
    fontSize: 13,
  },
  // Minimal variant styles
  minimalBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  minimalText: {
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Card styles
  card: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  upgradeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  featuresList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featureLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureLabelText: {
    fontSize: 14,
  },
  featureValue: {
    fontSize: 14,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
  },
  expiryText: {
    fontSize: 13,
  },
});

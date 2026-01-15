import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

// Broker data with referral links and official logos
const BROKERS = [
  {
    id: 'octafx',
    name: 'OctaFX',
    tagline: 'Simple trading with low spreads',
    highlights: [
      'Low spreads on major FX pairs',
      'Fast deposits & withdrawals',
      'MT4 / MT5 support',
      'Beginner-friendly interface',
    ],
    markets: ['Forex', 'Metals', 'Indices', 'Crypto'],
    color: '#0066CC',
    logoUrl: 'https://play-lh.googleusercontent.com/OqX1f5qKkWzZZPVVMxjSHBl5YFgEtjZFHxM0dXZc_BZX0g7lOlYjdAaJAu9VJN5FXg=w240-h480-rw',
    link: 'https://octa.click/bsNt11QX2CK?ib=9832496',
  },
  {
    id: 'fbs',
    name: 'FBS',
    tagline: 'Flexible accounts for all trader levels',
    highlights: [
      'Multiple account types',
      'High leverage options',
      'Educational tools & bonuses',
      'Strong global presence',
    ],
    markets: ['Forex', 'Stocks', 'Metals', 'Energies'],
    color: '#00C853',
    logoUrl: 'https://play-lh.googleusercontent.com/mIptQzg1ZqW0sUxQmq4e8F1kdVdTxg7jOaS5h-lIhjBjJxXNlMlUPvxF_UqYAKHVUQ=w240-h480-rw',
    link: 'https://fbs.partners?ibl=689161&ibp=9609491',
  },
  {
    id: 'xm',
    name: 'XM',
    tagline: 'Trusted global broker with tight execution',
    highlights: [
      'Regulated & globally recognized',
      'Tight spreads & fast execution',
      'Forex, indices, metals, crypto',
      'Excellent platform stability',
    ],
    markets: ['Forex', 'Indices', 'Metals', 'Crypto'],
    color: '#E31E24',
    logoUrl: 'https://play-lh.googleusercontent.com/V9bXj0K3Nl-93dKKrJMWlJ0Ygb5pL2g5H-D7rZ6dXDY5yt0I_UxIqAMmzFDkVQoFZg=w240-h480-rw',
    link: 'https://clicks.pipaffiliates.com/c?c=909395&l=en&p=1',
  },
  {
    id: 'exness',
    name: 'Exness',
    tagline: 'Professional trading with deep liquidity',
    highlights: [
      'Very low spreads',
      'Fast execution',
      'Flexible leverage',
      'Advanced trading conditions',
    ],
    markets: ['Forex', 'Metals', 'Crypto', 'Indices'],
    color: '#FFD700',
    logoUrl: 'https://play-lh.googleusercontent.com/7PjXxKCHRFx2-5CX5-fZb5bRqM0WdvvQH0g0kwDc5XFHCH8kMXx3X8fLq5t-fAJRew=w240-h480-rw',
    link: 'https://one.exnessonelink.com/a/xylvtcuik1',
  },
];

// Broker Logo Component with fallback
const BrokerLogo = ({ broker, size = 52 }: { broker: typeof BROKERS[0], size?: number }) => {
  const [imageError, setImageError] = useState(false);
  
  if (imageError || !broker.logoUrl) {
    // Fallback to letter-based logo
    return (
      <View style={[styles.brokerLogoFallback, { 
        width: size, 
        height: size, 
        borderRadius: size * 0.27,
        backgroundColor: `${broker.color}20` 
      }]}>
        <Text style={[styles.brokerLogoText, { color: broker.color, fontSize: size * 0.46 }]}>
          {broker.name.charAt(0)}
        </Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.brokerLogoContainer, { 
      width: size, 
      height: size, 
      borderRadius: size * 0.27,
    }]}>
      <Image
        source={{ uri: broker.logoUrl }}
        style={[styles.brokerLogoImage, { 
          width: size, 
          height: size, 
          borderRadius: size * 0.27,
        }]}
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
    </View>
  );
};

export default function RecommendedBrokersScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const handleVisitBroker = async (link: string, brokerName: string) => {
    try {
      const supported = await Linking.canOpenURL(link);
      if (supported) {
        await Linking.openURL(link);
      } else {
        console.error(`Cannot open URL: ${link}`);
      }
    } catch (error) {
      console.error(`Error opening ${brokerName} link:`, error);
    }
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Recommended Brokers</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro Section */}
        <View style={[styles.introCard, { backgroundColor: `${theme.primary}10` }]}>
          <View style={[styles.introIconContainer, { backgroundColor: `${theme.primary}20` }]}>
            <Ionicons name="shield-checkmark" size={28} color={theme.primary} />
          </View>
          <Text style={[styles.introTitle, dynamicStyles.text]}>Trusted Partners</Text>
          <Text style={[styles.introText, dynamicStyles.textSecondary]}>
            We've partnered with reputable brokers known for reliability, competitive spreads, and quality service. Choose a broker that fits your trading style.
          </Text>
        </View>

        {/* Broker Cards */}
        {BROKERS.map((broker) => {
          return (
            <View key={broker.id} style={[styles.brokerCard, dynamicStyles.card]}>
              {/* Broker Header */}
              <View style={styles.brokerHeader}>
                <BrokerLogo broker={broker} size={52} />
                <View style={styles.brokerInfo}>
                  <Text style={[styles.brokerName, dynamicStyles.text]}>{broker.name}</Text>
                  <Text style={[styles.brokerTagline, dynamicStyles.textSecondary]}>
                    {broker.tagline}
                  </Text>
                </View>
              </View>

              {/* Highlights */}
              <View style={styles.highlightsContainer}>
                {broker.highlights.map((highlight, index) => (
                  <View key={index} style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                    <Text style={[styles.highlightText, dynamicStyles.text]}>
                      {highlight}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Markets Tags */}
              <View style={styles.marketsContainer}>
                {broker.markets.map((market, index) => (
                  <View 
                    key={index} 
                    style={[styles.marketTag, { backgroundColor: `${theme.textSecondary}15` }]}
                  >
                    <Text style={[styles.marketTagText, dynamicStyles.textSecondary]}>
                      {market}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Visit Button */}
              <TouchableOpacity
                style={[styles.visitButton, { backgroundColor: logo.color }]}
                onPress={() => handleVisitBroker(broker.link, broker.name)}
                activeOpacity={0.8}
              >
                <Text style={styles.visitButtonText}>Visit {broker.name}</Text>
                <Ionicons name="open-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Disclaimer */}
        <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}30` }]}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="information-circle" size={20} color={theme.textSecondary} />
            <Text style={[styles.disclaimerTitle, dynamicStyles.textSecondary]}>Disclaimer</Text>
          </View>
          <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
            • Swift FX may earn a commission from broker referrals{"\n"}
            • Swift FX does not act as a broker or financial advisor{"\n"}
            • Users must verify broker suitability and regulations independently{"\n"}
            • Trading involves significant risk of loss
          </Text>
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  introCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  introIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  brokerCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  brokerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  brokerLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  brokerLogoText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  brokerInfo: {
    flex: 1,
  },
  brokerName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  brokerTagline: {
    fontSize: 13,
    lineHeight: 18,
  },
  highlightsContainer: {
    marginBottom: 14,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  highlightText: {
    fontSize: 14,
    flex: 1,
  },
  marketsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  marketTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  marketTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  visitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  visitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimerCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 20,
  },
});

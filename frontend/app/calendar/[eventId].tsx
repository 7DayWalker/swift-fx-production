import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  forecast: string;
  previous: string;
}

// Educational explanations for why events matter
const getWhyThisMatters = (title: string, impact: string): string => {
  const eventType = title.toLowerCase();
  
  // CPI/Inflation related
  if (eventType.includes('cpi') || eventType.includes('inflation')) {
    return 'Consumer Price Index (CPI) measures changes in the price of goods and services. Higher than expected readings typically strengthen the currency as central banks may raise interest rates to combat inflation. Lower readings may weaken the currency.';
  }
  
  // Interest rates/Central bank
  if (eventType.includes('interest rate') || eventType.includes('fed') || eventType.includes('fomc') || eventType.includes('boc') || eventType.includes('boe') || eventType.includes('ecb') || eventType.includes('rba')) {
    return 'Central bank decisions on interest rates directly impact currency values. Higher interest rates typically attract foreign investment, strengthening the currency. Lower rates may weaken it as investors seek better returns elsewhere.';
  }
  
  // Employment/Jobs
  if (eventType.includes('employment') || eventType.includes('nfp') || eventType.includes('payroll') || eventType.includes('jobless') || eventType.includes('unemployment') || eventType.includes('jobs')) {
    return 'Employment data reflects economic health. Strong job growth indicates a robust economy and may lead to currency appreciation. Weak employment data suggests economic slowdown and may weaken the currency.';
  }
  
  // GDP
  if (eventType.includes('gdp')) {
    return 'Gross Domestic Product (GDP) measures the total economic output of a country. Higher than expected GDP growth signals economic strength and may boost the currency. Lower readings indicate slower growth.';
  }
  
  // Retail Sales
  if (eventType.includes('retail') || eventType.includes('consumer spending')) {
    return 'Retail sales data shows consumer spending patterns. Strong retail sales indicate confident consumers and economic growth, which can strengthen the currency. Weak sales may suggest economic concerns.';
  }
  
  // Trade Balance
  if (eventType.includes('trade balance') || eventType.includes('import') || eventType.includes('export')) {
    return 'Trade balance shows the difference between exports and imports. A trade surplus (more exports) typically strengthens a currency, while a deficit (more imports) may weaken it.';
  }
  
  // PMI
  if (eventType.includes('pmi') || eventType.includes('purchasing manager')) {
    return 'Purchasing Managers\' Index (PMI) surveys business conditions. Readings above 50 indicate expansion, below 50 signal contraction. Higher PMI readings typically support currency strength.';
  }
  
  // Housing
  if (eventType.includes('housing') || eventType.includes('home') || eventType.includes('building permit')) {
    return 'Housing data reflects economic activity and consumer confidence. Strong housing numbers indicate a healthy economy and may support currency value. Weak data may signal economic concerns.';
  }
  
  // Speeches
  if (eventType.includes('speak') || eventType.includes('testimony') || eventType.includes('press conference')) {
    return 'Central bank officials\' speeches can provide hints about future monetary policy. Hawkish comments (suggesting rate hikes) typically strengthen the currency, while dovish comments (suggesting rate cuts) may weaken it.';
  }
  
  // Holiday
  if (impact.toLowerCase() === 'holiday') {
    return 'Market holidays may result in reduced liquidity and trading volumes. Major markets closed can lead to wider spreads and more volatile price movements in affected currency pairs.';
  }
  
  // Default
  return 'Economic events provide insights into a country\'s economic health. Unexpected results can cause significant currency movements as traders adjust their positions based on new information.';
};

// Get currency full name
const getCurrencyFullName = (code: string): string => {
  const names: { [key: string]: string } = {
    USD: 'United States Dollar',
    EUR: 'Euro',
    GBP: 'British Pound Sterling',
    JPY: 'Japanese Yen',
    AUD: 'Australian Dollar',
    NZD: 'New Zealand Dollar',
    CAD: 'Canadian Dollar',
    CHF: 'Swiss Franc',
    CNY: 'Chinese Yuan',
  };
  return names[code] || code;
};

// Get currency flag emoji
const getCurrencyFlag = (country: string) => {
  const flags: { [key: string]: string } = {
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    AUD: '🇦🇺',
    NZD: '🇳🇿',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    CNY: '🇨🇳',
  };
  return flags[country] || '🌍';
};

export default function EventDetailScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse event data from params
  let event: EconomicEvent | null = null;
  try {
    if (params.eventData) {
      event = JSON.parse(params.eventData as string);
    }
  } catch (e) {
    console.error('Failed to parse event data:', e);
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Event Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Event data not available
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Get impact color
  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#10B981';
      case 'holiday':
        return '#6366F1';
      default:
        return '#8A8D98';
    }
  };

  // Format date and time
  const eventDate = new Date(event.date);
  const formattedDate = eventDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = eventDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });

  const impactColor = getImpactColor(event.impact);
  const whyThisMatters = getWhyThisMatters(event.title, event.impact);

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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Event Details</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={[styles.heroCard, dynamicStyles.card]}>
          <View style={styles.heroTop}>
            <Text style={styles.heroFlag}>{getCurrencyFlag(event.country)}</Text>
            <View
              style={[
                styles.impactBadge,
                { backgroundColor: `${impactColor}20` },
              ]}
            >
              <View style={[styles.impactDot, { backgroundColor: impactColor }]} />
              <Text style={[styles.impactText, { color: impactColor }]}>
                {event.impact} Impact
              </Text>
            </View>
          </View>
          <Text style={[styles.heroTitle, dynamicStyles.text]}>{event.title}</Text>
          <Text style={[styles.heroCurrency, { color: theme.primary }]}>
            {event.country} • {getCurrencyFullName(event.country)}
          </Text>
        </View>

        {/* Schedule Card */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={20} color={theme.primary} />
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Scheduled Time</Text>
          </View>
          <View style={styles.scheduleContent}>
            <View style={styles.scheduleItem}>
              <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
              <Text style={[styles.scheduleText, dynamicStyles.text]}>{formattedDate}</Text>
            </View>
            <View style={styles.scheduleItem}>
              <Ionicons name="time-outline" size={18} color={theme.textSecondary} />
              <Text style={[styles.scheduleText, dynamicStyles.text]}>{formattedTime}</Text>
            </View>
          </View>
          <Text style={[styles.localTimeNote, dynamicStyles.textSecondary]}>
            Time shown in your local timezone
          </Text>
        </View>

        {/* Data Points Card */}
        {(event.forecast || event.previous) && (
          <View style={[styles.card, dynamicStyles.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="stats-chart-outline" size={20} color={theme.primary} />
              <Text style={[styles.cardTitle, dynamicStyles.text]}>Data Points</Text>
            </View>
            <View style={styles.dataPointsGrid}>
              {event.forecast && (
                <View style={[styles.dataPoint, { backgroundColor: `${theme.primary}10` }]}>
                  <Text style={[styles.dataPointLabel, dynamicStyles.textSecondary]}>Forecast</Text>
                  <Text style={[styles.dataPointValue, { color: theme.primary }]}>
                    {event.forecast}
                  </Text>
                </View>
              )}
              {event.previous && (
                <View style={[styles.dataPoint, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.dataPointLabel, dynamicStyles.textSecondary]}>Previous</Text>
                  <Text style={[styles.dataPointValue, dynamicStyles.text]}>
                    {event.previous}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Why This Matters Card */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Why This Matters</Text>
          </View>
          <Text style={[styles.educationalText, dynamicStyles.text]}>
            {whyThisMatters}
          </Text>
        </View>

        {/* Disclaimer */}
        <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}40` }]}>
          <Ionicons name="information-circle" size={20} color={theme.textSecondary} />
          <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
            This information is for educational purposes only and does not constitute financial advice. 
            Always conduct your own research before making trading decisions.
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
  },
  heroCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroFlag: {
    fontSize: 32,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  impactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  impactText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 28,
  },
  heroCurrency: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  scheduleContent: {
    gap: 12,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleText: {
    fontSize: 15,
  },
  localTimeNote: {
    fontSize: 11,
    marginTop: 12,
    fontStyle: 'italic',
  },
  dataPointsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  dataPoint: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dataPointLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  dataPointValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  educationalText: {
    fontSize: 14,
    lineHeight: 22,
  },
  disclaimerCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});

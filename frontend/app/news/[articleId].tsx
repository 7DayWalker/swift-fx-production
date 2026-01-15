import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  category: 'Forex' | 'Commodities' | 'Crypto' | 'Global';
  thumbnail?: string;
}

// Educational explanations based on category
const getWhyThisMatters = (category: string, title: string): string => {
  const titleLower = title.toLowerCase();
  
  // Specific topic-based explanations
  if (titleLower.includes('interest rate') || titleLower.includes('central bank') || titleLower.includes('fed') || titleLower.includes('boe') || titleLower.includes('ecb')) {
    return 'Central bank decisions and interest rate changes are among the most impactful events in financial markets. They influence currency valuations, borrowing costs, and overall economic activity. Traders and investors closely watch these announcements as they can cause significant market volatility.';
  }
  
  if (titleLower.includes('inflation') || titleLower.includes('cpi') || titleLower.includes('ppi')) {
    return 'Inflation data is a key economic indicator that measures price changes over time. High inflation can erode purchasing power and may prompt central banks to adjust monetary policy. Markets react to inflation surprises as they can signal future interest rate decisions.';
  }
  
  if (titleLower.includes('employment') || titleLower.includes('jobs') || titleLower.includes('nfp') || titleLower.includes('unemployment')) {
    return 'Employment data reflects the health of an economy. Strong job growth typically signals economic expansion, while weak employment may indicate a slowdown. Central banks consider employment data when making policy decisions, making it a market-moving indicator.';
  }
  
  if (titleLower.includes('gdp') || titleLower.includes('growth')) {
    return 'Gross Domestic Product (GDP) measures the total economic output of a country. It provides insight into economic health and growth trends. Markets use GDP data to assess the overall direction of an economy and potential policy responses.';
  }

  // Category-based fallbacks
  switch (category) {
    case 'Forex':
      return 'Currency markets are influenced by economic data, geopolitical events, and monetary policy decisions. Understanding these factors helps traders and investors make informed decisions about foreign exchange movements and their potential impact on portfolios.';
    case 'Commodities':
      return 'Commodity prices are affected by supply and demand dynamics, geopolitical tensions, weather patterns, and economic conditions. Changes in commodity markets can impact inflation, trade balances, and the performance of commodity-dependent economies.';
    case 'Crypto':
      return 'Cryptocurrency markets are known for their volatility and are influenced by technological developments, regulatory news, institutional adoption, and broader market sentiment. Understanding these dynamics is essential for anyone interested in digital assets.';
    case 'Global':
      return 'Global market news encompasses major economic and financial developments worldwide. These events can have ripple effects across asset classes, influencing investment decisions and economic policies in multiple countries.';
    default:
      return 'Financial news provides important context for understanding market movements and economic trends. Staying informed helps investors and traders make better decisions based on current events and data releases.';
  }
};

// Get category color
const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Forex':
      return '#00D4AA';
    case 'Commodities':
      return '#FFD700';
    case 'Crypto':
      return '#8B5CF6';
    case 'Global':
      return '#3B82F6';
    default:
      return '#8A8D98';
  }
};

// Get category icon
const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Forex':
      return 'swap-horizontal';
    case 'Commodities':
      return 'diamond';
    case 'Crypto':
      return 'logo-bitcoin';
    case 'Global':
      return 'globe';
    default:
      return 'newspaper';
  }
};

// Format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function NewsDetailScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse article data
  let article: NewsItem | null = null;
  try {
    if (params.articleData) {
      article = JSON.parse(params.articleData as string);
    }
  } catch (e) {
    console.error('Failed to parse article data:', e);
  }

  const handleReadArticle = async () => {
    if (article?.link) {
      try {
        await Linking.openURL(article.link);
      } catch (error) {
        console.error('Failed to open article link:', error);
      }
    }
  };

  if (!article) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Article</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Article not available
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = getCategoryColor(article.category);
  const whyThisMatters = getWhyThisMatters(article.category, article.title);

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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Article</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={[styles.heroCard, dynamicStyles.card]}>
          {/* Category & Source */}
          <View style={styles.heroTop}>
            <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}20` }]}>
              <Ionicons
                name={getCategoryIcon(article.category) as any}
                size={14}
                color={categoryColor}
              />
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {article.category}
              </Text>
            </View>
            <Text style={[styles.sourceText, dynamicStyles.textSecondary]}>
              {article.source}
            </Text>
          </View>

          {/* Title */}
          <Text style={[styles.articleTitle, dynamicStyles.text]}>
            {article.title}
          </Text>

          {/* Timestamp */}
          <View style={styles.timestampRow}>
            <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.timestamp, dynamicStyles.textSecondary]}>
              {formatDate(article.pubDate)}
            </Text>
          </View>
        </View>

        {/* Summary Section */}
        {article.description && (
          <View style={[styles.card, dynamicStyles.card]}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={20} color={theme.primary} />
              <Text style={[styles.cardTitle, dynamicStyles.text]}>Summary</Text>
            </View>
            <Text style={[styles.summaryText, dynamicStyles.text]}>
              {article.description}
            </Text>
          </View>
        )}

        {/* Why This Matters */}
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.cardHeader}>
            <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            <Text style={[styles.cardTitle, dynamicStyles.text]}>Why This Matters</Text>
          </View>
          <Text style={[styles.educationalText, dynamicStyles.text]}>
            {whyThisMatters}
          </Text>
        </View>

        {/* Read Full Article Button */}
        <TouchableOpacity
          style={[styles.readButton, { backgroundColor: theme.primary }]}
          onPress={handleReadArticle}
          activeOpacity={0.8}
        >
          <Text style={styles.readButtonText}>Read Full Article</Text>
          <Ionicons name="open-outline" size={18} color="#0A0E17" />
        </TouchableOpacity>

        {/* Disclaimer */}
        <View style={[styles.disclaimerCard, { backgroundColor: `${theme.border}40` }]}>
          <Ionicons name="information-circle" size={18} color={theme.textSecondary} />
          <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
            This news summary is for informational and educational purposes only. It does not constitute financial advice, trading recommendations, or an endorsement of any investment strategy.
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
    marginBottom: 14,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  articleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 28,
    marginBottom: 14,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timestamp: {
    fontSize: 12,
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
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 22,
  },
  educationalText: {
    fontSize: 14,
    lineHeight: 22,
  },
  readButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  readButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0E17',
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
    fontSize: 11,
    lineHeight: 16,
  },
});

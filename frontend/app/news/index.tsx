import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import { AdBanner, NativeAdCard, AD_BANNER_HEIGHT } from '../../src/components/ads';

// News item type
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

// Category filters
type CategoryFilter = 'All' | 'Forex' | 'Commodities' | 'Crypto' | 'Global';
const CATEGORIES: CategoryFilter[] = ['All', 'Forex', 'Commodities', 'Crypto', 'Global'];

// RSS feeds configuration
const NEWS_FEEDS = [
  {
    url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.forexlive.com/feed/news',
    source: 'ForexLive',
    category: 'Forex' as const,
  },
  {
    url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.fxstreet.com/rss/news',
    source: 'FXStreet',
    category: 'Forex' as const,
  },
  {
    url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.investing.com/rss/news_25.rss',
    source: 'Investing.com',
    category: 'Global' as const,
  },
];

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

// Parse relative time
const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Categorize news based on content
const categorizeNews = (title: string, description: string, defaultCategory: string): NewsItem['category'] => {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('bitcoin') || text.includes('crypto') || text.includes('ethereum') || text.includes('btc') || text.includes('eth')) {
    return 'Crypto';
  }
  if (text.includes('gold') || text.includes('silver') || text.includes('oil') || text.includes('commodity') || text.includes('xau')) {
    return 'Commodities';
  }
  if (text.includes('forex') || text.includes('eur/usd') || text.includes('gbp/usd') || text.includes('usd/jpy') || text.includes('currency') || text.includes('fx ')) {
    return 'Forex';
  }
  return defaultCategory as NewsItem['category'];
};

export default function MarketNewsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('All');

  const fetchNews = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const allNews: NewsItem[] = [];

      // Fetch from all RSS feeds in parallel
      const feedPromises = NEWS_FEEDS.map(async (feed) => {
        try {
          const response = await fetch(feed.url);
          const data = await response.json();
          
          if (data.status === 'ok' && data.items) {
            return data.items.map((item: any, index: number) => ({
              id: `${feed.source}-${index}-${item.pubDate}`,
              title: item.title?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'") || 'Untitled',
              description: item.description?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
              link: item.link || '',
              pubDate: item.pubDate || new Date().toISOString(),
              source: feed.source,
              category: categorizeNews(item.title || '', item.description || '', feed.category),
              thumbnail: item.thumbnail || item.enclosure?.link || null,
            }));
          }
          return [];
        } catch (err) {
          console.warn(`Failed to fetch from ${feed.source}:`, err);
          return [];
        }
      });

      const results = await Promise.all(feedPromises);
      results.forEach((items) => allNews.push(...items));

      // Sort by date (newest first)
      allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      setNews(allNews);
    } catch (err: any) {
      console.error('Failed to fetch news:', err);
      setError('Failed to load market news');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNews(true);
  };

  // Filter news by category
  const filteredNews = activeFilter === 'All' 
    ? news 
    : news.filter(item => item.category === activeFilter);

  const navigateToDetail = (item: NewsItem) => {
    router.push({
      pathname: '/news/[articleId]',
      params: {
        articleId: item.id,
        articleData: JSON.stringify(item),
      },
    });
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Market News</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: `${theme.primary}15` }]}>
        <Ionicons name="newspaper" size={18} color={theme.primary} />
        <Text style={[styles.infoText, { color: theme.primary }]}>
          Live market updates • Educational content only
        </Text>
      </View>

      {/* Category Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.filterChip,
              { borderColor: getCategoryColor(category) },
              activeFilter === category && { backgroundColor: getCategoryColor(category) },
            ]}
            onPress={() => setActiveFilter(category)}
          >
            <Ionicons
              name={getCategoryIcon(category) as any}
              size={14}
              color={activeFilter === category ? '#0A0E17' : getCategoryColor(category)}
            />
            <Text
              style={[
                styles.filterChipText,
                { color: activeFilter === category ? '#0A0E17' : getCategoryColor(category) },
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>
            Loading market news...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorText, dynamicStyles.textSecondary]}>{error}</Text>
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: theme.primary }]} 
            onPress={() => fetchNews()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredNews.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="newspaper-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No news found for this category
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          {filteredNews.map((item, index) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={[styles.newsCard, dynamicStyles.card]}
                onPress={() => navigateToDetail(item)}
                activeOpacity={0.7}
              >
                {/* Image + Content Row */}
                <View style={styles.newsCardContent}>
                  {/* Text Content */}
                  <View style={styles.newsCardText}>
                    {/* Category Badge */}
                    <View style={styles.newsCardTop}>
                      <View style={[styles.categoryBadge, { backgroundColor: `${getCategoryColor(item.category)}20` }]}>
                        <Ionicons
                          name={getCategoryIcon(item.category) as any}
                          size={10}
                          color={getCategoryColor(item.category)}
                        />
                        <Text style={[styles.categoryText, { color: getCategoryColor(item.category) }]}>
                          {item.category}
                        </Text>
                      </View>
                      <Text style={[styles.newsTime, dynamicStyles.textSecondary]}>
                        {getRelativeTime(item.pubDate)}
                      </Text>
                    </View>

                    {/* Title */}
                    <Text style={[styles.newsTitle, dynamicStyles.text]} numberOfLines={item.thumbnail ? 2 : 3}>
                      {item.title}
                    </Text>

                    {/* Footer */}
                    <View style={styles.newsFooter}>
                      <Text style={[styles.newsSource, dynamicStyles.textSecondary]}>
                        {item.source}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                    </View>
                  </View>

                  {/* Thumbnail Image */}
                  {item.thumbnail ? (
                    <Image
                      source={{ uri: item.thumbnail }}
                      style={styles.newsThumbnail}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.newsPlaceholder, { backgroundColor: `${getCategoryColor(item.category)}15` }]}>
                      <Ionicons
                        name={getCategoryIcon(item.category) as any}
                        size={28}
                        color={getCategoryColor(item.category)}
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              {/* Native ad every 4 items */}
              {(index + 1) % 4 === 0 && <NativeAdCard />}
            </React.Fragment>
          ))}

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
              News is for informational purposes only. Not financial advice.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Fixed bottom ad banner — free users only */}
      <AdBanner />
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterContainer: {
    maxHeight: 50,
    marginBottom: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#0A0E17',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  newsCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  newsCardContent: {
    flexDirection: 'row',
    gap: 12,
  },
  newsCardText: {
    flex: 1,
  },
  newsCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  newsTime: {
    fontSize: 11,
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
  },
  newsDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsSource: {
    fontSize: 11,
    fontWeight: '500',
  },
  newsThumbnail: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#1A1F2E',
  },
  newsPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  disclaimerText: {
    fontSize: 11,
    textAlign: 'center',
  },
});

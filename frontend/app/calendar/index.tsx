import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';

// Types for economic events
interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  impact: 'Low' | 'Medium' | 'High' | 'Holiday';
  forecast: string;
  previous: string;
}

interface GroupedEvents {
  [date: string]: EconomicEvent[];
}

type FilterType = 'today' | 'week' | 'high';

export default function EconomicCalendarScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('week');

  const fetchEvents = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const response = await api.get('/calendar/events', {
        params: { filter: activeFilter }
      });

      setEvents(response.data.events || []);
    } catch (err: any) {
      console.error('Failed to fetch calendar events:', err);
      setError(err.response?.data?.detail || 'Failed to load economic calendar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents(true);
  };

  // Group events by date
  const groupedEvents: GroupedEvents = events.reduce((acc, event) => {
    const eventDate = new Date(event.date);
    const dateKey = eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as GroupedEvents);

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

  // Get impact icon
  const getImpactIcon = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high':
        return 'alert-circle';
      case 'medium':
        return 'warning';
      case 'low':
        return 'information-circle';
      case 'holiday':
        return 'calendar';
      default:
        return 'ellipse';
    }
  };

  // Format time to local timezone
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
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

  const navigateToDetail = (event: EconomicEvent) => {
    router.push({
      pathname: '/calendar/[eventId]',
      params: {
        eventId: event.id,
        eventData: JSON.stringify(event),
      },
    });
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    surface: { backgroundColor: theme.surface },
    card: { backgroundColor: theme.cardBackground },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    border: { borderColor: theme.border },
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
        <Text style={[styles.headerTitle, dynamicStyles.text]}>Economic Calendar</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: `${theme.primary}15` }]}>
        <Ionicons name="information-circle" size={20} color={theme.primary} />
        <Text style={[styles.infoText, { color: theme.primary }]}>
          Live economic events • Educational purposes only
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, dynamicStyles.card]}>
        {(['today', 'week', 'high'] as FilterType[]).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              activeFilter === filter && { backgroundColor: theme.primary },
            ]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: activeFilter === filter ? '#0A0E17' : theme.textSecondary },
              ]}
            >
              {filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : 'High Impact'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, dynamicStyles.textSecondary]}>
            Loading economic events...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorText, dynamicStyles.textSecondary]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={() => fetchEvents()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No events found for this filter
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
          {Object.entries(groupedEvents).map(([dateKey, dateEvents]) => (
            <View key={dateKey} style={styles.dateGroup}>
              {/* Date Header */}
              <View style={styles.dateHeader}>
                <View style={[styles.dateBadge, { backgroundColor: `${theme.primary}20` }]}>
                  <Ionicons name="calendar" size={14} color={theme.primary} />
                  <Text style={[styles.dateText, { color: theme.primary }]}>{dateKey}</Text>
                </View>
                <Text style={[styles.eventCount, dynamicStyles.textSecondary]}>
                  {dateEvents.length} event{dateEvents.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Events for this date */}
              {dateEvents.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.eventCard, dynamicStyles.card, dynamicStyles.border]}
                  onPress={() => navigateToDetail(event)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventLeft}>
                    {/* Time */}
                    <View style={styles.timeContainer}>
                      <Text style={[styles.eventTime, dynamicStyles.text]}>
                        {formatTime(event.date)}
                      </Text>
                    </View>

                    {/* Event Info */}
                    <View style={styles.eventInfo}>
                      <View style={styles.eventTitleRow}>
                        <Text style={styles.currencyFlag}>
                          {getCurrencyFlag(event.country)}
                        </Text>
                        <Text style={[styles.currencyCode, { color: theme.primary }]}>
                          {event.country}
                        </Text>
                      </View>
                      <Text
                        style={[styles.eventTitle, dynamicStyles.text]}
                        numberOfLines={2}
                      >
                        {event.title}
                      </Text>
                      {(event.forecast || event.previous) && (
                        <View style={styles.eventDataRow}>
                          {event.forecast && (
                            <Text style={[styles.eventData, dynamicStyles.textSecondary]}>
                              Forecast: {event.forecast}
                            </Text>
                          )}
                          {event.previous && (
                            <Text style={[styles.eventData, dynamicStyles.textSecondary]}>
                              Previous: {event.previous}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Impact Badge */}
                  <View style={styles.eventRight}>
                    <View
                      style={[
                        styles.impactBadge,
                        { backgroundColor: `${getImpactColor(event.impact)}20` },
                      ]}
                    >
                      <Ionicons
                        name={getImpactIcon(event.impact) as any}
                        size={12}
                        color={getImpactColor(event.impact)}
                      />
                      <Text
                        style={[
                          styles.impactText,
                          { color: getImpactColor(event.impact) },
                        ]}
                      >
                        {event.impact}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* Footer Disclaimer */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.disclaimerText, dynamicStyles.textSecondary]}>
              Economic data is for informational purposes only. Not financial advice.
            </Text>
          </View>
        </ScrollView>
      )}
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
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 4,
    borderRadius: 12,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterTabText: {
    fontSize: 14,
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
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  eventCount: {
    fontSize: 12,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  eventLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  timeContainer: {
    width: 70,
    marginRight: 12,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '600',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  currencyFlag: {
    fontSize: 14,
  },
  currencyCode: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  eventDataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  eventData: {
    fontSize: 11,
  },
  eventRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  impactText: {
    fontSize: 10,
    fontWeight: '700',
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

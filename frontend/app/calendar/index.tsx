import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';
import api from '../../src/services/api';
import {
  isCalendarNotificationEnabled,
  setCalendarNotificationEnabled,
  getCalendarNotificationMinutes,
  setCalendarNotificationMinutes,
  scheduleCalendarEventNotification,
  cancelAllCalendarNotifications,
} from '../../src/services/notificationService';

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

type TimeFilterType = 'today' | 'week';

// Available currencies
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];
const IMPACT_LEVELS = ['High', 'Medium', 'Low', 'Holiday'];
const NOTIFICATION_MINUTES_OPTIONS = [5, 15, 30, 60];

export default function EconomicCalendarScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>('week');
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [selectedImpacts, setSelectedImpacts] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMinutes, setNotificationMinutesState] = useState(15);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  // Load notification settings
  useEffect(() => {
    const loadNotificationSettings = async () => {
      const enabled = await isCalendarNotificationEnabled();
      const minutes = await getCalendarNotificationMinutes();
      setNotificationsEnabled(enabled);
      setNotificationMinutesState(minutes);
    };
    loadNotificationSettings();
  }, []);

  // Schedule notifications for high-impact events when enabled
  useEffect(() => {
    const scheduleNotifications = async () => {
      if (!notificationsEnabled || events.length === 0) return;
      
      // Cancel existing notifications first
      await cancelAllCalendarNotifications();
      
      // Schedule notifications for high-impact events
      const highImpactEvents = events.filter(e => e.impact.toLowerCase() === 'high');
      for (const event of highImpactEvents) {
        await scheduleCalendarEventNotification(event);
      }
    };
    
    scheduleNotifications();
  }, [notificationsEnabled, events]);

  const handleNotificationToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await setCalendarNotificationEnabled(value);
    
    if (!value) {
      await cancelAllCalendarNotifications();
    }
  };

  const handleNotificationMinutesChange = async (minutes: number) => {
    setNotificationMinutesState(minutes);
    await setCalendarNotificationMinutes(minutes);
    setShowNotificationModal(false);
    
    // Re-schedule notifications with new timing
    if (notificationsEnabled) {
      await cancelAllCalendarNotifications();
      const highImpactEvents = events.filter(e => e.impact.toLowerCase() === 'high');
      for (const event of highImpactEvents) {
        await scheduleCalendarEventNotification(event);
      }
    }
  };

  const fetchEvents = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const response = await api.get('/calendar/events', {
        params: { filter: timeFilter }
      });

      setEvents(response.data.events || []);
    } catch (err: any) {
      console.error('Failed to fetch calendar events:', err);
      setError(err.response?.data?.detail || 'Failed to load economic calendar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents(true);
  };

  // Apply local filters (currency and impact)
  const filteredEvents = events.filter(event => {
    // Currency filter
    if (selectedCurrencies.length > 0 && !selectedCurrencies.includes(event.country)) {
      return false;
    }
    // Impact filter
    if (selectedImpacts.length > 0 && !selectedImpacts.includes(event.impact)) {
      return false;
    }
    return true;
  });

  // Group events by date
  const groupedEvents: GroupedEvents = filteredEvents.reduce((acc, event) => {
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

  // Toggle currency selection
  const toggleCurrency = (currency: string) => {
    setSelectedCurrencies(prev => 
      prev.includes(currency) 
        ? prev.filter(c => c !== currency)
        : [...prev, currency]
    );
  };

  // Toggle impact selection
  const toggleImpact = (impact: string) => {
    setSelectedImpacts(prev => 
      prev.includes(impact) 
        ? prev.filter(i => i !== impact)
        : [...prev, impact]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedCurrencies([]);
    setSelectedImpacts([]);
  };

  const activeFilterCount = selectedCurrencies.length + selectedImpacts.length;

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
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="options-outline" size={24} color={theme.text} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: `${theme.primary}15` }]}>
        <Ionicons name="information-circle" size={20} color={theme.primary} />
        <Text style={[styles.infoText, { color: theme.primary }]}>
          Live economic events • Educational purposes only
        </Text>
      </View>

      {/* Notification Settings Card */}
      {Platform.OS !== 'web' && (
        <View style={[styles.notificationCard, dynamicStyles.card, dynamicStyles.border]}>
          <View style={styles.notificationCardLeft}>
            <View style={[styles.notificationIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="notifications" size={18} color="#EF4444" />
            </View>
            <View style={styles.notificationTextContainer}>
              <Text style={[styles.notificationTitle, dynamicStyles.text]}>
                High-Impact Alerts
              </Text>
              <TouchableOpacity 
                onPress={() => notificationsEnabled && setShowNotificationModal(true)}
                disabled={!notificationsEnabled}
              >
                <Text style={[styles.notificationSubtitle, dynamicStyles.textSecondary]}>
                  {notificationsEnabled ? `${notificationMinutes} min before • Tap to change` : 'Get notified before major events'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: theme.border, true: '#EF4444' }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}

      {/* Time Filter Tabs */}
      <View style={[styles.filterContainer, dynamicStyles.card]}>
        {(['today', 'week'] as TimeFilterType[]).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              timeFilter === filter && { backgroundColor: theme.primary },
            ]}
            onPress={() => setTimeFilter(filter)}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: timeFilter === filter ? '#0A0E17' : theme.textSecondary },
              ]}
            >
              {filter === 'today' ? 'Today' : 'This Week'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedCurrencies.map(currency => (
              <TouchableOpacity
                key={currency}
                style={[styles.activeFilterChip, { backgroundColor: `${theme.primary}20` }]}
                onPress={() => toggleCurrency(currency)}
              >
                <Text style={[styles.activeFilterText, { color: theme.primary }]}>
                  {getCurrencyFlag(currency)} {currency}
                </Text>
                <Ionicons name="close" size={14} color={theme.primary} />
              </TouchableOpacity>
            ))}
            {selectedImpacts.map(impact => (
              <TouchableOpacity
                key={impact}
                style={[styles.activeFilterChip, { backgroundColor: `${getImpactColor(impact)}20` }]}
                onPress={() => toggleImpact(impact)}
              >
                <Text style={[styles.activeFilterText, { color: getImpactColor(impact) }]}>
                  {impact}
                </Text>
                <Ionicons name="close" size={14} color={getImpactColor(impact)} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.clearFiltersButton]}
              onPress={clearFilters}
            >
              <Text style={[styles.clearFiltersText, { color: theme.textSecondary }]}>
                Clear all
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

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
      ) : filteredEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, dynamicStyles.textSecondary]}>
            No events match your filters
          </Text>
          {activeFilterCount > 0 && (
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: theme.primary }]} 
              onPress={clearFilters}
            >
              <Text style={styles.retryButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
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

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.cardBackground }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, dynamicStyles.text]}>Filter Events</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Impact Level Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, dynamicStyles.text]}>Impact Level</Text>
                <Text style={[styles.filterSectionSubtitle, dynamicStyles.textSecondary]}>
                  Select one or more impact levels
                </Text>
                <View style={styles.filterChipsContainer}>
                  {IMPACT_LEVELS.map(impact => (
                    <TouchableOpacity
                      key={impact}
                      style={[
                        styles.filterChip,
                        { borderColor: getImpactColor(impact) },
                        selectedImpacts.includes(impact) && { 
                          backgroundColor: `${getImpactColor(impact)}20`,
                          borderWidth: 2,
                        },
                      ]}
                      onPress={() => toggleImpact(impact)}
                    >
                      <Ionicons
                        name={getImpactIcon(impact) as any}
                        size={16}
                        color={getImpactColor(impact)}
                      />
                      <Text style={[styles.filterChipText, { color: getImpactColor(impact) }]}>
                        {impact}
                      </Text>
                      {selectedImpacts.includes(impact) && (
                        <Ionicons name="checkmark" size={16} color={getImpactColor(impact)} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Currency Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, dynamicStyles.text]}>Currency</Text>
                <Text style={[styles.filterSectionSubtitle, dynamicStyles.textSecondary]}>
                  Select one or more currencies
                </Text>
                <View style={styles.filterChipsContainer}>
                  {CURRENCIES.map(currency => (
                    <TouchableOpacity
                      key={currency}
                      style={[
                        styles.filterChip,
                        { borderColor: theme.border },
                        selectedCurrencies.includes(currency) && { 
                          backgroundColor: `${theme.primary}20`,
                          borderColor: theme.primary,
                          borderWidth: 2,
                        },
                      ]}
                      onPress={() => toggleCurrency(currency)}
                    >
                      <Text style={styles.currencyFlagSmall}>{getCurrencyFlag(currency)}</Text>
                      <Text style={[
                        styles.filterChipText, 
                        { color: selectedCurrencies.includes(currency) ? theme.primary : theme.text }
                      ]}>
                        {currency}
                      </Text>
                      {selectedCurrencies.includes(currency) && (
                        <Ionicons name="checkmark" size={16} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.clearButton, { borderColor: theme.border }]}
                onPress={clearFilters}
              >
                <Text style={[styles.clearButtonText, dynamicStyles.textSecondary]}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.applyButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  filterButton: {
    padding: 8,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
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
    marginBottom: 12,
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
  activeFiltersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    gap: 6,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearFiltersButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearFiltersText: {
    fontSize: 12,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  filterSectionSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  filterChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  currencyFlagSmall: {
    fontSize: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearButton: {
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  applyButton: {},
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0E17',
  },
});

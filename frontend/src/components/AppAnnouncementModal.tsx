import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../services/api';

const DISMISSED_VERSION_KEY = 'appAnnouncementDismissedVersion';
const UPDATE_URL = 'https://swiftfx.online/app/';

interface AppAnnouncement {
  title: string;
  message: string;
  version: string;
  is_active?: boolean;
}

function normalizeAnnouncement(payload: any): AppAnnouncement | null {
  const source = payload?.announcement ?? payload?.data ?? payload;
  if (!source || typeof source !== 'object') {
    return null;
  }

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const message = typeof source.message === 'string' ? source.message.trim() : '';
  const version = typeof source.version === 'string' ? source.version.trim() : '';
  const isActive = Boolean(source.is_active ?? source.active ?? true);

  if (!title || !message || !version || !isActive) {
    return null;
  }

  return {
    title,
    message,
    version,
    is_active: isActive,
  };
}

export default function AppAnnouncementModal() {
  const [announcement, setAnnouncement] = useState<AppAnnouncement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const dismissedVersionRef = useRef<string | null>(null);
  const activeVersionRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const fetchLatestAnnouncement = useCallback(async () => {
    try {
      const response = await api.get('/admin/app-announcements/latest-active');
      const latestAnnouncement = normalizeAnnouncement(response.data);

      if (!latestAnnouncement) {
        setAnnouncement(null);
        setIsVisible(false);
        activeVersionRef.current = null;
        return;
      }

      activeVersionRef.current = latestAnnouncement.version;

      if (dismissedVersionRef.current === latestAnnouncement.version) {
        setAnnouncement(null);
        setIsVisible(false);
        return;
      }

      setAnnouncement(latestAnnouncement);
      setIsVisible(true);
    } catch (error) {
      console.error('Error fetching app announcement:', error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDismissedVersion = async () => {
      try {
        const dismissedVersion = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
        if (!isMounted) {
          return;
        }

        dismissedVersionRef.current = dismissedVersion;
        await fetchLatestAnnouncement();
      } catch (error) {
        console.error('Error loading announcement dismissal state:', error);
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    };

    loadDismissedVersion();

    return () => {
      isMounted = false;
    };
  }, [fetchLatestAnnouncement]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && prevState.match(/inactive|background/)) {
        fetchLatestAnnouncement();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchLatestAnnouncement, isLoaded]);

  const handleDismiss = useCallback(async () => {
    try {
      const version = activeVersionRef.current;
      if (version) {
        await AsyncStorage.setItem(DISMISSED_VERSION_KEY, version);
        dismissedVersionRef.current = version;
      }
    } catch (error) {
      console.error('Error saving dismissed announcement version:', error);
    } finally {
      setIsVisible(false);
    }
  }, []);

  const handleUpdateNow = useCallback(async () => {
    try {
      await Linking.openURL(UPDATE_URL);
    } catch (error) {
      console.error('Error opening update landing page:', error);
    } finally {
      setIsVisible(false);
    }
  }, []);

  if (!announcement) {
    return null;
  }

  return (
    <Modal transparent visible={isVisible} animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>App Update</Text>
          </View>

          <Text style={styles.title}>{announcement.title}</Text>
          <Text style={styles.version}>Version {announcement.version}</Text>

          <ScrollView style={styles.messageContainer} contentContainerStyle={styles.messageContent}>
            <Text style={styles.message}>{announcement.message}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleDismiss} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleUpdateNow} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Update Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 16,
  },
  badgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    marginBottom: 16,
  },
  messageContainer: {
    maxHeight: 220,
    marginBottom: 24,
  },
  messageContent: {
    paddingBottom: 4,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#E2E8F0',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

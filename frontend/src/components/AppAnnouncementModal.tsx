import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';

export interface AppAnnouncement {
  id: string;
  title: string;
  message: string;
  version: string;
  cta_url?: string | null;
}

type Props = {
  visible: boolean;
  announcement: AppAnnouncement | null;
  onDismiss: () => void;
};

export default function AppAnnouncementModal({ visible, announcement, onDismiss }: Props) {
  if (!announcement) return null;

  const ctaUrl = announcement.cta_url;

  const onPressCta = async () => {
    if (!ctaUrl) return;
    try {
      await Linking.openURL(ctaUrl);
    } finally {
      onDismiss();
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{announcement.title}</Text>
          </View>

          <Text style={styles.message}>{announcement.message}</Text>

          <View style={styles.footer}>
            <Text style={styles.version}>v{announcement.version}</Text>

            <View style={styles.buttonsRow}>
              {ctaUrl ? (
                <TouchableOpacity style={[styles.button, styles.ctaButton]} onPress={onPressCta} activeOpacity={0.9}>
                  <Text style={[styles.buttonText, styles.ctaButtonText]}>Update App</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={[styles.button, styles.dismissButton]} onPress={onDismiss} activeOpacity={0.9}>
                <Text style={[styles.buttonText, styles.dismissButtonText]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    padding: 16,
  },
  headerRow: {
    marginBottom: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  message: {
    color: '#8A8D98',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  footer: {
    flexDirection: 'column',
    gap: 10,
  },
  version: {
    color: '#5A5D68',
    fontSize: 11,
    fontWeight: '700',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  ctaButton: {
    backgroundColor: 'rgba(217,119,6,0.12)',
    borderColor: '#D97706',
  },
  dismissButton: {
    backgroundColor: 'rgba(0,212,170,0.08)',
    borderColor: '#00D4AA',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  ctaButtonText: {
    color: '#D97706',
  },
  dismissButtonText: {
    color: '#00D4AA',
  },
});

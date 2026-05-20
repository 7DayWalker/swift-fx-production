import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/services/api';

export default function AppAnnouncementsScreen() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handlePublish = async () => {
    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    const trimmedVersion = version.trim();

    if (!trimmedTitle || !trimmedMessage || !trimmedVersion) {
      Alert.alert('Missing Information', 'Please enter a title, message, and version.');
      return;
    }

    try {
      setIsSaving(true);
      await api.post('/admin/app-announcements', {
        title: trimmedTitle,
        message: trimmedMessage,
        version: trimmedVersion,
        is_active: isActive,
        active: isActive,
      });

      Alert.alert(
        isActive ? 'Announcement Published' : 'Announcement Saved',
        isActive
          ? 'The announcement is now active for all users.'
          : 'The announcement has been saved without publishing.'
      );

      if (isActive) {
        setTitle('');
        setMessage('');
        setVersion('');
      }
    } catch (error) {
      console.error('Error publishing announcement:', error);
      Alert.alert('Publish Failed', 'Unable to save the announcement right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>App Announcements</Text>
          <Text style={styles.subtitle}>Create and publish the latest app update message for users.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Update available"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />

          <Text style={styles.label}>Version</Text>
          <TextInput
            value={version}
            onChangeText={setVersion}
            placeholder="1.0.1"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tell users what changed and why they should update."
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textArea]}
          />

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleLabel}>Publish now</Text>
              <Text style={styles.toggleDescription}>
                Turn off to save the announcement without making it active.
              </Text>
            </View>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>

          <TouchableOpacity
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handlePublish}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>
              {isSaving ? 'Saving...' : isActive ? 'Publish Announcement' : 'Save Draft'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 140,
    paddingTop: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  toggleDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

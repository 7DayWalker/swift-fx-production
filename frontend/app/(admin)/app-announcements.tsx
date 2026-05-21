import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/services/api';

export default function AppAnnouncementsScreen() {
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [message, setMessage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const publish = async () => {
    const trimmedTitle = title.trim();
    const trimmedVersion = version.trim();
    const trimmedMessage = message.trim();

    if (!trimmedTitle || !trimmedVersion || !trimmedMessage) {
      Alert.alert('Missing Fields', 'Please enter title, version, and message.');
      return;
    }

    try {
      setIsPublishing(true);

      await api.post('/admin/app-announcements', {
        title: trimmedTitle,
        version: trimmedVersion,
        message: trimmedMessage,
        active: true,
      });

      Alert.alert('Published', 'Announcement is now active for all users.');
      setTitle('');
      setVersion('');
      setMessage('');
    } catch (error: any) {
      Alert.alert('Publish Failed', error?.response?.data?.detail || 'Unable to publish announcement.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Update available" placeholderTextColor="#8A8D98" style={styles.input} />

          <Text style={styles.label}>Version</Text>
          <TextInput value={version} onChangeText={setVersion} placeholder="1.0.1" placeholderTextColor="#8A8D98" autoCapitalize="none" style={styles.input} />

          <Text style={styles.label}>Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tell users what changed and why they should update."
            placeholderTextColor="#8A8D98"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textArea]}
          />

          <TouchableOpacity style={[styles.button, isPublishing ? { opacity: 0.7 } : null]} onPress={publish} disabled={isPublishing} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{isPublishing ? 'Publishing...' : 'Publish'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    backgroundColor: '#1A1F2E',
    padding: 16,
  },
  label: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2F3E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: '#252A3A',
    marginBottom: 4,
  },
  textArea: {
    minHeight: 130,
    paddingTop: 12,
  },
  button: {
    marginTop: 18,
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '800',
  },
});

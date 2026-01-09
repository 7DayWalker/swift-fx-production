import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MockAdBanner() {
  return (
    <View style={styles.container}>
      <View style={styles.adLabel}>
        <Text style={styles.adLabelText}>AD</Text>
      </View>
      <Text style={styles.adText}>Advertisement</Text>
      <Text style={styles.adSubtext}>Upgrade to Premium to remove ads</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1F2E',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
    borderStyle: 'dashed',
  },
  adLabel: {
    backgroundColor: '#8A8D98',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 8,
  },
  adLabelText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  adText: {
    fontSize: 14,
    color: '#8A8D98',
  },
  adSubtext: {
    fontSize: 12,
    color: '#00D4AA',
    marginTop: 4,
  },
});

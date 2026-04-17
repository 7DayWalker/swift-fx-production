import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/**
 * Auth callback screen.
 *
 * All deep link processing (recovery + OAuth cold-start) has been moved to
 * AuthContext, which runs at the root level before any routing decisions.
 *
 * This screen exists only as the Expo Router target for the swiftfx://auth
 * scheme. It shows a loading indicator while AuthContext processes the URL
 * and triggers navigation via _layout.tsx.
 */
export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00D4AA" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0E17',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
});

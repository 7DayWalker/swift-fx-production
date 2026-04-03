import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Cold-launch deep link handler.
 * ONLY processes the URL and sets the session.
 * Navigation is handled by _layout.tsx reacting to auth state change.
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) return;

        console.log('[AuthCallback] URL:', url);
        const { queryParams } = Linking.parse(url);
        const code = queryParams?.code;

        if (typeof code === 'string') {
          const { error: e } = await supabase.auth.exchangeCodeForSession(url);
          if (e) throw e;
        } else if (url.includes('#access_token')) {
          const hash = url.split('#')[1];
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (!access_token) throw new Error('No access token in callback URL');
          const { error: e } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || '',
          });
          if (e) throw e;
        }
        // Session is now set. onAuthStateChange in AuthContext will fire,
        // which updates user state, which triggers _layout.tsx to navigate.
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted) setError(err.message || 'Authentication failed');
      }
    })();

    return () => { mounted = false; };
  }, []);

  return (
    <View style={styles.container}>
      {!error ? (
        <>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.text}>Completing sign in...</Text>
        </>
      ) : (
        <Text style={styles.errorText}>{error}</Text>
      )}
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
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

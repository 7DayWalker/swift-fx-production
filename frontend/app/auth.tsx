import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Cold-launch deep link handler.
 * Reached when app opens from swiftfx://auth?code=xxx or swiftfx://auth#access_token=xxx.
 * Sets session, verifies it, then navigates. Includes a hard timeout escape.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    // Hard timeout: if we're still on this screen after 5s, force navigate
    const escapeTimer = setTimeout(() => {
      if (!mounted) return;
      console.log('[AuthCallback] Escape timeout — forcing navigation');
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (mounted) {
          router.replace(session ? '/(tabs)' : '/(auth)/login');
        }
      }).catch(() => {
        if (mounted) router.replace('/(auth)/login');
      });
    }, 5000);

    const handleDeepLink = async () => {
      try {
        const url = await Linking.getInitialURL();

        if (url) {
          console.log('[AuthCallback] URL:', url);
          const { queryParams } = Linking.parse(url);
          const code = queryParams?.code;

          if (typeof code === 'string') {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } else if (url.includes('#access_token')) {
            const hash = url.split('#')[1];
            const params = new URLSearchParams(hash);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (!access_token) throw new Error('No access token in callback URL');
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            });
            if (sessionError) throw sessionError;
          }
        }

        // Verify session is established
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[AuthCallback] Session exists:', !!session);

        if (mounted) {
          clearTimeout(escapeTimer);
          if (session) {
            router.replace('/(tabs)');
          } else {
            router.replace('/(auth)/login');
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted) {
          clearTimeout(escapeTimer);
          setError(err.message || 'Authentication failed');
          // Brief pause so error is visible, then redirect
          setTimeout(() => {
            if (mounted) router.replace('/(auth)/login');
          }, 1500);
        }
      }
    };

    handleDeepLink();

    return () => {
      mounted = false;
      clearTimeout(escapeTimer);
    };
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

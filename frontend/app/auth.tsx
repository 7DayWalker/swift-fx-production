import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';

// Dismiss lingering browser session on cold launch via deep link.
WebBrowser.maybeCompleteAuthSession();

/**
 * Cold-launch deep link handler.
 *
 * This screen is reached ONLY when the app is opened from an external
 * deep link (swiftfx://auth?code=xxx). The normal OAuth flow
 * (openAuthSessionAsync) handles exchange directly in signInWithProvider.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const handleDeepLink = async () => {
      try {
        const url = await Linking.getInitialURL();

        if (url) {
          console.log('AUTH CALLBACK URL:', url);
          const { queryParams } = Linking.parse(url);
          const code = queryParams?.code;

          if (typeof code === 'string') {
            // PKCE flow: ?code=XXXX
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } else if (url.includes('#access_token')) {
            // Implicit flow: #access_token=XXXX&refresh_token=XXXX
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

        // Check if we have a valid session
        const { data: { session } } = await supabase.auth.getSession();

        if (mounted) {
          if (session) {
            router.replace('/(tabs)/dashboard');
          } else {
            router.replace('/(auth)/login');
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted) {
          setError(err.message || 'Authentication failed');
          router.replace('/(auth)/login');
        }
      }
    };

    handleDeepLink();

    return () => { mounted = false; };
  }, [router]);

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

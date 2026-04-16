import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';
import { useAuth } from '../src/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

/**
 * Cold-launch deep link handler.
 * Processes the callback URL and sets the session.
 *
 * Two distinct flows:
 *   1. PASSWORD RECOVERY — URL contains type=recovery in the fragment.
 *      Sets session from access_token, then signals recovery so _layout
 *      routes to /reset-password. Does NOT call exchangeCodeForSession.
 *
 *   2. OAUTH (Google / Apple) — URL contains ?code= (PKCE) or #access_token
 *      without type=recovery. Uses exchangeCodeForSession or setSession.
 *
 * Navigation is handled by _layout.tsx reacting to auth state changes.
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState('');
  const { triggerPasswordRecovery } = useAuth();

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;

    // Safety net: always exit loading state after 15 seconds
    timeout = setTimeout(() => {
      if (mounted && !error) {
        setError('Authentication timed out. Please try again.');
      }
    }, 15000);

    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) {
          if (mounted) setError('No authentication URL found');
          return;
        }

        console.log('[AuthCallback] URL:', url);

        // ── Detect password recovery ──
        // Recovery links look like: swiftfx://auth#access_token=...&type=recovery
        const isRecovery =
          url.includes('type=recovery') || url.includes('type%3Drecovery');

        if (isRecovery) {
          console.log('[AuthCallback] Password recovery flow detected');

          if (url.includes('#access_token')) {
            const hash = url.split('#')[1];
            const params = new URLSearchParams(hash);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (!access_token) throw new Error('No access token in recovery URL');

            // Signal recovery BEFORE setSession so _layout.tsx routes correctly
            // when onAuthStateChange fires SIGNED_IN immediately after
            triggerPasswordRecovery();

            const { error: e } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            });
            if (e) throw e;
          } else {
            // Recovery URL without access_token fragment — unexpected format
            throw new Error('Invalid password recovery link format');
          }

          // Session set + recovery signaled.
          // _layout.tsx will route to /reset-password.
          return;
        }

        // ── OAuth flow (Google / Apple) ──
        const { queryParams } = Linking.parse(url);
        const code = queryParams?.code;

        if (typeof code === 'string') {
          // PKCE flow: exchange authorization code for session
          const { error: e } = await supabase.auth.exchangeCodeForSession(url);
          if (e) throw e;
        } else if (url.includes('#access_token')) {
          // Implicit grant flow
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
        } else {
          // No code or access_token — invalid callback
          if (mounted) setError('Invalid authentication callback');
        }

        // Session is now set. onAuthStateChange in AuthContext will fire,
        // which updates user state, which triggers _layout.tsx to navigate.
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted) setError(err.message || 'Authentication failed');
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(timeout);
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

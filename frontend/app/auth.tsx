import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';
import { useAuth } from '../src/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

/**
 * Deep link handler for auth callbacks (cold start + runtime).
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
  const handled = useRef(false);

  // ── Shared URL handler — used by both cold start and runtime listener ──
  const handleAuthUrl = useCallback(async (url: string) => {
    // Prevent double-processing if both getInitialURL and listener fire
    if (handled.current) return;
    handled.current = true;

    try {
      console.log('[AuthCallback] Processing URL:', url);

      // ── Detect password recovery ──
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
          throw new Error('Invalid password recovery link format');
        }
        return;
      }

      // ── OAuth flow (Google / Apple) ──
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
      } else {
        throw new Error('Invalid authentication callback');
      }
    } catch (err: any) {
      console.error('[AuthCallback] Error:', err.message || err);
      setError(err.message || 'Authentication failed');
    }
  }, [triggerPasswordRecovery]);

  useEffect(() => {
    let mounted = true;

    // Safety net: always exit loading state after 15 seconds
    const timeout = setTimeout(() => {
      if (mounted && !handled.current) {
        setError('Authentication timed out. Please try again.');
      }
    }, 15000);

    // ── Cold start: app was not running when link was tapped ──
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleAuthUrl(url);
      }
      // If null, don't show error yet — the runtime listener may still fire
    });

    // ── Runtime: app was already running (in background) when link was tapped ──
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        handleAuthUrl(event.url);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [handleAuthUrl]);

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

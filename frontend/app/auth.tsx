import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../src/services/supabase';
import { getPendingOAuthCallbackUrl } from '../src/context/AuthContext';

/**
 * OAuth callback route — the SINGLE place where session exchange happens.
 *
 * Reached via two paths:
 *  1. openAuthSessionAsync captured the redirect → login.tsx routes here,
 *     callback URL is available via getPendingOAuthCallbackUrl().
 *  2. External deep link (swiftfx://auth) opens the app directly →
 *     callback URL comes from Linking.getInitialURL().
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    const handleOAuthCallback = async () => {
      try {
        // 1. Check bridge from openAuthSessionAsync (login.tsx flow)
        // 2. Fall back to deep link URL (external browser flow)
        const url = getPendingOAuthCallbackUrl() || (await Linking.getInitialURL());
        console.log('[AuthCallback] URL received:', url);

        if (!url) {
          // No callback URL at all — check if a session already exists
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log('[AuthCallback] Existing session found, redirecting');
            if (mounted) router.replace('/(tabs)/dashboard');
            return;
          }
          throw new Error('No callback URL received');
        }

        // PKCE flow: extract code from query params using URL API
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');

        if (code) {
          console.log('[AuthCallback] PKCE code found, exchanging for session');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit flow: tokens in hash fragment
          const hashPart = url.split('#')[1];
          if (hashPart) {
            const params = new URLSearchParams(hashPart);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (access_token && refresh_token) {
              console.log('[AuthCallback] Implicit tokens found, setting session');
              const { error } = await supabase.auth.setSession({
                access_token,
                refresh_token,
              });
              if (error) throw error;
            } else {
              throw new Error('No auth tokens found in callback URL');
            }
          } else {
            // Last resort: session may already exist from auto-detection
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              throw new Error('No auth code or tokens in callback URL');
            }
            console.log('[AuthCallback] Session already exists from auto-detection');
          }
        }

        // Session established — onAuthStateChange in AuthContext updates user state
        if (mounted) {
          console.log('[AuthCallback] Success — redirecting to dashboard');
          router.replace('/(tabs)/dashboard');
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted) {
          setStatus('error');
          setErrorMsg(err.message || 'Authentication failed');
          setTimeout(() => {
            if (mounted) router.replace('/(auth)/login');
          }, 2000);
        }
      }
    };

    handleOAuthCallback();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.text}>Completing sign in...</Text>
        </>
      )}
      {status === 'error' && (
        <>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Text style={styles.subText}>Redirecting to login...</Text>
        </>
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
  subText: {
    color: '#8A8D98',
    fontSize: 14,
    marginTop: 8,
  },
});

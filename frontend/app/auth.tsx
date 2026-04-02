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
    let resolved = false;

    const navigate = (target: string) => {
      if (!mounted || resolved) return;
      resolved = true;
      router.replace(target as any);
    };

    // Hard timeout: if nothing resolves in 10s, redirect to login
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[AuthCallback] Timed out after 10s — redirecting to login');
        navigate('/(auth)/login');
      }
    }, 10000);

    const handleOAuthCallback = async () => {
      try {
        const url = getPendingOAuthCallbackUrl() || (await Linking.getInitialURL());
        console.log('[AuthCallback] URL received:', url);

        if (url) {
          // Safe code extraction via regex (works with custom scheme URLs like swiftfx://)
          const codeMatch = url.match(/[?&]code=([^&#]+)/);
          const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;

          if (code) {
            console.log('[AuthCallback] PKCE code found, exchanging...');
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
                const { error } = await supabase.auth.setSession({ access_token, refresh_token });
                if (error) throw error;
              }
            }
          }
        }

        // Verify session exists (regardless of how we got here)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[AuthCallback] Session confirmed — redirecting to dashboard');
          navigate('/(tabs)/dashboard');
        } else {
          throw new Error('No session established after OAuth callback');
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err.message || err);
        if (mounted && !resolved) {
          setStatus('error');
          setErrorMsg(err.message || 'Authentication failed');
          setTimeout(() => navigate('/(auth)/login'), 2000);
        }
      }
    };

    handleOAuthCallback();

    return () => {
      mounted = false;
      clearTimeout(timeout);
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

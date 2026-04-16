import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/services/supabase';
import { useAuth } from '../src/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

/**
 * Deep link handler for auth callbacks (cold start + runtime).
 * DEBUG BUILD — heavy logging to trace the exact deep link flow.
 */
export default function AuthCallbackScreen() {
  const [error, setError] = useState('');
  const { triggerPasswordRecovery } = useAuth();
  const handled = useRef(false);

  console.log('[AuthCallback] ===== SCREEN MOUNTED =====');

  // ── Shared URL handler ──
  const handleAuthUrl = useCallback(async (url: string, source: string) => {
    console.log(`[AuthCallback] handleAuthUrl called`);
    console.log(`[AuthCallback]   source: ${source}`);
    console.log(`[AuthCallback]   handled.current: ${handled.current}`);
    console.log(`[AuthCallback]   RAW URL: ${url}`);

    if (handled.current) {
      console.log(`[AuthCallback]   SKIPPED — already handled`);
      return;
    }
    handled.current = true;

    try {
      // ── Parse URL components ──
      const hasFragment = url.includes('#');
      const hasQueryCode = url.includes('?code=') || url.includes('&code=');
      const fragment = hasFragment ? url.split('#')[1] : null;

      console.log(`[AuthCallback]   hasFragment (#): ${hasFragment}`);
      console.log(`[AuthCallback]   hasQueryCode (?code=): ${hasQueryCode}`);
      console.log(`[AuthCallback]   fragment: ${fragment ? fragment.substring(0, 200) + '...' : 'null'}`);

      // ── Parse fragment values ──
      let fragAccessToken: string | null = null;
      let fragRefreshToken: string | null = null;
      let fragType: string | null = null;

      if (fragment) {
        const fragParams = new URLSearchParams(fragment);
        fragAccessToken = fragParams.get('access_token');
        fragRefreshToken = fragParams.get('refresh_token');
        fragType = fragParams.get('type');

        console.log(`[AuthCallback]   PARSED FRAGMENT:`);
        console.log(`[AuthCallback]     access_token: ${fragAccessToken ? fragAccessToken.substring(0, 30) + '...' : 'null'}`);
        console.log(`[AuthCallback]     refresh_token: ${fragRefreshToken ? fragRefreshToken.substring(0, 20) + '...' : 'null'}`);
        console.log(`[AuthCallback]     type: ${fragType}`);
      }

      // ── Parse query params via Linking ──
      const parsed = Linking.parse(url);
      console.log(`[AuthCallback]   Linking.parse result:`);
      console.log(`[AuthCallback]     hostname: ${parsed.hostname}`);
      console.log(`[AuthCallback]     path: ${parsed.path}`);
      console.log(`[AuthCallback]     queryParams: ${JSON.stringify(parsed.queryParams)}`);

      // ── Recovery detection ──
      const isRecoveryFragment = fragType === 'recovery';
      const isRecoveryUrl = url.includes('type=recovery') || url.includes('type%3Drecovery');

      console.log(`[AuthCallback]   RECOVERY DETECTION:`);
      console.log(`[AuthCallback]     isRecoveryFragment (type param): ${isRecoveryFragment}`);
      console.log(`[AuthCallback]     isRecoveryUrl (string match): ${isRecoveryUrl}`);
      console.log(`[AuthCallback]     FINAL isRecovery: ${isRecoveryFragment || isRecoveryUrl}`);

      const isRecovery = isRecoveryFragment || isRecoveryUrl;

      if (isRecovery) {
        console.log(`[AuthCallback]   >>> ENTERING RECOVERY FLOW`);

        if (fragAccessToken) {
          console.log(`[AuthCallback]   Calling triggerPasswordRecovery()...`);
          triggerPasswordRecovery();
          console.log(`[AuthCallback]   triggerPasswordRecovery() done`);

          console.log(`[AuthCallback]   Calling supabase.auth.setSession()...`);
          const { error: e } = await supabase.auth.setSession({
            access_token: fragAccessToken,
            refresh_token: fragRefreshToken || '',
          });
          console.log(`[AuthCallback]   setSession result — error: ${e ? e.message : 'none'}`);
          if (e) throw e;

          console.log(`[AuthCallback]   >>> RECOVERY FLOW COMPLETE — waiting for _layout.tsx to route`);
        } else {
          console.log(`[AuthCallback]   ERROR: No access_token in recovery URL fragment`);
          throw new Error('Invalid password recovery link format — no access_token in fragment');
        }
        return;
      }

      // ── OAuth flow ──
      console.log(`[AuthCallback]   >>> ENTERING OAUTH FLOW`);
      const code = parsed.queryParams?.code;
      console.log(`[AuthCallback]   OAuth code: ${typeof code === 'string' ? code.substring(0, 20) + '...' : String(code)}`);

      if (typeof code === 'string') {
        console.log(`[AuthCallback]   Calling exchangeCodeForSession()...`);
        const { error: e } = await supabase.auth.exchangeCodeForSession(url);
        console.log(`[AuthCallback]   exchangeCodeForSession result — error: ${e ? e.message : 'none'}`);
        if (e) throw e;
      } else if (fragAccessToken) {
        console.log(`[AuthCallback]   Calling setSession() (implicit grant)...`);
        const { error: e } = await supabase.auth.setSession({
          access_token: fragAccessToken,
          refresh_token: fragRefreshToken || '',
        });
        console.log(`[AuthCallback]   setSession result — error: ${e ? e.message : 'none'}`);
        if (e) throw e;
      } else {
        console.log(`[AuthCallback]   ERROR: No code and no access_token — invalid callback`);
        setError('Invalid authentication callback');
      }
    } catch (err: any) {
      console.error(`[AuthCallback] EXCEPTION: ${err.message || err}`);
      setError(err.message || 'Authentication failed');
    }
  }, [triggerPasswordRecovery]);

  useEffect(() => {
    let mounted = true;
    console.log(`[AuthCallback] useEffect FIRED — setting up listeners`);

    const timeout = setTimeout(() => {
      console.log(`[AuthCallback] TIMEOUT fired — handled.current: ${handled.current}, mounted: ${mounted}`);
      if (mounted && !handled.current) {
        setError('Authentication timed out. Please try again.');
      }
    }, 15000);

    // ── Cold start ──
    console.log(`[AuthCallback] Calling Linking.getInitialURL()...`);
    Linking.getInitialURL().then((url) => {
      console.log(`[AuthCallback] getInitialURL result: ${url ? url.substring(0, 100) + '...' : 'null'}`);
      if (url) {
        handleAuthUrl(url, 'getInitialURL');
      } else {
        console.log(`[AuthCallback] getInitialURL returned null — waiting for addEventListener`);
      }
    }).catch((err) => {
      console.error(`[AuthCallback] getInitialURL ERROR: ${err}`);
    });

    // ── Runtime listener ──
    console.log(`[AuthCallback] Registering addEventListener('url')...`);
    const subscription = Linking.addEventListener('url', (event) => {
      console.log(`[AuthCallback] addEventListener FIRED — url: ${event.url ? event.url.substring(0, 100) + '...' : 'null'}`);
      if (event.url) {
        handleAuthUrl(event.url, 'addEventListener');
      }
    });
    console.log(`[AuthCallback] addEventListener registered`);

    return () => {
      console.log(`[AuthCallback] ===== SCREEN UNMOUNTING =====`);
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
          <Text style={styles.debugText}>
            auth.tsx mounted — waiting for deep link...
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.debugText}>
            handled: {String(handled.current)}
          </Text>
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
  debugText: {
    color: '#555',
    fontSize: 11,
    marginTop: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

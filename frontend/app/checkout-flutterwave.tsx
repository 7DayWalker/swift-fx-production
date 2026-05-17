/**
 * In-app Flutterwave checkout (Android sideloaded distributions only).
 *
 * Renders the hosted Flutterwave page in a full-screen react-native-webview.
 * NEVER opens the system browser. Detects the backend redirect page via
 * navigation events and then polls the backend `/status` endpoint to learn
 * the verified outcome (webhook is the source of truth).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useSubscription } from '../src/context/SubscriptionContext';
import {
  getFlutterwaveStatus,
  FLUTTERWAVE_REDIRECT_PREFIX,
  type FlutterwaveStatus,
} from '../src/services/payments/flutterwave';

type Stage = 'loading' | 'paying' | 'verifying' | 'success' | 'failed' | 'cancelled';

const MAX_POLL_ATTEMPTS = 12; // ~24s at 2s interval
const POLL_INTERVAL_MS = 2000;

export default function FlutterwaveCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; txRef?: string; planLabel?: string }>();
  const { refreshStatus } = useSubscription();

  const [stage, setStage] = useState<Stage>('paying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const settled = useRef(false);

  const url = String(params.url || '');
  const txRef = String(params.txRef || '');
  const planLabel = String(params.planLabel || 'Subscription');

  // Hardware back: ask user to confirm leaving checkout
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settled.current) return false;
      Alert.alert('Leave checkout?', 'Your payment has not been completed.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const settleWithStatus = useCallback(
    async (next: Stage, message?: string) => {
      if (settled.current) return;
      settled.current = true;
      setStage(next);
      if (message) setErrorMsg(message);
      if (next === 'success') {
        try { await refreshStatus(); } catch { /* non-fatal */ }
      }
    },
    [refreshStatus],
  );

  const pollUntilSettled = useCallback(async () => {
    setStage('verifying');
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      try {
        const res = await getFlutterwaveStatus(txRef);
        const s: FlutterwaveStatus = res.status;
        if (s === 'successful') {
          if (res.subscription_expiry) {
            await settleWithStatus('success');
            return;
          }
          console.log('[FlutterwaveCheckout] Payment successful but subscription activation is still pending:', res);
        }
        if (s === 'failed' || s === 'cancelled') {
          await settleWithStatus(s as Stage, 'Payment was not completed.');
          return;
        }
      } catch (err: any) {
        // network blip — keep polling
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    // Timed out — leave the user a manual retry path.
    await settleWithStatus(
      'failed',
      'We could not confirm the payment in time. If you were charged, tap "Restore" on the subscription screen or contact support.',
    );
  }, [txRef, settleWithStatus]);

  const handleNavChange = useCallback(
    (nav: WebViewNavigation | { url: string }) => {
      const navUrl = (nav as WebViewNavigation).url || '';
      if (!navUrl) return;
      if (!navUrl.includes(FLUTTERWAVE_REDIRECT_PREFIX)) return;

      // Parse status hint from query string. Final word still comes from /status.
      let hint: string | null = null;
      try {
        const qIdx = navUrl.indexOf('?');
        if (qIdx > -1) {
          const qs = new URLSearchParams(navUrl.substring(qIdx + 1));
          hint = qs.get('status');
        }
      } catch { /* ignore */ }

      if (hint === 'cancelled') {
        settleWithStatus('cancelled', 'Payment cancelled.');
        return;
      }
      // Successful or unknown → defer to backend verification.
      pollUntilSettled();
    },
    [pollUntilSettled, settleWithStatus],
  );

  if (!url || !txRef) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Missing checkout parameters.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const showWebView = stage === 'paying';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (settled.current) { router.back(); return; }
            Alert.alert('Leave checkout?', 'Your payment has not been completed.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => router.back() },
            ]);
          }}
          style={styles.backBtn}
          data-testid="flutterwave-back-btn"
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Secure Checkout</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{planLabel}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {showWebView && (
        <WebView
          source={{ uri: url }}
          onNavigationStateChange={handleNavChange}
          onLoadProgress={({ nativeEvent }) => handleNavChange({ url: nativeEvent.url })}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#00D4AA" />
              <Text style={styles.loaderText}>Loading checkout…</Text>
            </View>
          )}
          onError={() => settleWithStatus('failed', 'Could not load checkout. Check your connection and try again.')}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="compatibility"
          originWhitelist={['https://*', 'http://*']}
          data-testid="flutterwave-webview"
        />
      )}

      {stage === 'verifying' && (
        <View style={styles.statusWrap}>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.statusTitle}>Verifying payment…</Text>
          <Text style={styles.statusBody}>This usually takes a few seconds.</Text>
        </View>
      )}

      {stage === 'success' && (
        <View style={styles.statusWrap}>
          <Ionicons name="checkmark-circle" size={56} color="#10B981" />
          <Text style={styles.statusTitle}>Payment successful</Text>
          <Text style={styles.statusBody}>Your subscription has been activated.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/subscription')}
            data-testid="flutterwave-success-continue"
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {(stage === 'failed' || stage === 'cancelled') && (
        <View style={styles.statusWrap}>
          <Ionicons
            name={stage === 'cancelled' ? 'close-circle' : 'alert-circle'}
            size={56}
            color={stage === 'cancelled' ? '#8A8D98' : '#FF6B6B'}
          />
          <Text style={styles.statusTitle}>
            {stage === 'cancelled' ? 'Payment cancelled' : 'Payment not confirmed'}
          </Text>
          <Text style={styles.statusBody}>{errorMsg || 'No charge was applied. You can try again.'}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/subscription')}
            data-testid="flutterwave-retry-btn"
          >
            <Text style={styles.primaryBtnText}>Back to plans</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E17' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1A1F2E',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1A1F2E',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  headerSub: { color: '#8A8D98', fontSize: 11, marginTop: 2 },
  loaderOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0A0E17', justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loaderText: { color: '#8A8D98', fontSize: 13 },
  statusWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  statusTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 8 },
  statusBody: { color: '#8A8D98', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: 16, backgroundColor: '#00D4AA', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#0A0E17', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#FF6B6B', textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
});

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useSignals } from '../src/context/SignalContext';
import SignalOverlay from '../src/components/SignalOverlay';
import SignalLinesOverlay from '../src/components/SignalLinesOverlay';
import api from '../src/services/api';

export default function ChartScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [linesDismissed, setLinesDismissed] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const { activeSignals } = useSignals();

  const displaySymbol = symbol || 'EURUSD';
  const chartUrl = `https://www.tradingview.com/widgetembed/?symbol=${displaySymbol}&interval=60&theme=dark&style=1&hide_top_toolbar=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`;

  // Reset state when symbol changes
  useEffect(() => {
    setOverlayDismissed(false);
    setLinesDismissed(false);
    setCurrentPrice(null);
  }, [displaySymbol]);

  // Fetch current market price (fire-and-forget, non-blocking)
  useEffect(() => {
    let cancelled = false;
    api.get('/market/price', { params: { symbol: displaySymbol } })
      .then((res) => {
        if (!cancelled && res.data?.price != null) {
          setCurrentPrice(Number(res.data.price));
        }
      })
      .catch(() => {}); // silently ignore — overlay still works without it
    return () => { cancelled = true; };
  }, [displaySymbol]);

  // Find the best matching signal for this symbol:
  //   1. Filter by pair match
  //   2. Prefer state === 'active'
  //   3. Fallback to most recent by activated_at or created_at
  const matchingSignal = useMemo(() => {
    const normalized = displaySymbol.toUpperCase();
    const matches = activeSignals.filter((s) => {
      return s.pair.replace('/', '').toUpperCase() === normalized;
    });

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Prefer 'active' state signals
    const active = matches.filter((s) => s.state === 'active');
    const pool = active.length > 0 ? active : matches;

    // Sort by most recent timestamp
    pool.sort((a, b) => {
      const tsA = a.activated_at || a.created_at || '';
      const tsB = b.activated_at || b.created_at || '';
      return tsB.localeCompare(tsA);
    });

    return pool[0];
  }, [activeSignals, displaySymbol]);

  const showOverlay = matchingSignal && !overlayDismissed;
  const showLines = matchingSignal && !linesDismissed;

  const openInBrowser = () => {
    Linking.openURL(`https://www.tradingview.com/chart/?symbol=${displaySymbol}`);
  };

  const handleViewSignal = () => {
    router.push('/(tabs)/signals');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          data-testid="chart-back-button"
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title} data-testid="chart-symbol-title">{displaySymbol}</Text>
        <TouchableOpacity
          style={styles.externalButton}
          onPress={openInBrowser}
          data-testid="chart-open-external"
        >
          <Ionicons name="open-outline" size={20} color="#8A8D98" />
        </TouchableOpacity>
      </View>

      <View style={styles.chartArea}>
        {hasError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#8A8D98" />
            <Text style={styles.errorText}>Failed to load chart</Text>
            <TouchableOpacity style={styles.fallbackButton} onPress={openInBrowser}>
              <Ionicons name="open-outline" size={16} color="#0A0E17" />
              <Text style={styles.fallbackButtonText}>Open in browser</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#00D4AA" />
                <Text style={styles.loadingText}>Loading chart...</Text>
              </View>
            )}
            <WebView
              source={{ uri: chartUrl }}
              style={styles.webview}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => { setHasError(true); setIsLoading(false); }}
              onHttpError={() => { setHasError(true); setIsLoading(false); }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState={false}
              scalesPageToFit
            />
          </>
        )}

        {showLines && (
          <SignalLinesOverlay signal={matchingSignal} currentPrice={currentPrice} />
        )}

        {showOverlay && (
          <SignalOverlay
            signal={matchingSignal}
            onClose={() => setOverlayDismissed(true)}
            onViewSignal={handleViewSignal}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  externalButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A1F2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: '#0A0E17',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8A8D98',
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: '#8A8D98',
    fontSize: 16,
  },
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00D4AA',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  fallbackButtonText: {
    color: '#0A0E17',
    fontSize: 15,
    fontWeight: '600',
  },
});

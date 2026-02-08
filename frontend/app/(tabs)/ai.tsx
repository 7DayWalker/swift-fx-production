import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSubscription } from '../../src/context/SubscriptionContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/services/supabase';
import { TAB_BAR_HEIGHT } from './_layout';

// Supabase Edge Function URL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hrzghlqcfccnmgcipxxo.supabase.co';
const AI_ANALYZE_URL = `${SUPABASE_URL}/functions/v1/ai-analyze`;

interface AIUsage {
  current_usage: number;
  weekly_limit: number | string;
  remaining: number;
  has_access: boolean;
}

interface AnalysisResult {
  success?: boolean;
  analysis_id: string | null;
  pair: string;
  timeframe: string;
  market_bias: string;
  trend_structure: string;
  support_levels: string[];
  resistance_levels: string[];
  trade_insight: string;
  confidence: string;
  disclaimer?: string;
  remaining_analyses?: number;
  weekly_limit?: number | string;
  created_at?: string;
}

// Tier-based limits (must match Edge Function)
const TIER_LIMITS: Record<string, number> = {
  free: 3,
  premium: 10,
  vip: -1,    // unlimited
  admin: -1,  // unlimited
};

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

type ScreenState = 'upload' | 'analyzing' | 'result' | 'error' | 'limit_reached';

export default function AIScreen() {
  const { user } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  
  // Calculate bottom padding for content to avoid tab bar overlap
  const bottomPadding = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + 8;
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('H1');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPairPicker, setShowPairPicker] = useState(false);
  const [showTimeframePicker, setShowTimeframePicker] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [screenState, setScreenState] = useState<ScreenState>('upload');

  useEffect(() => {
    fetchUsage();
  }, [user]);

  const fetchUsage = async () => {
    try {
      // Get user's role and usage from Supabase profile
      if (!user) {
        setUsage({ current_usage: 0, weekly_limit: 0, remaining: 0, has_access: false });
        setIsLoadingUsage(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, ai_weekly_used, ai_weekly_reset')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        console.error('Failed to fetch profile for AI usage:', error);
        setUsage({ current_usage: 0, weekly_limit: 3, remaining: 3, has_access: true });
        setIsLoadingUsage(false);
        return;
      }

      const role = profile.role || 'free';
      const limit = TIER_LIMITS[role] ?? TIER_LIMITS.free;
      const isUnlimited = limit === -1;
      
      // Check if we need to reset the weekly counter
      let currentUsage = profile.ai_weekly_used || 0;
      const resetDate = profile.ai_weekly_reset ? new Date(profile.ai_weekly_reset) : null;
      const now = new Date();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      
      if (!resetDate || (now.getTime() - resetDate.getTime()) >= weekMs) {
        // Counter should be reset (Edge Function will handle this on next call)
        currentUsage = 0;
      }

      const remaining = isUnlimited ? 999 : Math.max(0, limit - currentUsage);
      
      setUsage({
        current_usage: currentUsage,
        weekly_limit: isUnlimited ? 'unlimited' : limit,
        remaining,
        has_access: true, // All authenticated users have access
      });
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
      setUsage({ current_usage: 0, weekly_limit: 3, remaining: 3, has_access: true });
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      const msg = 'Please allow access to your photo library';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Permission Required', msg);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, // Allow any orientation - don't force crop
      quality: 0.85,
      base64: true,
      exif: false, // Don't need EXIF data
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await processAndSetImage(asset);
    }
  };
  
  // NEW: Camera capture for mobile users
  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      const msg = 'Please allow access to your camera to take chart photos';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Permission Required', msg);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, // Don't force crop - accept any orientation
      quality: 0.85,
      base64: true,
      exif: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await processAndSetImage(asset);
    }
  };
  
  // Process and preprocess image for better AI analysis
  const processAndSetImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setSelectedImage(asset.uri);
    
    // Store base64 for upload
    if (asset.base64) {
      // Preprocess image: resize if too large (max 2048px on longest side)
      const processedBase64 = await preprocessImage(asset.base64, asset.width, asset.height);
      setImageBase64(processedBase64);
    } else {
      setImageBase64(null);
    }
    
    // Clear previous result when new image is selected
    if (screenState === 'result' || screenState === 'error') {
      setScreenState('upload');
      setAnalysisResult(null);
      setErrorMessage(null);
    }
  };
  
  // Preprocess image for Claude Vision - CRITICAL for mobile support
  // Claude Vision via emergentintegrations requires PNG format, max 1024px
  const preprocessImage = async (base64: string, width?: number, height?: number): Promise<string> => {
    // ALWAYS process to ensure PNG format and proper dimensions
    const MAX_DIMENSION = 1024; // Claude Vision limit
    
    // For web, use canvas to resize and convert to PNG
    if (Platform.OS === 'web') {
      try {
        const img = new window.Image();
        
        // Handle both raw base64 and data URI formats
        const imgSrc = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
        img.src = imgSrc;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Image load timeout')), 10000);
        });
        
        console.log(`Original image: ${img.width}x${img.height}`);
        
        // Calculate new dimensions - BOTH must be <= 1024px
        let newWidth = img.width;
        let newHeight = img.height;
        
        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          const widthRatio = MAX_DIMENSION / img.width;
          const heightRatio = MAX_DIMENSION / img.height;
          // Use the smaller ratio to ensure BOTH dimensions are within limit
          const ratio = Math.min(widthRatio, heightRatio);
          newWidth = Math.round(img.width * ratio);
          newHeight = Math.round(img.height * ratio);
        }
        
        console.log(`Resized image: ${newWidth}x${newHeight}`);
        
        // Create canvas with white background (removes alpha channel issues)
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Fill with white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, newWidth, newHeight);
          
          // Draw the image
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          // Export as PNG (required by emergentintegrations library)
          const pngDataUrl = canvas.toDataURL('image/png');
          const pngBase64 = pngDataUrl.split(',')[1];
          
          console.log(`PNG base64 length: ${pngBase64.length}`);
          return pngBase64;
        }
      } catch (error) {
        console.warn('Image preprocessing failed:', error);
      }
    }
    
    // For native platforms or if processing fails, return original
    return base64;
  };

  const analyzeChart = async () => {
    if (!selectedImage) {
      const msg = 'Please select a chart image first';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('No Image', msg);
      return;
    }

    if (!usage?.has_access) {
      // Redirect to subscription page when no access
      if (Platform.OS === 'web') {
        window.alert('AI Chart Analyzer requires a subscription. Redirecting to plans...');
      } else {
        Alert.alert(
          'Upgrade Required', 
          'AI Chart Analyzer requires a subscription.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Plans', onPress: () => router.push('/subscription') }
          ]
        );
      }
      router.push('/subscription');
      return;
    }

    if (usage && usage.remaining <= 0) {
      // Show limit reached and redirect to subscription
      if (Platform.OS === 'web') {
        window.alert('AI limit reached. Upgrade to continue.');
      } else {
        Alert.alert(
          'AI Limit Reached', 
          'You have used all your weekly AI analyses. Upgrade for more.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/subscription') }
          ]
        );
      }
      return;
    }

    // Switch to analyzing state
    setScreenState('analyzing');
    setErrorMessage(null);

    try {
      // Get auth session for the Edge Function call
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Please log in to use AI Analyzer');
      }

      // Prepare image base64 if available
      let cleanBase64: string | undefined;
      if (imageBase64) {
        cleanBase64 = imageBase64;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }
        console.log('Prepared image base64, length:', cleanBase64.length);
      }

      // Build request payload for Edge Function
      const payload = {
        prompt: `Please analyze this ${selectedPair} chart on ${selectedTimeframe} timeframe. Identify the market bias, trend structure, key support and resistance levels, and provide actionable trading insights.`,
        pair: selectedPair,
        timeframe: selectedTimeframe,
        image_base64: cleanBase64,
      };

      console.log('Calling AI Analyze Edge Function...');

      // Call Supabase Edge Function
      const response = await fetch(AI_ANALYZE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('AI Analysis response:', JSON.stringify(data, null, 2));

      // Handle different response codes
      if (response.status === 429) {
        // Quota exceeded
        setErrorMessage(data.upgrade_message || 'Weekly AI analysis limit reached. Upgrade for more.');
        setScreenState('limit_reached');
        return;
      }

      if (response.status === 401) {
        setErrorMessage('Session expired. Please log in again.');
        setScreenState('error');
        return;
      }

      if (!response.ok) {
        // Other errors (400, 500, 502)
        const errorMsg = data.error || data.details || 'Analysis failed. Please try again.';
        setErrorMessage(errorMsg);
        setScreenState('error');
        return;
      }

      // Success - store result
      setAnalysisResult(data);
      setScreenState('result');
      
      // Refresh usage after analysis
      fetchUsage();
    } catch (error: any) {
      console.error('AI Analysis error:', error);
      setErrorMessage(error.message || 'Failed to analyze chart. Please try again.');
      setScreenState('error');
    }
  };

  const resetToUpload = () => {
    setScreenState('upload');
    setAnalysisResult(null);
    setErrorMessage(null);
    // Keep the image and settings - don't reset them
  };

  const startNewAnalysis = () => {
    setScreenState('upload');
    setSelectedImage(null);
    setImageBase64(null);
    setAnalysisResult(null);
    setErrorMessage(null);
    setSelectedPair(PAIRS[0]);
    setSelectedTimeframe('H1');
  };

  const getBiasColor = (bias: string) => {
    const lowerBias = bias?.toLowerCase() || '';
    if (lowerBias.includes('bullish')) return '#00D4AA';
    if (lowerBias.includes('bearish')) return '#FF4757';
    return '#FFD700';
  };

  const getConfidenceColor = (confidence: string) => {
    const lowerConf = confidence?.toLowerCase() || '';
    if (lowerConf.includes('high')) return '#00D4AA';
    if (lowerConf.includes('medium')) return '#FFD700';
    return '#FF4757';
  };

  const getBiasIcon = (bias: string) => {
    const lowerBias = bias?.toLowerCase() || '';
    if (lowerBias.includes('bullish')) return 'trending-up';
    if (lowerBias.includes('bearish')) return 'trending-down';
    return 'remove';
  };

  // Helper function to safely render any value as a string
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      // For arrays, join primitive values or stringify objects
      return value.map(v => {
        if (typeof v === 'string' || typeof v === 'number') return String(v);
        if (typeof v === 'object' && v !== null) {
          return v.msg || v.message || JSON.stringify(v);
        }
        return String(v);
      }).join(', ');
    }
    if (typeof value === 'object') {
      // Handle Pydantic validation errors {type, loc, msg, input, ctx, url}
      if (value.msg) return String(value.msg);
      if (value.message) return String(value.message);
      if (value.detail) {
        // FastAPI error detail can be string or array
        if (typeof value.detail === 'string') return value.detail;
        if (Array.isArray(value.detail)) {
          return value.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
        }
        return JSON.stringify(value.detail);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  };

  // Helper to safely get array of levels as strings
  const safeLevels = (levels: any): string[] => {
    if (!levels) return [];
    if (!Array.isArray(levels)) {
      // If it's a single value, wrap in array
      const str = safeString(levels);
      return str ? [str] : [];
    }
    return levels.map(level => {
      if (typeof level === 'string') return level;
      if (typeof level === 'number') return String(level);
      if (typeof level === 'object' && level !== null) {
        return level.msg || level.message || JSON.stringify(level);
      }
      return String(level);
    }).filter(Boolean);
  };

  // Safe render component - renders any value safely
  const SafeText = ({ value, style }: { value: any; style?: any }) => {
    const text = safeString(value);
    return <Text style={style}>{text}</Text>;
  };

  // No access screen for free users
  if (!isLoadingUsage && !usage?.has_access) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView 
          contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.noAccessContainer}>
            <View style={[styles.lockIconContainer, { backgroundColor: `${theme.warning}15` }]}>
              <Ionicons name="lock-closed" size={64} color={theme.warning} />
            </View>
            <Text style={[styles.noAccessTitle, { color: theme.text }]}>AI Chart Analyzer</Text>
            <Text style={[styles.noAccessSubtitle, { color: theme.textSecondary }]}>
              This feature requires Premium or VIP subscription
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                <Text style={[styles.featureText, { color: theme.text }]}>AI-powered chart analysis</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                <Text style={[styles.featureText, { color: theme.text }]}>Market bias detection</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                <Text style={[styles.featureText, { color: theme.text }]}>Support & resistance levels</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                <Text style={[styles.featureText, { color: theme.text }]}>Trade insights</Text>
              </View>
            </View>
            <View style={styles.planComparison}>
              <View style={[styles.planCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.planName, { color: theme.primary }]}>Premium</Text>
                <Text style={[styles.planLimit, { color: theme.textSecondary }]}>5 analyses/week</Text>
              </View>
              <View style={[styles.planCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                <Text style={[styles.planName, { color: theme.warning }]}>VIP</Text>
                <Text style={[styles.planLimit, { color: theme.textSecondary }]}>20 analyses/week</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Analyzing screen - show loading state
  if (screenState === 'analyzing') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView 
          contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.analyzingContainer}>
            <View style={[styles.analyzingIconContainer, { backgroundColor: `${theme.primary}15` }]}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
            <Text style={[styles.analyzingTitle, { color: theme.text }]}>Analyzing Chart</Text>
            <Text style={[styles.analyzingSubtitle, { color: theme.textSecondary }]}>
              Our AI is analyzing your {selectedPair} chart on {selectedTimeframe} timeframe
            </Text>
            <View style={styles.analyzingSteps}>
              <View style={styles.analyzingStep}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                <Text style={[styles.analyzingStepText, { color: theme.text }]}>Processing image</Text>
              </View>
              <View style={styles.analyzingStep}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.analyzingStepText, { color: theme.text }]}>Detecting patterns</Text>
              </View>
              <View style={styles.analyzingStep}>
                <Ionicons name="ellipse-outline" size={20} color={theme.textSecondary} />
                <Text style={[styles.analyzingStepText, { color: theme.textSecondary }]}>Generating insights</Text>
              </View>
            </View>
            <Text style={[styles.analyzingNote, { color: theme.textSecondary }]}>This may take up to 30 seconds...</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Error screen
  if (screenState === 'error') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScrollView 
          contentContainerStyle={{ paddingBottom: bottomPadding, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.errorContainer}>
            <View style={[styles.errorIconContainer, { backgroundColor: `${theme.error}15` }]}>
              <Ionicons name="alert-circle" size={64} color={theme.error} />
            </View>
            <Text style={[styles.errorTitle, { color: theme.text }]}>Analysis Failed</Text>
            <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>{errorMessage}</Text>
            <View style={styles.errorButtons}>
              <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={analyzeChart}>
                <Ionicons name="refresh" size={20} color="#0A0E17" />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.backButton, { borderColor: theme.border }]} onPress={resetToUpload}>
                <Text style={[styles.backButtonText, { color: theme.text }]}>Change Image</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Results screen
  if (screenState === 'result' && analysisResult) {
    // Debug: Log the entire analysis result
    console.log('Rendering analysis result:', JSON.stringify(analysisResult, null, 2));
    
    // Safely extract all values with defensive checks
    const marketBias = safeString(analysisResult.market_bias) || 'Unknown';
    const confidence = safeString(analysisResult.confidence) || 'Medium';
    const trendStructure = safeString(analysisResult.trend_structure) || 'Analysis not available';
    const tradeInsight = safeString(analysisResult.trade_insight) || 'No specific insight available';
    const disclaimer = safeString(analysisResult.disclaimer) || 'This analysis is for educational purposes only. Always do your own research before trading.';
    const supportLevels = safeLevels(analysisResult.support_levels);
    const resistanceLevels = safeLevels(analysisResult.resistance_levels);
    const pair = safeString(analysisResult.pair) || selectedPair;
    const timeframe = safeString(analysisResult.timeframe) || selectedTimeframe;
    const remainingAnalyses = analysisResult.remaining_analyses !== undefined 
      ? String(analysisResult.remaining_analyses) 
      : null;
    
    // Debug: Log extracted values
    console.log('Extracted values:', {
      marketBias,
      confidence,
      trendStructure: trendStructure.substring(0, 50) + '...',
      tradeInsight: tradeInsight.substring(0, 50) + '...',
      supportLevels,
      resistanceLevels,
      pair,
      timeframe,
      remainingAnalyses
    });
    
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.resultHeader}>
          <TouchableOpacity style={styles.resultBackButton} onPress={resetToUpload}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.resultHeaderTitle}>Analysis Result</Text>
          <TouchableOpacity style={styles.newAnalysisButton} onPress={startNewAnalysis}>
            <Ionicons name="add" size={24} color="#00D4AA" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.resultScrollView} 
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {/* Chart Info */}
          <View style={styles.chartInfoCard}>
            <View style={styles.chartInfoRow}>
              <View style={styles.chartInfoItem}>
                <Text style={styles.chartInfoLabel}>Pair</Text>
                <Text style={styles.chartInfoValue}>{pair}</Text>
              </View>
              <View style={styles.chartInfoItem}>
                <Text style={styles.chartInfoLabel}>Timeframe</Text>
                <Text style={styles.chartInfoValue}>{timeframe}</Text>
              </View>
            </View>
            {selectedImage && (
              <Image source={{ uri: selectedImage }} style={styles.resultChartImage} />
            )}
          </View>

          {/* Market Bias Card - Prominent */}
          <View style={[styles.biasCard, { borderColor: getBiasColor(marketBias) }]}>
            <View style={[styles.biasIconContainer, { backgroundColor: `${getBiasColor(marketBias)}20` }]}>
              <Ionicons name={getBiasIcon(marketBias) as any} size={32} color={getBiasColor(marketBias)} />
            </View>
            <Text style={styles.biasLabel}>Market Bias</Text>
            <Text style={[styles.biasValue, { color: getBiasColor(marketBias) }]}>
              {marketBias}
            </Text>
            <View style={[styles.confidenceBadge, { backgroundColor: `${getConfidenceColor(confidence)}20` }]}>
              <Text style={[styles.confidenceText, { color: getConfidenceColor(confidence) }]}>
                {confidence} Confidence
              </Text>
            </View>
          </View>

          {/* Trend Structure */}
          <View style={styles.resultCard}>
            <View style={styles.resultCardHeader}>
              <Ionicons name="analytics" size={20} color="#00D4AA" />
              <Text style={styles.resultCardTitle}>Trend Structure</Text>
            </View>
            <Text style={styles.resultCardText}>{trendStructure}</Text>
          </View>

          {/* Support & Resistance Levels */}
          <View style={styles.levelsContainer}>
            <View style={styles.levelCard}>
              <View style={styles.levelHeader}>
                <Ionicons name="arrow-down" size={16} color="#00D4AA" />
                <Text style={styles.levelTitle}>Support Levels</Text>
              </View>
              {supportLevels.length > 0 ? (
                supportLevels.map((level, i) => (
                  <View key={i} style={styles.levelItem}>
                    <Text style={[styles.levelValue, { color: '#00D4AA' }]}>{level}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noLevelsText}>No levels identified</Text>
              )}
            </View>
            <View style={styles.levelCard}>
              <View style={styles.levelHeader}>
                <Ionicons name="arrow-up" size={16} color="#FF4757" />
                <Text style={styles.levelTitle}>Resistance Levels</Text>
              </View>
              {resistanceLevels.length > 0 ? (
                resistanceLevels.map((level, i) => (
                  <View key={i} style={styles.levelItem}>
                    <Text style={[styles.levelValue, { color: '#FF4757' }]}>{level}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noLevelsText}>No levels identified</Text>
              )}
            </View>
          </View>

          {/* Trade Insight */}
          <View style={styles.resultCard}>
            <View style={styles.resultCardHeader}>
              <Ionicons name="bulb" size={20} color="#FFD700" />
              <Text style={styles.resultCardTitle}>Trade Insight</Text>
            </View>
            <Text style={styles.resultCardText}>{tradeInsight}</Text>
          </View>

          {/* Remaining Analyses */}
          {remainingAnalyses !== null && (
            <View style={styles.remainingCard}>
              <Ionicons name="sparkles" size={20} color="#00D4AA" />
              <Text style={styles.remainingText}>
                {remainingAnalyses} analyses remaining this week
              </Text>
            </View>
          )}

          {/* Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Ionicons name="information-circle-outline" size={16} color="#8A8D98" />
            <Text style={styles.disclaimerText}>{disclaimer}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.analyzeAnotherButton} onPress={startNewAnalysis}>
              <Ionicons name="camera" size={20} color="#0A0E17" />
              <Text style={styles.analyzeAnotherText}>Analyze Another Chart</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Upload screen (default)
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>AI Chart Analyzer</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Upload a chart for instant analysis</Text>
        </View>

        {/* Usage Info */}
        <View style={[styles.usageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.usageHeader}>
            <Ionicons name="sparkles" size={20} color={theme.primary} />
            <Text style={[styles.usageTitle, { color: theme.text }]}>Weekly Usage</Text>
          </View>
          <View style={[styles.usageBar, { backgroundColor: theme.background }]}>
            <View
              style={[
                styles.usageProgress,
                { width: `${((usage?.current_usage || 0) / (usage?.weekly_limit || 1)) * 100}%`, backgroundColor: theme.primary }
              ]}
            />
          </View>
          <Text style={[styles.usageText, { color: theme.textSecondary }]}>
            {usage?.remaining || 0} of {usage?.weekly_limit || 0} analyses remaining
          </Text>
          {user?.role === 'premium' && (
            <Text style={[styles.usageNote, { color: theme.textMuted }]}>
              * Includes limited AI chart analysis. Usage caps apply.
            </Text>
          )}
        </View>

        {/* Image Picker - Gallery and Camera Options */}
        <View style={styles.imagePickerSection}>
          {selectedImage ? (
            <View style={[styles.selectedImageContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Image source={{ uri: selectedImage }} style={styles.selectedImage} resizeMode="contain" />
              <View style={styles.imageActions}>
                <TouchableOpacity style={[styles.imageActionButton, { backgroundColor: theme.surfaceSecondary }]} onPress={pickImage}>
                  <Ionicons name="images-outline" size={20} color={theme.text} />
                  <Text style={[styles.imageActionText, { color: theme.text }]}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.imageActionButton, { backgroundColor: theme.surfaceSecondary }]} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={20} color={theme.text} />
                  <Text style={[styles.imageActionText, { color: theme.text }]}>Camera</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.uploadOptions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.uploadTitle, { color: theme.text }]}>Upload Your Chart</Text>
              <Text style={[styles.uploadSubtitle, { color: theme.textSecondary }]}>Portrait or landscape • Any trading platform</Text>
              
              <View style={styles.uploadButtonsRow}>
                <TouchableOpacity style={[styles.uploadButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} onPress={pickImage}>
                  <View style={[styles.uploadIconContainer, { backgroundColor: `${theme.primary}15` }]}>
                    <Ionicons name="images" size={32} color={theme.primary} />
                  </View>
                  <Text style={[styles.uploadButtonTitle, { color: theme.text }]}>Gallery</Text>
                  <Text style={[styles.uploadButtonSubtext, { color: theme.textSecondary }]}>Screenshot or saved image</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.uploadButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} onPress={takePhoto}>
                  <View style={[styles.uploadIconContainer, { backgroundColor: `${theme.primary}15` }]}>
                    <Ionicons name="camera" size={32} color={theme.primary} />
                  </View>
                  <Text style={[styles.uploadButtonTitle, { color: theme.text }]}>Camera</Text>
                  <Text style={[styles.uploadButtonSubtext, { color: theme.textSecondary }]}>Snap a chart photo</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.supportedPlatforms}>
                <Text style={[styles.supportedText, { color: theme.textMuted }]}>Works with MT4 • MT5 • TradingView • Any chart</Text>
              </View>
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={[styles.settingButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => setShowPairPicker(!showPairPicker)}
          >
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Pair</Text>
            <View style={styles.settingValue}>
              <Text style={[styles.settingValueText, { color: theme.text }]}>{selectedPair}</Text>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => setShowTimeframePicker(!showTimeframePicker)}
          >
            <Text style={[styles.settingLabel, { color: theme.textSecondary }]}>Timeframe</Text>
            <View style={styles.settingValue}>
              <Text style={[styles.settingValueText, { color: theme.text }]}>{selectedTimeframe}</Text>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Pair Picker */}
        {showPairPicker && (
          <View style={[styles.pickerContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {PAIRS.map((pair) => (
              <TouchableOpacity
                key={pair}
                style={[styles.pickerItem, { borderBottomColor: theme.border }, selectedPair === pair && { backgroundColor: `${theme.primary}20` }]}
                onPress={() => {
                  setSelectedPair(pair);
                  setShowPairPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }, selectedPair === pair && { color: theme.primary }]}>
                  {pair}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Timeframe Picker */}
        {showTimeframePicker && (
          <View style={[styles.pickerContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {TIMEFRAMES.map((tf) => (
              <TouchableOpacity
                key={tf}
                style={[styles.pickerItem, { borderBottomColor: theme.border }, selectedTimeframe === tf && { backgroundColor: `${theme.primary}20` }]}
                onPress={() => {
                  setSelectedTimeframe(tf);
                  setShowTimeframePicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }, selectedTimeframe === tf && { color: theme.primary }]}>
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Analyze Button */}
        <TouchableOpacity
          style={[styles.analyzeButton, { backgroundColor: theme.primary }, !selectedImage && styles.analyzeButtonDisabled]}
          onPress={analyzeChart}
          disabled={!selectedImage}
        >
          <Ionicons name="sparkles" size={20} color="#0A0E17" style={{ marginRight: 8 }} />
          <Text style={styles.analyzeButtonText}>Analyze Chart</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#8A8D98',
    marginTop: 4,
  },
  // No Access Styles
  noAccessContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  noAccessTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  noAccessSubtitle: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 32,
  },
  featureList: {
    width: '100%',
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 12,
  },
  planComparison: {
    flexDirection: 'row',
    gap: 12,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  vipPlanCard: {
    borderColor: '#FFD700',
  },
  planName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00D4AA',
    marginBottom: 4,
  },
  planLimit: {
    fontSize: 12,
    color: '#8A8D98',
  },
  // Analyzing Styles
  analyzingContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  analyzingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  analyzingSubtitle: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 32,
  },
  analyzingSteps: {
    width: '100%',
    maxWidth: 300,
    gap: 16,
  },
  analyzingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  analyzingStepText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  analyzingNote: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 32,
  },
  // Error Styles
  errorContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF4757',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8A8D98',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  errorButtons: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Result Styles
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F3E',
  },
  resultBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  newAnalysisButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultScrollView: {
    flex: 1,
    padding: 16,
  },
  chartInfoCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  chartInfoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chartInfoItem: {
    flex: 1,
  },
  chartInfoLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 4,
  },
  chartInfoValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resultChartImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    resizeMode: 'contain',
    backgroundColor: '#0A0E17',
  },
  biasCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
  },
  biasIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  biasLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginBottom: 4,
  },
  biasValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confidenceBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  resultCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resultCardText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  levelsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  levelCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  levelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  levelItem: {
    marginBottom: 8,
  },
  levelValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  noLevelsText: {
    fontSize: 12,
    color: '#8A8D98',
    fontStyle: 'italic',
  },
  remainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  remainingText: {
    fontSize: 14,
    color: '#00D4AA',
    fontWeight: '600',
  },
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(138, 141, 152, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#8A8D98',
    lineHeight: 18,
  },
  resultActions: {
    marginBottom: 40,
  },
  analyzeAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  analyzeAnotherText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
  // Usage Card Styles
  usageCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  usageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  usageBar: {
    height: 8,
    backgroundColor: '#2A2F3E',
    borderRadius: 4,
    marginBottom: 8,
  },
  usageProgress: {
    height: '100%',
    backgroundColor: '#00D4AA',
    borderRadius: 4,
  },
  usageText: {
    fontSize: 12,
    color: '#8A8D98',
  },
  usageNote: {
    fontSize: 10,
    color: '#8A8D98',
    fontStyle: 'italic',
    marginTop: 8,
  },
  // Image Picker Styles - Mobile Friendly
  imagePickerSection: {
    marginBottom: 20,
  },
  uploadOptions: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2A2F3E',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  uploadSubtitle: {
    fontSize: 13,
    color: '#8A8D98',
    marginBottom: 20,
    textAlign: 'center',
  },
  uploadButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#0A0E17',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  uploadIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  uploadButtonTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  uploadButtonSubtext: {
    fontSize: 11,
    color: '#8A8D98',
    textAlign: 'center',
  },
  supportedPlatforms: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2F3E',
    width: '100%',
    alignItems: 'center',
  },
  supportedText: {
    fontSize: 11,
    color: '#6A6D78',
    textAlign: 'center',
  },
  selectedImageContainer: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  selectedImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#0A0E17',
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
    gap: 16,
    backgroundColor: '#0A0E17',
  },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  imageActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Legacy styles (keep for compatibility)
  imagePicker: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2A2F3E',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
  },
  imagePickerContent: {
    padding: 40,
    alignItems: 'center',
  },
  imagePickerText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 12,
  },
  imagePickerSubtext: {
    fontSize: 12,
    color: '#8A8D98',
    marginTop: 4,
  },
  changeImageOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  changeImageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Settings Styles
  settingsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  settingButton: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  settingLabel: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 4,
  },
  settingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingValueText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // Picker Styles
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    margin: 4,
  },
  pickerItemActive: {
    backgroundColor: '#00D4AA',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#8A8D98',
  },
  pickerItemTextActive: {
    color: '#0A0E17',
    fontWeight: 'bold',
  },
  // Analyze Button Styles
  analyzeButton: {
    backgroundColor: '#00D4AA',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  analyzeButtonDisabled: {
    opacity: 0.5,
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0A0E17',
  },
});

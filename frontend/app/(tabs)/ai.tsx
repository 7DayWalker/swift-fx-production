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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';

interface AIUsage {
  current_usage: number;
  weekly_limit: number;
  remaining: number;
  has_access: boolean;
}

interface AnalysisResult {
  analysis_id: string;
  pair: string;
  timeframe: string;
  market_bias: string;
  trend_structure: string;
  support_levels: number[];
  resistance_levels: number[];
  trade_insight: string;
  confidence: string;
  disclaimer?: string;
  remaining_analyses?: number;
  created_at?: string;
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

type ScreenState = 'upload' | 'analyzing' | 'result' | 'error';

export default function AIScreen() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
  }, []);

  const fetchUsage = async () => {
    try {
      const response = await api.get('/ai/usage');
      setUsage(response.data);
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
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
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      // Clear previous result when new image is selected
      if (screenState === 'result' || screenState === 'error') {
        setScreenState('upload');
        setAnalysisResult(null);
        setErrorMessage(null);
      }
    }
  };

  const analyzeChart = async () => {
    if (!selectedImage) {
      const msg = 'Please select a chart image first';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('No Image', msg);
      return;
    }

    if (!usage?.has_access) {
      const msg = 'AI Chart Analyzer requires Premium or VIP subscription';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Upgrade Required', msg);
      return;
    }

    if (usage && usage.remaining <= 0) {
      const msg = 'You have reached your weekly AI analysis limit. Upgrade to VIP for more.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Limit Reached', msg);
      return;
    }

    // Switch to analyzing state
    setScreenState('analyzing');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      
      const imageUri = selectedImage;
      const filename = imageUri.split('/').pop() || 'chart.jpg';
      const match = /\.([\w]+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('image', {
        uri: imageUri,
        name: filename,
        type: type,
      } as any);
      formData.append('pair', selectedPair);
      formData.append('timeframe', selectedTimeframe);

      const response = await api.post('/ai/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minute timeout for AI processing
      });

      // Validate response data before setting
      const data = response.data;
      console.log('AI Analysis response:', JSON.stringify(data, null, 2));
      
      // Check if it's an error response masquerading as success
      if (data && data.detail) {
        // This is actually an error
        const errorMsg = typeof data.detail === 'string' 
          ? data.detail 
          : Array.isArray(data.detail)
            ? data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
            : JSON.stringify(data.detail);
        setErrorMessage(errorMsg);
        setScreenState('error');
        return;
      }
      
      // Store the result and navigate to results screen
      setAnalysisResult(data);
      setScreenState('result');
      
      // Refresh usage after analysis
      fetchUsage();
    } catch (error: any) {
      console.error('AI Analysis error:', error);
      
      // Extract error message safely
      let errorMsg = 'Failed to analyze chart. Please try again.';
      
      if (error.response?.data) {
        const errData = error.response.data;
        if (typeof errData === 'string') {
          errorMsg = errData;
        } else if (errData.detail) {
          if (typeof errData.detail === 'string') {
            errorMsg = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            // Pydantic validation errors
            errorMsg = errData.detail.map((d: any) => {
              if (typeof d === 'string') return d;
              if (d.msg) return d.msg;
              return JSON.stringify(d);
            }).join('; ');
          } else {
            errorMsg = JSON.stringify(errData.detail);
          }
        } else if (errData.message) {
          errorMsg = errData.message;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setErrorMessage(errorMsg);
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
      <SafeAreaView style={styles.container}>
        <View style={styles.noAccessContainer}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="lock-closed" size={64} color="#FFD700" />
          </View>
          <Text style={styles.noAccessTitle}>AI Chart Analyzer</Text>
          <Text style={styles.noAccessSubtitle}>
            This feature requires Premium or VIP subscription
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              <Text style={styles.featureText}>AI-powered chart analysis</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              <Text style={styles.featureText}>Market bias detection</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              <Text style={styles.featureText}>Support & resistance levels</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              <Text style={styles.featureText}>Trade insights</Text>
            </View>
          </View>
          <View style={styles.planComparison}>
            <View style={styles.planCard}>
              <Text style={styles.planName}>Premium</Text>
              <Text style={styles.planLimit}>5 analyses/week</Text>
            </View>
            <View style={[styles.planCard, styles.vipPlanCard]}>
              <Text style={[styles.planName, { color: '#FFD700' }]}>VIP</Text>
              <Text style={styles.planLimit}>20 analyses/week</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Analyzing screen - show loading state
  if (screenState === 'analyzing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.analyzingContainer}>
          <View style={styles.analyzingIconContainer}>
            <ActivityIndicator size="large" color="#00D4AA" />
          </View>
          <Text style={styles.analyzingTitle}>Analyzing Chart</Text>
          <Text style={styles.analyzingSubtitle}>
            Our AI is analyzing your {selectedPair} chart on {selectedTimeframe} timeframe
          </Text>
          <View style={styles.analyzingSteps}>
            <View style={styles.analyzingStep}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
              <Text style={styles.analyzingStepText}>Processing image</Text>
            </View>
            <View style={styles.analyzingStep}>
              <ActivityIndicator size="small" color="#00D4AA" />
              <Text style={styles.analyzingStepText}>Detecting patterns</Text>
            </View>
            <View style={styles.analyzingStep}>
              <Ionicons name="ellipse-outline" size={20} color="#8A8D98" />
              <Text style={[styles.analyzingStepText, { color: '#8A8D98' }]}>Generating insights</Text>
            </View>
          </View>
          <Text style={styles.analyzingNote}>This may take up to 30 seconds...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error screen
  if (screenState === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="alert-circle" size={64} color="#FF4757" />
          </View>
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <View style={styles.errorButtons}>
            <TouchableOpacity style={styles.retryButton} onPress={analyzeChart}>
              <Ionicons name="refresh" size={20} color="#0A0E17" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={resetToUpload}>
              <Text style={styles.backButtonText}>Change Image</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Results screen
  if (screenState === 'result' && analysisResult) {
    const marketBias = safeString(analysisResult.market_bias) || 'Unknown';
    const confidence = safeString(analysisResult.confidence) || 'Medium';
    const trendStructure = safeString(analysisResult.trend_structure) || 'Analysis not available';
    const tradeInsight = safeString(analysisResult.trade_insight) || 'No specific insight available';
    const disclaimer = safeString(analysisResult.disclaimer) || 'This analysis is for educational purposes only. Always do your own research before trading.';
    const supportLevels = safeLevels(analysisResult.support_levels);
    const resistanceLevels = safeLevels(analysisResult.resistance_levels);
    const pair = safeString(analysisResult.pair) || selectedPair;
    const timeframe = safeString(analysisResult.timeframe) || selectedTimeframe;
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultHeader}>
          <TouchableOpacity style={styles.resultBackButton} onPress={resetToUpload}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.resultHeaderTitle}>Analysis Result</Text>
          <TouchableOpacity style={styles.newAnalysisButton} onPress={startNewAnalysis}>
            <Ionicons name="add" size={24} color="#00D4AA" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.resultScrollView} showsVerticalScrollIndicator={false}>
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
          {analysisResult.remaining_analyses !== undefined && (
            <View style={styles.remainingCard}>
              <Ionicons name="sparkles" size={20} color="#00D4AA" />
              <Text style={styles.remainingText}>
                {safeString(analysisResult.remaining_analyses)} analyses remaining this week
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
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Chart Analyzer</Text>
          <Text style={styles.subtitle}>Upload a chart for instant analysis</Text>
        </View>

        {/* Usage Info */}
        <View style={styles.usageCard}>
          <View style={styles.usageHeader}>
            <Ionicons name="sparkles" size={20} color="#00D4AA" />
            <Text style={styles.usageTitle}>Weekly Usage</Text>
          </View>
          <View style={styles.usageBar}>
            <View
              style={[
                styles.usageProgress,
                { width: `${((usage?.current_usage || 0) / (usage?.weekly_limit || 1)) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.usageText}>
            {usage?.remaining || 0} of {usage?.weekly_limit || 0} analyses remaining
          </Text>
          {user?.role === 'premium' && (
            <Text style={styles.usageNote}>
              * Includes limited AI chart analysis. Usage caps apply.
            </Text>
          )}
        </View>

        {/* Image Picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
          ) : (
            <View style={styles.imagePickerContent}>
              <Ionicons name="image-outline" size={48} color="#8A8D98" />
              <Text style={styles.imagePickerText}>Tap to select chart image</Text>
              <Text style={styles.imagePickerSubtext}>MT4, MT5, TradingView supported</Text>
            </View>
          )}
          {selectedImage && (
            <View style={styles.changeImageOverlay}>
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.changeImageText}>Change</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Settings */}
        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingButton}
            onPress={() => setShowPairPicker(!showPairPicker)}
          >
            <Text style={styles.settingLabel}>Pair</Text>
            <View style={styles.settingValue}>
              <Text style={styles.settingValueText}>{selectedPair}</Text>
              <Ionicons name="chevron-down" size={16} color="#8A8D98" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingButton}
            onPress={() => setShowTimeframePicker(!showTimeframePicker)}
          >
            <Text style={styles.settingLabel}>Timeframe</Text>
            <View style={styles.settingValue}>
              <Text style={styles.settingValueText}>{selectedTimeframe}</Text>
              <Ionicons name="chevron-down" size={16} color="#8A8D98" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Pair Picker */}
        {showPairPicker && (
          <View style={styles.pickerContainer}>
            {PAIRS.map((pair) => (
              <TouchableOpacity
                key={pair}
                style={[styles.pickerItem, selectedPair === pair && styles.pickerItemActive]}
                onPress={() => {
                  setSelectedPair(pair);
                  setShowPairPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, selectedPair === pair && styles.pickerItemTextActive]}>
                  {pair}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Timeframe Picker */}
        {showTimeframePicker && (
          <View style={styles.pickerContainer}>
            {TIMEFRAMES.map((tf) => (
              <TouchableOpacity
                key={tf}
                style={[styles.pickerItem, selectedTimeframe === tf && styles.pickerItemActive]}
                onPress={() => {
                  setSelectedTimeframe(tf);
                  setShowTimeframePicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, selectedTimeframe === tf && styles.pickerItemTextActive]}>
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Analyze Button */}
        <TouchableOpacity
          style={[styles.analyzeButton, !selectedImage && styles.analyzeButtonDisabled]}
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
  // Image Picker Styles
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
  selectedImage: {
    width: '100%',
    height: 200,
    resizeMode: 'contain',
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

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
  TextInput,
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
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export default function AIScreen() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('H1');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showPairPicker, setShowPairPicker] = useState(false);
  const [showTimeframePicker, setShowTimeframePicker] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);

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
      Alert.alert('Permission Required', 'Please allow access to your photo library');
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
      setAnalysisResult(null);
    }
  };

  const analyzeChart = async () => {
    if (!selectedImage) {
      Alert.alert('No Image', 'Please select a chart image first');
      return;
    }

    if (!usage?.has_access) {
      Alert.alert('Upgrade Required', 'AI Chart Analyzer requires Premium or VIP subscription');
      return;
    }

    if (usage && usage.remaining <= 0) {
      Alert.alert('Limit Reached', 'You have reached your weekly AI analysis limit. Upgrade to VIP for more.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      
      // Get the image file
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
      });

      setAnalysisResult(response.data);
      fetchUsage(); // Refresh usage after analysis
    } catch (error: any) {
      Alert.alert('Analysis Failed', error.response?.data?.detail || 'Failed to analyze chart. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
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
          style={[styles.analyzeButton, (!selectedImage || isAnalyzing) && styles.analyzeButtonDisabled]}
          onPress={analyzeChart}
          disabled={!selectedImage || isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color="#0A0E17" style={{ marginRight: 8 }} />
              <Text style={styles.analyzeButtonText}>Analyzing...</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#0A0E17" style={{ marginRight: 8 }} />
              <Text style={styles.analyzeButtonText}>Analyze Chart</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Analysis Result */}
        {analysisResult && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Analysis Result</Text>

            {/* Market Bias */}
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Market Bias</Text>
                <View style={[styles.biasBadge, { backgroundColor: `${getBiasColor(analysisResult.market_bias)}20` }]}>
                  <Text style={[styles.biasText, { color: getBiasColor(analysisResult.market_bias) }]}>
                    {analysisResult.market_bias}
                  </Text>
                </View>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Confidence</Text>
                <View style={[styles.confidenceBadge, { backgroundColor: `${getConfidenceColor(analysisResult.confidence)}20` }]}>
                  <Text style={[styles.confidenceText, { color: getConfidenceColor(analysisResult.confidence) }]}>
                    {analysisResult.confidence}
                  </Text>
                </View>
              </View>
            </View>

            {/* Trend Structure */}
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Trend Structure</Text>
              <Text style={styles.resultText}>{analysisResult.trend_structure}</Text>
            </View>

            {/* Levels */}
            <View style={styles.levelsContainer}>
              <View style={styles.levelCard}>
                <Text style={styles.levelTitle}>Support Levels</Text>
                {analysisResult.support_levels?.length > 0 ? (
                  analysisResult.support_levels.map((level, i) => (
                    <Text key={i} style={[styles.levelValue, { color: '#00D4AA' }]}>{level}</Text>
                  ))
                ) : (
                  <Text style={styles.levelValue}>N/A</Text>
                )}
              </View>
              <View style={styles.levelCard}>
                <Text style={styles.levelTitle}>Resistance Levels</Text>
                {analysisResult.resistance_levels?.length > 0 ? (
                  analysisResult.resistance_levels.map((level, i) => (
                    <Text key={i} style={[styles.levelValue, { color: '#FF4757' }]}>{level}</Text>
                  ))
                ) : (
                  <Text style={styles.levelValue}>N/A</Text>
                )}
              </View>
            </View>

            {/* Trade Insight */}
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Trade Insight</Text>
              <Text style={styles.resultText}>{analysisResult.trade_insight}</Text>
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimerContainer}>
              <Ionicons name="information-circle-outline" size={16} color="#8A8D98" />
              <Text style={styles.disclaimerText}>
                {analysisResult.disclaimer || 'This analysis is for educational purposes only. Always do your own research before trading.'}
              </Text>
            </View>
          </View>
        )}
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
  imagePicker: {
    backgroundColor: '#1A1F2E',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2A2F3E',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 20,
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
  resultContainer: {
    marginBottom: 40,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 14,
    color: '#8A8D98',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  biasBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  biasText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  levelsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  levelCard: {
    flex: 1,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F3E',
  },
  levelTitle: {
    fontSize: 12,
    color: '#8A8D98',
    marginBottom: 8,
  },
  levelValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(138, 141, 152, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: '#8A8D98',
    marginLeft: 8,
    lineHeight: 16,
  },
});

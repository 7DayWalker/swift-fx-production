import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  getStoredReferralCode,
  validateReferralCode,
  clearStoredReferralCode,
  storeReferralCode,
  ReferralValidationResult,
} from '../../src/services/referralService';

export default function RegisterScreen() {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Referral state
  const [referralCode, setReferralCode] = useState('');
  const [isReferralLocked, setIsReferralLocked] = useState(false);
  const [isValidatingReferral, setIsValidatingReferral] = useState(false);
  const [referralValidation, setReferralValidation] = useState<ReferralValidationResult | null>(null);
  const [showReferralField, setShowReferralField] = useState(false);
  
  const { register } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();

  // Check for referral code on mount (from deep link or stored)
  useEffect(() => {
    checkForReferralCode();
  }, []);

  // Handle URL param referral code
  useEffect(() => {
    if (params.ref) {
      handleDeepLinkReferral(params.ref);
    }
  }, [params.ref]);

  const checkForReferralCode = async () => {
    try {
      const stored = await getStoredReferralCode();
      if (stored && stored.code) {
        setReferralCode(stored.code);
        setIsReferralLocked(stored.source === 'deeplink');
        setShowReferralField(true);
        
        // Validate the stored code
        setIsValidatingReferral(true);
        const validation = await validateReferralCode(stored.code);
        setReferralValidation(validation);
        setIsValidatingReferral(false);
      }
    } catch (error) {
      console.error('Failed to check for referral code:', error);
    }
  };

  const handleDeepLinkReferral = async (code: string) => {
    try {
      setIsValidatingReferral(true);
      const validation = await validateReferralCode(code);
      
      if (validation.valid) {
        setReferralCode(code.toUpperCase());
        setIsReferralLocked(true);
        setShowReferralField(true);
        setReferralValidation(validation);
        await storeReferralCode(code, 'deeplink');
      } else {
        setReferralValidation(validation);
      }
    } catch (error) {
      console.error('Failed to handle deep link referral:', error);
    } finally {
      setIsValidatingReferral(false);
    }
  };

  const handleManualReferralChange = async (code: string) => {
    if (isReferralLocked) return;
    
    const normalizedCode = code.toUpperCase().trim();
    setReferralCode(normalizedCode);
    setReferralValidation(null);
    
    // Only validate if code is long enough
    if (normalizedCode.length >= 8) {
      setIsValidatingReferral(true);
      try {
        const validation = await validateReferralCode(normalizedCode);
        setReferralValidation(validation);
        if (validation.valid) {
          await storeReferralCode(normalizedCode, 'manual');
        }
      } catch (error) {
        console.error('Failed to validate referral:', error);
      } finally {
        setIsValidatingReferral(false);
      }
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // If referral code is entered but invalid, warn user
    if (referralCode && referralValidation && !referralValidation.valid) {
      Alert.alert(
        'Invalid Referral Code',
        'The referral code you entered is invalid. Do you want to continue without a referral?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => performRegistration() },
        ]
      );
      return;
    }

    await performRegistration();
  };

  const performRegistration = async () => {
    setIsLoading(true);
    try {
      // Pass referral code to register function
      const validReferralCode = referralValidation?.valid ? referralCode : undefined;
      await register(name, email, password, validReferralCode);
      
      // Clear stored referral code after successful signup
      await clearStoredReferralCode();
      
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const dynamicStyles = {
    container: { backgroundColor: theme.background },
    card: { backgroundColor: theme.cardBackground, borderColor: theme.border },
    text: { color: theme.text },
    textSecondary: { color: theme.textSecondary },
    input: { backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text },
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={[styles.title, dynamicStyles.text]}>Create Account</Text>
            <Text style={[styles.subtitle, dynamicStyles.textSecondary]}>Join Swift FX Signals today</Text>
          </View>

          {/* Referral Banner (if code from deep link) */}
          {isReferralLocked && referralValidation?.valid && (
            <View style={[styles.referralBanner, { backgroundColor: `${theme.primary}15` }]}>
              <Ionicons name="gift" size={20} color={theme.primary} />
              <View style={styles.referralBannerText}>
                <Text style={[styles.referralBannerTitle, { color: theme.primary }]}>
                  {referralValidation.referrer_name 
                    ? `Referred by ${referralValidation.referrer_name}` 
                    : 'Referral Applied!'}
                </Text>
                <Text style={[styles.referralBannerCode, dynamicStyles.textSecondary]}>
                  Code: {referralCode}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
            </View>
          )}

          <View style={styles.form}>
            <View style={[styles.inputContainer, dynamicStyles.input]}>
              <Ionicons name="person-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Full Name"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.inputContainer, dynamicStyles.input]}>
              <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={[styles.inputContainer, dynamicStyles.input]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={[styles.inputContainer, dynamicStyles.input]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Confirm Password"
                placeholderTextColor={theme.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>

            {/* Referral Code Section */}
            {!isReferralLocked && (
              <>
                {!showReferralField ? (
                  <TouchableOpacity
                    style={styles.referralToggle}
                    onPress={() => setShowReferralField(true)}
                  >
                    <Ionicons name="gift-outline" size={16} color={theme.primary} />
                    <Text style={[styles.referralToggleText, { color: theme.primary }]}>
                      Have a referral code? (optional)
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.referralSection}>
                    <View style={[
                      styles.inputContainer, 
                      dynamicStyles.input,
                      referralValidation?.valid && { borderColor: '#10B981' },
                      referralValidation && !referralValidation.valid && referralCode.length >= 8 && { borderColor: '#EF4444' },
                    ]}>
                      <Ionicons name="gift-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder="Referral Code (optional)"
                        placeholderTextColor={theme.textSecondary}
                        value={referralCode}
                        onChangeText={handleManualReferralChange}
                        autoCapitalize="characters"
                        editable={!isReferralLocked}
                      />
                      {isValidatingReferral && (
                        <ActivityIndicator size="small" color={theme.primary} />
                      )}
                      {!isValidatingReferral && referralValidation?.valid && (
                        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      )}
                      {!isValidatingReferral && referralValidation && !referralValidation.valid && referralCode.length >= 8 && (
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                      )}
                    </View>
                    
                    {/* Validation Message */}
                    {referralValidation && (
                      <View style={styles.validationMessage}>
                        {referralValidation.valid ? (
                          <Text style={[styles.validationText, { color: '#10B981' }]}>
                            <Ionicons name="checkmark" size={12} color="#10B981" />
                            {' '}{referralValidation.referrer_name 
                              ? `Referred by ${referralValidation.referrer_name}` 
                              : referralValidation.message}
                          </Text>
                        ) : referralCode.length >= 8 && (
                          <Text style={[styles.validationText, { color: '#EF4444' }]}>
                            <Ionicons name="close" size={12} color="#EF4444" />
                            {' '}{referralValidation.message}
                          </Text>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.hideReferralButton}
                      onPress={() => {
                        setShowReferralField(false);
                        setReferralCode('');
                        setReferralValidation(null);
                      }}
                    >
                      <Text style={[styles.hideReferralText, dynamicStyles.textSecondary]}>
                        Hide referral field
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.registerButton, { backgroundColor: theme.primary }, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <Text style={styles.registerButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.termsText, dynamicStyles.textSecondary]}>
              By signing up, you agree to our{' '}
              <Text style={[styles.termsLink, { color: theme.primary }]}>Terms of Service</Text> and{' '}
              <Text style={[styles.termsLink, { color: theme.primary }]}>Privacy Policy</Text>
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, dynamicStyles.textSecondary]}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={[styles.footerLink, { color: theme.primary }]}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  referralBannerText: {
    flex: 1,
  },
  referralBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  referralBannerCode: {
    fontSize: 12,
    marginTop: 2,
  },
  form: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
  },
  referralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 16,
  },
  referralToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  referralSection: {
    marginBottom: 8,
  },
  validationMessage: {
    marginTop: -8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  validationText: {
    fontSize: 12,
  },
  hideReferralButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  hideReferralText: {
    fontSize: 12,
  },
  registerButton: {
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: 'bold',
  },
  termsText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {},
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});

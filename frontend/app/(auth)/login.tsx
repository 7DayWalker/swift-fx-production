import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const { login, signInWithProvider } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      if (Platform.OS === 'web') {
        window.alert('Please fill in all fields');
      } else {
        Alert.alert('Error', 'Please fill in all fields');
      }
      return;
    }

    setIsLoading(true);
    try {
      const userData = await login(email, password);
      if (userData.is_admin) {
        router.replace('/(admin)/dashboard');
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch (error: any) {
      const msg = error.message || 'Invalid credentials';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Login Failed', msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'apple' | 'google') => {
    setOauthLoading(provider);
    try {
      await signInWithProvider(provider);
      // On web, the page redirects so this code won't execute.
      // On native, openAuthSessionAsync stored the callback URL —
      // route to /auth which handles session exchange in one place.
      if (Platform.OS !== 'web') {
        router.replace('/auth');
      }
    } catch (error: any) {
      const msg = error.message || 'Something went wrong';
      // Don't show error for intentional cancellation
      if (msg !== 'Authentication cancelled') {
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Login Failed', msg);
        }
      }
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>Welcome Back</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Sign in to continue trading</Text>
          </View>

          <View style={styles.form}>
            <View style={[styles.inputContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="mail-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                data-testid="login-email-input"
              />
            </View>

            <View style={[styles.inputContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                data-testid="login-password-input"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>Forgot Password?</Text>
              </TouchableOpacity>
            </Link>

            <Pressable
              style={[styles.loginButton, { backgroundColor: theme.primary }, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading || oauthLoading !== null}
              accessibilityRole="button"
              accessibilityLabel="Sign In"
              testID="sign-in-button"
              data-testid="sign-in-button"
            >
              {isLoading ? (
                <ActivityIndicator color="#0A0E17" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Apple OAuth Button */}
            <Pressable
              style={[styles.oauthButton, styles.appleButton]}
              onPress={() => handleOAuthLogin('apple')}
              disabled={isLoading || oauthLoading !== null}
              testID="apple-sign-in-button"
              data-testid="apple-sign-in-button"
            >
              {oauthLoading === 'apple' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </>
              )}
            </Pressable>

            {/* Google OAuth Button */}
            <Pressable
              style={[styles.oauthButton, styles.googleButton, { borderColor: theme.border }]}
              onPress={() => handleOAuthLogin('google')}
              disabled={isLoading || oauthLoading !== null}
              testID="google-sign-in-button"
              data-testid="google-sign-in-button"
            >
              {oauthLoading === 'google' ? (
                <ActivityIndicator color="#4285F4" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text style={[styles.googleButtonText, { color: theme.text }]}>Continue with Google</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>Don't have an account? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={[styles.footerLink, { color: theme.primary }]}>Sign Up</Text>
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
    padding: 28,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logoWrapper: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 22,
  },
  logo: {
    width: 88,
    height: 88,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
  },
  form: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#0A0E17',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    opacity: 0.5,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    opacity: 0.6,
  },
  oauthButton: {
    flexDirection: 'row',
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  googleButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.7,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});

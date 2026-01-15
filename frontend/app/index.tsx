import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function SplashScreen() {
  const { user, isLoading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        if (user) {
          // Redirect based on admin status
          if (isAdmin) {
            router.replace('/(admin)/dashboard');
          } else {
            router.replace('/(tabs)/dashboard');
          }
        } else {
          router.replace('/(auth)/login');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, user, isAdmin]);

  return (
    <LinearGradient colors={['#0A0E17', '#1A1F2E', '#0A0E17']} style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoWrapper}>
          <Image 
            source={require('../assets/images/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>Swift FX</Text>
        <Text style={styles.subtitle}>SIGNALS</Text>
      </View>
      
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4AA" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
      
      <Text style={styles.tagline}>Professional Trading Signals</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#00D4AA',
    letterSpacing: 8,
    marginTop: 5,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#8A8D98',
    marginTop: 15,
    fontSize: 14,
  },
  tagline: {
    position: 'absolute',
    bottom: 50,
    color: '#8A8D98',
    fontSize: 14,
  },
});

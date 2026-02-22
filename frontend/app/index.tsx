import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function SplashScreen() {
  const { user, isLoading, isAdmin } = useAuth();
  const router = useRouter();

  console.log('[Splash] RENDER — isLoading:', isLoading, 'user:', !!user, 'isAdmin:', isAdmin);

  useEffect(() => {
    console.log('[Splash] useEffect — isLoading:', isLoading, 'user:', !!user, 'isAdmin:', isAdmin);
    if (!isLoading) {
      console.log('[Splash] isLoading is FALSE — will navigate in 1.5s');
      const timer = setTimeout(() => {
        const target = user
          ? (isAdmin ? '/(admin)/dashboard' : '/(tabs)/dashboard')
          : '/(auth)/login';
        console.log('[Splash] Navigating to:', target);
        if (user) {
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
    } else {
      console.log('[Splash] isLoading is TRUE — waiting for auth bootstrap');
    }
  }, [isLoading, user, isAdmin]);

  return (
    <LinearGradient colors={['#0A0E17', '#1A1F2E', '#0A0E17']} style={styles.container}>
      <View style={styles.logoContainer}>
        <Image 
          source={require('../assets/images/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4AA" />
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
  logo: {
    width: 200,
    height: 200,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  tagline: {
    position: 'absolute',
    bottom: 50,
    color: '#8A8D98',
    fontSize: 14,
  },
});

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Splash / Loading screen.
 * Shown while AuthContext resolves getSession().
 * Navigation is handled entirely by _layout.tsx watching auth state.
 */
export default function SplashScreen() {
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

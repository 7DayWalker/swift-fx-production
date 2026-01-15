import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use relative URL for web preview, direct URL for local dev, full URL for native
const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    // Check if we're on localhost (development) or production preview
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      // Local development - connect directly to backend
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8001/api';
      }
    }
    // Production preview - use relative URL which works with the proxy
    return '/api';
  }
  // For native apps, use the full backend URL
  const backendUrl = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';
  return `${backendUrl}/api`;
};

const baseURL = getBaseUrl();
console.log(baseURL, 'API_BASE_URL');

export const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - could trigger logout here
      console.log('Unauthorized request');
    }
    return Promise.reject(error);
  }
);

export default api;

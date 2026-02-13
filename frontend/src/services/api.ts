import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import supabase from './supabase';

// Use relative URL for web preview, direct URL for local dev, full URL for native
const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8001/api';
      }
    }
    return '/api';
  }
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

// Add request interceptor to include Supabase access token
api.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.error('Failed to get Supabase session:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log('Unauthorized request');
    }
    return Promise.reject(error);
  }
);

export default api;

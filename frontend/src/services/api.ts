import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Use relative URL for web, full URL for native
const getBaseUrl = () => {
  if (Platform.OS === 'web') {
    // Always use relative URL on web to work with the proxy
    // This works for both localhost dev and production preview
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

import axios from 'axios';
import supabase from './supabase';

// Single source of truth: All API calls use EXPO_PUBLIC_BACKEND_URL
// No platform branching, no relative paths, no localhost fallbacks
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  console.error('[API] CRITICAL: EXPO_PUBLIC_BACKEND_URL is not set. API calls will fail.');
}

const baseURL = BACKEND_URL ? `${BACKEND_URL}/api` : '';

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

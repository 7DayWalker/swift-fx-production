import axios from 'axios';
import supabase from './supabase';

// Single source of truth: All API calls use EXPO_PUBLIC_BACKEND_URL
// No platform branching, no relative paths, no localhost fallbacks
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  console.error('[API] CRITICAL: EXPO_PUBLIC_BACKEND_URL is not set. API calls will fail.');
}

// baseURL includes /api prefix - all routes should use paths like '/signals', '/iap/products', etc.
const baseURL = BACKEND_URL ? `${BACKEND_URL}/api` : '';

export const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper: getSession with a timeout to prevent indefinite hangs
const getSessionWithTimeout = (timeoutMs = 5000): Promise<string | null> => {
  return Promise.race([
    supabase.auth.getSession().then(({ data: { session } }) => session?.access_token ?? null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
};

// Add request interceptor to include Supabase access token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getSessionWithTimeout();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('[API] Failed to get Supabase session:', error);
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

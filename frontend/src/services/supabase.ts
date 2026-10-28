import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Validate required environment variables (runtime guard; TS uses non-null assertions above)
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing required environment variables: EXPO_PUBLIC_SUPABASE_URL and/or EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

/**
 * SSR-safe storage adapter.
 * Expo Router performs a server-side render pass where `window` is undefined.
 * AsyncStorage (web implementation) accesses `window.localStorage` internally,
 * so we guard every call to prevent "ReferenceError: window is not defined".
 */
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') return null;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') return;
      await AsyncStorage.setItem(key, value);
    } catch {
      // silently ignore
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') return;
      await AsyncStorage.removeItem(key);
    } catch {
      // silently ignore
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export default supabase;

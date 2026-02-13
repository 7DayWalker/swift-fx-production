import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../services/supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  user_id: string;
  name: string;
  email: string;
  role: 'free' | 'premium' | 'vip';
  subscription_status?: string;
  picture?: string;
  is_admin?: boolean;
}

type OAuthProvider = 'google' | 'apple';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
  register: (name: string, email: string, password: string, referralCode?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Map a Supabase auth user + profile row → our app User object */
const buildUser = (
  sbUser: SupabaseUser,
  profile: { name?: string; role?: string; admin_role?: string } | null,
): User => {
  const profileRole = profile?.role ?? 'free';
  // Both admin and super_admin get admin privileges and VIP access
  const isAdmin = profileRole === 'admin' || profileRole === 'super_admin';

  return {
    user_id: sbUser.id,
    name: profile?.name || sbUser.user_metadata?.name || sbUser.email || '',
    email: sbUser.email || '',
    role: isAdmin ? 'vip' : (profileRole as 'free' | 'premium' | 'vip'),
    is_admin: isAdmin,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = user?.is_admin === true;

  // Fetch the user profile from the profiles table
  const fetchProfile = useCallback(async (sbUser: SupabaseUser, accessToken: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, role, admin_role')
        .eq('id', sbUser.id)
        .single();

      if (error) {
        console.warn('[Auth] Profile fetch error (may be new user):', error.message);
      }

      const appUser = buildUser(sbUser, profile);
      setUser(appUser);
      setToken(accessToken);
      return appUser;
    } catch (err) {
      console.error('[Auth] fetchProfile failed:', err);
      const appUser = buildUser(sbUser, null);
      setUser(appUser);
      setToken(accessToken);
      return appUser;
    }
  }, []);

  // Bootstrap: restore session from storage on mount
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          await fetchProfile(session.user, session.access_token);
        }
      } catch (err) {
        console.error('[Auth] bootstrap error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    bootstrap();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] onAuthStateChange:', event);
        if (session && mounted) {
          await fetchProfile(session.user, session.access_token);
        } else if (mounted) {
          setUser(null);
          setToken(null);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ---- Auth actions ----

  const login = async (email: string, password: string): Promise<User> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const appUser = await fetchProfile(data.user, data.session.access_token);
    return appUser;
  };

  const signInWithProvider = async (provider: OAuthProvider): Promise<void> => {
    if (Platform.OS === 'web') {
      // Web: standard redirect flow — Supabase handles the callback via detectSessionInUrl
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : '/';
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      // Page redirects; onAuthStateChange picks up session on return
      return;
    }

    // Native (iOS / Android): open in-app browser, capture redirect with tokens
    const redirectTo = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success' && result.url) {
      // Supabase returns tokens in the URL hash fragment
      const hashPart = result.url.split('#')[1];
      if (hashPart) {
        const params: Record<string, string> = {};
        hashPart.split('&').forEach((pair) => {
          const [key, value] = pair.split('=');
          if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
        });

        const { access_token, refresh_token } = params;
        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
          // onAuthStateChange fires → fetchProfile → user state updated
          return;
        }
      }
      throw new Error('Authentication completed but no session tokens received');
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Authentication cancelled');
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    _referralCode?: string,
  ): Promise<User> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw new Error(error.message);

    // If email confirmation is required, session will be null
    if (!data.session) {
      throw new Error('Account created! Please check your email to verify, then log in.');
    }

    // Small delay for the trigger to create the profile row
    await new Promise((r) => setTimeout(r, 600));

    const appUser = await fetchProfile(data.user!, data.session.access_token);
    return appUser;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
  };

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await fetchProfile(session.user, session.access_token);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAdmin, login, signInWithProvider, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

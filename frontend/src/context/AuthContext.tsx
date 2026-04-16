import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../services/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  user_id: string;
  name: string;
  email: string;
  role: 'free' | 'premium' | 'vip';
  subscription_status?: string;
  picture?: string;
  is_admin?: boolean;
  admin_role?: string;
}

type OAuthProvider = 'google' | 'apple';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  login: (email: string, password: string) => Promise<User>;
  signInWithProvider: (provider: OAuthProvider) => Promise<User | void>;
  register: (name: string, email: string, password: string, referralCode?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearPasswordRecovery: () => void;
  triggerPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Build a minimal User immediately from Supabase session (no API call) */
const buildUserFromSession = (sbUser: SupabaseUser): User => ({
  user_id: sbUser.id,
  name: sbUser.user_metadata?.name || sbUser.email || '',
  email: sbUser.email || '',
  role: 'free',
  is_admin: false,
});

/** Enrich User with profile data from Supabase profiles table */
const enrichWithProfile = (
  sbUser: SupabaseUser,
  profile: { name?: string; role?: string; admin_role?: string } | null,
): User => {
  const profileRole = profile?.role ?? 'free';
  const isAdmin = profileRole === 'admin' || profileRole === 'super_admin';

  return {
    user_id: sbUser.id,
    name: profile?.name || sbUser.user_metadata?.name || sbUser.email || '',
    email: sbUser.email || '',
    role: isAdmin ? 'vip' : (profileRole as 'free' | 'premium' | 'vip'),
    is_admin: isAdmin,
    admin_role: profile?.admin_role ?? undefined,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const isAdmin = user?.is_admin === true;

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const triggerPasswordRecovery = useCallback(() => {
    console.log('[Auth] Password recovery triggered manually');
    setIsPasswordRecovery(true);
    setIsLoading(false);
  }, []);

  // Background profile enrichment — NEVER blocks UI
  const enrichProfile = useCallback(async (sbUser: SupabaseUser, accessToken: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, role, admin_role')
        .eq('id', sbUser.id)
        .single();

      if (error) {
        console.warn('[Auth] Profile fetch error:', error.message);
        return;
      }

      const enrichedUser = enrichWithProfile(sbUser, profile);
      setUser(enrichedUser);
      setToken(accessToken);
    } catch (err) {
      console.error('[Auth] enrichProfile failed:', err);
    }
  }, []);

  // ── Auth initialization ──
  // Rule: setUser IMMEDIATELY from session. Profile enrichment is background-only.
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        // Set user IMMEDIATELY so UI reacts
        setUser(buildUserFromSession(session.user));
        setToken(session.access_token);
        setIsLoading(false);

        // Enrich with profile data in background (for admin detection, name, etc.)
        enrichProfile(session.user, session.access_token);
      } else {
        setUser(null);
        setToken(null);
        setIsLoading(false);
      }
    };

    init();

    // Auth state listener — fires on login, logout, token refresh
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] AUTH EVENT:', event);

        if (!mounted) return;

        // Detect password recovery flow — do NOT treat as normal login
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[Auth] Password recovery detected');
          setIsPasswordRecovery(true);
          if (session) {
            setToken(session.access_token);
          }
          setIsLoading(false);
          return;
        }

        if (session) {
          // IMMEDIATE state update — no async blocking
          setUser(buildUserFromSession(session.user));
          setToken(session.access_token);
          setIsLoading(false);

          // Background enrichment
          enrichProfile(session.user, session.access_token);
        } else {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [enrichProfile]);

  // ── Auth actions ──

  const login = async (email: string, password: string): Promise<User> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    // Set immediately — onAuthStateChange also fires but this is synchronous feedback
    const immediateUser = buildUserFromSession(data.user);
    setUser(immediateUser);
    setToken(data.session.access_token);

    // Enrich in background
    enrichProfile(data.user, data.session.access_token);
    return immediateUser;
  };

  const signInWithProvider = async (provider: OAuthProvider): Promise<User | void> => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        throw new Error('OAuth sign-in not available during SSR');
      }
      const redirectTo = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      return;
    }

    // Native: open in-app browser, exchange code
    const redirectTo = 'swiftfx://auth';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success' && result.url) {
      console.log('[Auth] OAuth callback URL:', result.url);
      const { queryParams } = Linking.parse(result.url);
      const code = queryParams?.code;

      if (typeof code === 'string') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
        if (exchangeError) throw exchangeError;
      } else if (result.url.includes('#access_token')) {
        const hash = result.url.split('#')[1];
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (!access_token) throw new Error('No access token in callback URL');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || '',
        });
        if (sessionError) throw sessionError;
      } else {
        throw new Error('No authorization code or token in callback URL');
      }

      // onAuthStateChange will fire and set user. No need to do it here.
      return;
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Authentication cancelled');
    }

    throw new Error('Authentication failed');
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

    if (!data.session) {
      throw new Error('Account created! Please check your email to verify, then log in.');
    }

    // Small delay for the trigger to create the profile row
    await new Promise((r) => setTimeout(r, 600));

    const immediateUser = buildUserFromSession(data.user!);
    setUser(immediateUser);
    setToken(data.session.access_token);

    enrichProfile(data.user!, data.session.access_token);
    return immediateUser;
  };

  const logout = async () => {
    console.log('[Auth] LOGOUT TRIGGERED');
    try {
      await supabase.auth.signOut();
      console.log('[Auth] signOut completed');
    } catch (e) {
      console.log('[Auth] Logout error:', e);
    }
    // Force clear persisted session — signOut() alone doesn't reliably clear AsyncStorage on native
    try {
      await supabase.auth.setSession(null as any);
    } catch (_) {}
    setUser(null);
    setToken(null);
    setIsLoading(false);
    console.log('[Auth] State cleared: user=null, token=null');
  };

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await enrichProfile(session.user, session.access_token);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isAdmin, isPasswordRecovery, login, signInWithProvider, register, logout, refreshUser, clearPasswordRecovery, triggerPasswordRecovery }}
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

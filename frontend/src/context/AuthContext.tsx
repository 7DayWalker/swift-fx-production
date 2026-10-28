import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { getStoredReferralCode, clearStoredReferralCode } from '../services/referralService';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  user_id: string;
  name: string;
  email: string;
  role: 'free' | 'premium' | 'vip';
  raw_role?: string;
  subscription?: 'free' | 'premium' | 'vip';
  subscription_status?: string;
  account_status?: string;
  picture?: string;
  is_admin?: boolean;
  admin_role?: string;
}

type OAuthProvider = 'google' | 'apple';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  login: (email: string, password: string) => Promise<User>;
  signInWithProvider: (provider: OAuthProvider) => Promise<User | void>;
  register: (name: string, email: string, password: string, referralCode?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Build a minimal User immediately from Supabase session (no API call) */
const buildUserFromSession = (sbUser: SupabaseUser): User => ({
  user_id: sbUser.id,
  name: sbUser.user_metadata?.name || sbUser.email || '',
  email: sbUser.email || '',
  role: 'free',
  subscription: 'free',
  is_admin: false,
});

/** Enrich User with profile data from Supabase profiles table */
const enrichWithProfile = (
  sbUser: SupabaseUser,
  profile: {
    name?: string;
    role?: string;
    admin_role?: string;
    admin_enabled?: boolean;
    subscription?: string;
    subscription_tier?: string;
    subscription_status?: string;
    account_status?: string;
    picture?: string;
  } | null,
): User => {
  const profileRole = profile?.role ?? 'free';
  const adminEnabled = profile?.admin_enabled !== false;
  const isAdmin =
    adminEnabled &&
    (profileRole === 'admin' || profileRole === 'super_admin' || Boolean(profile?.admin_role));

  const rawTier = (
    profile?.subscription ||
    profile?.subscription_tier ||
    (['free', 'premium', 'vip'].includes(profileRole) ? profileRole : 'free')
  ).toLowerCase();
  const normalizedTier: 'free' | 'premium' | 'vip' = isAdmin
    ? 'vip'
    : rawTier === 'vip' || rawTier === 'premium'
      ? rawTier
      : 'free';

  return {
    user_id: sbUser.id,
    name: profile?.name || sbUser.user_metadata?.name || sbUser.email || '',
    email: sbUser.email || '',
    role: normalizedTier,
    raw_role: profileRole,
    subscription: normalizedTier,
    subscription_status: profile?.subscription_status ?? undefined,
    account_status: profile?.account_status ?? 'active',
    is_admin: isAdmin,
    admin_role: profile?.admin_role ?? (profileRole === 'super_admin' ? 'super_admin' : undefined),
    picture: profile?.picture ?? undefined,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // When an OAuth deep link is detected, we will bridge stored referral attribution into
  // /api/referral/record-signup once the Supabase session exists.
  const oauthAttributionReadyRef = useRef(false);
  const oauthAttributionProcessedUserIdRef = useRef<string | null>(null);

  const isAdmin = user?.is_admin === true;

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  // Background profile enrichment — NEVER blocks normal tab UI, while signaling admin layout readiness
  const enrichProfile = useCallback(async (sbUser: SupabaseUser, accessToken: string) => {
    setIsProfileLoading(true);
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, role, admin_role, admin_enabled, subscription, subscription_tier, subscription_status, account_status, picture')
        .eq('id', sbUser.id)
        .single();

      if (error) {
        console.warn('[Auth] Profile fetch error:', error.message);
        return;
      }

      if (profile?.account_status === 'deactivated' || profile?.account_status === 'deleted') {
        console.warn('[Auth] Account is deactivated/deleted, signing out.');
        try {
          await supabase.auth.signOut();
        } catch {}
        setUser(null);
        setToken(null);
        return;
      }

      const enrichedUser = enrichWithProfile(sbUser, profile);
      setUser(enrichedUser);
      setToken(accessToken);
    } catch (err) {
      console.error('[Auth] enrichProfile failed:', err);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  // ── Auth initialization + global deep link handling ──
  // isLoading stays TRUE until both deep link check and session init complete.
  // This blocks _layout.tsx routing and prevents the race condition.
  useEffect(() => {
    let mounted = true;

    /**
     * Process an auth deep link URL (recovery or OAuth cold-start).
     * Returns true if the URL was an auth callback and was handled.
     */
    const handleAuthDeepLink = async (url: string): Promise<boolean> => {
      // Only process swiftfx://auth URLs
      if (!url.includes('swiftfx://auth')) return false;

      console.log('[Auth] Processing auth deep link:', url.substring(0, 120));

      const isRecovery =
        url.includes('type=recovery') || url.includes('type%3Drecovery');
      const hasAccessToken = url.includes('#access_token');
      const parsed = Linking.parse(url);
      const code =
        typeof parsed.queryParams?.code === 'string'
          ? parsed.queryParams.code
          : null;

      // ── Password recovery ──
      if (isRecovery && hasAccessToken) {
        console.log('[Auth] Deep link: password recovery');
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (!access_token) {
          console.error('[Auth] Recovery link missing access_token');
          return false;
        }

        // Set recovery flag BEFORE setSession so routing sees it
        // when onAuthStateChange fires SIGNED_IN
        if (mounted) setIsPasswordRecovery(true);

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || '',
        });

        if (error) {
          console.error('[Auth] Recovery setSession error:', error.message);
          if (mounted) {
            setIsPasswordRecovery(false);
            setIsLoading(false);
          }
          return true; // We handled it (even if it failed)
        }

        if (mounted) {
          setToken(access_token);
          setIsLoading(false);
        }
        console.log('[Auth] Recovery deep link processed successfully');
        return true;
      }

      // ── OAuth PKCE (cold-start callback) ──
      if (code) {
        console.log('[Auth] Deep link: OAuth PKCE code exchange');
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) {
          console.error('[Auth] OAuth code exchange error:', error.message);
        }
        // OAuth succeeded; we will bridge stored referral attribution after session is established
        oauthAttributionReadyRef.current = true;
        // onAuthStateChange will set user + isLoading
        return true;
      }

      // ── OAuth implicit grant (cold-start callback, non-recovery) ──
      if (hasAccessToken && !isRecovery) {
        console.log('[Auth] Deep link: OAuth implicit grant');
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (!access_token) return false;

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || '',
        });
        if (error) {
          console.error('[Auth] OAuth setSession error:', error.message);
        }

        // OAuth succeeded; we will bridge stored referral attribution after session is established
        oauthAttributionReadyRef.current = true;

        // onAuthStateChange will set user + isLoading
        return true;
      }

      return false;
    };

    const init = async () => {
      // ── Step 1: Check for auth deep link (cold start) ──
      // This runs BEFORE getSession so we can intercept recovery links
      // before _layout.tsx tries to route.
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          console.log('[Auth] Initial URL found:', initialUrl.substring(0, 100));
          const handled = await handleAuthDeepLink(initialUrl);
          if (handled) {
            console.log('[Auth] Deep link handled — skipping normal session init');
            return; // Deep link was processed, don't do normal init
          }
        }
      } catch (err) {
        console.error('[Auth] getInitialURL error:', err);
      }

      // ── Step 2: Normal session init (no deep link or non-auth deep link) ──
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
          const sbUser = session.user;

          // Real authenticated session ALWAYS supersedes guest mode.
          // Clear stale guest flag only after confirmed session exists.
          try {
            await AsyncStorage.removeItem('swiftfx_guest');
          } catch {
            // fail-closed: auth routing still uses `user`, not guest flag
          }

          setUser(buildUserFromSession(sbUser));
          setToken(session.access_token);
          setIsProfileLoading(true);
          setIsLoading(false);

          // OAuth referral attribution bridge:
          // After OAuth session exists, consume AsyncStorage and record referral attribution once.
          if (
            oauthAttributionReadyRef.current &&
            oauthAttributionProcessedUserIdRef.current !== sbUser.id
          ) {
            oauthAttributionReadyRef.current = false;

            void (async () => {
              try {
                const stored = await getStoredReferralCode();
                if (!stored?.code) return;

                await api.post('/referral/record-signup', {
                  referral_code: stored.code,
                  user_id: sbUser.id,
                });

                // Clear so cold-restart does not re-attribute
                await clearStoredReferralCode();
                oauthAttributionProcessedUserIdRef.current = sbUser.id;

                console.log('[Referral] OAuth referral attribution recorded:', stored.code);
              } catch (err) {
                console.error('[Referral] OAuth referral attribution failed:', err);
              }
            })();
          }

          enrichProfile(sbUser, session.access_token);
        } else {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
    };

    init();

    // ── Runtime deep link listener (app already running) ──
    const linkSubscription = Linking.addEventListener('url', async (event) => {
      if (event.url) {
        console.log('[Auth] Runtime deep link received:', event.url.substring(0, 100));
        await handleAuthDeepLink(event.url);
      }
    });

    // ── Auth state listener — fires on login, logout, token refresh ──
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] AUTH EVENT:', event);

        if (!mounted) return;

        // Detect password recovery (web / Supabase internal detection)
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[Auth] PASSWORD_RECOVERY event from Supabase');
          setIsPasswordRecovery(true);
          if (session) {
            setToken(session.access_token);
          }
          setIsLoading(false);
          return;
        }

        if (session) {
          const sbUser = session.user;

          // Real authenticated session ALWAYS supersedes guest mode.
          // Clear stale guest flag only after confirmed session exists.
          void (async () => {
            try {
              await AsyncStorage.removeItem('swiftfx_guest');
            } catch {
              // fail-closed
            }
          })();

          setUser(buildUserFromSession(sbUser));
          setToken(session.access_token);
          setIsProfileLoading(true);
          setIsLoading(false);

          // OAuth referral attribution bridge (runtime + cold-start safety):
          // if an OAuth callback was processed, consume AsyncStorage referral code
          // and record it server-side once per user.
          if (
            oauthAttributionReadyRef.current &&
            oauthAttributionProcessedUserIdRef.current !== sbUser.id
          ) {
            oauthAttributionReadyRef.current = false;

            void (async () => {
              try {
                const stored = await getStoredReferralCode();
                if (!stored?.code) return;

                await api.post('/referral/record-signup', {
                  referral_code: stored.code,
                  user_id: sbUser.id,
                });

                await clearStoredReferralCode();
                oauthAttributionProcessedUserIdRef.current = sbUser.id;

                console.log('[Referral] OAuth referral attribution recorded (runtime):', stored.code);
              } catch (err) {
                console.error('[Referral] OAuth referral attribution failed (runtime):', err);
              }
            })();
          }

          enrichProfile(sbUser, session.access_token);
        } else {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      linkSubscription.remove();
      listener.subscription.unsubscribe();
    };
  }, [enrichProfile]);

  // ── Auth actions ──

  const login = async (email: string, password: string): Promise<User> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const immediateUser = buildUserFromSession(data.user);
    setUser(immediateUser);
    setToken(data.session.access_token);

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
    referralCode?: string,
  ): Promise<User> => {
    const signupData: any = { data: { name } };
    
    // Include referral code in auth metadata if provided
    if (referralCode) {
      signupData.data.referral_code = referralCode;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: signupData,
    });
    if (error) throw new Error(error.message);

    if (!data.session) {
      throw new Error('Account created! Please check your email to verify, then log in.');
    }

    await new Promise((r) => setTimeout(r, 600));

    const immediateUser = buildUserFromSession(data.user!);
    setUser(immediateUser);
    setToken(data.session.access_token);

    enrichProfile(data.user!, data.session.access_token);
    
    // Create referral record in backend if referral code was provided
    if (referralCode && data.user) {
      try {
        await api.post('/referral/record-signup', {
          referral_code: referralCode,
          user_id: data.user.id,
        });
      } catch (err) {
        console.error('[Auth] Failed to record referral on signup:', err);
        // Don't fail signup if referral recording fails
      }
    }

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
    try {
      await supabase.auth.setSession(null as any);
    } catch (_) {}
    setUser(null);
    setToken(null);
    setIsPasswordRecovery(false);
    setIsProfileLoading(false);
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
      value={{ user, token, isLoading, isProfileLoading, isAdmin, isPasswordRecovery, login, signInWithProvider, register, logout, refreshUser, clearPasswordRecovery }}
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

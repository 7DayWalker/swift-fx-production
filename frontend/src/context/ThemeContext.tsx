import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Theme System v1
 * 
 * User Area:
 * - Dark Mode is the stable default
 * - Light Mode is optional and partial (Phase 2 polish)
 * - Screens without Light Mode support fallback to Dark
 * - User preference is persisted
 * 
 * Admin Area:
 * - Force Dark Mode ONLY
 * - Ignores user theme preference completely
 * - Use useAdminTheme() hook for all admin screens
 */

// Theme colors
export const themes = {
  dark: {
    name: 'dark',
    background: '#0A0E17',
    surface: '#1A1F2E',
    surfaceSecondary: '#252A3A',
    border: '#2A2F3E',
    text: '#FFFFFF',
    textSecondary: '#8A8D98',
    textMuted: '#6B7280',
    primary: '#00D4AA',
    primaryDark: '#00B894',
    error: '#FF4757',
    warning: '#FFD700',
    success: '#00D4AA',
    cardBackground: '#1A1F2E',
    inputBackground: '#252A3A',
    tabBarBackground: '#1A1F2E',
    tabBarBorder: '#2A2F3E',
  },
  light: {
    name: 'light',
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceSecondary: '#F0F2F5',
    border: '#E5E7EB',
    text: '#1A1F2E',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    primary: '#00B894',
    primaryDark: '#00A085',
    error: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981',
    cardBackground: '#FFFFFF',
    inputBackground: '#F0F2F5',
    tabBarBackground: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
  },
};

// Admin theme - ALWAYS dark, never changes
export const adminTheme = themes.dark;

export type ThemeType = 'dark' | 'light' | 'system';
export type Theme = typeof themes.dark;

interface ThemeContextType {
  theme: Theme;
  themeType: ThemeType;
  isDark: boolean;
  setThemeType: (type: ThemeType) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@swift_fx_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeType, setThemeTypeState] = useState<ThemeType>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference on mount
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system')) {
        setThemeTypeState(savedTheme as ThemeType);
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setThemeType = async (type: ThemeType) => {
    setThemeTypeState(type);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, type);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = themeType === 'dark' ? 'light' : 'dark';
    setThemeType(newTheme);
  };

  // Determine actual theme based on themeType and system preference
  const isDark = themeType === 'system' 
    ? systemColorScheme === 'dark' 
    : themeType === 'dark';

  const theme = isDark ? themes.dark : themes.light;

  // Don't render until theme is loaded to avoid flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, themeType, isDark, setThemeType, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

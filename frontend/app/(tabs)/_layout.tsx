import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';

// Base tab bar height (the visible content area, excluding safe area)
const BASE_TAB_BAR_HEIGHT = 52;

// Export for screens that need to know total tab bar height
export const TAB_BAR_HEIGHT = BASE_TAB_BAR_HEIGHT;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  
  // Total height = visible content area + bottom safe area inset
  const totalTabBarHeight = BASE_TAB_BAR_HEIGHT + insets.bottom;
  
  // Tab bar bg slightly darker than page bg for integration
  const tabBg = isDark ? '#080B13' : theme.tabBarBackground;
  const tabBorder = isDark ? '#151A27' : theme.tabBarBorder;

  return (
    <View style={[layoutStyles.container, { backgroundColor: theme.background }]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: tabBg,
            borderTopWidth: 0.5,
            borderTopColor: tabBorder,
            height: totalTabBarHeight,
            paddingTop: 0,
            paddingBottom: 0,
            elevation: 0,
          },
          tabBarItemStyle: {
            height: BASE_TAB_BAR_HEIGHT,
            paddingTop: 6,
            paddingBottom: 2,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: isDark ? 'rgba(138,141,152,0.55)' : theme.textSecondary,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={21} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="signals"
          options={{
            title: 'Signals',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'trending-up' : 'trending-up-outline'} size={21} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ai"
          options={{
            title: 'AI',
            tabBarIcon: ({ color, focused }) => (
              <View style={[layoutStyles.aiIconContainer, focused && { backgroundColor: `${theme.primary}18` }]}>
                <Ionicons name="sparkles" size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Community',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={21} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'menu' : 'menu-outline'} size={21} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const layoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  aiIconContainer: {
    backgroundColor: 'transparent',
    padding: 4,
    borderRadius: 10,
  },
});

import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Base tab bar height (the visible content area, excluding safe area)
const BASE_TAB_BAR_HEIGHT = 56;

// Export for screens that need to know total tab bar height
export const TAB_BAR_HEIGHT = BASE_TAB_BAR_HEIGHT;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  
  // Total height = visible content area + bottom safe area inset
  const totalTabBarHeight = BASE_TAB_BAR_HEIGHT + insets.bottom;

  return (
    <View style={layoutStyles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1A1F2E',
            borderTopWidth: 1,
            borderTopColor: '#2A2F3E',
            // Total container height includes safe area at bottom
            height: totalTabBarHeight,
            // NO padding here - we control item positioning instead
            paddingTop: 0,
            paddingBottom: 0,
            // Shadow
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
          },
          // Item container - constrained to visible area only
          tabBarItemStyle: {
            height: BASE_TAB_BAR_HEIGHT,
            paddingTop: 6,
            paddingBottom: 6,
            justifyContent: 'center',
            alignItems: 'center',
          },
          // Icon styling
          tabBarIconStyle: {
            marginBottom: 2,
          },
          // Label styling - offset upward to stay above safe area
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: -2,
            marginBottom: insets.bottom > 0 ? insets.bottom : 4,
          },
          tabBarActiveTintColor: '#00D4AA',
          tabBarInactiveTintColor: '#8A8D98',
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="signals"
          options={{
            title: 'Signals',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="trending-up-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ai"
          options={{
            title: 'AI',
            tabBarIcon: ({ color, size }) => (
              <View style={layoutStyles.aiIconContainer}>
                <Ionicons name="sparkles" size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Community',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="menu-outline" size={22} color={color} />
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
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    padding: 4,
    borderRadius: 8,
  },
});

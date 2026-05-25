import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import GuestUpgradePrompt from './GuestUpgradePrompt';
import { Ionicons } from '@expo/vector-icons';

export interface GuestOverlayGateProps {
  isGuest: boolean;
  icon: keyof typeof Ionicons.glyphMap | string;
  title: string;
  description: string;
  buttonLabel: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function GuestOverlayGate({
  isGuest,
  icon,
  title,
  description,
  buttonLabel,
  containerStyle,
}: GuestOverlayGateProps) {
  if (!isGuest) return null;

  return (
    <View pointerEvents="auto" style={[styles.overlay, containerStyle]}>
      <View style={styles.backdrop} />
      <BlurView
        style={styles.blur}
        intensity={60}
        tint="dark"
      />

      <View style={styles.center}>
        <GuestUpgradePrompt
          icon={icon}
          title={title}
          description={description}
          buttonLabel={buttonLabel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,

    // premium/intentional modal behavior: block interactions underneath
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',

    // keep the card visually “floating” even with varying screen heights
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
});

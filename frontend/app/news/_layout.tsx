import { Stack } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

export default function NewsLayout() {
  const { theme } = useTheme();
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    />
  );
}

import { Stack } from 'expo-router';

export default function AcademyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0E17' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[category]" />
      <Stack.Screen name="lesson" />
    </Stack>
  );
}

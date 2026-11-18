import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/theme';
import { WakeWordManager } from '../src/voice/WakeWordManager';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <WakeWordManager />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

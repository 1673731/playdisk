import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { LogBox, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { api } from '@/src/api';
import { useShakeDetector } from '@/src/useShakeDetector';

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [shakeEnabled, setShakeEnabled] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    api.getSettings().then((s) => setShakeEnabled(s.shake_to_search)).catch(() => {});
  }, []);

  const onShake = useCallback(() => {
    // Avoid retriggering while already on search screen
    if (segments.join('/').includes('search')) return;
    router.push('/(tabs)/search');
  }, [router, segments]);

  useShakeDetector(shakeEnabled, onShake);

  // Expose refresh function via global for settings screen
  useEffect(() => {
    (globalThis as any).__refreshShake = () => {
      api.getSettings().then((s) => setShakeEnabled(s.shake_to_search)).catch(() => {});
    };
  }, []);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#050614' }}>
        <StatusBar barStyle="light-content" backgroundColor="#050614" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050614' } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="assistant"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="add-game"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="premium"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="stats"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="export"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="game/[id]"
            options={{ animation: 'slide_from_right' }}
          />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

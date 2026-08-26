import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Detects a shake gesture from the accelerometer.
 * On web/non-supported platforms, this is a no-op.
 */
export function useShakeDetector(enabled: boolean, onShake: () => void) {
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') return;

    let sub: any;
    let cancelled = false;

    (async () => {
      try {
        const { Accelerometer } = await import('expo-sensors');
        const available = await Accelerometer.isAvailableAsync().catch(() => false);
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(120);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          if (magnitude > 1.8) {
            const now = Date.now();
            if (now - lastTriggerRef.current > 1500) {
              lastTriggerRef.current = now;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
              onShake();
            }
          }
        });
      } catch (e) {
        console.warn('Shake detector unavailable', e);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, [enabled, onShake]);
}

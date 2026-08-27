import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Detects a shake gesture from the accelerometer.
 * On web/non-supported platforms, this is a no-op.
 *
 * En vez de disparar con un único pico de aceleración (lo que hacía que
 * cualquier movimiento normal del móvil -cogerlo, dejarlo en la mesa-
 * abriera el buscador por error), exigimos varios picos seguidos en poco
 * tiempo: eso sí es característico de agitar el móvil de verdad, y un solo
 * golpe o movimiento normal no lo cumple.
 */
export function useShakeDetector(enabled: boolean, onShake: () => void) {
  const lastTriggerRef = useRef(0);
  const peakTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'web') return;

    let sub: any;
    let cancelled = false;

    const SHAKE_THRESHOLD = 1.7; // pico de aceleración necesario (1.0 = reposo)
    const PEAKS_REQUIRED = 3; // nº de picos seguidos para contar como "agitar"
    const PEAK_WINDOW_MS = 900; // ventana de tiempo en la que deben ocurrir
    const MIN_MS_BETWEEN_PEAKS = 120; // evita contar el mismo pico dos veces
    const COOLDOWN_MS = 1500; // tras disparar, ignorar un rato

    (async () => {
      try {
        const { Accelerometer } = await import('expo-sensors');
        const available = await Accelerometer.isAvailableAsync().catch(() => false);
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(80);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();

          if (magnitude <= SHAKE_THRESHOLD) return;
          if (now - lastTriggerRef.current < COOLDOWN_MS) return;

          const peaks = peakTimestampsRef.current;
          const lastPeak = peaks[peaks.length - 1];
          if (lastPeak && now - lastPeak < MIN_MS_BETWEEN_PEAKS) return; // mismo pico

          peaks.push(now);
          // Nos quedamos solo con los picos dentro de la ventana reciente
          peakTimestampsRef.current = peaks.filter((t) => now - t <= PEAK_WINDOW_MS);

          if (peakTimestampsRef.current.length >= PEAKS_REQUIRED) {
            lastTriggerRef.current = now;
            peakTimestampsRef.current = [];
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            onShake();
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
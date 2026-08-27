import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';

import { theme } from './theme';

/**
 * Pantalla de captura de foto "personal" para la portada de un juego.
 *
 * Importante para privacidad: la foto resultante se guarda SOLO en el
 * dispositivo (carpeta de documentos de la app) y su URI se usa únicamente
 * como cover_url de ESE juego en TU colección. A propósito, quien use este
 * componente debe evitar mandar esa URI al catálogo compartido de códigos
 * de barras (confirm-barcode), para que una foto propia (que podría ser
 * cualquier cosa) nunca acabe mostrándose a otra persona que escanee el
 * mismo código.
 */
export function CameraCaptureScreen({
  onCaptured,
  onCancel,
}: {
  onCaptured: (localUri: string) => void;
  onCancel: () => void;
}) {
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied' | 'unsupported'>('pending');
  const [Camera, setCamera] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') { setPermission('unsupported'); return; }
      try {
        const cam = await import('expo-camera');
        setCamera(cam);
        const perm = await cam.Camera.requestCameraPermissionsAsync();
        setPermission(perm.granted ? 'granted' : 'denied');
      } catch (e) {
        console.warn('camera unavailable', e);
        setPermission('unsupported');
      }
    })();
  }, []);

  const takePhoto = async () => {
    if (!cameraRef.current || saving) return;
    setSaving(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      const dir = FileSystem.documentDirectory + 'covers/';
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const dest = `${dir}cover-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: photo.uri, to: dest });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onCaptured(dest);
    } catch (e) {
      console.warn('Error al hacer la foto', e);
      setSaving(false);
    }
  };

  if (permission === 'pending') {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.brandPrimary} /></View>;
  }

  if (permission === 'granted' && Camera?.CameraView) {
    const CameraView = Camera.CameraView;
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.hint}>Haz una foto a la caja o al disco de tu copia</Text>
          <View style={styles.controls}>
            <Pressable testID="photo-cancel" onPress={onCancel} style={styles.sideBtn}>
              <MaterialCommunityIcons name="close" size={22} color="#fff" />
            </Pressable>
            <Pressable testID="photo-shutter" onPress={takePhoto} disabled={saving} style={styles.shutter}>
              {saving ? <ActivityIndicator color="#111" /> : <View style={styles.shutterInner} />}
            </Pressable>
            <View style={styles.sideBtn} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <MaterialCommunityIcons
        name={permission === 'denied' ? 'camera-off-outline' : 'camera-outline'}
        size={44}
        color={theme.colors.muted}
      />
      <Text style={{ color: theme.colors.onSurfaceTertiary, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 }}>
        {permission === 'denied'
          ? 'Concede el permiso de cámara en ajustes para hacer la foto.'
          : 'La cámara no está disponible aquí.'}
      </Text>
      <Pressable testID="photo-cancel-fallback" onPress={onCancel} style={{ marginTop: 20 }}>
        <Text style={{ color: theme.colors.brandPrimary, fontWeight: '700' }}>Volver</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
  },
  hint: {
    color: '#fff', textAlign: 'center', fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4,
  },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  sideBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 72, height: 72, borderRadius: 999,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 999, backgroundColor: '#fff' },
});

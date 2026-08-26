import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme } from '@/src/theme';
import { api } from '@/src/api';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shake, setShake] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((s) => { setShake(s.shake_to_search); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggleShake = async (val: boolean) => {
    setShake(val);
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.updateSettings({ shake_to_search: val });
      (globalThis as any).__refreshShake?.();
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable
          testID="settings-close"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Ajustes</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium</Text>
          <Pressable
            testID="settings-open-premium"
            onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/premium'); }}
            style={styles.row}
          >
            <View style={[styles.rowIcon, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
              <MaterialCommunityIcons name="crown" size={20} color={theme.colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Mi Colección Premium</Text>
              <Text style={styles.rowDesc}>IA ilimitada, escaneos, sin anuncios y más.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceTertiary} />
          </Pressable>

          <Pressable
            testID="settings-open-stats"
            onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/stats'); }}
            style={styles.row}
          >
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="chart-line" size={20} color={theme.colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Estadísticas</Text>
              <Text style={styles.rowDesc}>Gasto total, plataformas y evolución mensual.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceTertiary} />
          </Pressable>

          <Pressable
            testID="settings-open-export"
            onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/export'); }}
            style={styles.row}
          >
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="download-outline" size={20} color={theme.colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Exportar colección</Text>
              <Text style={styles.rowDesc}>Descarga tu colección en CSV o PDF.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gestos</Text>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="vibrate" size={20} color={theme.colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Agitar para buscar</Text>
              <Text style={styles.rowDesc}>Abre el buscador agitando el móvil (como CEX).</Text>
            </View>
            <Switch
              testID="shake-toggle"
              value={shake}
              onValueChange={toggleShake}
              trackColor={{ false: theme.colors.border, true: theme.colors.brandPrimary }}
              thumbColor="#fff"
              disabled={loading}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobre</Text>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="controller-classic" size={20} color={theme.colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Mi Colección</Text>
              <Text style={styles.rowDesc}>v1.0.0 · Tu colección de videojuegos físicos.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 4,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: theme.colors.onSurface, fontSize: 20, fontWeight: '700' },
  section: {
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, gap: 8,
  },
  sectionTitle: { color: theme.colors.onSurfaceTertiary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { color: theme.colors.onSurface, fontWeight: '600' },
  rowDesc: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
});

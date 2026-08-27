import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Linking, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

import { theme, type UserSettings } from '@/src/theme';
import { api } from '@/src/api';

type Toast = { text: string; kind: 'ok' | 'err' } | null;

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [busy, setBusy] = useState<null | 'csv' | 'pdf'>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  const showToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3200);
  };

  const isPremium = !!settings?.premium_active;

  const handleCsv = async () => {
    if (!isPremium) { router.replace('/premium'); return; }
    Haptics.selectionAsync().catch(() => {});
    setBusy('csv');
    try {
      const csv = await api.exportCsv();
      const filename = `mi-coleccion-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === 'web') {
        // Web: trigger download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast('CSV descargado');
      } else {
        const path = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Exportar colección' });
        }
        showToast('CSV listo para compartir');
      }
    } catch (e: any) {
      showToast(e?.message ?? 'Error al exportar CSV', 'err');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    if (!isPremium) { router.replace('/premium'); return; }
    Haptics.selectionAsync().catch(() => {});
    setBusy('pdf');
    try {
      const html = await api.fetchExportHtml();
      if (Platform.OS === 'web') {
        // Open in a new tab so user can Save As PDF via print dialog
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => win.print(), 400);
        }
        showToast('Abriendo vista imprimible…');
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar colección PDF' });
        }
        showToast('PDF generado');
      }
    } catch (e: any) {
      showToast(e?.message ?? 'Error al exportar PDF', 'err');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 6 }}>
      <View style={styles.header}>
        <Pressable testID="export-close" onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Exportar colección</Text>
        <View style={styles.premiumTag}>
          <MaterialCommunityIcons name="crown" size={12} color={theme.colors.gold} />
          <Text style={styles.premiumTagText}>Premium</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={styles.helperTitle}>Copia de seguridad</Text>
        <Text style={styles.helperText}>
          Descarga toda tu colección para tenerla a mano o compartirla. Los datos se exportan sin comprimir.
        </Text>

        <Pressable
          testID="export-csv"
          onPress={handleCsv}
          disabled={busy !== null}
          style={[styles.card, !isPremium && styles.cardLocked]}
        >
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <MaterialCommunityIcons name="file-delimited-outline" size={26} color={theme.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cardTitle}>Exportar a CSV</Text>
              {!isPremium && <MaterialCommunityIcons name="lock" size={12} color={theme.colors.gold} />}
            </View>
            <Text style={styles.cardDesc}>Hoja de cálculo (Excel, Numbers, Google Sheets)</Text>
          </View>
          {busy === 'csv' ? (
            <ActivityIndicator color={theme.colors.brandPrimary} />
          ) : (
            <MaterialCommunityIcons name="download" size={22} color={theme.colors.onSurfaceTertiary} />
          )}
        </Pressable>

        <Pressable
          testID="export-pdf"
          onPress={handlePdf}
          disabled={busy !== null}
          style={[styles.card, !isPremium && styles.cardLocked]}
        >
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
            <MaterialCommunityIcons name="file-pdf-box" size={26} color={theme.colors.error} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cardTitle}>Exportar a PDF</Text>
              {!isPremium && <MaterialCommunityIcons name="lock" size={12} color={theme.colors.gold} />}
            </View>
            <Text style={styles.cardDesc}>Documento imprimible con resumen y tablas</Text>
          </View>
          {busy === 'pdf' ? (
            <ActivityIndicator color={theme.colors.brandPrimary} />
          ) : (
            <MaterialCommunityIcons name="download" size={22} color={theme.colors.onSurfaceTertiary} />
          )}
        </Pressable>

        {!isPremium && (
          <Pressable testID="export-cta" onPress={() => router.replace('/premium')} style={styles.cta}>
            <LinearGradient
              colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons name="crown" size={18} color="#fff" />
            <Text style={styles.ctaText}>Hazte Premium para exportar</Text>
          </Pressable>
        )}

        <Pressable
          testID="preview-html"
          onPress={() => Linking.openURL(api.exportHtmlUrl())}
          style={styles.previewBtn}
        >
          <MaterialCommunityIcons name="eye-outline" size={16} color={theme.colors.brandPrimary} />
          <Text style={styles.previewText}>Ver vista previa web</Text>
        </Pressable>
      </ScrollView>

      {toast && (
        <View
          testID="export-toast"
          style={[
            styles.toast,
            { bottom: insets.bottom + 16, backgroundColor: toast.kind === 'ok' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)' },
          ]}
        >
          <MaterialCommunityIcons name={toast.kind === 'ok' ? 'check-circle' : 'alert-circle'} size={16} color="#fff" />
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' },
  premiumTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  premiumTagText: { color: theme.colors.gold, fontSize: 11, fontWeight: '700' },

  helperTitle: { color: theme.colors.onSurface, fontSize: 22, fontWeight: '800' },
  helperText: { color: theme.colors.onSurfaceTertiary, lineHeight: 20 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18,
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cardLocked: { opacity: 0.7 },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: theme.colors.onSurface, fontWeight: '700', fontSize: 15 },
  cardDesc: { color: theme.colors.onSurfaceTertiary, fontSize: 12, marginTop: 3 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 14, overflow: 'hidden',
  },
  ctaText: { color: '#fff', fontWeight: '800' },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
  },
  previewText: { color: theme.colors.brandPrimary, fontWeight: '700' },

  toast: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
  },
  toastText: { color: '#fff', fontWeight: '700', flex: 1 },
});

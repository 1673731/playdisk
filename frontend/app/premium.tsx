import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme, type UserSettings } from '@/src/theme';
import { api } from '@/src/api';

const FEATURES = [
  { icon: 'infinity', label: 'Chat IA ilimitado', desc: 'Sin límite diario' },
  { icon: 'barcode-scan', label: 'Escaneos ilimitados', desc: 'Añade juegos sin límite' },
  { icon: 'chart-line', label: 'Estadísticas avanzadas', desc: 'Gasto, rareza, tendencias' },
  { icon: 'download', label: 'Exportar colección', desc: 'CSV y PDF' },
  { icon: 'block-helper', label: 'Sin anuncios', desc: 'Experiencia limpia' },
  { icon: 'palette', label: 'Temas visuales', desc: 'Personaliza tu app' },
];

const PLANS = [
  { id: 'monthly',  label: 'Mensual', price: '4,99€', period: '/mes',  save: null },
  { id: 'annual',   label: 'Anual',   price: '39,99€', period: '/año', save: 'Ahorra 33%' },
];

export default function Premium() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const [busy, setBusy] = useState(false);
  const glow = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const subscribe = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBusy(true);
    try {
      await api.premiumSubscribe();
      const s = await api.getSettings();
      setSettings(s);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.premiumCancel();
      const s = await api.getSettings();
      setSettings(s);
    } finally {
      setBusy(false);
    }
  };

  const watchAd = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true);
    try {
      // Simulated rewarded ad — 24h unlock
      await new Promise((r) => setTimeout(r, 800));
      await api.rewardUnlock('all', 24);
      const s = await api.getSettings();
      setSettings(s);
    } finally {
      setBusy(false);
    }
  };

  const isPremium = !!settings?.is_premium;
  const tempActive = settings?.premium_active && !isPremium;
  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 6 }}>
      <View style={styles.header}>
        <Pressable testID="premium-close" onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Mi Colección Premium</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <LinearGradient
            colors={['rgba(251,191,36,0.15)', 'rgba(99,102,241,0.18)', 'rgba(5,6,20,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View style={[styles.crownWrap, { transform: [{ scale }], opacity }]}>
            <LinearGradient
              colors={['#FBBF24', '#F59E0B', '#B45309']}
              style={styles.crownBg}
            >
              <MaterialCommunityIcons name="crown" size={40} color="#fff" />
            </LinearGradient>
          </Animated.View>
          <Text style={styles.heroTitle}>Desbloquea todo</Text>
          <Text style={styles.heroSub}>Todas las funciones premium, sin anuncios y con IA ilimitada.</Text>
          {isPremium && (
            <View style={styles.activeBadge} testID="premium-active-badge">
              <MaterialCommunityIcons name="check-circle" size={14} color={theme.colors.success} />
              <Text style={styles.activeBadgeText}>Premium activo</Text>
            </View>
          )}
          {tempActive && !isPremium && (
            <View style={[styles.activeBadge, { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.35)' }]}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.brandPrimary} />
              <Text style={[styles.activeBadgeText, { color: theme.colors.brandPrimary }]}>Premium temporal</Text>
            </View>
          )}
        </View>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow} testID={`feature-${f.label}`}>
              <View style={styles.featureIconWrap}>
                <MaterialCommunityIcons name={f.icon as any} size={18} color={theme.colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.success} />
            </View>
          ))}
        </View>

        {!isPremium && (
          <>
            {/* Plans */}
            <View style={{ gap: 10 }}>
              {PLANS.map((p) => {
                const active = plan === p.id;
                return (
                  <Pressable
                    key={p.id}
                    testID={`plan-${p.id}`}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setPlan(p.id as any); }}
                    style={[styles.planCard, active && styles.planCardActive]}
                  >
                    <View style={styles.radio}>
                      {active && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.planLabel}>{p.label}</Text>
                        {p.save && (
                          <View style={styles.saveBadge}>
                            <Text style={styles.saveBadgeText}>{p.save}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.planPeriod}>Renovación automática. Cancelable.</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.planPrice}>{p.price}</Text>
                      <Text style={styles.planPeriodSmall}>{p.period}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="subscribe-btn"
              onPress={subscribe}
              disabled={busy}
              style={[styles.subscribeBtn, busy && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <MaterialCommunityIcons name="crown" size={20} color="#fff" />
                  <Text style={styles.subscribeBtnText}>Empezar Premium</Text>
                </>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o desbloquea temporal</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable testID="reward-ad-btn" onPress={watchAd} disabled={busy} style={styles.adBtn}>
              <MaterialCommunityIcons name="play-circle" size={22} color={theme.colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.adBtnTitle}>Ver anuncio → 24h Premium</Text>
                <Text style={styles.adBtnDesc}>Desbloquea todas las funciones por hoy.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.onSurfaceTertiary} />
            </Pressable>
          </>
        )}

        {isPremium && (
          <Pressable testID="cancel-premium" onPress={cancel} disabled={busy} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>{busy ? 'Cancelando...' : 'Cancelar suscripción (simulada)'}</Text>
          </Pressable>
        )}

        <Text style={styles.legal}>
          * Sistema de pagos en modo demo. La integración real con Apple/Google se activa al publicar la app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 4,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' },

  hero: {
    alignItems: 'center', paddingVertical: 24, borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
    backgroundColor: 'rgba(30,27,75,0.4)',
  },
  crownWrap: { marginBottom: 12 },
  crownBg: {
    width: 80, height: 80, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.gold, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  heroTitle: { color: theme.colors.onSurface, fontSize: 24, fontWeight: '800' },
  heroSub: { color: theme.colors.onSurfaceTertiary, fontSize: 14, textAlign: 'center', paddingHorizontal: 30, marginTop: 4 },
  activeBadge: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
  },
  activeBadgeText: { color: theme.colors.success, fontSize: 12, fontWeight: '700' },

  features: {
    padding: 14, borderRadius: 20,
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderWidth: 1, borderColor: theme.colors.border,
    gap: 10,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '700' },
  featureDesc: { color: theme.colors.muted, fontSize: 11 },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 18,
    backgroundColor: 'rgba(13,17,38,0.55)',
    borderWidth: 1.5, borderColor: theme.colors.border,
  },
  planCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: 'rgba(99,102,241,0.10)',
  },
  radio: {
    width: 22, height: 22, borderRadius: 999,
    borderWidth: 2, borderColor: theme.colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 999, backgroundColor: theme.colors.brandPrimary },
  planLabel: { color: theme.colors.onSurface, fontSize: 16, fontWeight: '700' },
  planPeriod: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  planPrice: { color: theme.colors.onSurface, fontSize: 18, fontWeight: '800' },
  planPeriodSmall: { color: theme.colors.muted, fontSize: 11 },
  saveBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: theme.colors.success,
  },
  saveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  subscribeBtn: {
    height: 54, borderRadius: 16, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  subscribeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.muted, fontSize: 11 },

  adBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  adBtnTitle: { color: theme.colors.onSurface, fontWeight: '700' },
  adBtnDesc: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },

  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelBtnText: { color: theme.colors.error, fontWeight: '600' },

  legal: { color: theme.colors.muted, fontSize: 10, textAlign: 'center', paddingHorizontal: 20 },
});

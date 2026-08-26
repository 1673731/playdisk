import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { theme, CONDITION_META, type ConditionKey, type Platform as Pf, type UserSettings } from '@/src/theme';
import { api, type StatsSummary } from '@/src/api';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (ym: string) => {
  const [, m] = ym.split('-');
  return MONTHS_ES[parseInt(m, 10) - 1] ?? m;
};

export default function Stats() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [platforms, setPlatforms] = useState<Pf[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, pfs, us] = await Promise.all([
          api.statsSummary(),
          api.listPlatforms(),
          api.getSettings(),
        ]);
        setStats(s);
        setPlatforms(pfs);
        setSettings(us);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.brandPrimary} />
      </View>
    );
  }

  const isPremium = !!settings?.premium_active;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 6 }}>
      <View style={styles.header}>
        <Pressable testID="stats-close" onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Estadísticas</Text>
        <View style={styles.premiumTag}>
          <MaterialCommunityIcons name="crown" size={12} color={theme.colors.gold} />
          <Text style={styles.premiumTagText}>Premium</Text>
        </View>
      </View>

      {!isPremium && (
        <Pressable
          testID="stats-locked"
          onPress={() => router.replace('/premium')}
          style={styles.lockedBanner}
        >
          <MaterialCommunityIcons name="lock-outline" size={16} color={theme.colors.gold} />
          <Text style={styles.lockedBannerText}>
            Vista previa · Hazte Premium para desbloquear todas las estadísticas
          </Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {/* Top KPI cards */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <KpiCard
            testID="kpi-spent"
            icon="cash-multiple"
            label="Gasto total"
            value={`${stats!.total_spent.toFixed(2)}€`}
            gradient={['#4338CA', '#6366F1']}
          />
          <KpiCard
            testID="kpi-avg"
            icon="chart-timeline-variant"
            label="Precio medio"
            value={`${stats!.average_price.toFixed(2)}€`}
            gradient={['#0EA5E9', '#38BDF8']}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <KpiCard
            testID="kpi-games"
            icon="gamepad-variant"
            label="Total juegos"
            value={String(stats!.total_games)}
            gradient={['#059669', '#10B981']}
          />
          <KpiCard
            testID="kpi-gifts"
            icon="gift-outline"
            label="Regalos"
            value={String(stats!.total_gifts)}
            gradient={['#B45309', '#F59E0B']}
          />
        </View>

        {/* Top platform */}
        {stats!.top_platform && (
          <View style={styles.card} testID="top-platform">
            <Text style={styles.cardKicker}>Plataforma favorita</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
              {(() => {
                const pf = platforms.find((p) => p.slug === stats!.top_platform);
                return pf ? (
                  <>
                    <View style={[styles.pfCircle, { backgroundColor: `${pf.color}22`, borderColor: `${pf.color}55` }]}>
                      <MaterialCommunityIcons name={pf.icon as any} size={22} color={pf.color} />
                    </View>
                    <View>
                      <Text style={styles.pfName}>{pf.name}</Text>
                      <Text style={styles.pfCount}>{stats!.by_platform[pf.slug]} juegos en tu colección</Text>
                    </View>
                  </>
                ) : null;
              })()}
            </View>
          </View>
        )}

        {/* Monthly chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Añadidos por mes</Text>
          <MonthlyChart data={stats!.monthly} locked={!isPremium} />
        </View>

        {/* By platform */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Por plataforma</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {Object.entries(stats!.by_platform)
              .sort((a, b) => b[1] - a[1])
              .map(([slug, count]) => {
                const pf = platforms.find((p) => p.slug === slug);
                const max = Math.max(...Object.values(stats!.by_platform));
                const pct = (count / max) * 100;
                return (
                  <View key={slug} style={styles.barRow}>
                    <View style={{ width: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {pf && <MaterialCommunityIcons name={pf.icon as any} size={14} color={pf.color} />}
                      <Text style={styles.barLabel} numberOfLines={1}>{pf?.name ?? slug}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${pct}%`, backgroundColor: pf?.color ?? theme.colors.brandPrimary },
                        ]}
                      />
                    </View>
                    <Text style={styles.barCount}>{count}</Text>
                  </View>
                );
              })}
          </View>
        </View>

        {/* By box condition */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado de las cajas</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {(['excelente', 'bien', 'normal', 'mal', 'horrible', 'sin'] as ConditionKey[]).map((k) => {
              const count = stats!.by_box_condition?.[k] ?? 0;
              const total = stats!.total_games || 1;
              const pct = (count / total) * 100;
              const meta = CONDITION_META[k];
              return (
                <View key={k} style={styles.barRow}>
                  <View style={{ width: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name={meta.icon as any} size={14} color={meta.color} />
                    <Text style={styles.barLabel}>{meta.label}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.color }]}
                    />
                  </View>
                  <Text style={styles.barCount}>{count}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {!isPremium && (
          <Pressable testID="stats-cta" onPress={() => router.replace('/premium')} style={styles.premiumCta}>
            <LinearGradient
              colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons name="crown" size={18} color="#fff" />
            <Text style={styles.premiumCtaText}>Hazte Premium para ver todo</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function KpiCard({ icon, label, value, gradient, testID }: any) {
  return (
    <View style={styles.kpi} testID={testID}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <MaterialCommunityIcons name={icon} size={18} color="rgba(255,255,255,0.85)" />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function MonthlyChart({ data, locked }: { data: { month: string; count: number }[]; locked?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.chartRow}>
        {data.map((d, i) => {
          const h = 8 + (d.count / max) * 92; // 8-100px
          return (
            <View key={d.month} style={styles.barCol}>
              <View style={{ height: h, width: 18, backgroundColor: theme.colors.brandPrimary, borderRadius: 4, opacity: locked && i < data.length - 2 ? 0.35 : 1 }}>
                <LinearGradient
                  colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <Text style={styles.barMonth}>{monthLabel(d.month)}</Text>
              <Text style={styles.barValue}>{d.count}</Text>
            </View>
          );
        })}
      </View>
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

  lockedBanner: {
    marginHorizontal: 16, marginTop: 4, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.28)',
  },
  lockedBannerText: { color: theme.colors.gold, fontSize: 12, flex: 1, fontWeight: '600' },

  kpi: {
    flex: 1, height: 100, borderRadius: 18,
    padding: 12, gap: 4,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-between',
  },
  kpiLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  kpiValue: { color: '#fff', fontSize: 22, fontWeight: '800' },

  card: {
    padding: 14, borderRadius: 18,
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cardKicker: { color: theme.colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { color: theme.colors.onSurface, fontWeight: '700', fontSize: 14 },
  pfCircle: {
    width: 44, height: 44, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  pfName: { color: theme.colors.onSurface, fontWeight: '800', fontSize: 16 },
  pfCount: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, paddingHorizontal: 4 },
  barCol: { alignItems: 'center', gap: 4, width: 40 },
  barMonth: { color: theme.colors.onSurfaceTertiary, fontSize: 10, marginTop: 4 },
  barValue: { color: theme.colors.muted, fontSize: 10 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: theme.colors.onSurface, fontSize: 12, fontWeight: '600' },
  barTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  barFill: { height: '100%', borderRadius: 999 },
  barCount: { color: theme.colors.onSurfaceTertiary, fontSize: 12, width: 24, textAlign: 'right' },

  premiumCta: {
    marginTop: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 14, overflow: 'hidden',
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  premiumCtaText: { color: '#fff', fontWeight: '800' },
});

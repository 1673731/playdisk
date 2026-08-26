import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { theme, type Game, type Platform, type UserSettings } from '@/src/theme';
import { api } from '@/src/api';

const AI_AVATAR = 'https://images.pexels.com/photos/36847299/pexels-photo-36847299.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pfs, gs, st, s] = await Promise.all([
        api.listPlatforms(),
        api.listGames(selectedPlatform ?? undefined, 12),
        api.stats(selectedPlatform ?? undefined),
        api.getSettings(),
      ]);
      setPlatforms(pfs);
      setGames(gs);
      setTotal(st.total);
      setSettings(s);
    } catch (e) {
      console.warn('Home load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPlatform]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentPlatform = platforms.find((p) => p.slug === selectedPlatform);
  const isPremium = !!settings?.premium_active;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.brandPrimary} />
        }
      >
        {/* Header gradient bg */}
        <View style={styles.headerBgWrap} pointerEvents="none">
          <LinearGradient
            colors={['#1E3A8A', '#050614']}
            start={{ x: 0.8, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Top badges row */}
        <View style={styles.topRow}>
          <Pressable
            testID="premium-badge"
            onPress={() => router.push('/premium')}
            style={[styles.premiumBadge, isPremium && styles.premiumBadgeOn]}
          >
            <MaterialCommunityIcons
              name={isPremium ? 'crown' : 'star-four-points'}
              size={13}
              color={isPremium ? theme.colors.gold : theme.colors.brandPrimary}
            />
            <Text style={[styles.premiumBadgeText, isPremium && { color: theme.colors.gold }]}>
              {isPremium ? 'Premium' : 'Free'}
            </Text>
          </Pressable>

          <Pressable
            testID="coins-badge"
            onPress={() => router.push('/premium')}
            style={styles.coinsBadge}
          >
            <View style={styles.coinCircle}>
              <Text style={styles.coinLetter}>G</Text>
            </View>
            <Text style={styles.coinsValue} testID="coins-value">{(settings?.coins ?? 0).toLocaleString('es-ES')}</Text>
          </Pressable>
        </View>

        {/* Header controls */}
        <View style={styles.headerRow}>
          <Pressable
            testID="open-settings"
            onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/settings'); }}
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="cog-outline" size={20} color={theme.colors.onSurface} />
          </Pressable>
          <Pressable
            testID="open-assistant"
            onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/assistant'); }}
            style={styles.assistantBtn}
          >
            <Image source={{ uri: AI_AVATAR }} style={styles.assistantAvatar} contentFit="cover" />
            <View style={styles.assistantDot} />
          </Pressable>
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Mi Colección</Text>
          <Text style={styles.subtitle}>Tus juegos, físicos, en un solo lugar</Text>
        </View>

        {/* Total card */}
        <View style={styles.totalCard} testID="total-games-card">
          <View style={styles.totalIconBox}>
            <MaterialCommunityIcons name="controller-classic" size={24} color={theme.colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.totalLabel}>Total {currentPlatform ? `· ${currentPlatform.name}` : 'de juegos'}</Text>
            <Text style={styles.totalValue} testID="total-games-count">{total}</Text>
            <Text style={styles.totalHint}>
              {currentPlatform ? `en ${currentPlatform.name}` : 'en toda mi colección'}
            </Text>
          </View>
        </View>

        {/* Platform chips */}
        <View style={styles.chipsWrap} testID="platform-chips-row">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
            <PlatformChip slug={null} icon="apps" name="Todo" color={theme.colors.brandPrimary}
              selected={selectedPlatform === null}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedPlatform(null); }} />
            {platforms.map((p) => (
              <PlatformChip key={p.slug} slug={p.slug} icon={p.icon} name={p.name} color={p.color}
                selected={selectedPlatform === p.slug}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedPlatform(p.slug); }} />
            ))}
          </ScrollView>
        </View>

        {/* Últimos añadidos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Últimos añadidos {currentPlatform ? <Text style={styles.sectionPill}>({currentPlatform.name})</Text> : null}
          </Text>
          <Pressable testID="see-all-recent" onPress={() => router.push('/(tabs)/library')} style={styles.seeAllBtn}>
            <Text style={styles.seeAllText}>Ver todo</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={theme.colors.brandPrimary} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.brandPrimary} />
        ) : games.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="bookshelf" size={36} color={theme.colors.muted} />
            <Text style={styles.emptyText}>Sin juegos en esta plataforma.</Text>
          </View>
        ) : (
          <View style={{ gap: 8, paddingHorizontal: 16 }}>
            {games.slice(0, 8).map((g) => {
              const pf = platforms.find((p) => p.slug === g.platform);
              return (
                <Pressable
                  key={g.id}
                  testID={`recent-game-${g.id}`}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${g.id}` as any); }}
                >
                  <RecentGameCard game={g} platform={pf} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        testID="add-game-fab"
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.push('/add-game'); }}
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
      >
        <LinearGradient colors={[theme.colors.brandPrimary, theme.colors.brandSecondary]} style={StyleSheet.absoluteFill} />
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

function PlatformChip({ slug, icon, name, color, selected, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={styles.chipItem} testID={`platform-chip-${slug ?? 'all'}`}>
      <View style={[styles.chipLogo, selected && { borderColor: color, backgroundColor: `${color}25` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={selected ? color : theme.colors.onSurfaceTertiary} />
      </View>
      <Text style={[styles.chipLabel, selected && { color: theme.colors.onSurface, fontWeight: '700' }]}>{name}</Text>
      {selected && <View style={[styles.chipUnderline, { backgroundColor: color }]} />}
    </Pressable>
  );
}

function RecentGameCard({ game, platform }: { game: Game; platform?: Platform }) {
  const added = formatDistanceToNow(new Date(game.added_at), { locale: es, addSuffix: true });
  return (
    <View style={styles.gameCard}>
      <View style={styles.coverWrap}>
        {game.cover_url ? (
          <Image source={{ uri: game.cover_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialCommunityIcons name="gamepad-variant" size={20} color={theme.colors.muted} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.gameTitle} numberOfLines={1}>{game.title}</Text>
        <View style={styles.gameMetaRow}>
          {platform && <MaterialCommunityIcons name={platform.icon as any} size={12} color={platform.color} />}
          <Text style={styles.gameMetaText}>{platform?.name ?? game.platform}</Text>
          {game.is_gift && (
            <>
              <Text style={styles.gameMetaText}>·</Text>
              <MaterialCommunityIcons name="gift-outline" size={12} color={theme.colors.warning} />
              <Text style={[styles.gameMetaText, { color: theme.colors.warning }]}>Regalo</Text>
            </>
          )}
          {typeof game.price === 'number' && game.price > 0 && !game.is_gift && (
            <>
              <Text style={styles.gameMetaText}>·</Text>
              <Text style={[styles.gameMetaText, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>
                {game.price.toFixed(2)}€
              </Text>
            </>
          )}
        </View>
        <Text style={styles.gameDateText}>Añadido {added}</Text>
      </View>
      {platform && (
        <View style={[styles.platformPill, { backgroundColor: `${platform.color}22`, borderColor: `${platform.color}55` }]}>
          <MaterialCommunityIcons name={platform.icon as any} size={11} color={platform.color} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  headerBgWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 300,
    borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 6,
  },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.45)',
  },
  premiumBadgeOn: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderColor: 'rgba(251,191,36,0.45)',
  },
  premiumBadgeText: { color: theme.colors.brandPrimary, fontSize: 12, fontWeight: '700' },
  coinsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 4, paddingRight: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  coinCircle: {
    width: 22, height: 22, borderRadius: 999,
    backgroundColor: theme.colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  coinLetter: { color: '#78350F', fontWeight: '900', fontSize: 12 },
  coinsValue: { color: theme.colors.onSurface, fontWeight: '700', fontSize: 13 },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 4,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  assistantBtn: {
    width: 44, height: 44, borderRadius: 999,
    overflow: 'hidden', borderWidth: 2, borderColor: theme.colors.brandPrimary,
  },
  assistantAvatar: { width: '100%', height: '100%' },
  assistantDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 9, height: 9, borderRadius: 999, backgroundColor: theme.colors.info,
    borderWidth: 2, borderColor: theme.colors.surface,
  },

  titleBlock: { paddingHorizontal: 20, marginTop: 14, marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.onSurface, letterSpacing: -0.5 },
  subtitle: { color: theme.colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },

  totalCard: {
    marginHorizontal: 20, padding: 12, borderRadius: 20,
    backgroundColor: 'rgba(30, 27, 75, 0.55)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  totalIconBox: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  totalLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 12 },
  totalValue: { color: theme.colors.onSurface, fontSize: 30, fontWeight: '800', lineHeight: 36 },
  totalHint: { color: theme.colors.muted, fontSize: 11 },

  chipsWrap: {
    marginTop: 12, paddingVertical: 6, marginHorizontal: 20, borderRadius: 20,
    backgroundColor: 'rgba(13,17,38,0.55)',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipsContent: { paddingHorizontal: 10, gap: 4, alignItems: 'center', height: 74 },
  chipItem: { width: 66, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipLogo: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  chipLabel: { color: theme.colors.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
  chipUnderline: { width: 16, height: 2.5, borderRadius: 999, marginTop: 3 },

  sectionHeader: {
    marginTop: 18, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sectionTitle: { color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' },
  sectionPill: { color: theme.colors.muted, fontSize: 14, fontWeight: '500' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seeAllText: { color: theme.colors.brandPrimary, fontSize: 12, fontWeight: '600' },

  gameCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8,
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
  },
  coverWrap: { width: 44, height: 58, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.surfaceTertiary },
  cover: { width: '100%', height: '100%' },
  gameTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '700' },
  gameMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  gameMetaText: { color: theme.colors.onSurfaceTertiary, fontSize: 11 },
  gameDateText: { color: theme.colors.muted, fontSize: 10 },
  platformPill: {
    width: 26, height: 26, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },

  emptyBox: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: theme.colors.muted },

  fab: {
    position: 'absolute', right: 20,
    width: 54, height: 54, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
});

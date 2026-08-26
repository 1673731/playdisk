import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { theme, type Game, type Platform } from '@/src/theme';
import { api } from '@/src/api';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function Ranking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [gs, pfs] = await Promise.all([api.ranking(), api.listPlatforms()]);
      setGames(gs);
      setPlatforms(pfs);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const top1 = games[0];
  const rest = games.slice(1);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Ranking personal</Text>
        <Text style={styles.subtitle}>Tus juegos ordenados por nota</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 10 }}
          ListHeaderComponent={
            top1 ? (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${top1.id}` as any); }}
                style={styles.heroCard}
                testID={`ranking-1-${top1.id}`}
              >
                <LinearGradient
                  colors={['#FBBF24', '#F59E0B', '#B45309']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroRow}>
                  {top1.cover_url ? (
                    <Image source={{ uri: top1.cover_url }} style={styles.heroCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.heroCover, { alignItems: 'center', justifyContent: 'center' }]}>
                      <MaterialCommunityIcons name="gamepad-variant" size={30} color="#fff" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>#1</Text></View>
                    <Text style={styles.heroTitle}>{top1.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="star" size={16} color="#fff" />
                      <Text style={styles.heroRating}>{top1.rating}/10</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="trophy-variant-outline" size={40} color={theme.colors.muted} />
                <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
                  Puntúa tus juegos para verlos aquí.
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${item.id}` as any); }}
                style={styles.row}
                testID={`ranking-${index + 2}-${item.id}`}
              >
                <Text style={styles.rank}>#{index + 2}</Text>
                {item.cover_url ? (
                  <Image source={{ uri: item.cover_url }} style={styles.rowCover} contentFit="cover" />
                ) : (
                  <View style={[styles.rowCover, { alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialCommunityIcons name="gamepad-variant" size={20} color={theme.colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  {pf && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MaterialCommunityIcons name={pf.icon as any} size={12} color={pf.color} />
                      <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: 12 }}>{pf.name}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.ratingChip}>
                  <MaterialCommunityIcons name="star" size={14} color={theme.colors.warning} />
                  <Text style={styles.ratingChipText}>{item.rating}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { color: theme.colors.onSurface, fontSize: 30, fontWeight: '800' },
  subtitle: { color: theme.colors.onSurfaceTertiary, marginTop: 4 },
  heroCard: {
    borderRadius: 22, overflow: 'hidden', marginBottom: 14, padding: 16,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCover: { width: 80, height: 100, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.2)' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  heroRating: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
  },
  rankBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: 'rgba(13,17,38,0.6)', borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rank: { color: theme.colors.brandPrimary, fontWeight: '800', width: 34, fontSize: 15 },
  rowCover: { width: 46, height: 60, borderRadius: 8, backgroundColor: theme.colors.surfaceTertiary },
  rowTitle: { color: theme.colors.onSurface, fontWeight: '600' },
  ratingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  ratingChipText: { color: theme.colors.warning, fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 40 },
});

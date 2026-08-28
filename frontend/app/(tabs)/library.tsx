import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme, type Game, type Platform } from '@/src/theme';
import { api } from '@/src/api';

export default function Library() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const requestIdRef = React.useRef(0);

  const loadPlatforms = useCallback(async () => {
    try {
      const pfs = await api.listPlatforms();
      setPlatforms(pfs);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const loadGames = useCallback(async (platformSlug: string | null) => {
    const myRequestId = ++requestIdRef.current;
    try {
      const gs = await api.listGames(platformSlug ?? undefined, 300);
      if (myRequestId !== requestIdRef.current) return; // respuesta obsoleta, ignorar
      setGames(gs);
    } catch (e) {
      if (myRequestId !== requestIdRef.current) return;
      console.warn(e);
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);
  useEffect(() => { setLoading(true); loadGames(selectedPlatform); }, [selectedPlatform, loadGames]);
  useFocusEffect(useCallback(() => { loadPlatforms(); loadGames(selectedPlatform); }, [loadPlatforms, loadGames, selectedPlatform]));

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Biblioteca</Text>
        <Text style={styles.count} testID="library-count">{games.length} juegos</Text>
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        >
          <Chip label="Todo" active={selectedPlatform === null} onPress={() => setSelectedPlatform(null)} />
          {platforms.map((p) => (
            <Chip
              key={p.slug}
              label={p.name}
              icon={p.icon}
              color={p.color}
              active={selectedPlatform === p.slug}
              onPress={() => setSelectedPlatform(p.slug)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 14, paddingTop: 12, paddingBottom: 140 }}
          renderItem={({ item }) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <Pressable
                testID={`library-game-${item.id}`}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${item.id}` as any); }}
                style={styles.gridItem}
              >
                <View style={styles.gridCover}>
                  {item.cover_url ? (
                    <Image source={{ uri: item.cover_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <MaterialCommunityIcons name="gamepad-variant" size={30} color={theme.colors.muted} />
                  )}
                </View>
                <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                {(item.console_icon || pf) && (
                  <View style={styles.gridPlatform}>
                    <MaterialCommunityIcons
                      name={(item.console_icon as any) || (pf?.icon as any)}
                      size={13}
                      color={item.console_color || pf?.color}
                    />
                    <Text style={[styles.gridPlatformText, { color: item.console_color || pf?.color }]}>
                      {item.console_badge || pf?.name}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="bookshelf" size={40} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Aún no tienes juegos en esta plataforma.</Text>
              <Pressable style={styles.addBtn} onPress={() => router.push('/add-game')}>
                <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Añadir juego</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

function Chip({ label, icon, color, active, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { borderColor: color || theme.colors.brandPrimary, backgroundColor: `${color || theme.colors.brandPrimary}22` }]}
      testID={`lib-chip-${label}`}
    >
      {icon && <MaterialCommunityIcons name={icon} size={14} color={active ? color : theme.colors.onSurfaceTertiary} />}
      <Text style={[styles.chipText, active && { color: theme.colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: theme.colors.onSurface, fontSize: 30, fontWeight: '800' },
  count: { color: theme.colors.onSurfaceTertiary, marginTop: 4 },
  chipsRow: { height: 56, justifyContent: 'center' },
  chip: {
    flexShrink: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 36, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: 'rgba(13,17,38,0.5)',
  },
  chipText: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: '600' },
  gridItem: { flex: 1, gap: 6 },
  gridCover: {
    aspectRatio: 3 / 4,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: theme.colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  gridTitle: { color: theme.colors.onSurface, fontSize: 13, fontWeight: '600' },
  gridPlatform: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridPlatformText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8, paddingHorizontal: 24 },
  addBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
});

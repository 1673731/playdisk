import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme, type Game, type Platform } from '@/src/theme';
import { api } from '@/src/api';
import { searchBus } from '@/src/CustomTabBar';

export default function Search() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(searchBus.query);
  const [results, setResults] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    api.listPlatforms().then(setPlatforms).catch(() => {});
    const unsub = searchBus.subscribe((newQ) => setQ(newQ));
    return unsub;
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      api.search(q).then((r) => { setResults(r); setLoading(false); }).catch(() => setLoading(false));
    }, 250);
  }, [q]);

  const renderItem = useCallback(({ item }: { item: Game }) => {
    const pf = platforms.find((p) => p.slug === item.platform);
    return (
      <View style={styles.row} testID={`search-result-${item.id}`}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialCommunityIcons name="gamepad-variant" size={22} color={theme.colors.muted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {pf && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <MaterialCommunityIcons name={pf.icon as any} size={13} color={pf.color} />
              <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: 12 }}>{pf.name}</Text>
            </View>
          )}
        </View>
        {item.in_wishlist && (
          <View style={styles.tag}>
            <MaterialCommunityIcons name="heart" size={12} color={theme.colors.error} />
            <Text style={styles.tagText}>Wishlist</Text>
          </View>
        )}
      </View>
    );
  }, [platforms]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 12 }}>
      <View style={styles.header}>
        <Text style={styles.hTitle}>Buscador</Text>
        <Text style={styles.hSubtitle}>
          {q ? `Buscando "${q}"` : 'Agita el móvil o escribe abajo para buscar'}
        </Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.brandPrimary} />}

      <FlatList
        data={results}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty} testID="search-empty">
              <MaterialCommunityIcons
                name={q ? 'magnify' : 'gesture-tap'}
                size={44}
                color={theme.colors.muted}
              />
              <Text style={{ color: theme.colors.muted, marginTop: 8, textAlign: 'center' }}>
                {q ? `Sin resultados para "${q}"` : 'Empieza a escribir en la barra inferior'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, marginBottom: 6 },
  hTitle: { color: theme.colors.onSurface, fontSize: 26, fontWeight: '800' },
  hSubtitle: { color: theme.colors.onSurfaceTertiary, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: 'rgba(13,17,38,0.6)', borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cover: { width: 50, height: 66, borderRadius: 10, backgroundColor: theme.colors.surfaceTertiary },
  title: { color: theme.colors.onSurface, fontWeight: '600' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  tagText: { color: theme.colors.error, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40 },
});

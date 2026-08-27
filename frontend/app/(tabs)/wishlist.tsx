import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme, type Game, type Platform } from '@/src/theme';
import { api } from '@/src/api';

export default function Wishlist() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [gs, pfs] = await Promise.all([api.wishlist(), api.listPlatforms()]);
      setGames(gs);
      setPlatforms(pfs);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const moveToCollection = (g: Game) => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      `¿Ya tienes "${g.title}"?`,
      'Se moverá de tu wishlist a tu colección. Podrás editar el estado de la caja, el disco y el precio después, desde la ficha del juego.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, moverlo',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            await api.updateGame(g.id, { in_wishlist: false });
            load();
          },
        },
      ],
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Wishlist</Text>
        <Text style={styles.subtitle}>Los juegos que quieres tener</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="heart-outline" size={40} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
                Añade juegos a tu wishlist para verlos aquí.
              </Text>
              <Pressable style={styles.addBtn} onPress={() => router.push('/add-game')}>
                <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Añadir a wishlist</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <Pressable
                style={styles.row}
                testID={`wishlist-item-${item.id}`}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${item.id}` as any); }}
              >
                {item.cover_url ? (
                  <Image source={{ uri: item.cover_url }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, { alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialCommunityIcons name="gamepad-variant" size={22} color={theme.colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  {pf && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialCommunityIcons name={pf.icon as any} size={13} color={pf.color} />
                      <Text style={{ color: theme.colors.onSurfaceTertiary, fontSize: 12 }}>{pf.name}</Text>
                    </View>
                  )}
                </View>
                <Pressable
                  testID={`wishlist-move-${item.id}`}
                  style={styles.moveBtn}
                  onPress={() => moveToCollection(item)}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                  <Text style={styles.moveBtnText}>Tengo</Text>
                </Pressable>
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
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: 'rgba(13,17,38,0.6)', borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cover: { width: 54, height: 70, borderRadius: 10, backgroundColor: theme.colors.surfaceTertiary },
  rowTitle: { color: theme.colors.onSurface, fontWeight: '600' },
  moveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  moveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  addBtn: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.brandPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
});

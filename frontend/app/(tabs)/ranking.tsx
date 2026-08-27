import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';

import { theme, type Game, type Platform } from '@/src/theme';
import { api } from '@/src/api';

const ROW_HEIGHT = 70;
const ROW_GAP = 10;
const SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP;

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

  // Reordenar localmente (optimista) y persistir en el backend en segundo
  // plano. Si falla, no revertimos: es un ranking personal, no crítico, y el
  // siguiente "load()" al volver a esta pantalla corregirá cualquier
  // discrepancia si algo fue mal.
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setGames((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      api.reorderRanking(next.map((g) => g.id)).catch((e) => console.warn('No se pudo guardar el orden', e));
      return next;
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Ranking personal</Text>
        <Text style={styles.subtitle}>Arrastra el asa para reordenar tus juegos a tu gusto</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.brandPrimary} />
      ) : games.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="trophy-variant-outline" size={40} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
            Puntúa tus juegos para verlos aquí.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          {games.map((item, index) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <RankRow
                key={item.id}
                item={item}
                index={index}
                total={games.length}
                pf={pf}
                onReorder={handleReorder}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/game/${item.id}` as any); }}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RankRow({
  item, index, total, pf, onReorder, onPress,
}: {
  item: Game;
  index: number;
  total: number;
  pf: Platform | undefined;
  onReorder: (from: number, to: number) => void;
  onPress: () => void;
}) {
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const startIndexRef = React.useRef(index);

  // El índice puede cambiar entre renders (al reordenar); lo mantenemos
  // accesible dentro del gesto sin recrear el gesture en cada render.
  const indexRef = React.useRef(index);
  indexRef.current = index;
  const totalRef = React.useRef(total);
  totalRef.current = total;

  const commitMove = (toIndex: number) => {
    const from = startIndexRef.current;
    const clamped = Math.max(0, Math.min(totalRef.current - 1, toIndex));
    if (clamped !== from) onReorder(from, clamped);
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startIndexRef.current = indexRef.current;
      dragging.value = true;
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const move = Math.round(e.translationY / SLOT_HEIGHT);
      translateY.value = withSpring(0, { damping: 18 });
      dragging.value = false;
      runOnJS(commitMove)(startIndexRef.current + move);
    })
    .onFinalize(() => {
      dragging.value = false;
      translateY.value = withSpring(0, { damping: 18 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: withSpring(dragging.value ? 1.02 : 1) }],
    zIndex: dragging.value ? 100 : 0,
    shadowOpacity: dragging.value ? 0.35 : 0,
    elevation: dragging.value ? 8 : 0,
  }));

  const isFirst = index === 0;

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      style={[
        styles.row,
        animatedStyle,
        isFirst && styles.rowFirst,
      ]}
    >
      <Text style={[styles.rank, isFirst && styles.rankFirst]}>#{index + 1}</Text>

      <Pressable onPress={onPress} style={styles.rowMain} testID={`ranking-${index + 1}-${item.id}`}>
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

      <GestureDetector gesture={pan}>
        <Animated.View style={styles.handle} testID={`ranking-handle-${item.id}`}>
          <MaterialCommunityIcons name="drag-vertical" size={22} color={theme.colors.onSurfaceTertiary} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { color: theme.colors.onSurface, fontSize: 30, fontWeight: '800' },
  subtitle: { color: theme.colors.onSurfaceTertiary, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: ROW_HEIGHT, marginBottom: ROW_GAP, paddingHorizontal: 10,
    backgroundColor: 'rgba(13,17,38,0.6)', borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  rowFirst: {
    borderColor: 'rgba(251,191,36,0.5)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: theme.colors.brandPrimary, fontWeight: '800', width: 30, fontSize: 15 },
  rankFirst: { color: theme.colors.gold },
  rowCover: { width: 46, height: 60, borderRadius: 8, backgroundColor: theme.colors.surfaceTertiary },
  rowTitle: { color: theme.colors.onSurface, fontWeight: '600' },
  ratingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  ratingChipText: { color: theme.colors.warning, fontWeight: '700', fontSize: 13 },
  handle: {
    width: 40, height: '100%', alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
});

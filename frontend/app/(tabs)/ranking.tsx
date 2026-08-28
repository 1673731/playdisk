import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

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
  const [draggingId, setDraggingId] = useState<string | null>(null);

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

  // 'liveOrder' es la ÚNICA fuente de verdad de "dónde está visualmente
  // cada juego ahora mismo", compartida por referencia con todas las filas.
  // Tanto durante el arrastre (donde se reordena en vivo con cada casilla
  // cruzada) como justo después de soltar (antes de que React haya vuelto a
  // renderizar con el array ya reordenado), TODAS las filas consultan esta
  // misma lista para saber su posición. Como nunca hay dos fuentes de
  // verdad distintas mezclándose (que era lo que causaba el solapamiento
  // anterior), esto es robusto por construcción.
  const liveOrder = useSharedValue<string[]>([]);
  // Qué juego se está arrastrando activamente ahora mismo (para el efecto
  // de escala/sombra). No afecta a la posición de nadie, solo al estilo.
  const draggingItemId = useSharedValue<string | null>(null);

  // Cada vez que la lista real cambia (carga inicial, o tras confirmarse un
  // reordenamiento), resincronizamos liveOrder para que coincida. Si ya
  // coincidía (caso normal tras soltar), esto no produce ningún cambio
  // visual: es idempotente.
  useEffect(() => {
    liveOrder.value = games.map((g) => g.id);
  }, [games]);

  const commitReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} scrollEnabled={!draggingId}>
          {games.map((item, index) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <RankRow
                key={item.id}
                item={item}
                index={index}
                total={games.length}
                pf={pf}
                liveOrder={liveOrder}
                draggingItemId={draggingItemId}
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onCommitReorder={commitReorder}
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
  item, index, total, pf, liveOrder, draggingItemId, onDragStart, onDragEnd, onCommitReorder, onPress,
}: {
  item: Game;
  index: number;
  total: number;
  pf: Platform | undefined;
  liveOrder: ReturnType<typeof useSharedValue<string[]>>;
  draggingItemId: ReturnType<typeof useSharedValue<string | null>>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCommitReorder: (from: number, to: number) => void;
  onPress: () => void;
}) {
  const rawTranslateY = useSharedValue(0);
  const startIndex = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      draggingItemId.value = item.id;
      startIndex.value = index; // 'index' es el valor de la última renderización: correcto, porque el gesto se recrea en cada render
      rawTranslateY.value = 0;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      rawTranslateY.value = e.translationY;
      // Reordenamos liveOrder EN VIVO conforme cruzamos cada casilla, para
      // que los vecinos abran hueco de verdad mientras arrastramos.
      const target = Math.max(0, Math.min(total - 1, startIndex.value + Math.round(e.translationY / SLOT_HEIGHT)));
      const order = liveOrder.value;
      const currentPos = order.indexOf(item.id);
      if (currentPos !== -1 && currentPos !== target) {
        const next = order.slice();
        next.splice(currentPos, 1);
        next.splice(target, 0, item.id);
        liveOrder.value = next;
      }
    })
    .onEnd(() => {
      const finalIndex = liveOrder.value.indexOf(item.id);
      const from = startIndex.value;
      rawTranslateY.value = 0;
      draggingItemId.value = null;
      runOnJS(onCommitReorder)(from, finalIndex === -1 ? from : finalIndex);
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      rawTranslateY.value = 0;
      draggingItemId.value = null;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const isMe = draggingItemId.value === item.id;

    if (isMe) {
      return {
        transform: [
          { translateY: rawTranslateY.value },
          { scale: 1.035 },
        ],
        zIndex: 100,
        shadowOpacity: 0.4,
        elevation: 10,
      };
    }

    // No soy la fila arrastrada: me coloco donde diga liveOrder (mi
    // posición "visual en vivo"), relativa a mi posición real actual
    // (index, el prop que me da React). Esta resta es la clave de que todo
    // encaje sin saltos: en cuanto React termine de reordenar de verdad y
    // mi 'index' pase a coincidir con mi posición en liveOrder, este
    // desplazamiento se vuelve 0 sin que nadie tenga que "resetear" nada a
    // mano ni esperar a ningún momento concreto.
    const liveIdx = liveOrder.value.indexOf(item.id);
    const offset = liveIdx === -1 ? 0 : (liveIdx - index) * SLOT_HEIGHT;

    return {
      transform: [
        { translateY: offset },
        { scale: 1 },
      ],
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  const isFirst = index === 0;

  return (
    <Animated.View
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
          {(item.console_icon || pf) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <MaterialCommunityIcons
                name={(item.console_icon as any) || (pf?.icon as any)}
                size={12}
                color={item.console_color || pf?.color}
              />
              <Text style={{ color: item.console_color || theme.colors.onSurfaceTertiary, fontSize: 12 }}>
                {item.console_badge || pf?.name}
              </Text>
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
    shadowColor: '#000', shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
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

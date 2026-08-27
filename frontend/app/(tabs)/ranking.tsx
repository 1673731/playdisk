import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const SPRING_CONFIG = { damping: 22, stiffness: 260, mass: 0.9 };
const SIBLING_TRANSITION = LinearTransition.springify().damping(24).stiffness(220);

export default function Ranking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrollLocked, setScrollLocked] = useState(false);
  const gamesRef = useRef<Game[]>([]);

  useEffect(() => { gamesRef.current = games; }, [games]);

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

  // Estos 3 shared values son "globales" (una sola instancia, compartida
  // por referencia con todas las filas). Mientras se arrastra, cada fila
  // vecina consulta estos valores para saber si tiene que desplazarse un
  // hueco arriba o abajo — sin que el array de React (el estado 'games')
  // cambie ni una sola vez durante el gesto. Esto es lo que elimina el
  // tirón/glitch: antes, cada casilla cruzada reordenaba el array real y
  // provocaba un re-render masivo de toda la lista en pleno gesto.
  const dragActiveIndex = useSharedValue(-1);
  const dragTargetIndex = useSharedValue(-1);

  // El reordenamiento real de datos (y la llamada al backend) solo ocurre
  // UNA VEZ, al soltar el dedo.
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} scrollEnabled={!scrollLocked}>
          {games.map((item, index) => {
            const pf = platforms.find((p) => p.slug === item.platform);
            return (
              <RankRow
                key={item.id}
                item={item}
                index={index}
                total={games.length}
                pf={pf}
                dragActiveIndex={dragActiveIndex}
                dragTargetIndex={dragTargetIndex}
                onDragStart={() => setScrollLocked(true)}
                onDragEnd={() => setScrollLocked(false)}
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
  item, index, total, pf, dragActiveIndex, dragTargetIndex, onDragStart, onDragEnd, onCommitReorder, onPress,
}: {
  item: Game;
  index: number;
  total: number;
  pf: Platform | undefined;
  dragActiveIndex: ReturnType<typeof useSharedValue<number>>;
  dragTargetIndex: ReturnType<typeof useSharedValue<number>>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCommitReorder: (from: number, to: number) => void;
  onPress: () => void;
}) {
  // Posición del dedo mientras arrastramos ESTA fila (solo se usa cuando
  // esta fila es la que se está arrastrando activamente).
  const rawTranslateY = useSharedValue(0);

  const finishDrag = (from: number, to: number) => {
    onCommitReorder(from, to);
    onDragEnd();
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      dragActiveIndex.value = index; // 'index' es el valor de la última renderización: correcto, porque el gesto se recrea en cada render
      dragTargetIndex.value = index;
      rawTranslateY.value = 0;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      rawTranslateY.value = e.translationY;
      const from = dragActiveIndex.value;
      const rawTarget = from + Math.round(e.translationY / SLOT_HEIGHT);
      dragTargetIndex.value = Math.max(0, Math.min(total - 1, rawTarget));
    })
    .onEnd(() => {
      const from = dragActiveIndex.value;
      const to = dragTargetIndex.value;
      // Encajamos la fila arrastrada exactamente en el hueco de destino
      // antes de soltar los datos, para que al confirmarse el reordenamiento
      // real no haya ningún salto visual (la posición ya coincide).
      rawTranslateY.value = withSpring((to - from) * SLOT_HEIGHT, SPRING_CONFIG);
      runOnJS(finishDrag)(from, to);
    })
    .onFinalize(() => {
      dragActiveIndex.value = -1;
      dragTargetIndex.value = -1;
      rawTranslateY.value = 0;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const isDraggedRow = dragActiveIndex.value === index;

    if (isDraggedRow) {
      return {
        transform: [
          { translateY: rawTranslateY.value },
          { scale: withSpring(1.035, SPRING_CONFIG) },
        ],
        zIndex: 100,
        shadowOpacity: withSpring(0.4, SPRING_CONFIG),
        elevation: 10,
      };
    }

    // Filas vecinas: si hay un arrastre en curso, calculamos si esta fila
    // debe abrir hueco desplazándose una posición arriba o abajo — sin
    // tocar el array real, solo visualmente.
    const from = dragActiveIndex.value;
    const to = dragTargetIndex.value;
    let shiftSlots = 0;
    if (from !== -1 && to !== -1) {
      if (from < to && index > from && index <= to) shiftSlots = -1;
      else if (from > to && index >= to && index < from) shiftSlots = 1;
    }

    return {
      transform: [
        { translateY: withSpring(shiftSlots * SLOT_HEIGHT, SPRING_CONFIG) },
        { scale: withSpring(1, SPRING_CONFIG) },
      ],
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  const isFirst = index === 0;

  return (
    <Animated.View
      layout={SIBLING_TRANSITION}
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

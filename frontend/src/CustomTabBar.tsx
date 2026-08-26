import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/theme';

type BottomTabBarProps = any;

// Global bridge so the search screen can read/write the query from the tab bar input
export const searchBus = {
  query: '',
  listeners: new Set<(q: string) => void>(),
  set(q: string) {
    this.query = q;
    this.listeners.forEach((l) => l(q));
  },
  subscribe(fn: (q: string) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  },
};

const TAB_META: Record<string, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  index: { label: 'Inicio', icon: 'home-variant' },
  library: { label: 'Biblioteca', icon: 'bookshelf' },
  ranking: { label: 'Ranking', icon: 'trophy-variant' },
  wishlist: { label: 'Wishlist', icon: 'heart-outline' },
  search: { label: 'Buscar', icon: 'magnify' },
};

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRouteName = state.routes[state.index].name;
  const isSearchActive = activeRouteName === 'search';
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (isSearchActive) {
      // slight delay so the modal/screen mounts first
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    } else {
      setText('');
      searchBus.set('');
      Keyboard.dismiss();
    }
  }, [isSearchActive]);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="bottom-tab-bar">
      <BlurView
        intensity={Platform.OS === 'ios' ? 60 : 40}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.overlay} pointerEvents="none" />

      {isSearchActive ? (
        <View style={styles.searchExpanded} testID="tab-search-expanded">
          <MaterialCommunityIcons name="magnify" size={22} color={theme.colors.brandPrimary} />
          <TextInput
            ref={inputRef}
            testID="tab-search-input"
            value={text}
            onChangeText={(t) => {
              setText(t);
              searchBus.set(t);
            }}
            placeholder="Busca en tu colección..."
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          <Pressable
            testID="tab-search-close"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate('index' as never);
            }}
            hitSlop={10}
            style={styles.closeBtn}
          >
            <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurface} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.tabsRow}>
          {state.routes.map((route, idx) => {
            const meta = TAB_META[route.name];
            if (!meta) return null;
            const focused = state.index === idx;
            const onPress = () => {
              Haptics.selectionAsync().catch(() => {});
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tabItem}
                testID={`tab-${route.name}`}
              >
                <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                  {focused && <View style={styles.glow} pointerEvents="none" />}
                  <MaterialCommunityIcons
                    name={meta.icon}
                    size={22}
                    color={focused ? theme.colors.onBrandPrimary : theme.colors.onSurfaceTertiary}
                  />
                </View>
                <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 17, 38, 0.72)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: 56,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    width: 44,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconWrapActive: {
    backgroundColor: theme.colors.brandPrimary,
    shadowColor: theme.colors.brandPrimary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  glow: {
    position: 'absolute',
    width: 60,
    height: 50,
    borderRadius: 999,
    backgroundColor: theme.colors.brandPrimary,
    opacity: 0.25,
  },
  tabLabel: {
    fontSize: 11,
    color: theme.colors.onSurfaceTertiary,
  },
  tabLabelActive: {
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  searchExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 16,
    paddingVertical: 8,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme } from '@/src/theme';
import { api } from '@/src/api';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

const AI_AVATAR = 'https://images.pexels.com/photos/36847299/pexels-photo-36847299.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

export default function Assistant() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'welcome', role: 'assistant', text: '¡Hola! Soy tu asistente personal de Mi Colección. Puedo recomendarte juegos, hablar de tu colección o sugerirte a qué jugar hoy. ¿En qué te ayudo?' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<string>(`sess-${Date.now()}`);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    Haptics.selectionAsync().catch(() => {});
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setSending(true);
    try {
      const res = await api.chat(sessionRef.current, text);
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', text: res.reply }]);
    } catch (e: any) {
      if (e?.status === 402) {
        setMessages((m) => [...m, { id: `e-${Date.now()}`, role: 'assistant', text: 'Has llegado a tu límite gratuito diario. Hazte Premium o ve un anuncio para desbloquear más.' }]);
        setTimeout(() => router.replace('/premium'), 900);
      } else {
        setMessages((m) => [...m, { id: `e-${Date.now()}`, role: 'assistant', text: 'Ups, no pude responder ahora mismo. Inténtalo en un momento.' }]);
      }
    } finally {
      setSending(false);
    }
  };

  const suggestions = ['¿A qué juego hoy?', 'Recomiéndame algo de mi colección', 'Dame una curiosidad'];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable
          testID="assistant-close"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="close" size={22} color={theme.colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>Asistente</Text>
          <Text style={styles.subtitle}>IA · Claude Sonnet</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <View
              key={m.id}
              testID={`msg-${m.role}-${m.id}`}
              style={[styles.bubbleRow, m.role === 'user' ? styles.userRow : styles.aiRow]}
            >
              {m.role === 'assistant' && (
                <Image source={{ uri: AI_AVATAR }} style={styles.avatar} contentFit="cover" />
              )}
              <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={m.role === 'user' ? styles.userText : styles.aiText}>{m.text}</Text>
              </View>
            </View>
          ))}
          {sending && (
            <View style={[styles.bubbleRow, styles.aiRow]}>
              <Image source={{ uri: AI_AVATAR }} style={styles.avatar} contentFit="cover" />
              <View style={[styles.bubble, styles.aiBubble, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
                <Text style={styles.aiText}>Pensando...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {messages.length <= 1 && (
          <View style={styles.suggestionsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  testID={`suggestion-${s}`}
                  onPress={() => setInput(s)}
                  style={styles.suggestion}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            testID="assistant-input"
            value={input}
            onChangeText={setInput}
            placeholder="Pregúntame algo..."
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            testID="assistant-send"
            onPress={send}
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]}
            disabled={!input.trim() || sending}
          >
            <MaterialCommunityIcons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' },
  subtitle: { color: theme.colors.brandPrimary, fontSize: 11, fontWeight: '600' },

  bubbleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 999 },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  aiBubble: { backgroundColor: 'rgba(13,17,38,0.85)', borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: theme.colors.brandPrimary, borderBottomRightRadius: 4 },
  aiText: { color: theme.colors.onSurface, fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },

  suggestionsRow: { paddingBottom: 8 },
  suggestion: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)',
  },
  suggestionText: { color: theme.colors.onBrandTertiary, fontSize: 12, fontWeight: '600' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  input: {
    flex: 1, color: theme.colors.onSurface, fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, maxHeight: 100, minHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 999,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
});

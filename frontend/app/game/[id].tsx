import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, ActivityIndicator, Alert, StyleSheet, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { api } from '@/src/api';
import { CameraCaptureScreen } from '@/src/CameraCapture';

type ConditionKey = 'mint' | 'good' | 'bad' | 'missing';
const CONDITION_KEYS: ConditionKey[] = ['mint', 'good', 'bad', 'missing'];
const CONDITION_META: Record<ConditionKey, { label: string; icon: string; color: string }> = {
  mint: { label: 'Perfecto', icon: 'star-circle', color: '#10B981' },
  good: { label: 'Bueno', icon: 'check-circle', color: '#3B82F6' },
  bad: { label: 'Mal', icon: 'alert-circle', color: '#F59E0B' },
  missing: { label: 'Falta', icon: 'close-circle', color: '#EF4444' },
};

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rating, setRating] = useState(0);
  const [box, setBox] = useState<ConditionKey | null>(null);
  const [man, setMan] = useState<ConditionKey | null>(null);
  const [disc, setDisc] = useState<ConditionKey | null>(null);
  const [notes, setNotes] = useState('');
  const [showCamera, setShowCamera] = useState(false);

  // 1. Cargamos el juego
  useEffect(() => {
    if (!id) return;
    api.getGame(id)
      .then((data: any) => {
        setGame(data);
        setRating(data.rating || 0);
        setBox(data.box_condition || null);
        setMan(data.manual_condition || null);
        setDisc(data.disc_condition || null);
        setNotes(data.notes || '');
        setLoading(false);
      })
      .catch((e) => {
        console.warn(e);
        setLoading(false);
      });
  }, [id]);

  // 2b. Guardar una foto personal de portada (nunca se comparte con el
  // catálogo de códigos de barras: es solo para esta entrada tuya).
  const savePersonalPhoto = async (localUri: string) => {
    setShowCamera(false);
    setSaving(true);
    try {
      await api.updateGame(id as string, { cover_url: localUri } as any);
      setGame((g: any) => ({ ...g, cover_url: localUri }));
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'No se pudo guardar la foto.');
    } finally {
      setSaving(false);
    }
  };

  // 2. Guardar cambios en las notas o estado
  const saveChanges = async () => {
    setSaving(true);
    try {
      await api.updateGame(id as string, {
        rating,
        box_condition: box as any,
        manual_condition: man as any,
        disc_condition: disc as any,
        notes,
      } as any);
      Alert.alert("¡Guardado!", "Se han actualizado los datos de este juego.");
    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  // 3. Eliminar el juego
  const deleteGame = () => {
    Alert.alert("Eliminar juego", "¿Seguro que quieres borrar este título de tu colección?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
          setSaving(true);
          try {
            await api.deleteGame(id as string);
            // Te devuelve a la pantalla inicial tras borrar
            router.replace('/');
          } catch (e) {
            console.warn(e);
            Alert.alert("Error", "No se pudo eliminar el juego.");
            setSaving(false);
          }
      }}
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4338CA" />
      </View>
    );
  }

  if (!game || game.detail === 'Game not found') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialCommunityIcons name="controller-off" size={64} color="#555" />
        <Text style={{ color: '#fff', marginTop: 16 }}>Juego no encontrado</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 24, padding: 12, backgroundColor: '#4338CA', borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  if (showCamera) {
    return (
      <CameraCaptureScreen
        onCaptured={savePersonalPhoto}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  // 4. Parche de la fecha para evitar crasheos
  const added = (game.added_at && !isNaN(new Date(game.added_at).getTime())) 
    ? formatDistanceToNow(new Date(game.added_at), { locale: es, addSuffix: true }) 
    : 'hace poco';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      
      {/* Cabecera con Portada y Título */}
      <View style={styles.header}>
        {game.cover_url ? (
          <Image source={{ uri: game.cover_url }} style={styles.cover} />
        ) : (
          <Pressable
            testID="detail-take-photo"
            onPress={() => setShowCamera(true)}
            style={[styles.cover, { backgroundColor: '#444', justifyContent: 'center', alignItems: 'center', gap: 6 }]}
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={32} color="#999" />
            <Text style={{ color: '#999', fontSize: 10, textAlign: 'center', paddingHorizontal: 4 }}>Añadir foto</Text>
          </Pressable>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{game.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            {game.console_icon && (
              <MaterialCommunityIcons name={game.console_icon as any} size={15} color={game.console_color || '#aaa'} />
            )}
            <Text style={[styles.platform, { marginBottom: 0, color: game.console_color || '#aaa' }]}>
              {game.console_badge || game.platform}{game.version ? ` · ${game.version}` : ''}
            </Text>
          </View>
          {game.is_steelbook && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <MaterialCommunityIcons name="cube-outline" size={14} color="#C0C0C0" />
              <Text style={{ color: '#C0C0C0', fontSize: 12, marginLeft: 4, fontWeight: '600' }}>SteelBook</Text>
            </View>
          )}
          <Text style={styles.addedText}>Añadido {added}</Text>
        </View>
      </View>

      {/* Puntuación */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mi Puntuación</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => setRating(star)}>
              <MaterialCommunityIcons 
                name={rating >= star ? 'star' : 'star-outline'} 
                size={32} 
                color={rating >= star ? '#F59E0B' : '#555'} 
              />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Evaluación de segunda mano */}
      <ConditionRow label="Estado de la Caja" value={box} onChange={setBox} />
      <ConditionRow label="Estado del Manual" value={man} onChange={setMan} />
      <ConditionRow label="Estado del Disco/Cartucho" value={disc} onChange={setDisc} />

      {/* Notas */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notas Personales</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Ej: Tiene un arañazo en la contraportada..."
          placeholderTextColor="#666"
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {/* Botones de Acción */}
      <Pressable style={styles.saveBtn} onPress={saveChanges} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar Cambios</Text>}
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={deleteGame} disabled={saving}>
        <MaterialCommunityIcons name="delete" size={20} color="#fff" />
        <Text style={styles.deleteBtnText}>Eliminar Juego</Text>
      </Pressable>

    </ScrollView>
  );
}

// 5. Los botones de condición ahora se iluminan correctamente
function ConditionRow({ label, value, onChange }: { label: string; value: ConditionKey | null; onChange: (v: ConditionKey) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
        {CONDITION_KEYS.map((k) => {
          const meta = CONDITION_META[k];
          const active = value === k;
          return (
            <Pressable
              key={k}
              onPress={() => onChange(k)}
              style={[
                styles.condChip, 
                { borderColor: meta.color },
                // Aquí aplicamos el color de fondo si está seleccionado
                active && { backgroundColor: meta.color }
              ]}
            >
              <MaterialCommunityIcons 
                name={meta.icon as any} 
                size={16} 
                color={active ? '#fff' : meta.color} 
              />
              <Text style={[styles.condChipText, active && { color: '#fff', fontWeight: '800' }]}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Estilos del componente
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { flexDirection: 'row', marginBottom: 24, backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12 },
  cover: { width: 80, height: 110, borderRadius: 8, marginRight: 16 },
  headerInfo: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  platform: { fontSize: 16, color: '#aaa', marginBottom: 8, textTransform: 'capitalize' },
  addedText: { fontSize: 12, color: '#666' },
  card: { backgroundColor: '#1E1E1E', padding: 16, borderRadius: 12, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  condChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  condChipText: { marginLeft: 6, fontSize: 14, color: '#ccc' },
  input: { backgroundColor: '#2C2C2C', color: '#fff', padding: 12, borderRadius: 8, minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#4338CA', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  deleteBtn: { backgroundColor: '#EF4444', flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
});
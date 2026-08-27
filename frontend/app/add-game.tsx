import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme, CONDITION_META, type ConditionKey, type Platform as Pf } from '@/src/theme';
import { api, type BarcodeMatch, type OnlineGame } from '@/src/api';
import { CameraCaptureScreen } from '@/src/CameraCapture';
type Step = 'method' | 'scan' | 'confirm' | 'notfound' | 'manual' | 'box' | 'manualCond' | 'disc' | 'price' | 'desc' | 'done' | 'photo';

const CONDITION_KEYS: ConditionKey[] = ['excelente', 'bien', 'normal', 'mal', 'horrible', 'sin'];
    
export default function AddGame() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string; q?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';

  const [step, setStep] = useState<Step>(params.method === 'manual' ? 'manual' : 'method');
  const [platforms, setPlatforms] = useState<Pf[]>([]);

  // Draft
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverIsPersonal, setCoverIsPersonal] = useState(false);
  const [photoReturnStep, setPhotoReturnStep] = useState<Step>('manual');
  const [version, setVersion] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);

  const [box, setBox] = useState<ConditionKey | null>(null);
  const [man, setMan] = useState<ConditionKey | null>(null);
  const [disc, setDisc] = useState<ConditionKey | null>(null);
  const [isSteelbook, setIsSteelbook] = useState(false);
  const [price, setPrice] = useState('');
  const [isGift, setIsGift] = useState(false);
  const [wantDescription, setWantDescription] = useState<boolean | null>(null);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listPlatforms().then((pfs) => {
      setPlatforms(pfs);
      if (pfs.length && !platform) setPlatform(pfs[0].slug);
    }).catch(() => {});
  }, []);

  const advanceCondition = (which: 'box' | 'man' | 'disc', v: ConditionKey) => {
    Haptics.selectionAsync().catch(() => {});
    if (which === 'box') { setBox(v); setTimeout(() => setStep('manualCond'), 260); }
    if (which === 'man') { setMan(v); setTimeout(() => setStep('disc'), 260); }
    if (which === 'disc') { setDisc(v); setTimeout(() => setStep('price'), 260); }
  };

  const commitSave = async (finalDescription?: string) => {
    if (!title.trim() || !platform) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    try {
      const priceNum = price.trim() ? parseFloat(price.replace(',', '.')) : null;

      // Si llegamos hasta aquí con un barcode puesto, es porque el usuario
      // nunca lo rechazó (si hubiera pulsado "No" en el paso de confirmación,
      // barcode ya se habría puesto a null). Así que el título/plataforma que
      // se está guardando ahora sí corresponden de verdad a ese código: lo
      // dejamos grabado de forma fiable en el catálogo local. Es un "best
      // effort": si falla, no bloqueamos el guardado del juego en sí.
      //
      // IMPORTANTE (privacidad): si la portada es una foto que el usuario se
      // hizo con su cámara (coverIsPersonal), NUNCA se manda al catálogo
      // compartido de códigos de barras. Ese catálogo lo usan también otras
      // personas que escaneen el mismo código, y una foto casera no debe
      // acabar mostrándose a terceros. Solo se comparten portadas que vienen
      // de una fuente oficial (IGDB / búsqueda online).
      if (barcode) {
        api.confirmBarcode({
          barcode,
          title: title.trim(),
          platform: platform as string,
          cover_url: coverIsPersonal ? undefined : (coverUrl || undefined),
          version: version || undefined,
        }).catch((e) => console.warn('No se pudo confirmar el barcode:', e));
      }

      await api.createGame({
        title: title.trim(),
        platform,
        cover_url: coverUrl || undefined,
        box_condition: box || undefined,
        manual_condition: man || undefined,
        disc_condition: disc || undefined,
        price: isGift ? 0 : (isNaN(priceNum as number) ? null : priceNum) as any,
        is_gift: isGift,
        description: finalDescription ?? '',
        barcode: barcode || undefined,
        is_steelbook: isSteelbook,
        version: version || undefined,
        in_wishlist: false,
      } as any);
      
      setStep('done');
      setTimeout(() => router.back(), 1400);
      
    } catch (e: any) {
      setSaving(false);
      
      // Capturamos el error de duplicado (HTTP 409)
      if (e?.status === 409) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        alert(`¡Ya tienes ${title} en tu colección!`);
        router.back(); 
      } else {
        console.warn(e);
        alert("Ocurrió un error al guardar el juego.");
      }
    }
  };

  const renderTop = () => (
    <View style={styles.header}>
      <Pressable
        testID="add-back"
        onPress={() => {
          if (step === 'method' || step === 'done') router.back();
          else if (step === 'scan' || step === 'manual') setStep('method');
          else if (step === 'notfound') setStep('scan');
          else if (step === 'confirm') setStep(barcode ? 'scan' : 'notfound');
          else if (step === 'box') { title ? setStep('confirm') : setStep('manual'); }
          else if (step === 'manualCond') setStep('box');
          else if (step === 'disc') setStep('manualCond');
          else if (step === 'price') setStep('disc');
          else if (step === 'desc') setStep('price');
          else if (step === 'photo') setStep(photoReturnStep);
        }}
        style={styles.iconBtn}
      >
        <MaterialCommunityIcons name="chevron-left" size={22} color={theme.colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>
        {step === 'method' && 'Añadir juego'}
        {step === 'scan' && 'Escanear código'}
        {step === 'confirm' && '¿Es este juego?'}
        {step === 'notfound' && 'Código no reconocido'}
        {step === 'manual' && 'Datos del juego'}
        {step === 'box' && 'Estado 1/4'}
        {step === 'manualCond' && 'Estado 2/4'}
        {step === 'disc' && 'Estado 3/4'}
        {step === 'price' && 'Estado 4/4'}
        {step === 'desc' && 'Notas'}
        {step === 'done' && '¡Añadido!'}
      </Text>
      <Pressable testID="add-close" onPress={() => router.back()} style={styles.iconBtn}>
        <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurface} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top + 6 }}>
      {renderTop()}

      {step === 'method' && (
        <MethodStep
          onPick={(m) => { setStep(m); }}
        />
      )}

      {step === 'scan' && (
        <ScanStep
          onCancel={() => setStep('method')}
          onDetected={async (code) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setBarcode(code);
            try {
              const res = await api.lookupBarcode(code);
              if (res.found && res.game) {
                setTitle(res.game.title);
                setPlatform(res.game.platform);
                setCoverUrl(res.game.cover_url || null);
                setVersion(res.game.version || null);
                setStep('confirm');
              } else {
                setStep('notfound');
              }
            } catch (e: any) {
              if (e?.status === 402) {
                router.replace('/premium');
              } else if (e?.status === 409) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                  alert("¡Ya tienes " + (e.body?.detail || "este juego") + " en tu colección!");
                  setStep('method');
              } else {
                setStep('notfound');
              }
            }
          }}
        />
      )}

      {step === 'notfound' && (
        <NotFoundStep
          barcode={barcode || ''}
          platforms={platforms}
          onPick={(g) => {
            setTitle(g.title);
            if (g.platform) setPlatform(g.platform);
            if (g.cover_url) setCoverUrl(g.cover_url);
            setStep('confirm');
          }}
          onManual={() => setStep('manual')}
          onRescan={() => setStep('scan')}
        />
      )}

      {step === 'confirm' && (
        <ConfirmStep
          title={title} platform={platform} platforms={platforms}
          coverUrl={coverUrl} version={version}
          onYes={() => setStep('box')}
          onNo={() => {
            // Importante: si el usuario dice que este NO es el juego correcto,
            // hay que soltar el barcode. Si no, al guardar el título que ponga
            // a mano se asociaría por error a un código que no es el suyo.
            setBarcode(null);
            setStep('manual');
          }}
          onTakePhoto={() => { setPhotoReturnStep('confirm'); setStep('photo'); }}
        />
      )}

      {step === 'manual' && (
        <ManualStep
          title={title} setTitle={setTitle}
          platform={platform} setPlatform={setPlatform}
          coverUrl={coverUrl} setCoverUrl={setCoverUrl}
          setVersion={setVersion}
          coverIsPersonal={coverIsPersonal} setCoverIsPersonal={setCoverIsPersonal}
          onTakePhoto={() => { setPhotoReturnStep('manual'); setStep('photo'); }}
          initialQuery={initialQuery}
          onSave={() => setStep('confirm')}
          onCancel={() => (initialQuery ? router.back() : setStep('method'))}
        />
      )}

      {step === 'box' && (
        <ConditionStep
          question="¿Cómo está la caja?"
          desc="Evalúa el estado físico de la caja del juego."
          testIdPrefix="cond-box"
          coverUrl={coverUrl} platforms={platforms} platform={platform}
          selected={box}
          onSelect={(v) => advanceCondition('box', v)}
          progress={1}
          extra={
            <Pressable
              testID="steelbook-toggle"
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setIsSteelbook((v) => !v); }}
              style={{
                flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
                marginTop: 14, marginBottom: 4, paddingVertical: 8, paddingHorizontal: 14,
                borderRadius: 20, borderWidth: 1,
                borderColor: isSteelbook ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: isSteelbook ? 'rgba(99,102,241,0.12)' : 'transparent',
              }}
            >
              <MaterialCommunityIcons
                name={isSteelbook ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={18}
                color={isSteelbook ? theme.colors.brandPrimary : theme.colors.muted}
              />
              <Text style={{ marginLeft: 8, color: isSteelbook ? theme.colors.brandPrimary : theme.colors.muted, fontWeight: '600' }}>
                Es edición SteelBook
              </Text>
            </Pressable>
          }
        />
      )}
      {step === 'manualCond' && (
        <ConditionStep
          question="¿Cómo está el manual?"
          desc="Si tiene manual, valora su estado."
          testIdPrefix="cond-man"
          coverUrl={coverUrl} platforms={platforms} platform={platform}
          selected={man}
          onSelect={(v) => advanceCondition('man', v)}
          progress={2}
        />
      )}
      {step === 'disc' && (
        <ConditionStep
          question="¿Cómo está el disco?"
          desc="Rayadas, huellas o desgaste."
          testIdPrefix="cond-disc"
          coverUrl={coverUrl} platforms={platforms} platform={platform}
          selected={disc}
          onSelect={(v) => advanceCondition('disc', v)}
          progress={3}
        />
      )}

      {step === 'price' && (
        <PriceStep
          price={price} setPrice={setPrice}
          isGift={isGift} setIsGift={setIsGift}
          onNext={() => setStep('desc')}
        />
      )}

      {step === 'desc' && (
        <DescriptionStep
          wantDescription={wantDescription} setWantDescription={setWantDescription}
          description={description} setDescription={setDescription}
          saving={saving}
          onSkip={() => commitSave('')}
          onSave={() => commitSave(description)}
        />
      )}

      {step === 'photo' && (
        <CameraCaptureScreen
          onCaptured={(uri) => {
            setCoverUrl(uri);
            setCoverIsPersonal(true);
            setStep(photoReturnStep);
          }}
          onCancel={() => setStep(photoReturnStep)}
        />
      )}

      {step === 'done' && <DoneStep title={title} />}
    </View>
  );
}

/* ---------------- Steps ---------------- */

function MethodStep({ onPick }: { onPick: (m: 'scan' | 'manual') => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={styles.helperTitle}>¿Cómo quieres añadir tu juego?</Text>
      <Text style={styles.helperText}>
        Escanea el código de barras de la caratula para autocompletar, o hazlo manualmente.
      </Text>

      <Pressable
        testID="method-scan"
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onPick('scan'); }}
        style={[styles.methodCard, { borderColor: theme.colors.brandPrimary }]}
      >
        <LinearGradient
          colors={['rgba(99,102,241,0.28)', 'rgba(99,102,241,0.05)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.methodIconWrap}>
          <MaterialCommunityIcons name="barcode-scan" size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.methodTitle}>Escanear código</Text>
            <View style={styles.premiumMini}>
              <MaterialCommunityIcons name="star-four-points" size={10} color={theme.colors.gold} />
              <Text style={styles.premiumMiniText}>Premium+</Text>
            </View>
          </View>
          <Text style={styles.methodDesc}>Enfoca el código EAN/UPC de la caratula.</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceTertiary} />
      </Pressable>

      <Pressable
        testID="method-manual"
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onPick('manual'); }}
        style={styles.methodCard}
      >
        <View style={[styles.methodIconWrap, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <MaterialCommunityIcons name="pencil-outline" size={26} color={theme.colors.onSurface} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.methodTitle}>Añadir manualmente</Text>
          <Text style={styles.methodDesc}>Escribe título, plataforma y portada.</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceTertiary} />
      </Pressable>
    </ScrollView>
  );
}

/* Barcode scanner — uses expo-camera. On web falls back to numeric input. */
function ScanStep({ onCancel, onDetected }: { onCancel: () => void; onDetected: (code: string) => void }) {
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied' | 'unsupported'>('pending');
  const [manualCode, setManualCode] = useState('');
  const [Camera, setCamera] = useState<any>(null);
  const lastCodeRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') { setPermission('unsupported'); return; }
      try {
        const cam = await import('expo-camera');
        setCamera(cam);
        const perm = await cam.Camera.requestCameraPermissionsAsync();
        setPermission(perm.granted ? 'granted' : 'denied');
      } catch (e) {
        console.warn('camera unavailable', e);
        setPermission('unsupported');
      }
    })();
  }, []);

  const handleBarCode = (data: string) => {
    if (!data || lastCodeRef.current === data) return;
    lastCodeRef.current = data;
    onDetected(data);
  };

  if (permission === 'pending') {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.brandPrimary} /></View>;
  }

  if (permission === 'granted' && Camera?.CameraView) {
    const CameraView = Camera.CameraView;
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
          }}
          onBarcodeScanned={({ data }: any) => handleBarCode(data)}
        />
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>Alinea el código dentro del marco</Text>
        </View>
        <Pressable testID="scan-cancel" onPress={onCancel} style={styles.scanCancel}>
          <MaterialCommunityIcons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={styles.centerBlock}>
        <MaterialCommunityIcons
          name={permission === 'denied' ? 'camera-off-outline' : 'barcode'}
          size={44}
          color={theme.colors.muted}
        />
        <Text style={styles.helperTitle}>
          {permission === 'denied' ? 'Sin permiso de cámara' : 'Escáner no disponible aquí'}
        </Text>
        <Text style={styles.helperText}>
          {permission === 'denied'
            ? 'Concede el permiso en ajustes para escanear códigos de barras.'
            : 'Puedes introducir el código manualmente para probar.'}
        </Text>
      </View>

      <Text style={styles.label}>Código de barras</Text>
      <TextInput
        testID="scan-manual-input"
        value={manualCode}
        onChangeText={setManualCode}
        placeholder="Ej: 711719560838"
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
        keyboardType="number-pad"
      />
      <Pressable
        testID="scan-manual-submit"
        onPress={() => manualCode.trim() && onDetected(manualCode.trim())}
        disabled={!manualCode.trim()}
        style={[styles.primaryBtn, !manualCode.trim() && { opacity: 0.4 }]}
      >
        <Text style={styles.primaryBtnText}>Buscar</Text>
      </Pressable>

      <Pressable testID="scan-skip" onPress={onCancel} style={styles.ghostBtn}>
        <Text style={styles.ghostBtnText}>Cancelar</Text>
      </Pressable>
    </ScrollView>
  );
}

function NotFoundStep({
  barcode, platforms, onPick, onManual, onRescan,
}: {
  barcode: string;
  platforms: Pf[];
  onPick: (g: OnlineGame) => void;
  onManual: () => void;
  onRescan: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<OnlineGame[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await api.searchOnline(q.trim());
        setResults(r);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [q]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.notfoundHero} testID="notfound-hero">
          <View style={styles.notfoundIcon}>
            <MaterialCommunityIcons name="barcode-off" size={26} color={theme.colors.warning} />
          </View>
          <Text style={styles.helperTitle}>No reconocemos este código</Text>
          <Text style={styles.helperText}>
            EAN escaneado: <Text style={{ color: theme.colors.brandPrimary, fontWeight: '700' }}>{barcode}</Text>{'\n'}
            Búscalo por nombre o añádelo manualmente.
          </Text>
        </View>

        <TextInput
          testID="notfound-search"
          value={q}
          onChangeText={setQ}
          placeholder="Ej: Nioh 3, God of War..."
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />

        {loading && <ActivityIndicator color={theme.colors.brandPrimary} style={{ marginTop: 8 }} />}

        {!loading && results.length > 0 && (
          <View style={{ gap: 8 }}>
            {results.map((r, idx) => {
              const pf = platforms.find((p) => p.slug === r.platform);
              return (
                <Pressable
                  key={`${r.title}-${idx}`}
                  testID={`notfound-result-${idx}`}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onPick(r); }}
                  style={styles.resultRow}
                >
                  <View style={styles.resultCover}>
                    {r.cover_url ? (
                      <Image source={{ uri: r.cover_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <MaterialCommunityIcons name="gamepad-variant" size={20} color={theme.colors.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{r.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      {pf && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <MaterialCommunityIcons name={pf.icon as any} size={12} color={pf.color} />
                          <Text style={{ color: pf.color, fontSize: 11, fontWeight: '700' }}>{pf.name}</Text>
                        </View>
                      )}
                      {r.description ? (
                        <Text style={{ color: theme.colors.muted, fontSize: 11 }} numberOfLines={1}>
                          {r.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.onSurfaceTertiary} />
                </Pressable>
              );
            })}
          </View>
        )}

        {!loading && q.trim().length >= 2 && results.length === 0 && (
          <Text style={{ color: theme.colors.muted, textAlign: 'center', marginTop: 8 }}>
            Sin resultados para "{q}".
          </Text>
        )}

        <View style={{ gap: 8, marginTop: 12 }}>
          <Pressable testID="notfound-manual" onPress={onManual} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Añadir manualmente</Text>
          </Pressable>
          <Pressable testID="notfound-rescan" onPress={onRescan} style={styles.ghostBtn}>
            <Text style={styles.ghostBtnText}>Volver a escanear</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ConfirmStep({
  title, platform, platforms, coverUrl, version, onYes, onNo, onTakePhoto,
}: any) {
  const pf = platforms.find((p: Pf) => p.slug === platform);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, alignItems: 'center' }}>
      <View style={styles.confirmCover}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <MaterialCommunityIcons name="gamepad-variant" size={40} color={theme.colors.muted} />
        )}
      </View>
      {!coverUrl && onTakePhoto && (
        <Pressable
          testID="confirm-take-photo"
          onPress={onTakePhoto}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <MaterialCommunityIcons name="camera" size={16} color={theme.colors.brandPrimary} />
          <Text style={{ color: theme.colors.brandPrimary, fontWeight: '600', fontSize: 13 }}>
            Sin portada oficial — hazle una foto a tu copia
          </Text>
        </Pressable>
      )}
      <Text style={styles.confirmQ}>¿Es este juego?</Text>
      <Text style={styles.confirmTitle}>{title}</Text>
      {pf && (
        <View style={styles.confirmPfPill}>
          <MaterialCommunityIcons name={pf.icon as any} size={14} color={pf.color} />
          <Text style={[styles.confirmPfText, { color: pf.color }]}>{pf.name}</Text>
        </View>
      )}
      {version && <Text style={styles.confirmVersion}>{version}</Text>}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignSelf: 'stretch' }}>
        <Pressable testID="confirm-no" onPress={onNo} style={[styles.confirmBtn, styles.confirmNo]}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurface} />
          <Text style={styles.confirmBtnText}>No</Text>
        </Pressable>
        <Pressable testID="confirm-yes" onPress={onYes} style={[styles.confirmBtn, styles.confirmYes]}>
          <MaterialCommunityIcons name="check" size={20} color="#fff" />
          <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Sí, es este</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ManualStep({
  title, setTitle, platform, setPlatform, coverUrl, setCoverUrl, setVersion, onSave, onCancel,
  coverIsPersonal, setCoverIsPersonal, onTakePhoto, initialQuery,
}: any) {
  const [query, setQuery] = React.useState(title || initialQuery || '');
  const [results, setResults] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timerRef = React.useRef<any>(null);

  const search = React.useCallback(async (text: string) => {
    if (!text.trim() || text.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchOnline(text.trim());
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn(e);
      setResults([]);
      setError('No se pudo buscar. Revisa tu conexión al servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, search]);

  const pickResult = (r: any) => {
    setTitle(r.title);
    setPlatform(r.platform);
    setCoverUrl(r.cover_url || null);
    setCoverIsPersonal?.(false);
    setVersion(r.platform_name || null);
    onSave();
  };


  return (
    <View style={{ flex: 1, padding: 16, marginTop: 40 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#fff' }}>Buscar Juego en IGDB</Text>
      
      <View style={{ marginBottom: 16 }}>
        <TextInput
          style={{ backgroundColor: '#333', color: '#fff', padding: 12, borderRadius: 8 }}
          placeholder="Ej: Nioh..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
        />
      </View>

      {loading && <ActivityIndicator color="#4338CA" size="large" style={{ marginTop: 20 }} />}
      {!loading && error && (
        <Text style={{ color: theme.colors.error, textAlign: 'center', marginTop: 12 }}>{error}</Text>
      )}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 12 }}>Sin resultados para "{query}".</Text>
      )}


      <ScrollView style={{ flex: 1 }}>
        {results.map((r, i) => (
          <Pressable
            key={i}
            style={{ flexDirection: 'row', backgroundColor: '#222', padding: 12, borderRadius: 8, marginBottom: 8, alignItems: 'center' }}
            onPress={() => pickResult(r)}
          >
            {r.cover_url ? (
              <Image source={{ uri: r.cover_url }} style={{ width: 50, height: 70, borderRadius: 4, marginRight: 12 }} />
            ) : (
              <View style={{ width: 50, height: 70, backgroundColor: '#444', borderRadius: 4, marginRight: 12 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{r.title}</Text>
              
              {/* AQUÍ ESTÁ EL CAMBIO: Logo y texto alineados en horizontal */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <MaterialCommunityIcons 
                  name={
                    r.platform === 'playstation' ? 'sony-playstation' : 
                    r.platform === 'nintendo' ? 'nintendo-switch' : 
                    r.platform === 'xbox' ? 'microsoft-xbox' : 'gamepad-variant'
                  } 
                  size={18} 
                  color={
                    r.platform === 'playstation' ? '#0070D1' : 
                    r.platform === 'nintendo' ? '#E60012' : 
                    r.platform === 'xbox' ? '#107C10' : '#888'
                  } 
                />
                <Text style={{ color: '#aaa', marginLeft: 6, fontSize: 13 }} numberOfLines={1}>
                  {r.platform_name || r.platform}
                </Text>
              </View>
              
            </View>
          </Pressable>
        ))}
      </ScrollView>
      
      <Pressable onPress={onCancel} style={{ marginTop: 16, padding: 16, alignItems: 'center' }}>
        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16 }}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

function ConditionStep({
  question, desc, selected, onSelect, coverUrl, platforms, platform, progress, testIdPrefix, extra,
}: {
  question: string;
  desc: string;
  selected: ConditionKey | null;
  onSelect: (v: ConditionKey) => void;
  coverUrl?: string | null;
  platforms?: Pf[];
  platform?: string | null;
  progress: number;
  testIdPrefix: string;
  extra?: React.ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      <View style={styles.condCoverBlock}>
        <View style={styles.condCoverWrap}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <MaterialCommunityIcons name="gamepad-variant" size={40} color={theme.colors.muted} />
          )}
        </View>
      </View>

      <Text style={styles.condQuestion}>{question}</Text>
      <Text style={styles.condDesc}>{desc}{'\n'}Esto nos ayuda a darte una valoración más precisa.</Text>
      {extra}

      <View style={styles.condGrid}>
        {CONDITION_KEYS.map((k) => {
          const meta = CONDITION_META[k];
          const active = selected === k;
          return (
            <Pressable
              key={k}
              testID={`${testIdPrefix}-${k}`}
              onPress={() => onSelect(k)}
              style={[styles.condCell, active && { borderColor: theme.colors.brandPrimary, backgroundColor: 'rgba(99,102,241,0.10)' }]}
            >
              {active && (
                <View style={styles.condCheck}>
                  <MaterialCommunityIcons name="check" size={12} color="#fff" />
                </View>
              )}
              <MaterialCommunityIcons name={meta.icon as any} size={30} color={meta.color} />
              <Text style={[styles.condLabel, { color: meta.color }]}>{meta.label}</Text>
              <Text style={styles.condCellDesc}>{meta.desc}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.progressRow}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.progressDot, i === progress && { backgroundColor: theme.colors.brandPrimary, width: 22 }]}
          />
        ))}
      </View>
      <Text style={styles.progressText}>Avanzaremos automáticamente a la siguiente pregunta</Text>
    </ScrollView>
  );
}

function PriceStep({ price, setPrice, isGift, setIsGift, onNext }: any) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.condQuestion}>¿Cuánto te ha costado?</Text>
        <Text style={styles.condDesc}>Introduce el precio o marca si te lo regalaron.</Text>

        <View style={styles.priceRow}>
          <TextInput
            testID="price-input"
            value={price} onChangeText={(t) => { setPrice(t); if (t) setIsGift(false); }}
            placeholder="0,00"
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, { flex: 1, fontSize: 22, textAlign: 'right', paddingRight: 42 }]}
            keyboardType="decimal-pad"
            editable={!isGift}
          />
          <Text style={styles.priceCurrency}>€</Text>
        </View>

        <Pressable
          testID="gift-toggle"
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setIsGift(!isGift); if (!isGift) setPrice(''); }}
          style={[styles.giftBtn, isGift && { borderColor: theme.colors.gold, backgroundColor: 'rgba(251,191,36,0.12)' }]}
        >
          <MaterialCommunityIcons name="gift-outline" size={22} color={isGift ? theme.colors.gold : theme.colors.onSurfaceTertiary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.giftTitle, isGift && { color: theme.colors.gold }]}>Me lo regalaron</Text>
            <Text style={styles.giftDesc}>Se marcará con un icono de regalo en la lista.</Text>
          </View>
          {isGift && <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.gold} />}
        </Pressable>

        <Pressable testID="price-next" onPress={onNext} style={[styles.primaryBtn, { marginTop: 6 }]}>
          <Text style={styles.primaryBtnText}>Continuar</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DescriptionStep({
  wantDescription, setWantDescription, description, setDescription, onSkip, onSave, saving,
}: any) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.condQuestion}>¿Quieres añadir una descripción?</Text>
        <Text style={styles.condDesc}>Anécdotas, edición limitada, quién te lo regaló...</Text>

        {wantDescription === null && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              testID="desc-no"
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onSkip(); }}
              style={[styles.confirmBtn, styles.confirmNo, { flex: 1 }]}
              disabled={saving}
            >
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurface} />
              <Text style={styles.confirmBtnText}>No, guardar</Text>
            </Pressable>
            <Pressable
              testID="desc-yes"
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setWantDescription(true); }}
              style={[styles.confirmBtn, styles.confirmYes, { flex: 1 }]}
              disabled={saving}
            >
              <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
              <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Sí, escribir</Text>
            </Pressable>
          </View>
        )}

        {wantDescription === true && (
          <>
            <TextInput
              testID="desc-input"
              value={description} onChangeText={setDescription}
              placeholder="Escribe tu descripción..."
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
              multiline
            />
            <Pressable
              testID="desc-save"
              onPress={onSave}
              disabled={saving}
              style={[styles.primaryBtn, saving && { opacity: 0.5 }]}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Guardar juego</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DoneStep({ title }: { title: string }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 90, friction: 5 }).start();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={[theme.colors.success, '#059669']}
          style={styles.doneCircle}
        >
          <MaterialCommunityIcons name="check-bold" size={54} color="#fff" />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.doneTitle}>¡Añadido!</Text>
      <Text style={styles.doneSub}>{title}</Text>
      <View style={styles.coinsGained}>
        <MaterialCommunityIcons name="star-four-points" size={14} color={theme.colors.gold} />
        <Text style={styles.coinsGainedText}>+50 monedas</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: theme.colors.onSurface, fontSize: 17, fontWeight: '700' },

  helperTitle: { color: theme.colors.onSurface, fontSize: 20, fontWeight: '700' },
  helperText: { color: theme.colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },

  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 18, backgroundColor: 'rgba(13,17,38,0.6)',
    borderWidth: 1, borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  methodIconWrap: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  methodTitle: { color: theme.colors.onSurface, fontSize: 15, fontWeight: '700' },
  methodDesc: { color: theme.colors.onSurfaceTertiary, fontSize: 12, marginTop: 3 },
  premiumMini: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  premiumMiniText: { color: theme.colors.gold, fontSize: 10, fontWeight: '700' },

  notfoundHero: { alignItems: 'center', gap: 6, marginBottom: 4 },
  notfoundIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
    backgroundColor: 'rgba(13,17,38,0.6)',
    borderRadius: 14,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  resultCover: {
    width: 42, height: 56, borderRadius: 8, overflow: 'hidden',
    backgroundColor: theme.colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  resultTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '700' },

  // Scanner
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  scanFrame: {
    width: 260, height: 160,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: theme.colors.brandPrimary,
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 13, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 },
  scanCancel: {
    position: 'absolute', top: 16, right: 16,
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerBlock: { alignItems: 'center', gap: 8 },

  label: { color: theme.colors.onSurfaceTertiary, fontSize: 12, fontWeight: '600' },
  input: {
    color: theme.colors.onSurface, fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  primaryBtn: {
    backgroundColor: theme.colors.brandPrimary,
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghostBtn: { alignItems: 'center', paddingVertical: 10 },
  ghostBtnText: { color: theme.colors.onSurfaceTertiary, fontWeight: '600' },

  // Confirm
  confirmCover: {
    width: 130, height: 170, borderRadius: 16, overflow: 'hidden',
    backgroundColor: theme.colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  confirmQ: { color: theme.colors.onSurfaceTertiary, fontSize: 14 },
  confirmTitle: { color: theme.colors.onSurface, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  confirmPfPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  confirmPfText: { fontWeight: '700', fontSize: 13 },
  confirmVersion: { color: theme.colors.onSurfaceTertiary, fontSize: 13 },
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 14,
  },
  confirmNo: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: theme.colors.border },
  confirmYes: {
    backgroundColor: theme.colors.brandPrimary,
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  confirmBtnText: { color: theme.colors.onSurface, fontWeight: '700' },

  // Manual step
  coverPreviewWrap: { alignItems: 'center' },
  coverPreview: {
    width: 110, height: 145, borderRadius: 14, overflow: 'hidden',
    backgroundColor: theme.colors.surfaceTertiary,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: 'rgba(13,17,38,0.5)',
    flexShrink: 0,
  },
  pfChipText: { color: theme.colors.onSurfaceTertiary, fontSize: 13, fontWeight: '600' },

  // Condition step
  condCoverBlock: { alignItems: 'center', paddingVertical: 8 },
  condCoverWrap: {
    width: 100, height: 130, borderRadius: 12, overflow: 'hidden',
    backgroundColor: theme.colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.brandPrimary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  condQuestion: { color: theme.colors.onSurface, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  condDesc: { color: theme.colors.onSurfaceTertiary, fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 19 },
  condGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    rowGap: 10,
  },
  condCell: {
    width: '31.5%',
    aspectRatio: 0.95,
    borderRadius: 16,
    borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: 'rgba(13,17,38,0.55)',
    alignItems: 'center', justifyContent: 'center',
    padding: 6, gap: 4,
  },
  condCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 999,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  condLabel: { fontWeight: '800', fontSize: 14, marginTop: 2 },
  condCellDesc: { color: theme.colors.muted, fontSize: 10, textAlign: 'center' },
  progressRow: {
    marginTop: 20, flexDirection: 'row', gap: 6, justifyContent: 'center',
  },
  progressDot: {
    width: 8, height: 8, borderRadius: 999,
    backgroundColor: theme.colors.border,
  },
  progressText: { color: theme.colors.muted, textAlign: 'center', marginTop: 8, fontSize: 12 },

  // Price step
  priceRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  priceCurrency: {
    color: theme.colors.brandPrimary, fontSize: 22, fontWeight: '800',
    position: 'absolute', right: 14,
  },
  giftBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: 'rgba(13,17,38,0.55)',
  },
  giftTitle: { color: theme.colors.onSurface, fontWeight: '700', fontSize: 14 },
  giftDesc: { color: theme.colors.muted, fontSize: 12 },

  // Done
  doneCircle: {
    width: 120, height: 120, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.success, shadowOpacity: 0.5, shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  doneTitle: { color: theme.colors.onSurface, fontSize: 24, fontWeight: '800', marginTop: 8 },
  doneSub: { color: theme.colors.onSurfaceTertiary, textAlign: 'center' },
  coinsGained: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.15)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  coinsGainedText: { color: theme.colors.gold, fontWeight: '700', fontSize: 12 },
});

import type { Game, Platform, UserSettings } from './theme';

// URL del backend. En desarrollo (Expo Go / simulador) puedes seguir usando tu
// IP local en frontend/.env. En producción DEBE apuntar a tu backend real con
// HTTPS (ver frontend/.env.production.example).
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://192.168.1.37:8000";

if (!process.env.EXPO_PUBLIC_API_BASE_URL && !__DEV__) {
  console.warn(
    '⚠️ Falta EXPO_PUBLIC_API_BASE_URL — la app en producción está usando una IP local que no existirá en el dispositivo del usuario final.'
  );
}

// Se lee de frontend/.env (variable EXPO_PUBLIC_API_KEY). Expo expone
// automáticamente cualquier variable con el prefijo EXPO_PUBLIC_ vía
// process.env, sin configuración extra. Debe coincidir con el API_KEY
// que tengas en backend/.env.
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

if (!API_KEY && __DEV__) {
  console.warn(
    '⚠️ Falta EXPO_PUBLIC_API_KEY en frontend/.env — las llamadas al backend fallarán con 401.'
  );
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY || '',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`API ${path} failed: ${res.status} ${text}`);
    err.status = res.status;
    try { err.body = JSON.parse(text); } catch { err.body = { detail: text }; }
    throw err;
  }
  return res.json();
}

export type BarcodeMatch = { barcode: string; title: string; platform: string; cover_url?: string; version?: string };
export type BarcodeLookupRes = { found: boolean; game?: BarcodeMatch; suggestions?: BarcodeMatch[] };
export type OnlineGame = {
  title: string;
  platform?: string | null;
  platform_name?: string | null;
  console_icon?: string | null;
  console_color?: string | null;
  console_badge?: string | null;
  cover_url?: string | null;
  description?: string | null;
  source: string;
};

export const api = {
  listPlatforms: () => req<Platform[]>('/platforms'),
  listGames: (platform?: string, limit = 200) => {
    const p = new URLSearchParams();
    if (platform) p.set('platform', platform);
    p.set('limit', String(limit));
    return req<Game[]>(`/games?${p.toString()}`);
  },
  stats: (platform?: string) => {
    const p = new URLSearchParams();
    if (platform) p.set('platform', platform);
    return req<{ total: number; platform?: string; total_spent: number }>(`/games/stats?${p.toString()}`);
  },
  search: (q: string, platform?: string) => {
    const p = new URLSearchParams({ q });
    if (platform) p.set('platform', platform);
    return req<Game[]>(`/games/search?${p.toString()}`);
  },
  createGame: (data: Partial<Game>) =>
    req<Game>('/games', { method: 'POST', body: JSON.stringify(data) }),
  getGame: (id: string) => req<Game>(`/games/${id}`),
  updateGame: (id: string, data: Partial<Game>) =>
    req<Game>(`/games/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGame: (id: string) => req<{ success: boolean }>(`/games/${id}`, { method: 'DELETE' }),
  wishlist: () => req<Game[]>('/wishlist'),
  ranking: () => req<Game[]>('/games/ranking'),
  reorderRanking: (orderedIds: string[]) =>
    req<{ ok: boolean; count: number }>('/games/ranking/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    }),

  getSettings: () => req<UserSettings>('/settings'),
  updateSettings: (data: Partial<UserSettings>) =>
    req<UserSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  premiumSubscribe: () => req<{ success: boolean; message: string }>('/premium/subscribe', { method: 'POST' }),
  premiumCancel: () => req<{ success: boolean }>('/premium/cancel', { method: 'POST' }),
  rewardUnlock: (feature: string, hours = 24) =>
    req<{ success: boolean; premium_until: string; hours: number }>('/premium/reward-unlock', {
      method: 'POST',
      body: JSON.stringify({ feature, hours }),
    }),

  lookupBarcode: (barcode: string) =>
    req<BarcodeLookupRes>('/games/lookup-barcode', {
      method: 'POST',
      body: JSON.stringify({ barcode }),
    }),

  // Se llama solo cuando el usuario ha confirmado a mano que este barcode
  // corresponde a este juego. Es lo que deja la asociación guardada de forma
  // fiable en el catálogo local (con source: "user_confirmed").
  confirmBarcode: (data: BarcodeMatch) =>
    req<{ success: boolean }>('/games/confirm-barcode', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  chat: (session_id: string, message: string) =>
    req<{ reply: string }>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ session_id, message }),
    }),

  searchOnline: (q: string, limit = 20) => {
    const p = new URLSearchParams({ q, limit: String(limit) });
    return req<OnlineGame[]>(`/games/search-online?${p.toString()}`);
  },

  statsSummary: () => req<StatsSummary>('/stats/summary'),
  exportCsv: async (): Promise<string> => {
    const res = await fetch(`${BASE}/api/export/csv`, { headers: { 'X-API-Key': API_KEY || '' } });
    return res.text();
  },
  // Para abrir en el navegador (Linking.openURL) no se pueden mandar cabeceras,
  // así que aquí la clave va como query param (el backend acepta ambas formas).
  exportHtmlUrl: () => `${BASE}/api/export/html?api_key=${encodeURIComponent(API_KEY || '')}`,
  fetchExportHtml: async (): Promise<string> => {
    const res = await fetch(`${BASE}/api/export/html`, { headers: { 'X-API-Key': API_KEY || '' } });
    return res.text();
  },
};

export type StatsSummary = {
  total_games: number;
  total_spent: number;
  average_price: number;
  total_gifts: number;
  top_platform: string | null;
  by_platform: Record<string, number>;
  by_box_condition: Record<string, number>;
  monthly: { month: string; count: number }[];
};
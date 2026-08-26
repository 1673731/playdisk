export const theme = {
  colors: {
    surface: '#050614',
    onSurface: '#F8FAFC',
    surfaceSecondary: '#0D1126',
    onSurfaceSecondary: '#E2E8F0',
    surfaceTertiary: '#1A1F3B',
    onSurfaceTertiary: '#CBD5E1',
    brand: '#6366F1',
    brandPrimary: '#6366F1',
    onBrandPrimary: '#FFFFFF',
    brandSecondary: '#4338CA',
    brandTertiary: '#1E1B4B',
    onBrandTertiary: '#A5B4FC',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    gold: '#FBBF24',
    border: '#1E293B',
    borderStrong: '#334155',
    divider: '#0F172A',
    muted: '#64748B',
    glassBg: 'rgba(13, 17, 38, 0.6)',
    glassBorder: 'rgba(99, 102, 241, 0.18)',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  fontSize: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, hero: 40 },
};

export type Platform = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
};

export type ConditionKey = 'excelente' | 'bien' | 'normal' | 'mal' | 'horrible' | 'sin';

export type Game = {
  id: string;
  title: string;
  platform: string;
  cover_url?: string;
  notes?: string;
  rating?: number;
  in_wishlist: boolean;
  added_at: string;
  box_condition?: ConditionKey | null;
  manual_condition?: ConditionKey | null;
  disc_condition?: ConditionKey | null;
  price?: number | null;
  is_gift?: boolean;
  description?: string;
  barcode?: string | null;
  is_steelbook?: boolean;
  version?: string | null;
};

export type UserSettings = {
  shake_to_search: boolean;
  is_premium: boolean;
  premium_until: string | null;
  premium_active: boolean;
  coins: number;
  ai_messages_today: number;
  scans_today: number;
};

export const CONDITION_META: Record<ConditionKey, { label: string; desc: string; icon: string; color: string }> = {
  excelente: { label: 'Excelente', desc: 'Sin detalles, como nueva.', icon: 'diamond-stone', color: '#38BDF8' },
  bien:      { label: 'Bien',      desc: 'Detalles leves de uso.',    icon: 'check-circle-outline', color: '#A78BFA' },
  normal:    { label: 'Normal',    desc: 'Desgaste visible moderado.', icon: 'emoticon-neutral-outline', color: '#10B981' },
  mal:       { label: 'Mal',       desc: 'Daños notables, golpes o rayones.', icon: 'emoticon-sad-outline', color: '#F59E0B' },
  horrible:  { label: 'Horrible',  desc: 'Muy dañado, roturas o humedad.',    icon: 'emoticon-dead-outline', color: '#EF4444' },
  sin:       { label: 'Sin',       desc: 'No lo incluye.',           icon: 'package-variant', color: '#64748B' },
};

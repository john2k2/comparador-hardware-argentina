import type { HardwareCategory } from '@/lib/types';

export const ALL_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'perifericos',
];

export const REFRESH_CONCURRENCY = 2;
export const DEFAULT_MAX_QUERIES = 40;
export const DEFAULT_STALE_MINUTES = 180;
export const MAX_QUERIES_LIMIT = 200;
export const MAX_STALE_MINUTES = 60 * 24 * 7;
export const INTERNAL_REFRESH_TIMEOUT_MS = 90_000;

export type RefreshMode = 'cleanup-history' | 'custom' | 'full' | 'hot' | 'tracked';
export type AccessMode = 'admin' | 'cron';

export type RefreshInput = {
  mode: RefreshMode;
  query?: string;
  categories: HardwareCategory[];
  stores: string[];
  maxQueries: number;
  staleMinutes: number;
};

export type RefreshTarget = {
  kind: 'category' | 'query';
  value: string;
  category?: HardwareCategory;
};

export type RefreshSummary = {
  target: string;
  kind: 'category' | 'query';
  status: number;
  productCount: number;
  ok: boolean;
  error?: string;
};

export type RefreshPlan = {
  source: string;
  targets: RefreshTarget[];
  fallbackApplied: boolean;
  fallbackReason: string | null;
};

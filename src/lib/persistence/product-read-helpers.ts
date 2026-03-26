import type { HardwareCategory, StockStatus } from '@/lib/types';

export const DEFAULT_LIMIT = 240;
export const MAX_LIMIT = 1200;
export const EMPTY_RESULT_ERROR_CODES = new Set(['PGRST116']);
export const PRODUCT_SELECT_FIELDS = `
  id,
  name,
  category,
  brand,
  model,
  description,
  image,
  normalized_title,
  canonical_product_key,
  family_key,
  variant_key,
  refresh_priority,
  last_scraped_at,
  last_normalized_at,
  specs,
  lowest_price,
  highest_price,
  average_price,
  created_at,
  updated_at,
  product_prices (
    store_id,
    url,
    price,
    original_price,
    stock,
    installment_count,
    installment_amount,
    last_updated
  )
`;

export type SharedProductQueryFilters = {
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  searchTerm?: string;
};

export function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function toDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function toStockStatus(value: string | null | undefined): StockStatus {
  if (value === 'in-stock' || value === 'low-stock' || value === 'out-of-stock') return value;
  return 'unknown';
}

export function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[%,()']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchOrFilter(searchTerm: string): string {
  return `name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,normalized_title.ilike.%${searchTerm}%,family_key.ilike.%${searchTerm}%,variant_key.ilike.%${searchTerm}%`;
}

export function applySharedProductFilters<TQuery>(queryBuilder: TQuery, filters: SharedProductQueryFilters): TQuery {
  let next = queryBuilder as TQuery & {
    eq: (column: string, value: string) => TQuery;
    gte: (column: string, value: number) => TQuery;
    lte: (column: string, value: number) => TQuery;
    or: (expression: string) => TQuery;
  };

  if (filters.category) {
    next = next.eq('category', filters.category) as typeof next;
  }
  if (filters.minPrice !== undefined) {
    next = next.gte('lowest_price', filters.minPrice) as typeof next;
  }
  if (filters.maxPrice !== undefined) {
    next = next.lte('lowest_price', filters.maxPrice) as typeof next;
  }
  if (filters.searchTerm) {
    next = next.or(buildSearchOrFilter(filters.searchTerm)) as typeof next;
  }

  return next;
}

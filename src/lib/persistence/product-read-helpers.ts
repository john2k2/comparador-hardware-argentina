import type { HardwareCategory, StockStatus } from '@/lib/types';

export const DEFAULT_LIMIT = 240;
export const MAX_LIMIT = 1200;
export const EMPTY_RESULT_ERROR_CODES = new Set(['PGRST116']);
// El mapper expone campos explícitos; el comodín anidado permite desplegar antes
// de agregar identity_review sin romper las lecturas del catálogo existente.
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
  product_prices (*)
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
  const tokens = searchTerm.split(/\s+/).filter(Boolean);
  const databaseCandidate = [...tokens].sort((first, second) => {
    const firstHasDigit = /\d/.test(first) ? 1 : 0;
    const secondHasDigit = /\d/.test(second) ? 1 : 0;
    return secondHasDigit - firstHasDigit || second.length - first.length;
  })[0] ?? searchTerm;

  return `name.ilike.%${databaseCandidate}%,brand.ilike.%${databaseCandidate}%,model.ilike.%${databaseCandidate}%,normalized_title.ilike.%${databaseCandidate}%,family_key.ilike.%${databaseCandidate}%,variant_key.ilike.%${databaseCandidate}%`;
}

/** Las guías consultan modelos concretos antes de aplicar su ventana de ocho
 * resultados. Usar sólo «3200» dejaba afuera Mancer Vant entre RAM sin relación. */
export function buildGuideSearchOrFilter(searchTerm: string): string | null {
  const tokens = [...new Set(searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) ?? [])];
  if (!tokens.length) return null;
  const fields = ['name', 'brand', 'model', 'normalized_title', 'canonical_product_key'];
  // Cada término puede estar en cualquiera de los campos del resolver de guías;
  // la marca no siempre se repite en el título. Todos los términos son exigidos.
  // Sólo caracteres alfanuméricos entran a la sintaxis PostgREST.
  const clauses = tokens.map((token) => `or(${fields.map((field) => `${field}.ilike.%${token}%`).join(',')})`);
  // catalog_document es generado desde estos campos y tiene un índice GIN.
  // Un término alfanumérico con dígitos no cambia por sus reemplazos de sinónimos.
  // El prefiltro reduce la lectura; todos los requisitos originales permanecen.
  const indexedToken = tokens.filter((token) => token.length >= 3 && /\d/.test(token))
    .sort((first, second) => second.length - first.length)[0];
  if (indexedToken) clauses.unshift(`catalog_document.ilike.%${indexedToken}%`);
  return `and(${clauses.join(',')})`;
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

import type { NextRequest } from 'next/server';
import type { HardwareCategory } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import { scheduleInternalRefresh } from '@/lib/server/internal-refresh';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';

export type SortBy = 'relevance' | 'price-asc' | 'price-desc' | 'name' | 'newest';

export const VALID_SORTS = new Set<SortBy>(['relevance', 'price-asc', 'price-desc', 'name', 'newest']);
export const SCRAPER_TIMEOUT_MS = 25_000;
export const MAX_CONCURRENT_SCRAPERS = 6;
export const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
export const PERSISTENCE_TIMEOUT_MS = 7_000;
export const DB_STALE_AFTER_MS = 20 * 60 * 1000;
export const BACKGROUND_REFRESH_TIMEOUT_MS = 60 * 1000;
export const SEARCH_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

// Mapas con limite de tamano para evitar fugas de memoria
// Se limpian automaticamente en .finally() de cada promise
const MAX_INFLIGHT_ENTRIES = 200;
const MAX_INFLIGHT_REFRESH_ENTRIES = 50;

export const inFlightSearchRequests = new Map<string, Promise<SearchApiResponse>>();
export const inFlightBackgroundSearchRefreshes = new Map<string, Promise<void>>();

/** Limpia entradas huérfanas o excedidas del mapa de requests en vuelo */
export function pruneInFlightRequests(): void {
  // Eliminar entradas excedentes (las mas viejas primero)
  while (inFlightSearchRequests.size > MAX_INFLIGHT_ENTRIES) {
    const oldestKey = inFlightSearchRequests.keys().next().value as string | undefined;
    if (!oldestKey) break;
    inFlightSearchRequests.delete(oldestKey);
  }
  while (inFlightBackgroundSearchRefreshes.size > MAX_INFLIGHT_REFRESH_ENTRIES) {
    const oldestKey = inFlightBackgroundSearchRefreshes.keys().next().value as string | undefined;
    if (!oldestKey) break;
    inFlightBackgroundSearchRefreshes.delete(oldestKey);
  }
}

export function parseNonNegativeNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

export function parsePositiveInteger(value: string | null, fallback = 1): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

export function parseStoreIds(value: string | null): Set<string> {
  if (!value) return new Set<string>();
  const ids = value
    .split(',')
    .map((storeId) => storeId.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids);
}

export function shouldRunStore(selectedStoreIds: Set<string>, storeId: string): boolean {
  return selectedStoreIds.size === 0 || selectedStoreIds.has(storeId.toLowerCase());
}

export function hasSearchFiltersIntent(input: {
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}): boolean {
  return Boolean(
    input.category
    || input.minPrice !== undefined
    || input.maxPrice !== undefined
    || input.stores.size > 0,
  );
}

export function scheduleBackgroundSearchRefresh(request: NextRequest, refreshKey: string): void {
  scheduleInternalRefresh({
    request,
    refreshKey,
    inFlightRefreshes: inFlightBackgroundSearchRefreshes,
    timeoutMs: BACKGROUND_REFRESH_TIMEOUT_MS,
    timeoutLabel: 'search-background-refresh',
    logPrefix: '[API Search]',
  });
}

export function buildResponsePagination(total: number, page: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 0;
  const currentPage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
  const offset = (currentPage - 1) * safePageSize;

  return {
    limit: total > 0 ? Math.min(safePageSize, Math.max(0, total - offset)) : 0,
    offset,
    total,
    totalPages,
    page: currentPage,
    pageSize: safePageSize,
  };
}

export function emptySearchResponse(page = 1, pageSize = SEARCH_PAGE_SIZE): SearchApiResponse {
  return {
    products: [],
    pagination: buildResponsePagination(0, page, pageSize),
    facets: { categories: [], brands: [], stores: [] },
  };
}

export function buildSearchCacheKey(input: {
  query: string;
  category?: HardwareCategory;
  sortBy: SortBy;
  page: number;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}) {
  const stores = Array.from(input.stores).sort().join(',');
  return [
    `q=${input.query.toLowerCase()}`,
    `cat=${input.category ?? ''}`,
    `sort=${input.sortBy}`,
    `page=${input.page}`,
    `min=${input.minPrice ?? ''}`,
    `max=${input.maxPrice ?? ''}`,
    `stores=${stores}`,
  ].join('|');
}

export async function getCachedSearchResponse(cacheKey: string): Promise<SearchApiResponse | null> {
  const cached = await getSharedCache<SearchApiResponse>('search-response', cacheKey);
  if (!cached) return null;

  return {
    ...cached,
    products: hydrateProducts(cached.products ?? []),
  };
}

export async function setCachedSearchResponse(cacheKey: string, payload: SearchApiResponse): Promise<void> {
  await setSharedCache('search-response', cacheKey, payload, SEARCH_CACHE_TTL_MS);
}

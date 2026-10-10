import type { NextRequest } from 'next/server';
import type { HardwareCategory, Product } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import { scheduleInternalRefresh } from '@/lib/server/internal-refresh';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
import { dedupeCpuSearchProducts } from '@/lib/search/search-dedupe';
import { guardIdentityPage, type IdentityPageOptions } from '@/lib/search/identity-page-guard';
import { hasCurrentSearchPagePrices } from './search-availability';
export { hasCurrentSearchPagePrices } from './search-availability';

function dedupeSearchResponse(payload: SearchApiResponse, options: IdentityPageOptions = {}): SearchApiResponse {
  const products = dedupeCpuSearchProducts(payload.products, options);
  // El mínimo puede subir al invalidarse un dictamen de alias para el título
  // final. SQL ordenó las filas originales: se ordena de nuevo esta página.
  if (options.sortBy === 'price-asc' || options.sortBy === 'price-desc') {
    products.sort((a, b) => options.sortBy === 'price-asc' ? a.lowestPrice - b.lowestPrice : b.lowestPrice - a.lowestPrice);
  }
  // Sólo podemos recalcular el total si esta página contiene el conjunto entero.
  // En páginas parciales se conserva el conteo SQL; no inventamos cobertura global.
  const complete = payload.pagination.page === 1 && payload.pagination.total === payload.products.length
    && !payload.pagination.categoryExcludedOnPage && !payload.pagination.identityExcludedOnPage;
  return { ...payload, products, pagination: {
    ...payload.pagination, limit: products.length,
    ...(complete ? { total: products.length, totalPages: products.length ? 1 : 0 } : {}),
  } };
}

export function catalogPageResponse(result: ProductPageResult, options: IdentityPageOptions = {}): SearchApiResponse {
  const guarded = guardIdentityPage(result.products, options);
  const identityExcludedOnPage = (result.identityExcludedOnPage ?? 0) + guarded.identityExcludedOnPage;
  return dedupeSearchResponse({
    products: guarded.products,
    pagination: {
      limit: guarded.products.length, offset: (result.page - 1) * result.pageSize,
      total: result.total, totalPages: result.totalPages, page: result.page, pageSize: result.pageSize,
      ...(result.categoryExcludedOnPage ? { categoryExcludedOnPage: result.categoryExcludedOnPage } : {}),
      ...(identityExcludedOnPage ? { identityExcludedOnPage } : {}),
    },
    facets: { categories: [], brands: [], stores: [] },
  }, options);
}

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
  includeUnavailable?: boolean;
}) {
  const stores = Array.from(input.stores).sort().join(',');
  return [
    'catalog-v15',
    `references=${input.includeUnavailable ? 1 : 0}`,
    `q=${input.query.toLowerCase()}`,
    `cat=${input.category ?? ''}`,
    `sort=${input.sortBy}`,
    `page=${input.page}`,
    `min=${input.minPrice ?? ''}`,
    `max=${input.maxPrice ?? ''}`,
    `stores=${stores}`,
  ].join('|');
}

export async function getCachedSearchResponse(cacheKey: string, includeUnavailable = false, options?: IdentityPageOptions): Promise<SearchApiResponse | null> {
  const cached = await getSharedCache<SearchApiResponse>('search-response-v3', cacheKey);
  if (!cached) return null;
  const products = hydrateProducts(cached.products ?? []);
  const guarded = guardIdentityPage(products, options);
  // Sin contexto de filtros, una caché antigua corregida debe releer SQL.
  if (options === undefined && guarded.products !== products) return null;
  const identityExcludedOnPage = (cached.pagination.identityExcludedOnPage ?? 0) + guarded.identityExcludedOnPage;
  // Releer SQL si venció el mínimo o la última oferta: no filtrar una página ya paginada.
  if (!includeUnavailable && !hasCurrentSearchPagePrices(guarded.products)) return null;

  return dedupeSearchResponse({
    ...cached,
    products: guarded.products,
    pagination: { ...cached.pagination, ...(identityExcludedOnPage ? { identityExcludedOnPage } : {}) },
  }, options);
}

export async function setCachedSearchResponse(cacheKey: string, payload: SearchApiResponse): Promise<void> {
  await setSharedCache('search-response-v3', cacheKey, payload, SEARCH_CACHE_TTL_MS);
}

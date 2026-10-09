import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Product } from '@/lib/types';
const { readPage, getCache } = vi.hoisted(() => ({ readPage: vi.fn(), getCache: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: vi.fn(() => { throw new Error('outside request scope'); }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/server/rate-limit', async original => ({ ...await original<typeof import('@/lib/server/rate-limit')>(),
  checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 30, remaining: 29, resetAtMs: Date.now() + 60000, retryAfterSeconds: 0 })), getRequestIp: () => '203.0.113.8' }));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: getCache, setSharedCache: vi.fn() }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: readPage }));
vi.mock('@/lib/catalog/refresh-demand', () => ({ recordCatalogRefreshDemand: vi.fn() }));
vi.mock('@/lib/search/search-live', () => ({ runLiveSearch: vi.fn() }));
vi.mock('@/lib/server/runtime-flags', () => ({ isStableRuntimeMode: () => false, shouldSkipLiveScraping: () => true }));
vi.mock('@/lib/telemetry/operational-metrics', () => ({ recordEndpointRequestEvent: vi.fn(), runObservedStoreScrape: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { GET } from './search-route-handler';
import { readInitialSearchPage } from './read-initial-search-page';
import { parseSearchState } from './search-state';
import { catalogPageResponse, getCachedSearchResponse, hasCurrentSearchPagePrices } from './search-handler-shared';
import { dedupeCpuSearchProducts } from './search-dedupe';

// Fixture contractual del reviewer. No es una observación de tiendas/producción.
const observedAt = '2026-10-09T16:37:22Z';
function cpu(id: string, name: string, price: number, storeId = 'maxtecno'): Product {
  const date = new Date(observedAt), number = name.includes('5500') ? '5500' : '5600';
  const url = `https://${storeId}.com.ar/producto/procesador-amd-ryzen-5-${number}/`;
  return { id, name, model: name, category: 'procesadores', brand: 'AMD', specs: {}, createdAt: date, updatedAt: date,
    lowestPrice: price, highestPrice: price, averagePrice: price,
    prices: [{ storeId, storeName: storeId, url, price, stock: 'in-stock', installment: null, lastUpdated: date,
      identityReview: { version: 1, status: 'consistent', reason: 'consistent-text', reviewedAt: observedAt,
        model: 'jev-1.13.0', confidence: .95, subject: { name: name.toLowerCase(), category: 'procesadores', url } } }] };
}
function aliases(includeOther = false, sameUrl = true) {
  const a = cpu('alias', 'AMD Ryzen 5 5600', 233700);
  const b = cpu('agrupado-procesadores-5600', 'Procesador AMD Ryzen 5 5600', 250000, sameUrl ? 'maxtecno' : 'katech');
  return includeOther ? [a, cpu('other', 'AMD Ryzen 5 5500', 240000), b] : [a, b];
}
function page(products = aliases()) { return { products, total: 40, totalPages: 4, page: 2, pageSize: 12 }; }
function cached(products = aliases()) { return { products, pagination: { limit: products.length, offset: 12, total: 40, totalPages: 4, page: 2, pageSize: 12 }, facets: { categories: [], brands: [], stores: [] } }; }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(observedAt)); vi.clearAllMocks(); getCache.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());

describe('dictámenes CPU ligados a nombres originales', () => {
  it.each([false, true])('mantiene ambas ofertas vigentes de igual URL y sujetos distintos, reversed=%s', reverse => {
    const rows = aliases(); if (reverse) rows.reverse(); const snapshot = JSON.stringify(rows);
    expect(hasCurrentSearchPagePrices(rows)).toBe(true);
    const merged = dedupeCpuSearchProducts(rows);
    expect(merged).toHaveLength(2);
    expect(merged.map(product => product.lowestPrice).sort((a, b) => a - b)).toEqual([233700, 250000]);
    expect(merged).toEqual(rows);
    expect(hasCurrentSearchPagePrices(merged)).toBe(true);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
  it.each(['price-asc', 'price-desc'] as const)('reordena después de dedupe tanto DB como caché, %s', async sortBy => {
    const rows = aliases(true, false), expected = sortBy === 'price-asc' ? [233700, 240000, 250000] : [250000, 240000, 233700];
    const response = catalogPageResponse(page(rows), { sortBy });
    expect(response.products.map(product => product.lowestPrice)).toEqual(expected);
    expect(hasCurrentSearchPagePrices(response.products)).toBe(true);
    expect(response.pagination).toMatchObject({ total: 40, totalPages: 4, page: 2, offset: 12, limit: 3 });
    getCache.mockResolvedValue(JSON.parse(JSON.stringify(cached(rows))));
    const fromCache = await getCachedSearchResponse('reviewed-alias', false, { sortBy });
    expect(fromCache!.products.map(product => product.lowestPrice)).toEqual(expected);
    expect(hasCurrentSearchPagePrices(fromCache!.products)).toBe(true);
  });
  it('mantiene separadas las filas cuando la fusión no conservaría el rango solicitado', () => {
    const rows = aliases();
    // Esta tercera observación tiene dictamen para el nombre canónico: no es
    // elegible bajo el alias original, pero sí lo sería después de fusionar.
    const canonicalOffer = cpu('old-canonical-observation', rows[1].name, 100000, 'katech').prices[0];
    rows[0].prices.push(canonicalOffer);
    expect(hasCurrentSearchPagePrices(rows)).toBe(true);
    const result = dedupeCpuSearchProducts(rows, { minPrice: 230000, maxPrice: 260000 });
    expect(result).toHaveLength(2);
    expect(hasCurrentSearchPagePrices(result)).toBe(true);
    expect(result.map(product => product.lowestPrice)).toEqual([233700, 250000]);
    const bounded = catalogPageResponse(page(rows), { minPrice: 230000, maxPrice: 260000, sortBy: 'price-asc' });
    expect(bounded.products.map(product => product.lowestPrice)).toEqual([233700, 250000]);
    expect(bounded.pagination.identityExcludedOnPage).toBeUndefined();
    // El loader decide qué filas entran en el rango antes de paginar: no se
    // reinserta la fila de 250000 si SQL sólo devolvió el alias de 233700.
    const response = catalogPageResponse(page([aliases()[0]]), { maxPrice: 245000 });
    expect(response.products.map(product => product.lowestPrice)).toEqual([233700]);
    expect(response.pagination.total).toBe(40);
  });
  it.each(['price-asc', 'price-desc'] as const)('API y SSR conservan vigencia después de dedupe sin 503, %s', async sortBy => {
    const rows = aliases(true), snapshot = JSON.stringify(rows);
    readPage.mockResolvedValue(page(rows));
    const api = await GET(new NextRequest(`https://example.com/api/search?category=procesadores&page=2&sortBy=${sortBy}`));
    expect(api.status).toBe(200);
    const payload = await api.json();
    const expected = sortBy === 'price-asc' ? [233700, 240000, 250000] : [250000, 240000, 233700];
    expect(payload.products.map((product: Product) => product.lowestPrice)).toEqual(expected);
    const ssr = await readInitialSearchPage(parseSearchState({ category: 'procesadores', page: '2', sortBy }));
    expect(ssr.products.map(product => product.lowestPrice)).toEqual(expected);
    expect(hasCurrentSearchPagePrices(ssr.products)).toBe(true);
    expect(ssr.pagination).toMatchObject({ total: 40, offset: 12, limit: 3 });
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

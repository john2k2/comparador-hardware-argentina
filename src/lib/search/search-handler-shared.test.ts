import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import auditRows from './search-dedupe-audit.fixture.json';
const { getCache } = vi.hoisted(() => ({ getCache: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: getCache, setSharedCache: vi.fn() }));
import { catalogPageResponse, getCachedSearchResponse } from './search-handler-shared';
function rows() { return hydrateProducts(auditRows as unknown as Product[]); }
function currentSubjects(products: Product[]): string[] {
  return products.flatMap(product => product.prices
    .filter(offer => isComparableStoreOffer(offer, product) && isCatalogOfferFresh(offer.lastUpdated))
    .map(offer => JSON.stringify({ name: product.name, category: product.category, offer }))).sort();
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:37:22Z')); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe('deduplicación CPU en respuestas de base y caché', () => {
  it('conserva el conjunto completo cuando fusionar perdería sujetos elegibles', () => {
    const products = rows(), snapshot = JSON.stringify(products), before = currentSubjects(products);
    expect(before).toHaveLength(5);
    const response = catalogPageResponse({ products, total: 4, totalPages: 1, page: 1, pageSize: 12 });
    expect(response.products).toEqual(products);
    expect(currentSubjects(response.products)).toEqual(before);
    expect(response.pagination).toMatchObject({ limit: 4, total: 4, totalPages: 1, page: 1 });
    expect(JSON.stringify(products)).toBe(snapshot);
  });
  it('conserva conteo, offset y totalPages de SQL en páginas parciales', () => {
    const products = rows(), snapshot = JSON.stringify(products);
    const response = catalogPageResponse({ products, total: 40, totalPages: 4, page: 2, pageSize: 12 });
    expect(response.products).toEqual(products);
    expect(currentSubjects(response.products)).toEqual(currentSubjects(products));
    expect(response.pagination).toMatchObject({ limit: 4, total: 40, totalPages: 4, offset: 12, page: 2 });
    expect(JSON.stringify(products)).toBe(snapshot);
  });
  it('no inventa un total tras exclusiones de categoría', () => {
    const response = catalogPageResponse({ products: rows(), total: 4, totalPages: 1, page: 1, pageSize: 12, categoryExcludedOnPage: 1 });
    expect(response.pagination.total).toBe(4);
    expect(response.pagination.categoryExcludedOnPage).toBe(1);
  });
  it('conserva sujetos de respuestas antiguas cacheadas sin renovar fechas', async () => {
    const products = rows(), cached = { products, pagination: { limit: 4, offset: 0, total: 4, totalPages: 1, page: 1, pageSize: 12 }, facets: { categories: [], brands: [], stores: [] } };
    const snapshot = JSON.stringify(cached), before = currentSubjects(products);
    getCache.mockResolvedValue(cached);
    const response = await getCachedSearchResponse('audit-ryzen');
    expect(response!.products).toEqual(products);
    expect(currentSubjects(response!.products)).toEqual(before);
    expect(response!.pagination).toMatchObject({ limit: 4, total: 4, totalPages: 1, page: 1 });
    const canonical = response!.products.find(product => product.id === products[1].id)!;
    expect(canonical.lowestPrice).toBe(233700);
    expect(canonical.prices.find(offer => offer.price === 229000)!.lastUpdated.toISOString()).toContain('2026-09-22');
    expect(JSON.stringify(cached)).toBe(snapshot);
  });
  it.each([false, true])('recalcula sólo un conjunto completo tras una fusión que conserva sujetos, partial=%s', async partial => {
    const original = rows(), canonical = original[1];
    // Mismo título y dictámenes: esta copia no necesita trasladar aprobaciones
    // entre sujetos. Su conjunto de ofertas es exactamente el mismo.
    const products = [canonical, { ...canonical, id: 'same-subject-alias' }, original[3]];
    const snapshot = JSON.stringify(products);
    const page = { products, total: partial ? 40 : 3, totalPages: partial ? 4 : 1,
      page: partial ? 2 : 1, pageSize: 12 };
    const response = catalogPageResponse(page);
    const expected = { limit: 2, total: partial ? 40 : 2, totalPages: partial ? 4 : 1,
      page: page.page, offset: partial ? 12 : 0 };
    expect(response.products).toHaveLength(2);
    expect(response.pagination).toMatchObject(expected);
    expect(currentSubjects(response.products)).toEqual(currentSubjects([canonical, original[3]]));
    expect(response.products.find(product => product.id === canonical.id)!.prices).toEqual(canonical.prices);
    getCache.mockResolvedValue({ products, pagination: { limit: 3, total: page.total,
      totalPages: page.totalPages, page: page.page, pageSize: page.pageSize,
      offset: partial ? 12 : 0 }, facets: { categories: [], brands: [], stores: [] } });
    const fromCache = await getCachedSearchResponse('safe-subject-alias');
    expect(fromCache!.products).toEqual(response.products);
    expect(fromCache!.pagination).toMatchObject(expected);
    expect(JSON.stringify(products)).toBe(snapshot);
  });
});

describe('guard de identidad en caché histórica', () => {
  function cachePage() {
    const product = rows()[0];
    return { products: [{ ...product, category: 'almacenamiento' as const,
      name: 'SSD Western Digital WD Green 1TB', lowestPrice: 254647.83, highestPrice: 254647.83, averagePrice: 254648,
      prices: [{ ...product.prices[0], price: 254647.83, stock: 'in-stock' as const, identityReview: undefined, sourceIdentity: undefined,
        lastUpdated: new Date('2026-10-08T22:34:00Z'),
        url: 'https://maxtecno.com.ar/producto/disco-externo-hdd-western-digital-elements-1tb-usb-3-0-tipo-a-negro/', storeId: 'maxtecno' }] }],
      pagination: { limit: 1, offset: 0, total: 20, totalPages: 2, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
  }
  it('excluye el mínimo contaminado sin perder total SQL ni inventar fechas', async () => {
    const cached = cachePage(), snapshot = JSON.stringify(cached); getCache.mockResolvedValue(cached);
    const response = await getCachedSearchResponse('audit-storage', false, {});
    expect(response!.products).toEqual([]);
    expect(response!.pagination).toMatchObject({ limit: 0, total: 20, totalPages: 2, identityExcludedOnPage: 1 });
    expect(JSON.stringify(cached)).toBe(snapshot);
  });
  it('relee SQL si el llamador no aportó el contexto de filtros para una caché contaminada', async () => {
    getCache.mockResolvedValue(cachePage());
    expect(await getCachedSearchResponse('audit-storage')).toBeNull();
  });
  it('reaplica maxPrice al mínimo corregido y conserva observaciones cuando está dentro del rango', async () => {
    const cached = cachePage(), product = cached.products[0];
    product.prices.push({ ...product.prices[0], price: 450000,
      lastUpdated: new Date('2026-10-09T16:00:00Z'), url: 'https://maxtecno.com.ar/producto/ssd-western-digital-wd-green-1tb/' });
    getCache.mockResolvedValue(cached);
    expect((await getCachedSearchResponse('audit-storage', false, { maxPrice: 425000 }))!.products).toEqual([]);
    const response = await getCachedSearchResponse('audit-storage', false, { maxPrice: 450000 });
    expect(response!.products[0].lowestPrice).toBe(450000);
    expect(response!.products[0].prices).toHaveLength(2);
    expect(response!.products[0].prices[0].lastUpdated.toISOString()).toBe('2026-10-08T22:34:00.000Z');
  });
});

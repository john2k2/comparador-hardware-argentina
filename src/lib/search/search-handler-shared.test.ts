import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import auditRows from './search-dedupe-audit.fixture.json';
const { getCache } = vi.hoisted(() => ({ getCache: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: getCache, setSharedCache: vi.fn() }));
import { catalogPageResponse, getCachedSearchResponse } from './search-handler-shared';
function rows() { return hydrateProducts(auditRows as unknown as Product[]); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T16:37:22Z')); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe('deduplicación CPU en respuestas de base y caché', () => {
  it('recalcula el total sólo cuando recibió el conjunto completo', () => {
    const response = catalogPageResponse({ products: rows(), total: 4, totalPages: 1, page: 1, pageSize: 12 });
    expect(response.products).toHaveLength(2);
    expect(response.pagination).toMatchObject({ limit: 2, total: 2, totalPages: 1, page: 1 });
  });
  it('conserva conteo, offset y totalPages de SQL en páginas parciales', () => {
    const response = catalogPageResponse({ products: rows(), total: 40, totalPages: 4, page: 2, pageSize: 12 });
    expect(response.products).toHaveLength(2);
    expect(response.pagination).toMatchObject({ limit: 2, total: 40, totalPages: 4, offset: 12, page: 2 });
  });
  it('no inventa un total tras exclusiones de categoría', () => {
    const response = catalogPageResponse({ products: rows(), total: 4, totalPages: 1, page: 1, pageSize: 12, categoryExcludedOnPage: 1 });
    expect(response.pagination.total).toBe(4);
    expect(response.pagination.categoryExcludedOnPage).toBe(1);
  });
  it('deduplica respuestas antiguas cacheadas sin renovar fechas', async () => {
    getCache.mockResolvedValue({ products: rows(), pagination: { limit: 4, offset: 0, total: 4, totalPages: 1, page: 1, pageSize: 12 }, facets: { categories: [], brands: [], stores: [] } });
    const response = await getCachedSearchResponse('audit-ryzen');
    expect(response!.products).toHaveLength(2);
    expect(response!.products[0].lowestPrice).toBe(233700);
    expect(response!.products[0].prices.find(offer => offer.price === 229000)!.lastUpdated.toISOString()).toContain('2026-09-22');
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

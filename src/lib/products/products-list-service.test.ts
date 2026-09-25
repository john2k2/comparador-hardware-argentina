import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  fetchFoxtiendaCategory: vi.fn(async () => [] as Product[]),
  fetchFoxtiendaSearch: vi.fn(async () => [] as Product[]),
  fetchQloudCategory: vi.fn(async () => [] as Product[]),
  fetchQloudSearch: vi.fn(async () => [] as Product[]),
  fetchPrestashopCategory: vi.fn(async () => [] as Product[]),
  fetchPrestashopSearch: vi.fn(async () => [] as Product[]),
  fetchTiendaNubeCategory: vi.fn(async () => [] as Product[]),
  fetchTiendaNubeSearch: vi.fn(async () => [] as Product[]),
  fetchWooCommerceCategory: vi.fn(async () => [] as Product[]),
  fetchWooCommerceSearch: vi.fn(async () => [] as Product[]),
  reviewProductOffers: vi.fn(async (products: Product[]) => products),
  persistProductsSnapshot: vi.fn(async () => undefined),
  snapshotProducts: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/scrapers/foxtienda', () => ({
  fetchAllFoxtiendaCategory: mocks.fetchFoxtiendaCategory,
  fetchAllFoxtiendaSearch: mocks.fetchFoxtiendaSearch,
}));
vi.mock('@/lib/scrapers/qloud', () => ({
  fetchAllQloudCategory: mocks.fetchQloudCategory,
  fetchAllQloudSearch: mocks.fetchQloudSearch,
}));
vi.mock('@/lib/scrapers/prestashop', () => ({
  fetchAllPrestashopCategory: mocks.fetchPrestashopCategory,
  fetchAllPrestashopSearch: mocks.fetchPrestashopSearch,
}));
vi.mock('@/lib/scrapers/tiendanube', () => ({
  fetchAllTiendaNubeCategory: mocks.fetchTiendaNubeCategory,
  fetchAllTiendaNubeSearch: mocks.fetchTiendaNubeSearch,
}));
vi.mock('@/lib/scrapers/woocommerce', () => ({
  fetchAllWooCommerceCategory: mocks.fetchWooCommerceCategory,
  fetchAllWooCommerceSearch: mocks.fetchWooCommerceSearch,
}));
vi.mock('@/lib/ai/review-product-offers', () => ({
  collectOfferSourceTitles: () => ({}),
  reviewProductOffers: mocks.reviewProductOffers,
}));
vi.mock('@/lib/persistence/product-catalog', () => ({
  persistProductsSnapshot: mocks.persistProductsSnapshot,
  REFRESH_PERSISTENCE_TIMEOUT_MS: 45_000,
}));
vi.mock('@/lib/cache/search-snapshot', () => ({ snapshotProducts: mocks.snapshotProducts }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn(), debug: vi.fn() } }));

import { resolveLiveProductsList } from './products-list-service';
import { buildCoreStoreCategoryUrls } from './products-list-targets';

function observedProduct(storeId: string): Product {
  const now = new Date('2026-09-21T12:00:00.000Z');
  return {
    id: `${storeId}-cpu`,
    name: `AMD Ryzen 5 5600 ${storeId}`,
    model: 'Ryzen 5 5600',
    brand: 'AMD',
    category: 'procesadores',
    specs: {},
    prices: [],
    lowestPrice: 100_000,
    highestPrice: 100_000,
    averagePrice: 100_000,
    createdAt: now,
    updatedAt: now,
  };
}

describe('resolveLiveProductsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistProductsSnapshot.mockResolvedValue(undefined);
    mocks.reviewProductOffers.mockImplementation(async (products: Product[]) => products);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('selecciona solo Mexx, Venex y Maximus entre scrapers directos y pasa el Set a agregadores', async () => {
    const selected = new Set(['mexx', 'venex', 'maximus']);
    const observedStoreIds: string[] = [];
    const observe = vi.fn(async (storeId: string) => {
      observedStoreIds.push(storeId);
      return [observedProduct(storeId)];
    });

    const products = await resolveLiveProductsList('procesadores', undefined, observe, false, selected);

    expect(products).toHaveLength(3);
    expect(observedStoreIds).toEqual(['mexx', 'venex', 'maximus']);
    for (const aggregator of [
      mocks.fetchFoxtiendaCategory,
      mocks.fetchQloudCategory,
      mocks.fetchPrestashopCategory,
      mocks.fetchTiendaNubeCategory,
      mocks.fetchWooCommerceCategory,
    ]) {
      expect(aggregator).toHaveBeenCalled();
      expect(aggregator.mock.calls[0]?.[2]).toBe(selected);
    }
  });

  it('trata un Set vacío como todas las tiendas directas y no filtra agregadores', async () => {
    const observedStoreIds: string[] = [];
    const observe = vi.fn(async (storeId: string) => {
      observedStoreIds.push(storeId);
      return [];
    });

    await resolveLiveProductsList('procesadores', undefined, observe, false, new Set());

    expect(observedStoreIds).toEqual([
      'mexx', 'venex', 'fullh4rd', 'maximus', 'gamingcity', 'gezatek',
      'compugarden', 'logg', 'compragamer', 'portaltech', 'wiztech', 'xtpc',
    ]);
    for (const aggregator of [
      mocks.fetchFoxtiendaCategory,
      mocks.fetchQloudCategory,
      mocks.fetchPrestashopCategory,
      mocks.fetchTiendaNubeCategory,
      mocks.fetchWooCommerceCategory,
    ]) {
      expect(aggregator.mock.calls[0]?.[2]).toBeUndefined();
    }
  });

  it('propaga un fallo de persistencia durante un refresh autorizado', async () => {
    mocks.persistProductsSnapshot.mockRejectedValue(new Error('service credentials unavailable'));
    const observe = vi.fn(async (storeId: string) => [observedProduct(storeId)]);

    await expect(resolveLiveProductsList('procesadores', undefined, observe, true)).rejects.toThrow('service credentials unavailable');
    expect(mocks.snapshotProducts).not.toHaveBeenCalled();
  });

  it('tolera un fallo de persistencia en modo público y conserva el resultado en memoria', async () => {
    mocks.persistProductsSnapshot.mockRejectedValue(new Error('temporary persistence failure'));
    const observe = vi.fn(async () => [observedProduct('mexx')]);

    await expect(resolveLiveProductsList('procesadores', undefined, observe, false, new Set(['mexx']))).resolves.toHaveLength(1);
    expect(mocks.snapshotProducts).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it('permite que una persistencia autorizada tarde más de siete segundos sin aplicar el timeout público', async () => {
    vi.useFakeTimers();
    mocks.persistProductsSnapshot.mockImplementation(() => new Promise<void>((resolve) => {
      setTimeout(resolve, 8_000);
    }));
    const observe = vi.fn(async () => [observedProduct('mexx')]);
    const result = resolveLiveProductsList('procesadores', undefined, observe, true, new Set(['mexx']));

    await vi.advanceTimersByTimeAsync(8_001);
    await expect(result).resolves.toHaveLength(1);
  });
});

describe('buildCoreStoreCategoryUrls', () => {
  it('nunca usa URLs de procesadores para RAM', () => {
    const urls = Object.values(buildCoreStoreCategoryUrls('memoria-ram'));

    expect(urls.every((url) => !/procesador|microprocesador/i.test(url))).toBe(true);
    expect(urls.every((url) => /ram/i.test(decodeURIComponent(url)))).toBe(true);
  });

  it('usa búsquedas específicas para almacenamiento y refrigeración', () => {
    const storage = Object.values(buildCoreStoreCategoryUrls('almacenamiento'));
    const cooling = Object.values(buildCoreStoreCategoryUrls('refrigeracion'));

    expect(storage.every((url) => /ssd/i.test(decodeURIComponent(url)))).toBe(true);
    expect(cooling.every((url) => /cooler/i.test(decodeURIComponent(url)))).toBe(true);
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

vi.mock('server-only', () => ({}));

const mockGetSharedCache = vi.fn();
const mockSetSharedCache = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn(() => ({}));
const mockGetRequestIp = vi.fn(() => '127.0.0.1');
const mockRecordEndpointRequestEvent = vi.fn();
const mockRunObservedStoreScrape = vi.fn(async ({ run }) => run());
const mockReadProductsFromDatabase = vi.fn();
const mockPersistProductsSnapshot = vi.fn();
const mockCreateObservedProductsSourceRunner = vi.fn(() => async (_storeId, _storeName, run) => run(new AbortController().signal));
const mockResolveLiveProductsList = vi.fn(async () => []);
const mockLoggerError = vi.fn();
const mockLoggerWarn = vi.fn();
const mockRecordCatalogRefreshDemand = vi.fn();

vi.mock('@/lib/catalog/refresh-demand', () => ({
  recordCatalogRefreshDemand: mockRecordCatalogRefreshDemand,
}));

vi.mock('@/lib/server/shared-cache', () => ({
  getSharedCache: mockGetSharedCache,
  setSharedCache: mockSetSharedCache,
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  buildRateLimitHeaders: mockBuildRateLimitHeaders,
  getRequestIp: mockGetRequestIp,
}));

vi.mock('@/lib/telemetry/operational-metrics', () => ({
  recordEndpointRequestEvent: mockRecordEndpointRequestEvent,
  runObservedStoreScrape: mockRunObservedStoreScrape,
}));

vi.mock('@/lib/persistence/product-read', () => ({
  readProductsFromDatabase: mockReadProductsFromDatabase,
  readProductsPageFromDatabase: async (params: { page: number; pageSize: number }) => {
    const value = await mockReadProductsFromDatabase(params);
    return Array.isArray(value) ? { products: value, total: value.length, totalPages: value.length ? 1 : 0, page: 1, pageSize: params.pageSize } : value;
  },
}));

vi.mock('@/lib/products/products-handler-shared', () => ({
  createObservedProductsSourceRunner: mockCreateObservedProductsSourceRunner,
}));

vi.mock('@/lib/products/products-list-service', () => ({
  resolveLiveProductsList: mockResolveLiveProductsList,
}));

vi.mock('@/lib/persistence/product-catalog', () => ({
  persistProductsSnapshot: mockPersistProductsSnapshot,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock('@/lib/server/admin-auth', () => ({
  resolveAdminAccessFromToken: vi.fn(async () => null),
}));

vi.mock('@/lib/ai/normalize-products', () => ({
  normalizeProductTitlesWithStats: vi.fn(async (titles: string[]) => ({
    map: new Map(titles.map((title) => [title, title])),
    stats: {
      requestedTitles: titles.length,
      uniqueTitles: titles.length,
      memoryHits: 0,
      dbHits: 0,
      heuristicCount: 0,
      fallbackCount: titles.length,
      deferredCount: 0,
      dbUpsertAttempted: 0,
      dbUpserted: 0,
      fallbackRatePct: 100,
      fallbackReasons: {
        heuristic: 0,
        deferred: 0,
        error: 0,
      },
    },
  })),
}));

vi.mock('@/lib/scrapers/mexx', () => ({ fetchMexxProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/venex', () => ({ fetchVenexProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/fullh4rd', () => ({ fetchFullh4rdProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/maximus', () => ({ fetchMaximusProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/gezatek', () => ({ fetchGezatekProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/compugarden', () => ({ fetchCompugardenProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/compragamer', () => ({ searchCompraGamerProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/woocommerce', () => ({ fetchAllWooCommerceSearch: vi.fn(async () => []) }));

describe('/api/search route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetModules();
    mockGetSharedCache.mockReset();
    mockSetSharedCache.mockReset();
    mockCheckRateLimit.mockReset();
    mockRecordEndpointRequestEvent.mockReset();
    mockReadProductsFromDatabase.mockReset();
    mockPersistProductsSnapshot.mockReset();
    mockCreateObservedProductsSourceRunner.mockClear();
    mockResolveLiveProductsList.mockReset();
    mockLoggerError.mockReset();
    mockLoggerWarn.mockReset();
    mockRecordCatalogRefreshDemand.mockReset();

    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      resetAtMs: Date.now() + 60000,
      retryAfterSeconds: 60,
    });
    mockGetSharedCache.mockResolvedValue(undefined);
    mockReadProductsFromDatabase.mockResolvedValue([]);
    mockResolveLiveProductsList.mockResolvedValue([]);
  });

  it('returns an empty payload without touching DB when there is no search intent', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.products).toEqual([]);
    expect(mockReadProductsFromDatabase).not.toHaveBeenCalled();
  });

  it('serves DB-first search results before falling back to live scraping', async () => {
    mockReadProductsFromDatabase.mockResolvedValue([{
      id: 'cpu-1',
      name: 'Ryzen 7600',
      category: 'procesadores',
      brand: 'AMD',
      model: '7600',
      description: 'CPU',
      image: '/pixel-box.svg',
      specs: {},
      prices: [],
      lowestPrice: 1,
      highestPrice: 1,
      averagePrice: 1,
      createdAt: new Date('2026-03-08T12:00:00.000Z'),
      updatedAt: new Date('2026-03-08T12:00:00.000Z'),
    }]);

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=ryzen'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pagination.total).toBe(1);
    expect(mockSetSharedCache).toHaveBeenCalled();
  });

  it('bypasses cached search responses when refresh=1', async () => {
    mockGetSharedCache.mockResolvedValue({
      products: [{
        id: 'cached-cpu',
        name: 'Cached Ryzen',
        category: 'procesadores',
        brand: 'AMD',
        model: 'cached',
        description: 'CPU',
        image: '/pixel-box.svg',
        specs: {},
        prices: [],
        lowestPrice: 1,
        highestPrice: 1,
        averagePrice: 1,
        createdAt: new Date('2026-03-08T12:00:00.000Z'),
        updatedAt: new Date('2026-03-08T12:00:00.000Z'),
      }],
      pagination: {
        limit: 1,
        offset: 0,
        total: 1,
        totalPages: 1,
        page: 1,
        pageSize: 12,
      },
      facets: { categories: [], brands: [], stores: [] },
    });

    mockReadProductsFromDatabase.mockResolvedValue([{
      id: 'fresh-cpu',
      name: 'Fresh Ryzen',
      category: 'procesadores',
      brand: 'AMD',
      model: 'fresh',
      description: 'CPU',
      image: '/pixel-box.svg',
      specs: {},
      prices: [],
      lowestPrice: 2,
      highestPrice: 2,
      averagePrice: 2,
      createdAt: new Date('2026-03-08T12:00:00.000Z'),
      updatedAt: new Date('2026-03-08T12:00:00.000Z'),
    }]);

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=ryzen&refresh=1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.products[0]?.id).toBe('fresh-cpu');
    expect(response.headers.get('X-Search-Cache')).toBe('DB-STALE');
    expect(mockReadProductsFromDatabase).toHaveBeenCalled();
  });

  it('keeps empty current results honest without scraping on a public visit', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?category=procesadores'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.pagination).toMatchObject({ total: 0, page: 1, totalPages: 0 });
    expect(mockReadProductsFromDatabase).toHaveBeenCalledWith(expect.objectContaining({ onlyCurrentOffers: true }));
    expect(mockResolveLiveProductsList).not.toHaveBeenCalled();
    expect(mockPersistProductsSnapshot).not.toHaveBeenCalled();
  });

  it('passes opt-in historical references separately from current search', async () => {
    const { GET } = await import('./route');
    await GET(new NextRequest('http://localhost/api/search?q=rtx+5090&includeUnavailable=1'));
    expect(mockReadProductsFromDatabase).toHaveBeenCalledWith(expect.objectContaining({ onlyCurrentOffers: false }));
    expect(mockGetSharedCache).toHaveBeenCalledWith('search-response-v2', expect.stringContaining('references=1'));
  });

  it('habilita revisión de ofertas sólo al propagar un refresh autenticado', async () => {
    vi.stubEnv('INTERNAL_REFRESH_SECRET', 'internal-refresh-test-secret');
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?category=procesadores&stores=mexx,venex,maximus&bypassDb=1&refresh=1', {
      headers: { 'x-internal-refresh': 'internal-refresh-test-secret' },
    }));
    expect(response.status).toBe(200);
    expect(mockResolveLiveProductsList).toHaveBeenCalledWith('procesadores', undefined, expect.any(Function), true, new Set(['mexx', 'venex', 'maximus']));
  });

  it('queues public production demand instead of scraping stores on a catalog miss', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    vi.stubEnv('ENABLE_PUBLIC_LIVE_SCRAPING', '');

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=ryzen%207600'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Cache')).toBe('CATALOG-PENDING');
    expect(payload.products).toEqual([]);
    expect(mockResolveLiveProductsList).not.toHaveBeenCalled();
    expect(mockRecordCatalogRefreshDemand).toHaveBeenCalledWith({
      query: 'ryzen 7600',
      category: 'procesadores',
    });
  });

  it('rejects bypassDb when x-internal-refresh is the spoofable value 1', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=ryzen&bypassDb=1', {
      headers: { 'x-internal-refresh': '1' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/admin/i);
  });

  it('preserves RPC totals and page two without slicing or filtering the page', async () => {
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    mockReadProductsFromDatabase.mockResolvedValue({ products: [{ id: 'target50', prices: [], updatedAt: new Date() }], total: 1501, totalPages: 126, page: 2, pageSize: 12 });
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=target50&page=2&stores=MEXX,mexx'));
    const payload = await response.json();
    expect(payload.pagination).toMatchObject({ total: 1501, page: 2, offset: 12, totalPages: 126 });
    expect(payload.products.map((p: { id: string }) => p.id)).toEqual(['target50']);
    expect(mockReadProductsFromDatabase).toHaveBeenCalledWith(expect.objectContaining({ page: 2, storeIds: new Set(['mexx']) }));
    expect(mockSetSharedCache).toHaveBeenCalledWith('search-response-v2', expect.any(String), expect.any(Object), expect.any(Number));
  });

  it('returns 503 without scraping or caching when catalog RPC fails', async () => {
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    mockReadProductsFromDatabase.mockRejectedValue(new Error('database unavailable'));
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=target50'));
    expect(response.status).toBe(503);
    expect(mockResolveLiveProductsList).not.toHaveBeenCalled();
    expect(mockSetSharedCache).not.toHaveBeenCalled();
  });

  it('uses fixtures only in explicitly enabled stable mode without reading the database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    mockReadProductsFromDatabase.mockRejectedValue(new Error('unavailable'));
    const { GET } = await import('./route');
    expect((await GET(new NextRequest('http://localhost/api/search?category=procesadores'))).status).toBe(200);
    expect(mockReadProductsFromDatabase).not.toHaveBeenCalled();
    expect(mockResolveLiveProductsList).not.toHaveBeenCalled();
  });

  function cachedMouse(otherCurrentOffer = false): Product {
    const now = new Date('2026-10-07T18:00:00Z');
    const cheap = { storeId: 'mexx', storeName: 'Mexx', price: 100, stock: 'in-stock' as const,
      url: 'https://www.mexx.com.ar/mouse-logitech-g502', installment: null,
      lastUpdated: new Date('2026-10-06T17:59:59Z') };
    return {
      id: 'mouse', name: 'Mouse Logitech G502', brand: 'Logitech', model: 'G502', category: 'perifericos', specs: {},
      prices: [cheap, ...(otherCurrentOffer ? [{ ...cheap, storeId: 'venex', storeName: 'Venex',
        url: 'https://www.venex.com.ar/mouse-logitech-g502', price: 200, lastUpdated: now }] : [])],
      lowestPrice: 100, highestPrice: otherCurrentOffer ? 200 : 100, averagePrice: otherCurrentOffer ? 150 : 100,
      createdAt: now, updatedAt: now,
    };
  }

  function cachedPage(item: Product) {
    return { products: [item], pagination: { limit: 1, offset: 12, total: 40, totalPages: 4, page: 2, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
  }

  it.each([true, false])('relee SQL con mismos filtros cuando vence mínimo (otra actual=%s), sin filtrar la página', async (otherCurrentOffer) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T18:00:00Z'));
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    mockGetSharedCache.mockResolvedValue(cachedPage(cachedMouse(otherCurrentOffer)));
    const replacement = { ...cachedMouse(), id: 'replacement', prices: [], lowestPrice: 80 };
    const databasePage = { products: [replacement], total: 25, totalPages: 3, page: 2, pageSize: 12 };
    mockReadProductsFromDatabase.mockResolvedValue(databasePage);
    const { GET } = await import('./route');

    const response = await GET(new NextRequest('http://localhost/api/search?q=mouse&category=perifericos&sortBy=price-asc&page=2&minPrice=0&maxPrice=150&stores=venex,mexx'));
    const payload = await response.json();

    expect(mockReadProductsFromDatabase).toHaveBeenCalledExactlyOnceWith({ query: 'mouse', category: 'perifericos',
      minPrice: 0, maxPrice: 150, storeIds: new Set(['venex', 'mexx']), sortBy: 'price-asc', page: 2, pageSize: 12, onlyCurrentOffers: true });
    expect(payload.products.map((item: Product) => item.id)).toEqual(['replacement']);
    expect(payload.pagination).toMatchObject({ total: 25, totalPages: 3, page: 2, offset: 12 });
    expect(mockResolveLiveProductsList).not.toHaveBeenCalled();
    expect(mockRecordEndpointRequestEvent).toHaveBeenCalledTimes(1);
  });

  it('conserva ventana pública 24h y referencias opt-in sin renovar observaciones', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T18:00:00Z'));
    const item = cachedMouse();
    item.prices[0].lastUpdated = new Date('2026-10-07T14:00:00Z');
    mockGetSharedCache.mockResolvedValue(cachedPage(item));
    const { GET } = await import('./route');
    const publicPayload = await (await GET(new NextRequest('http://localhost/api/search?q=mouse'))).json();
    expect(publicPayload.products[0].prices[0].lastUpdated).toBe('2026-10-07T14:00:00.000Z');
    mockGetSharedCache.mockResolvedValue(cachedPage(cachedMouse()));
    expect((await GET(new NextRequest('http://localhost/api/search?q=mouse&includeUnavailable=1'))).headers.get('X-Search-Cache')).toBe('HIT');
    expect(mockReadProductsFromDatabase).not.toHaveBeenCalled();
  });

  it('revalida tras esperar demanda y relee una vez si la última oferta vence durante la espera', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T18:00:00Z'));
    const item = cachedMouse();
    item.prices[0].lastUpdated = new Date('2026-10-06T18:00:01Z');
    item.updatedAt = new Date('2026-10-07T17:00:00Z');
    mockGetSharedCache.mockResolvedValue(cachedPage(item));
    mockRecordCatalogRefreshDemand.mockImplementationOnce(async () => vi.setSystemTime(new Date('2026-10-07T18:00:02Z')));
    mockReadProductsFromDatabase.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    const { GET } = await import('./route');
    const payload = await (await GET(new NextRequest('http://localhost/api/search?q=mouse'))).json();
    expect(payload.products).toEqual([]);
    expect(payload.pagination.total).toBe(0);
    expect(mockReadProductsFromDatabase).toHaveBeenCalledTimes(1);
    expect(mockRecordEndpointRequestEvent).toHaveBeenCalledTimes(1);
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

vi.mock('server-only', () => ({}));

const mockGetSharedCache = vi.fn();
const mockSetSharedCache = vi.fn();
const mockReadProductByIdFromDatabase = vi.fn();
const mockReadProductsFromDatabase = vi.fn();
const mockResolveAdminAccessFromToken = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn(() => ({}));
const mockGetRequestIp = vi.fn(() => '127.0.0.1');
const mockRecordEndpointRequestEvent = vi.fn();
const mockRunObservedStoreScrape = vi.fn(async ({ run }) => run());
const mockFetchWooCommerceProductById = vi.fn();
const mockFetchAllWooCommerceSearch = vi.fn(async () => []);
const mockFetchProductDescriptionFromUrl = vi.fn();
const mockPersistProductsSnapshot = vi.fn();
const mockWithPromiseTimeout = vi.fn(async (promise: Promise<unknown>) => promise);
const mockWithAbortTimeout = vi.fn(async (runner: (signal: AbortSignal) => Promise<unknown>) => runner(new AbortController().signal));
const mockRecordCatalogRefreshDemand = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock('@/lib/server/shared-cache', () => ({
  getSharedCache: mockGetSharedCache,
  setSharedCache: mockSetSharedCache,
}));

vi.mock('@/lib/persistence/product-read', () => ({
  readProductByIdFromDatabase: mockReadProductByIdFromDatabase,
  readProductsFromDatabase: mockReadProductsFromDatabase,
  readProductsPageFromDatabase: async (params: { page: number; pageSize: number }) => {
    const value = await mockReadProductsFromDatabase(params);
    return Array.isArray(value) ? { products: value, total: value.length, totalPages: value.length ? 1 : 0, page: 1, pageSize: params.pageSize } : value;
  },
}));

vi.mock('@/lib/server/admin-auth', () => ({
  resolveAdminAccessFromToken: mockResolveAdminAccessFromToken,
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

vi.mock('@/lib/scrapers/woocommerce', () => ({
  fetchAllWooCommerceCategory: vi.fn(async () => []),
  fetchAllWooCommerceSearch: mockFetchAllWooCommerceSearch,
  fetchWooCommerceProductById: mockFetchWooCommerceProductById,
}));

vi.mock('@/lib/scrapers/product-description', () => ({
  fetchProductDescriptionFromUrl: mockFetchProductDescriptionFromUrl,
  isWeakProductDescription: vi.fn(() => false),
}));

vi.mock('@/lib/persistence/product-catalog', () => ({
  persistProductsSnapshot: mockPersistProductsSnapshot,
}));

vi.mock('@/lib/catalog/refresh-demand', () => ({
  recordCatalogRefreshDemand: mockRecordCatalogRefreshDemand,
}));

vi.mock('@/lib/async/with-abort-timeout', () => ({
  withPromiseTimeout: mockWithPromiseTimeout,
  withAbortTimeout: mockWithAbortTimeout,
}));

vi.mock('@/lib/scrapers/mexx', () => ({ fetchMexxProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/venex', () => ({ fetchVenexProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/fullh4rd', () => ({ fetchFullh4rdProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/compragamer', () => ({
  fetchCompraGamerProducts: vi.fn(async () => []),
  searchCompraGamerProducts: vi.fn(async () => []),
}));
vi.mock('@/lib/scrapers/maximus', () => ({ fetchMaximusProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/gamingcity', () => ({
  fetchGamingCityProducts: vi.fn(async () => []),
  getGamingCityCategoryUrl: vi.fn(() => ''),
}));
vi.mock('@/lib/scrapers/gezatek', () => ({ fetchGezatekProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/compugarden', () => ({ fetchCompugardenProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/foxtienda', () => ({
  fetchAllFoxtiendaCategory: vi.fn(async () => []),
  fetchAllFoxtiendaSearch: vi.fn(async () => []),
  fetchFoxtiendaProductById: vi.fn(async () => null),
}));
vi.mock('@/lib/scrapers/logg', () => ({ fetchLoggProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/portaltech', () => ({
  fetchPortalTechCategory: vi.fn(async () => []),
  fetchPortalTechProductById: vi.fn(async () => null),
  fetchPortalTechProducts: vi.fn(async () => []),
}));
vi.mock('@/lib/scrapers/prestashop', () => ({
  fetchAllPrestashopCategory: vi.fn(async () => []),
  fetchAllPrestashopSearch: vi.fn(async () => []),
}));
vi.mock('@/lib/scrapers/qloud', () => ({
  fetchAllQloudCategory: vi.fn(async () => []),
  fetchAllQloudSearch: vi.fn(async () => []),
}));
vi.mock('@/lib/scrapers/tiendanube', () => ({
  fetchAllTiendaNubeCategory: vi.fn(async () => []),
  fetchAllTiendaNubeSearch: vi.fn(async () => []),
  fetchTiendaNubeProductById: vi.fn(async () => null),
}));
vi.mock('@/lib/scrapers/wiztech', () => ({
  fetchWiztechCategory: vi.fn(async () => []),
  fetchWiztechProductById: vi.fn(async () => null),
  fetchWiztechProducts: vi.fn(async () => []),
}));
vi.mock('@/lib/scrapers/xtpc', () => ({
  fetchXtpcCategory: vi.fn(async () => []),
  fetchXtpcProductById: vi.fn(async () => null),
  fetchXtpcProducts: vi.fn(async () => []),
}));

const sampleProduct: Product = {
  id: 'gpu-123-rtx-5070',
  name: 'Placa De Video RTX 5070',
  category: 'tarjetas-graficas',
  brand: 'NVIDIA',
  model: 'RTX 5070',
  description: 'GPU',
  image: '/pixel-box.svg',
  specs: {},
  prices: [{
    storeId: 'venex',
    storeName: 'Venex',
    url: 'https://example.com/gpu',
    price: 1200000,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-03-08T12:00:00.000Z'),
  }],
  lowestPrice: 1200000,
  highestPrice: 1200000,
  averagePrice: 1200000,
  createdAt: new Date('2026-03-08T12:00:00.000Z'),
  updatedAt: new Date('2026-03-08T12:00:00.000Z'),
};

describe('/api/products route', () => {
  it('serves explicitly enabled stable list fixtures without a database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    mockReadProductsFromDatabase.mockRejectedValue(new Error('unavailable'));
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?category=procesadores'));
    expect(response.status).toBe(200);
    expect((await response.json()).pagination.pageSize).toBe(12);
    expect(mockReadProductsFromDatabase).not.toHaveBeenCalled();
  });
  it('preserves the RPC page, total and list filters', async () => {
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    mockReadProductsFromDatabase.mockResolvedValue({ products: [{ ...sampleProduct, id: 'target50' }], total: 1501, totalPages: 126, page: 2, pageSize: 12 });
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?q=target50&page=2&stores=MEXX,mexx&minPrice=20&maxPrice=10&sort=price-asc'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.pagination).toMatchObject({ total: 1501, page: 2, offset: 12, totalPages: 126 });
    expect(payload.products[0].id).toBe('target50');
    expect(mockReadProductsFromDatabase).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 12, minPrice: 10, maxPrice: 20, sortBy: 'price-asc', storeIds: new Set(['mexx']) }));
  });

  it('distinguishes an empty catalog page from an unavailable database', async () => {
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '1');
    mockReadProductsFromDatabase.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 48 });
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?page=99&pageSize=99'));
    expect(response.status).toBe(200);
    expect((await response.json()).pagination).toMatchObject({ page: 1, total: 0, pageSize: 48 });
    mockReadProductsFromDatabase.mockRejectedValue(new Error('database unavailable'));
    expect((await GET(new NextRequest('http://localhost/api/products?category=procesadores'))).status).toBe(503);
    expect(mockRunObservedStoreScrape).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.stubEnv('DISABLE_INTERNAL_BACKGROUND_REFRESH', '1');
    vi.resetModules();
    mockGetSharedCache.mockReset();
    mockSetSharedCache.mockReset();
    mockReadProductByIdFromDatabase.mockReset();
    mockReadProductsFromDatabase.mockReset();
    mockResolveAdminAccessFromToken.mockReset();
    mockCheckRateLimit.mockReset();
    mockRecordEndpointRequestEvent.mockReset();
    mockFetchWooCommerceProductById.mockReset();
    mockFetchAllWooCommerceSearch.mockReset();
    mockFetchProductDescriptionFromUrl.mockReset();
    mockPersistProductsSnapshot.mockReset();
    mockRecordCatalogRefreshDemand.mockReset();
    mockWithPromiseTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    mockWithAbortTimeout.mockImplementation(async (runner: (signal: AbortSignal) => Promise<unknown>) => runner(new AbortController().signal));

    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      limit: 50,
      remaining: 49,
      resetAtMs: Date.now() + 60000,
      retryAfterSeconds: 60,
    });
    mockGetSharedCache.mockResolvedValue(undefined);
    mockReadProductByIdFromDatabase.mockResolvedValue(null);
    mockReadProductsFromDatabase.mockResolvedValue([]);
    mockFetchWooCommerceProductById.mockResolvedValue(null);
    mockFetchAllWooCommerceSearch.mockResolvedValue([]);
    mockPersistProductsSnapshot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    { time: '2026-03-08T12:00:00.000Z', suffix: '' },
    { time: '2026-03-08T13:00:00.000Z', suffix: '-STALE' },
  ])('expires detail cache from its original write despite repeated hits across replicas ($suffix)', async ({ time, suffix }) => {
    vi.useFakeTimers();
    const startedAt = new Date(time).getTime();
    vi.setSystemTime(startedAt);
    const cache = new Map<string, { value: Product | null; expiresAt: number }>();
    cache.set(`product-detail:${sampleProduct.id}`, {
      value: { ...sampleProduct, prices: [] },
      expiresAt: startedAt + 60 * 60 * 1000,
    });
    mockGetSharedCache.mockImplementation(async (scope: string, key: string) => {
      const entry = cache.get(`${scope}:${key}`);
      return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
    });
    mockSetSharedCache.mockImplementation(async (scope: string, key: string, value: Product | null, ttlMs: number) => {
      cache.set(`${scope}:${key}`, { value, expiresAt: Date.now() + ttlMs });
    });
    mockReadProductByIdFromDatabase.mockResolvedValue(sampleProduct);
    const { GET } = await import('./route');
    const { DETAIL_CACHE_TTL_MS } = await import('@/lib/products/products-handler-shared');
    const request = () => new NextRequest(`http://localhost/api/products?id=${sampleProduct.id}`);

    expect((await GET(request())).headers.get('X-Product-Cache')).toBe(`DB${suffix}`);
    expect(mockSetSharedCache).toHaveBeenCalledWith('product-detail-v2', sampleProduct.id, expect.any(Object), DETAIL_CACHE_TTL_MS);
    vi.setSystemTime(startedAt + DETAIL_CACHE_TTL_MS / 2);
    expect((await GET(request())).headers.get('X-Product-Cache')).toBe(`HIT${suffix}`);

    // A new module instance shares the backend, not process-local route state.
    vi.resetModules();
    const { GET: replicaGET } = await import('./route');
    vi.setSystemTime(startedAt + DETAIL_CACHE_TTL_MS - 1);
    expect((await replicaGET(request())).headers.get('X-Product-Cache')).toBe(`HIT${suffix}`);
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledTimes(1);
    expect(mockSetSharedCache).toHaveBeenCalledTimes(1);
    expect(mockGetSharedCache).toHaveBeenCalledWith('product-detail-v2', sampleProduct.id);

    const refreshed = { ...sampleProduct, prices: [{ ...sampleProduct.prices[0], price: 1_100_000 }] };
    mockReadProductByIdFromDatabase.mockResolvedValue(refreshed);
    vi.setSystemTime(startedAt + DETAIL_CACHE_TTL_MS);
    const response = await replicaGET(request());
    expect(response.headers.get('X-Product-Cache')).toBe(`DB${suffix}`);
    await expect(response.json()).resolves.toMatchObject({ prices: [{ price: 1_100_000 }] });
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledTimes(2);
    expect(mockSetSharedCache).toHaveBeenCalledTimes(2);
  });

  it('reads and caches the complete database detail with all store offers', async () => {
    const completeProduct = {
      ...sampleProduct,
      prices: [...sampleProduct.prices, { ...sampleProduct.prices[0], storeId: 'mexx', storeName: 'Mexx', price: 1_100_000 }],
    };
    mockReadProductByIdFromDatabase.mockResolvedValue(completeProduct);
    const { GET } = await import('./route');
    const response = await GET(new NextRequest(`http://localhost/api/products?id=${sampleProduct.id}`));

    expect(response.status).toBe(200);
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledWith(sampleProduct.id);
    await expect(response.json()).resolves.toMatchObject({ prices: expect.arrayContaining([
      expect.objectContaining({ storeId: 'venex' }), expect.objectContaining({ storeId: 'mexx' }),
    ]) });
    expect(mockSetSharedCache.mock.calls[0][2].prices).toHaveLength(2);
  });

  it('returns not found without persisting a fallback when DB and scraping miss', async () => {
    vi.stubEnv('DISABLE_LIVE_SCRAPING', '0');
    vi.stubEnv('E2E_STABLE_MODE', '0');
    vi.stubEnv('CI_E2E', '0');
    const { GET } = await import('./route');
    const response = await GET(new NextRequest(`http://localhost/api/products?id=${sampleProduct.id}`));

    expect(response.status).toBe(404);
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledWith(sampleProduct.id);
    expect(mockFetchWooCommerceProductById).toHaveBeenCalled();
    expect(mockPersistProductsSnapshot).not.toHaveBeenCalled();
    expect(mockSetSharedCache).toHaveBeenCalledWith('product-detail-v2', sampleProduct.id, null, expect.any(Number));
  });

  it('falls back to DB even when a negative detail cache entry exists', async () => {
    mockGetSharedCache.mockResolvedValue(null);
    mockReadProductByIdFromDatabase.mockResolvedValue(sampleProduct);

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?id=gpu-123-rtx-5070'));

    expect(response.status).toBe(200);
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledWith('gpu-123-rtx-5070');
    await expect(response.json()).resolves.toMatchObject({ id: sampleProduct.id });
  });

  it('reads the database after an on-demand refresh even when a cached detail exists', async () => {
    mockGetSharedCache.mockResolvedValue(sampleProduct);
    const refreshed = { ...sampleProduct, prices: [{ ...sampleProduct.prices[0], price: 1_100_000 }] };
    mockReadProductByIdFromDatabase.mockResolvedValue(refreshed);

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?id=gpu-123-rtx-5070&preferDb=1'));

    expect(response.status).toBe(200);
    expect(mockReadProductByIdFromDatabase).toHaveBeenCalledWith(sampleProduct.id);
    expect(mockGetSharedCache).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ prices: [{ price: 1_100_000 }] });
  });

  it('records not found detail requests as unsuccessful telemetry events', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/products?id=missing-item'));

    expect(response.status).toBe(404);
    expect(mockRecordEndpointRequestEvent).toHaveBeenCalled();
    const telemetryEvent = mockRecordEndpointRequestEvent.mock.calls.at(-1)?.[0];
    expect(telemetryEvent?.success).toBe(false);
  });

  it('infers a GPU category for detail re-scrape instead of forcing procesadores', async () => {
    const { GET } = await import('./route');
    const request = new NextRequest('http://localhost/api/products?id=unknown-rtx-5070', {
      headers: {
        'x-internal-refresh': '1',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(mockFetchWooCommerceProductById).toHaveBeenCalledWith(
      'unknown-rtx-5070',
      'tarjetas-graficas',
      expect.any(Object),
    );
  });
});

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/cache/search-snapshot', () => ({
  snapshotProducts: vi.fn(),
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

  it('falls back to live category products when filter-only DB-first search is empty', async () => {
    const liveProduct = {
      id: 'live-cpu',
      name: 'Ryzen 9600X',
      category: 'procesadores',
      brand: 'AMD',
      model: '9600X',
      description: 'CPU',
      image: '/pixel-box.svg',
      specs: {},
      prices: [{
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://example.com/cpu',
        price: 1000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date('2026-03-08T12:00:00.000Z'),
      }],
      lowestPrice: 1000,
      highestPrice: 1000,
      averagePrice: 1000,
      createdAt: new Date('2026-03-08T12:00:00.000Z'),
      updatedAt: new Date('2026-03-08T12:00:00.000Z'),
    };

    mockReadProductsFromDatabase
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([liveProduct]);
    mockResolveLiveProductsList.mockResolvedValue([liveProduct]);

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?category=procesadores'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pagination.total).toBe(1);
    expect(payload.products[0]?.id).toBe('live-cpu');
    expect(response.headers.get('X-Search-Cache')).toBe('CATEGORY-MISS-DB');
    expect(mockResolveLiveProductsList).toHaveBeenCalledWith('procesadores', undefined, expect.any(Function));
  });
});
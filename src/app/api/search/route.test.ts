import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSharedCache = vi.fn();
const mockSetSharedCache = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn(() => ({}));
const mockGetRequestIp = vi.fn(() => '127.0.0.1');
const mockRecordEndpointRequestEvent = vi.fn();
const mockRunObservedStoreScrape = vi.fn(async ({ run }) => run());
const mockReadProductsPageFromDatabase = vi.fn();
const mockPersistProductsSnapshot = vi.fn();

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
  readProductsPageFromDatabase: mockReadProductsPageFromDatabase,
}));

vi.mock('@/lib/persistence/product-catalog', () => ({
  persistProductsSnapshot: mockPersistProductsSnapshot,
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
      geminiCount: 0,
      fallbackCount: titles.length,
      deferredFallbackCount: 0,
      geminiBatches: 0,
      geminiBatchFailures: 0,
      dbUpsertAttempted: 0,
      dbUpserted: 0,
      fallbackRatePct: 100,
      fallbackReasons: {
        no_ai: 0,
        quota_backoff: 0,
        deferred_budget: 0,
        batch_error: 0,
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
    mockReadProductsPageFromDatabase.mockReset();
    mockPersistProductsSnapshot.mockReset();

    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      resetAtMs: Date.now() + 60000,
      retryAfterSeconds: 60,
    });
    mockGetSharedCache.mockResolvedValue(undefined);
    mockReadProductsPageFromDatabase.mockResolvedValue({
      products: [],
      total: 0,
      totalPages: 0,
      page: 1,
      pageSize: 24,
    });
  });

  it('returns an empty payload without touching DB when there is no search intent', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.products).toEqual([]);
    expect(mockReadProductsPageFromDatabase).not.toHaveBeenCalled();
  });

  it('serves DB-first search results before falling back to live scraping', async () => {
    mockReadProductsPageFromDatabase.mockResolvedValue({
      products: [{
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
      }],
      total: 1,
      totalPages: 1,
      page: 1,
      pageSize: 24,
    });

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost/api/search?q=ryzen'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pagination.total).toBe(1);
    expect(mockSetSharedCache).toHaveBeenCalled();
  });
});

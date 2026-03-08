import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mockGetSharedCache = vi.fn();
const mockSetSharedCache = vi.fn();
const mockGetSnapshotProductById = vi.fn();
const mockSnapshotProducts = vi.fn();
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

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock('@/lib/server/shared-cache', () => ({
  getSharedCache: mockGetSharedCache,
  setSharedCache: mockSetSharedCache,
}));

vi.mock('@/lib/cache/search-snapshot', () => ({
  getSnapshotProductById: mockGetSnapshotProductById,
  snapshotProducts: mockSnapshotProducts,
}));

vi.mock('@/lib/persistence/product-read', () => ({
  readProductByIdFromDatabase: mockReadProductByIdFromDatabase,
  readProductsFromDatabase: mockReadProductsFromDatabase,
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
vi.mock('@/lib/scrapers/gezatek', () => ({ fetchGezatekProducts: vi.fn(async () => []) }));
vi.mock('@/lib/scrapers/compugarden', () => ({ fetchCompugardenProducts: vi.fn(async () => []) }));

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
  beforeEach(() => {
    vi.resetModules();
    mockGetSharedCache.mockReset();
    mockSetSharedCache.mockReset();
    mockGetSnapshotProductById.mockReset();
    mockSnapshotProducts.mockReset();
    mockReadProductByIdFromDatabase.mockReset();
    mockReadProductsFromDatabase.mockReset();
    mockResolveAdminAccessFromToken.mockReset();
    mockCheckRateLimit.mockReset();
    mockRecordEndpointRequestEvent.mockReset();
    mockFetchWooCommerceProductById.mockReset();
    mockFetchAllWooCommerceSearch.mockReset();
    mockFetchProductDescriptionFromUrl.mockReset();
    mockPersistProductsSnapshot.mockReset();
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
    mockGetSnapshotProductById.mockReturnValue(null);
    mockReadProductByIdFromDatabase.mockResolvedValue(null);
    mockReadProductsFromDatabase.mockResolvedValue([]);
    mockFetchWooCommerceProductById.mockResolvedValue(null);
    mockFetchAllWooCommerceSearch.mockResolvedValue([]);
    mockPersistProductsSnapshot.mockResolvedValue(undefined);
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

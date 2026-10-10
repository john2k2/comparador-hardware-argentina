import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { RateLimitResult } from '@/lib/server/rate-limit';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getSharedCache: vi.fn(),
  setSharedCache: vi.fn(),
  readProductsPageFromDatabase: vi.fn(),
  after: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/server/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rate-limit')>()),
  checkRateLimit: mocks.checkRateLimit,
  getRequestIp: () => '203.0.113.7',
}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: mocks.getSharedCache, setSharedCache: mocks.setSharedCache }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: mocks.readProductsPageFromDatabase }));
vi.mock('@/lib/catalog/refresh-demand', () => ({ recordCatalogRefreshDemand: vi.fn() }));
vi.mock('@/lib/search/search-live', () => ({ runLiveSearch: vi.fn() }));
vi.mock('@/lib/server/runtime-flags', () => ({ isStableRuntimeMode: () => false, shouldSkipLiveScraping: () => true }));
vi.mock('@/lib/telemetry/operational-metrics', () => ({ recordEndpointRequestEvent: vi.fn(), runObservedStoreScrape: vi.fn() }));

import { GET } from './search-route-handler';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { catalogPageResponse } from './search-handler-shared';

function rateLimit(allowed: boolean): RateLimitResult {
  return { allowed, limit: 30, remaining: allowed ? 29 : 0, resetAtMs: Date.now() + 60_000, retryAfterSeconds: 42 };
}

function freshProduct(id: string): Product {
  const fixture = getStableFixtureProducts({ category: 'procesadores', selectedStoreIds: new Set(), sortBy: 'relevance' })[0];
  const now = new Date();
  return { ...fixture, id, createdAt: now, updatedAt: now, lastScrapedAt: undefined, lastNormalizedAt: null,
    prices: fixture.prices.map((offer) => ({ ...offer, lastUpdated: new Date(Date.now() - 1000) })) };
}

function catalogPage(products: Product[]) {
  return { products, total: products.length, totalPages: 1, page: 1, pageSize: 12 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function searchRequest(query = 'ryzen 5600') {
  return new NextRequest(`https://www.comparador-hardware.com.ar/api/search?q=${encodeURIComponent(query)}`);
}

describe('/api/search rate limit, caché y escrituras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSharedCache.mockResolvedValue(undefined);
    mocks.setSharedCache.mockResolvedValue(undefined);
  });

  it('responde 429 sin exponer una página cacheada aunque la caché ya se haya leído', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(false));
    mocks.getSharedCache.mockResolvedValue(catalogPageResponse(catalogPage([freshProduct('cached-secret')])));

    const response = await GET(searchRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('cached-secret');
    expect(response.headers.get('X-Search-Cache')).toBeNull();
    expect(mocks.readProductsPageFromDatabase).not.toHaveBeenCalled();
  });

  it('no deja un rechazo sin observar si la caché falla en una solicitud limitada', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(false));
    mocks.getSharedCache.mockRejectedValue(new Error('cache transport down'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      expect((await GET(searchRequest())).status).toBe(429);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('lee la caché mientras espera el rate limit y la sirve sólo tras admitir la solicitud', async () => {
    const pendingLimit = deferred<RateLimitResult>();
    mocks.checkRateLimit.mockReturnValue(pendingLimit.promise);
    mocks.getSharedCache.mockResolvedValue(catalogPageResponse(catalogPage([freshProduct('cached-hit')])));

    const responsePromise = GET(searchRequest());
    await vi.waitFor(() => expect(mocks.getSharedCache).toHaveBeenCalledWith('search-response-v3', expect.any(String)));
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);

    pendingLimit.resolve(rateLimit(true));
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Cache')).toBe('HIT');
    expect((await response.json()).products[0].id).toBe('cached-hit');
    expect(mocks.readProductsPageFromDatabase).not.toHaveBeenCalled();
  });

  it('lee SQL tras una caché vacía resuelta en paralelo al rate limit', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(true));
    mocks.readProductsPageFromDatabase.mockResolvedValue(catalogPage([freshProduct('from-db')]));

    const response = await GET(searchRequest('ryzen 7600'));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Cache')).toBe('DB');
    expect((await response.json()).products[0].id).toBe('from-db');
    expect(mocks.getSharedCache).toHaveBeenCalledTimes(1);
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(1);
  });

  it('conserva una búsqueda admitida si falla la caché y SQL puede responder', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(true));
    mocks.getSharedCache.mockRejectedValue(new Error('cache transport down'));
    mocks.readProductsPageFromDatabase.mockResolvedValue(catalogPage([freshProduct('available-from-db')]));

    const response = await GET(searchRequest('ryzen 7700'));

    expect(response.status).toBe(200);
    expect((await response.json()).products[0].id).toBe('available-from-db');
    expect(mocks.readProductsPageFromDatabase).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Search-Cache')).toBe('DB');
  });

  it('no lee la caché en un refresh explícito', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(true));
    mocks.readProductsPageFromDatabase.mockResolvedValue(catalogPage([freshProduct('refreshed')]));

    const response = await GET(new NextRequest('https://www.comparador-hardware.com.ar/api/search?q=ryzen%205500&refresh=1'));

    expect(response.status).toBe(200);
    expect(mocks.getSharedCache).not.toHaveBeenCalled();
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(1);
  });

  it('mantiene un error visible si fallan la caché auxiliar y la lectura SQL', async () => {
    mocks.checkRateLimit.mockResolvedValue(rateLimit(true));
    mocks.getSharedCache.mockRejectedValue(new Error('cache transport down'));
    mocks.readProductsPageFromDatabase.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(searchRequest('ryzen 7900'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(mocks.setSharedCache).not.toHaveBeenCalled();
  });
});

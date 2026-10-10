import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
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

describe('Server-Timing de búsqueda pública', () => {
  let clock = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const json = NextResponse.json.bind(NextResponse);
    vi.spyOn(NextResponse, 'json').mockImplementation((body, init) => {
      clock += 2; // Serialización/creación, independiente de las promesas de IO.
      return json(body, init);
    });
    mocks.checkRateLimit.mockResolvedValue(rateLimit(true));
    mocks.getSharedCache.mockResolvedValue(undefined);
    mocks.setSharedCache.mockResolvedValue(undefined);
    mocks.readProductsPageFromDatabase.mockResolvedValue(catalogPage([freshProduct('timed-db')]));
  });
  afterEach(() => vi.restoreAllMocks());

  function timings(response: Response) {
    const header = response.headers.get('Server-Timing')!;
    const names = ['rate_limit', 'cache_read', 'database', 'cache_write', 'response', 'total'];
    const values = Object.fromEntries(header.split(', ').map(entry => {
      expect(entry).toMatch(/^[a-z_]+;dur=\d+\.\d{2}$/);
      const [name, duration] = entry.split(';dur=');
      return [name, Number(duration)];
    }));
    expect(Object.keys(values)).toEqual(names);
    expect(Object.values(values).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    return values;
  }

  it('mide HIT desde el inicio de caché, conserva admisión y documenta el solapamiento', async () => {
    const cached = deferred<ReturnType<typeof catalogPageResponse>>(), limit = deferred<RateLimitResult>();
    const payload = catalogPageResponse(catalogPage([freshProduct('timed-hit')]));
    const snapshot = JSON.stringify(payload);
    mocks.getSharedCache.mockReturnValue(cached.promise);
    mocks.checkRateLimit.mockReturnValue(limit.promise);
    const pending = GET(searchRequest('private-query-marker'));
    expect(mocks.getSharedCache).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    clock = 10;
    cached.resolve(payload);
    await new Promise(resolve => setImmediate(resolve));
    expect(mocks.readProductsPageFromDatabase).not.toHaveBeenCalled();
    clock = 40;
    limit.resolve(rateLimit(true));
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Cache')).toBe('HIT');
    expect(timings(response)).toEqual({ rate_limit: 40, cache_read: 10,
      database: 0, cache_write: 0, response: 2, total: 42 });
    expect(await response.json()).toEqual(JSON.parse(snapshot));
    expect(JSON.stringify(payload)).toBe(snapshot);
  });

  it('mide lectura DB y escritura esperada en un MISS sin cambiar precios ni fechas', async () => {
    const page = catalogPage([freshProduct('timed-db')]);
    const expected = JSON.parse(JSON.stringify(catalogPageResponse(page)));
    mocks.readProductsPageFromDatabase.mockImplementation(async () => { clock += 25; return page; });
    mocks.setSharedCache.mockImplementation(async () => { clock += 11; });
    const response = await GET(searchRequest('private-query-marker'));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Search-Cache')).toBe('DB');
    expect(timings(response)).toEqual({ rate_limit: 0, cache_read: 0,
      database: 25, cache_write: 11, response: 2, total: 38 });
    expect(await response.json()).toEqual(expected);
    expect(mocks.readProductsPageFromDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(1);
  });

  it('mide el rechazo DB y no expone query, IP, bearer, URL o mensajes en el header', async () => {
    mocks.getSharedCache.mockRejectedValue(new Error('private-cache-error'));
    mocks.readProductsPageFromDatabase.mockImplementation(async () => {
      clock += 19; throw new Error('private-SQL-error SELECT * FROM products');
    });
    const request = new NextRequest('https://www.comparador-hardware.com.ar/api/search?q=private-query-marker',
      { headers: { authorization: 'Bearer private-token-marker', 'x-forwarded-for': '198.51.100.99' } });
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(timings(response)).toEqual({ rate_limit: 0, cache_read: 0,
      database: 19, cache_write: 0, response: 2, total: 21 });
    expect(response.headers.get('Server-Timing')).not.toMatch(/private|198\.51|203\.0|https|SELECT|products/);
    expect(await response.json()).toEqual({ error: 'Error al buscar productos de manera global' });
    expect(mocks.setSharedCache).not.toHaveBeenCalled();
  });

  it('mide espera por consumidor sin duplicar lectura ni escritura coalescidas', async () => {
    const database = deferred<ReturnType<typeof catalogPage>>();
    const page = catalogPage([freshProduct('timed-shared')]);
    mocks.readProductsPageFromDatabase.mockReturnValue(database.promise);
    const first = GET(searchRequest('timed-shared-query'));
    await new Promise(resolve => setImmediate(resolve));
    expect(mocks.readProductsPageFromDatabase).toHaveBeenCalledTimes(1);
    clock = 5;
    const second = GET(searchRequest('timed-shared-query'));
    await new Promise(resolve => setImmediate(resolve));
    expect(mocks.readProductsPageFromDatabase).toHaveBeenCalledTimes(1);
    clock = 20;
    database.resolve(page);
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(timings(firstResponse).database).toBe(20);
    expect(timings(secondResponse).database).toBe(15);
    expect(await firstResponse.json()).toEqual(await secondResponse.json());
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.setSharedCache).toHaveBeenCalledTimes(1);
  });

  it('conserva 503 y mide una escritura que rechaza, sin diferirla', async () => {
    mocks.readProductsPageFromDatabase.mockImplementation(async () => {
      clock += 17; return catalogPage([freshProduct('timed-write-error')]);
    });
    mocks.setSharedCache.mockImplementation(async () => { clock += 11; throw new Error('private-write-error'); });
    const response = await GET(searchRequest('timed-write-rejection'));
    expect(response.status).toBe(503);
    expect(timings(response)).toEqual({ rate_limit: 0, cache_read: 0,
      database: 17, cache_write: 11, response: 2, total: 30 });
    expect(response.headers.get('Server-Timing')).not.toContain('private-write-error');
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it('responde 429 sin esperar caché pendiente y mide sólo hasta responder', async () => {
    const cached = deferred<undefined>();
    mocks.getSharedCache.mockReturnValue(cached.promise);
    mocks.checkRateLimit.mockImplementation(async () => { clock += 7; return rateLimit(false); });
    const response = await GET(searchRequest('private-limited-query'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(response.headers.get('X-Search-Cache')).toBeNull();
    expect(timings(response)).toEqual({ rate_limit: 7, cache_read: 9,
      database: 0, cache_write: 0, response: 2, total: 9 });
    expect(mocks.readProductsPageFromDatabase).not.toHaveBeenCalled();
    const snapshot = response.headers.get('Server-Timing');
    clock = 100;
    cached.resolve(undefined);
    await new Promise(resolve => setImmediate(resolve));
    expect(response.headers.get('Server-Timing')).toBe(snapshot);
  });
});

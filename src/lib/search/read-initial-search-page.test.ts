import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { readPage, getCache, setCache, afterMock } = vi.hoisted(() => ({ readPage: vi.fn(), getCache: vi.fn(), setCache: vi.fn(), afterMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({ ...await importOriginal<typeof import('next/server')>(), after: afterMock }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: readPage }));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache: getCache, setSharedCache: setCache }));
import { readInitialSearchPage } from './read-initial-search-page';
import { parseSearchState } from './search-state';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';

import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { buildSearchCacheKey, catalogPageResponse, SEARCH_CACHE_TTL_MS } from './search-handler-shared';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import type { Product } from '@/lib/types';

const NOW = new Date();
const cachedPages = new Map<string, unknown>();
function product(id = 'target50'): Product {
  const fixture = getStableFixtureProducts({ category: 'procesadores', selectedStoreIds: new Set(), sortBy: 'relevance' })[0];
  return { ...fixture, id, createdAt: new Date(NOW), updatedAt: new Date(NOW), lastScrapedAt: undefined, lastNormalizedAt: null,
    prices: fixture.prices.map(offer => ({ ...offer, lastUpdated: new Date(Date.now() - 1000) })) };
}
function page(products = [product()], pageNumber = 1) {
  return { products, total: 1501, totalPages: 126, page: pageNumber, pageSize: 12 };
}
function cacheKey(params: Record<string, string> = { q: 'ryzen 5600' }) {
  const state = parseSearchState(params);
  return buildSearchCacheKey({ ...state, stores: new Set(state.stores.map(id => id.toLowerCase())) });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  cachedPages.clear();
  getCache.mockImplementation(async (_scope, key) => cachedPages.get(key));
  setCache.mockImplementation(async (_scope, key, value) => { cachedPages.set(key, value); });
  // Sin contexto de request, after() lanza y la escritura se espera como antes.
  afterMock.mockImplementation(() => { throw new Error('outside request scope'); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('initial catalog page', () => {
  it('includes historical references only when explicitly requested', async () => {
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    await readInitialSearchPage(parseSearchState({ q: 'rtx 5090', includeUnavailable: '1' }));
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ onlyCurrentOffers: false }));
  });
  it('preserves page two and totals beyond the former cap', async () => {
    readPage.mockResolvedValue(page([product()], 2));
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 7600', page: '2', stores: 'MEXX,mexx' }));
    expect(result.products).toEqual([expect.objectContaining({ id: 'target50' })]);
    expect(result.pagination).toMatchObject({ total: 1501, page: 2, offset: 12 });
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ category: 'procesadores', storeIds: new Set(['mexx']), onlyCurrentOffers: true }));
  });

  it('propagates database failure instead of producing empty hydration data', async () => {
    readPage.mockRejectedValue(new Error('unavailable'));
    await expect(readInitialSearchPage(parseSearchState({ category: 'procesadores' }))).rejects.toThrow('unavailable');
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    expect((await readInitialSearchPage(parseSearchState({ category: 'procesadores', page: '50' }))).pagination).toMatchObject({ total: 0, page: 1 });
  });

  it('supports explicitly enabled fixtures without a database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    const page = await readInitialSearchPage(parseSearchState({ category: 'procesadores' }));
    expect(page.pagination.total).toBe(2);
    expect(page.products.map(product => product.id)).toEqual(['fixture-ryzen-5600', 'fixture-ryzen-5700x']);
    expect(page.products.every(product => getRecentProductOffers(product).length === 2)).toBe(true);
    expect(readPage).not.toHaveBeenCalled();
  });

  it('reuses the API cache including original observation dates and all pagination fields without another RPC', async () => {
    const payload = catalogPageResponse(page([product()], 2));
    cachedPages.set(cacheKey({ q: 'ryzen 5600', page: '2' }), JSON.parse(JSON.stringify(payload)));
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', page: '2' }));
    expect(result).toEqual(payload);
    expect(result.products[0].prices[0].lastUpdated).toEqual(payload.products[0].prices[0].lastUpdated);
    expect(readPage).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
  });

  it('shares twenty simultaneous SSR misses as one RPC and one existing cache write', async () => {
    const pending = deferred<ReturnType<typeof page>>();
    const started = deferred<void>();
    readPage.mockImplementation(() => { started.resolve(); return pending.promise; });
    const requests = Array.from({ length: 20 }, () => readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' })));
    await started.promise;
    expect(readPage).toHaveBeenCalledTimes(1);
    pending.resolve(page());
    const results = await Promise.all(requests);
    expect(results.every(result => result.products[0].id === 'target50' && result.pagination.total === 1501)).toBe(true);
    expect(getCache).toHaveBeenCalledTimes(1);
    expect(setCache).toHaveBeenCalledTimes(1);
    expect(setCache).toHaveBeenCalledWith('search-response-v2', cacheKey(), expect.any(Object), SEARCH_CACHE_TTL_MS);
    await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }));
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('keeps queries, category, page, ordering, stores, both price bounds and references in separate keys', async () => {
    readPage.mockImplementation(async (params) => page([product(JSON.stringify({ ...params, storeIds: [...params.storeIds] }))], params.page));
    const variants = [
      {}, { q: 'ryzen 7600' }, { category: 'motherboards' }, { page: '2' },
      { sortBy: 'price-desc' }, { stores: 'mexx' }, { minPrice: '100000' },
      { maxPrice: '500000' }, { includeUnavailable: '1' },
    ];
    const states = variants.map(variant => parseSearchState({ q: 'ryzen 5600', ...variant }));
    const results = await Promise.all(states.map(readInitialSearchPage));
    expect(readPage).toHaveBeenCalledTimes(states.length);
    expect(new Set(getCache.mock.calls.map(call => call[1])).size).toBe(states.length);
    expect(new Set(results.map(result => result.products[0].id)).size).toBe(states.length);
    expect(results[3].pagination).toMatchObject({ page: 2, total: 1501 });
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ onlyCurrentOffers: false }));
  });

  it('normalizes duplicated store IDs and shares equivalent filters', async () => {
    const pending = deferred<ReturnType<typeof page>>();
    const started = deferred<void>();
    readPage.mockImplementation(() => { started.resolve(); return pending.promise; });
    const first = readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', stores: 'MEXX,venex,mexx' }));
    const second = readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', stores: 'venex,mexx' }));
    await started.promise;
    pending.resolve(page());
    await Promise.all([first, second]);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ storeIds: new Set(['mexx', 'venex']) }));
  });

  it('rejects a cached page with no current offers without changing its pagination after filtering', async () => {
    const stale = product('old');
    stale.prices = stale.prices.map(offer => ({ ...offer, lastUpdated: new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1) }));
    cachedPages.set(cacheKey(), catalogPageResponse(page([stale])));
    readPage.mockResolvedValue(page([product('new')], 2));
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }));
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(result.products[0].id).toBe('new');
    expect(result.pagination).toMatchObject({ total: 1501, page: 2, offset: 12 });
  });

  it('rereads when the cached cheapest offer expired even if a dearer one is still current', async () => {
    const staleMinimum = product('old-minimum');
    staleMinimum.prices[0].lastUpdated = new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1);
    cachedPages.set(cacheKey(), catalogPageResponse(page([staleMinimum])));
    const newMinimum = product('new-minimum');
    newMinimum.prices = [newMinimum.prices[1]];
    newMinimum.lowestPrice = newMinimum.prices[0].price;
    readPage.mockResolvedValue(page([newMinimum]));
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }));
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(result.products[0].lowestPrice).toBe(newMinimum.lowestPrice);
  });

  it('revalidates after awaiting a shared cache write and rereads once if the minimum expired', async () => {
    const almostExpired = product('near-expiry');
    almostExpired.prices[0].lastUpdated = new Date(Date.now() - CATALOG_OFFER_FRESH_MS + 1000);
    readPage.mockResolvedValueOnce(page([almostExpired])).mockImplementationOnce(async () => page([product('current')]));
    setCache.mockImplementationOnce(async (_scope, key, value) => {
      cachedPages.set(key, value);
      vi.setSystemTime(Date.now() + 1001);
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }))));
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(results.every(result => result.products[0].id === 'current')).toBe(true);
  });

  it('bounds retries and does not cache a SQL page that is already ineligible', async () => {
    const stale = product();
    stale.prices = stale.prices.map(offer => ({ ...offer, lastUpdated: new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1) }));
    readPage.mockResolvedValue(page([stale]));
    await expect(readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }))).rejects.toThrow('NO_LONGER_CURRENT');
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(setCache).not.toHaveBeenCalled();
  });

  it('allows explicit historical references from cache while retaining their old dates', async () => {
    const old = product();
    old.prices = old.prices.map(offer => ({ ...offer, lastUpdated: new Date(Date.now() - CATALOG_OFFER_FRESH_MS - 1) }));
    const payload = catalogPageResponse(page([old]));
    cachedPages.set(cacheKey({ q: 'ryzen 5600', includeUnavailable: '1' }), payload);
    expect(await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', includeUnavailable: '1' }))).toEqual(payload);
    expect(readPage).not.toHaveBeenCalled();
  });

  it('releases a failed shared read and propagates failure to every caller without caching an empty page', async () => {
    const pending = deferred<ReturnType<typeof page>>();
    const started = deferred<void>();
    readPage.mockImplementation(() => { started.resolve(); return pending.promise; });
    const requests = Array.from({ length: 5 }, () => readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' })));
    const settled = Promise.allSettled(requests);
    await started.promise;
    pending.reject(new Error('SQL unavailable'));
    expect((await settled).every(result => result.status === 'rejected')).toBe(true);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(setCache).not.toHaveBeenCalled();
    readPage.mockResolvedValue(page());
    expect((await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }))).products[0].id).toBe('target50');
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('treats cache transport failures as optional while preserving a real database result', async () => {
    getCache.mockRejectedValue(new Error('cache unavailable'));
    setCache.mockRejectedValue(new Error('cache write unavailable'));
    readPage.mockResolvedValue(page());
    expect((await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }))).pagination.total).toBe(1501);
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('entrega la página SSR sin esperar la escritura distribuida cuando hay contexto de request', async () => {
    const pendingWrite = deferred<void>();
    setCache.mockReturnValue(pendingWrite.promise);
    afterMock.mockImplementation(() => undefined);
    readPage.mockResolvedValue(page());
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600' }));
    expect(result.pagination.total).toBe(1501);
    expect(setCache).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledWith(expect.any(Promise));
    pendingWrite.resolve();
  });

  it('shares and caches a genuine empty SQL result without inventing fixture products', async () => {
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    expect((await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', page: '50' }))).pagination).toMatchObject({ total: 0, page: 1 });
    expect((await readInitialSearchPage(parseSearchState({ q: 'ryzen 5600', page: '50' }))).products).toEqual([]);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(setCache).toHaveBeenCalledTimes(1);
  });

});

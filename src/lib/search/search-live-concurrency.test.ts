import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scraperFns: Array.from({ length: 9 }, () => vi.fn()),
  runObservedStoreScrape: vi.fn(),
  withAbortTimeout: vi.fn(),
  withPromiseTimeout: vi.fn(),
  normalizeProductTitlesWithStats: vi.fn(),
  reviewProductOffers: vi.fn(),
  collectOfferSourceTitles: vi.fn(),
  persistProductsSnapshot: vi.fn(),
  setCachedSearchResponse: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/scrapers/scraper-registry', () => ({
  STORE_SCRAPERS: mocks.scraperFns.slice(0, 8).map((fn, index) => ({
    id: `store-${index}`,
    displayName: `Store ${index}`,
    fn,
  })),
  FRAMEWORK_SCRAPERS: [{
    id: 'framework',
    displayName: 'Framework',
    isFramework: true,
    fn: mocks.scraperFns[8],
  }],
}));

vi.mock('@/lib/async/with-abort-timeout', () => ({
  withAbortTimeout: mocks.withAbortTimeout,
  withPromiseTimeout: mocks.withPromiseTimeout,
}));

vi.mock('@/lib/telemetry/operational-metrics', () => ({
  runObservedStoreScrape: mocks.runObservedStoreScrape,
}));

vi.mock('@/lib/search/search-handler-shared', () => ({
  SCRAPER_TIMEOUT_MS: 25_000,
  PERSISTENCE_TIMEOUT_MS: 7_000,
  MAX_CONCURRENT_SCRAPERS: 3,
  shouldRunStore: (selectedStoreIds: Set<string>, storeId: string) => selectedStoreIds.size === 0 || selectedStoreIds.has(storeId.toLowerCase()),
  setCachedSearchResponse: mocks.setCachedSearchResponse,
}));

vi.mock('@/lib/ai/normalize-products', () => ({ normalizeProductTitlesWithStats: mocks.normalizeProductTitlesWithStats }));
vi.mock('@/lib/ai/review-product-offers', () => ({
  collectOfferSourceTitles: mocks.collectOfferSourceTitles,
  reviewProductOffers: mocks.reviewProductOffers,
}));
vi.mock('@/lib/persistence/product-catalog', () => ({ persistProductsSnapshot: mocks.persistProductsSnapshot }));
vi.mock('@/lib/cache/search-snapshot', () => ({ snapshotProducts: vi.fn() }));
vi.mock('@/lib/catalog/hardware-categories', () => ({
  inferHardwareCategoryFromName: vi.fn(() => undefined),
  resolveHardwareCategoryForProduct: vi.fn((_name: string, category: unknown) => category ?? 'perifericos'),
}));
vi.mock('@/lib/product-sanitizer', () => ({ sanitizeProducts: (products: unknown[]) => products }));
vi.mock('@/lib/products/normalize-product-content', () => ({ normalizeProductContent: (product: unknown) => product }));
vi.mock('@/lib/search/search-dedupe', () => ({
  filterProductStores: (product: unknown) => product,
  groupSearchProducts: (products: unknown[]) => products,
}));
vi.mock('@/lib/search/search-ranking', () => ({
  normalizeSearchText: (value: string) => value.toLowerCase(),
  matchesSearchQueryIntent: () => true,
  sortProductsBySearchRelevance: (products: unknown[]) => products,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn } }));

import { runLiveSearch } from './search-live';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

describe('runLiveSearch scraper concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runObservedStoreScrape.mockImplementation(async ({ run }: { run: () => Promise<unknown[]> }) => run());
    mocks.withAbortTimeout.mockImplementation(async (run: (signal: AbortSignal) => Promise<unknown[]>) => run(new AbortController().signal));
    mocks.withPromiseTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    mocks.reviewProductOffers.mockImplementation(async (products: unknown[]) => products);
    mocks.persistProductsSnapshot.mockResolvedValue(undefined);
    mocks.setCachedSearchResponse.mockResolvedValue(undefined);
    mocks.scraperFns.forEach((scraperFn) => scraperFn.mockReset());
  });

  it('starts at most three scrapers, fills one released slot, and never exceeds the limit', async () => {
    const pending = Array.from({ length: mocks.scraperFns.length }, () => deferred<unknown[]>());
    let active = 0;
    let peak = 0;
    const started: number[] = [];

    mocks.scraperFns.forEach((scraperFn, index) => {
      scraperFn.mockImplementation(() => {
        started.push(index);
        active += 1;
        peak = Math.max(peak, active);
        return pending[index].promise.finally(() => { active -= 1; });
      });
    });

    const search = runLiveSearch({
      query: 'ryzen',
      selectedStoreIds: new Set(),
      page: 1,
      sortBy: 'relevance',
      cacheKey: 'concurrency-test',
      bypassDb: true,
    });
    await flushMicrotasks();

    expect(started).toHaveLength(3);
    expect(active).toBe(3);
    expect(peak).toBe(3);

    pending[0].resolve([]);
    await flushMicrotasks();
    expect(started).toHaveLength(4);
    expect(active).toBe(3);
    expect(peak).toBe(3);

    for (let index = 1; index < pending.length; index += 1) {
      pending[index].resolve([]);
      await flushMicrotasks();
      expect(active).toBeLessThanOrEqual(3);
      expect(peak).toBe(3);
    }

    const result = await search;
    expect(started).toHaveLength(9);
    expect(active).toBe(0);
    expect(result.payload.products).toEqual([]);
  });
});

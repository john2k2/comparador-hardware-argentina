import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getServerSupabaseServiceClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  readBuilderCatalog: vi.fn(),
  getStoreScraper: vi.fn(),
  scrape: vi.fn(),
  reviewProductOffers: vi.fn(),
  buildPriceStateSignature: vi.fn(),
  withAbortTimeout: vi.fn(),
  withPromiseTimeout: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseServiceClient: mocks.getServerSupabaseServiceClient,
}));
vi.mock('@/lib/pc-builder/catalog', () => ({ readBuilderCatalog: mocks.readBuilderCatalog }));
vi.mock('@/lib/scrapers/scraper-registry', () => ({
  getStoreScraper: mocks.getStoreScraper,
  FRAMEWORK_SCRAPERS: [],
}));
vi.mock('@/lib/async/with-abort-timeout', () => ({
  withAbortTimeout: mocks.withAbortTimeout,
  withPromiseTimeout: mocks.withPromiseTimeout,
}));
vi.mock('@/lib/ai/review-product-offers', () => ({ reviewProductOffers: mocks.reviewProductOffers }));
vi.mock('@/lib/persistence/product-write-dedupe', () => ({ buildPriceStateSignature: mocks.buildPriceStateSignature }));

import { runRequestedRefresh } from './worker';
import type { RefreshJob, RefreshTarget } from './contracts';

const target: RefreshTarget = {
  productId: 'gpu-4060',
  storeId: 'mexx',
  url: 'https://store.example/gigabyte-rtx-4060',
};
const job: RefreshJob & { lease_token: string } = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  status: 'running',
  targets: [target],
  results: [],
  created_at: '2026-09-21T11:59:00.000Z',
  started_at: '2026-09-21T12:00:00.000Z',
  finished_at: null,
  expires_at: '2026-09-21T14:00:00.000Z',
  lease_token: 'lease-token-test',
};

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'category'>): Product {
  const prices = overrides.prices ?? [];
  const lowest = prices.length ? Math.min(...prices.map((item) => item.price)) : 0;
  return {
    brand: 'Gigabyte',
    model: overrides.name,
    specs: {},
    prices,
    lowestPrice: lowest,
    highestPrice: lowest,
    averagePrice: lowest,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T11:00:00.000Z'),
    ...overrides,
  };
}

function price(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'storeName' | 'price'>): ProductPrice {
  return {
    url: target.url,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-21T12:00:01.000Z'),
    ...overrides,
  };
}

function catalogProduct() {
  return product({ id: target.productId, name: 'Gigabyte GeForce RTX 4060 8GB', category: 'tarjetas-graficas' });
}

function sourceProduct(overrides: { name?: string; offer?: Partial<ProductPrice> } = {}): Product {
  return product({
    id: 'scraped-gpu',
    name: overrides.name ?? 'Gigabyte GeForce RTX 4060 Eagle 8GB',
    category: 'tarjetas-graficas',
    prices: [price({ storeId: target.storeId, storeName: 'Mexx', ...overrides.offer })],
  });
}

function configureFinalUpdate(data: Array<{ id: string }> = [{ id: job.id }], error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data, error });
  const gt = vi.fn(() => ({ select }));
  const eqStatus = vi.fn(() => ({ gt }));
  const eqLease = vi.fn(() => ({ eq: eqStatus }));
  const eqJob = vi.fn(() => ({ eq: eqLease }));
  const update = vi.fn(() => ({ eq: eqJob }));
  mocks.from.mockReturnValue({ update });
  return { select, update };
}

function configureClaimedJob(found: Product[] = [sourceProduct()]) {
  mocks.getServerSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.rpc.mockImplementation(async (name: string) => (
    name === 'claim_offer_refresh' ? { data: job, error: null } : { data: true, error: null }
  ));
  mocks.readBuilderCatalog.mockResolvedValue([catalogProduct()]);
  mocks.getStoreScraper.mockReturnValue({ id: 'mexx', displayName: 'Mexx', fn: mocks.scrape });
  mocks.scrape.mockResolvedValue(found);
  mocks.reviewProductOffers.mockImplementation(async (products: Product[]) => products);
  mocks.buildPriceStateSignature.mockReturnValue('signature-test');
  configureFinalUpdate();
}

describe('runRequestedRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:10:00.000Z'));
    mocks.withAbortTimeout.mockImplementation(async (run: (signal: AbortSignal) => Promise<unknown>) => run(new AbortController().signal));
    mocks.withPromiseTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    mocks.getServerSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.getStoreScraper.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns processed false for an empty claim without scraping', async () => {
    const result = await runRequestedRefresh();

    expect(result).toEqual({ processed: false });
    expect(mocks.getStoreScraper).not.toHaveBeenCalled();
    expect(mocks.scrape).not.toHaveBeenCalled();
  });

  it('matches the exact offer URL, persists the observed date, and passes the source title to review', async () => {
    const sourceTitle = 'Gigabyte GeForce RTX 4060 Eagle OC 8GB';
    configureClaimedJob([sourceProduct({
      name: sourceTitle,
      offer: { url: 'https://store.example/wrong-offer', price: 1 },
    }), sourceProduct({
      name: sourceTitle,
      offer: { url: target.url, price: 420_000, lastUpdated: new Date('2026-09-21T12:00:01.000Z') },
    })]);
    // The source helper above intentionally returns two products; only the exact URL is eligible.
    mocks.scrape.mockResolvedValueOnce([sourceProduct({ name: sourceTitle, offer: { url: 'https://store.example/wrong-offer', price: 1 } }), sourceProduct({ name: sourceTitle, offer: { url: target.url, price: 420_000 } })]);

    const result = await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');

    expect(result).toEqual({ processed: true, jobId: job.id, status: 'completed' });
    expect(mocks.reviewProductOffers).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Gigabyte GeForce RTX 4060 8GB' })],
      { authorizedRefresh: true, sourceTitles: { [target.url]: sourceTitle } },
    );
    expect(persistCall?.[1]).toMatchObject({
      p_url: target.url,
      p_price: 420_000,
      p_observed_at: '2026-09-21T12:00:01.000Z',
    });
  });

  it('does not persist or report success when the result is empty, mismatched, or stale', async () => {
    const scenarios: Product[][] = [
      [],
      [sourceProduct({ offer: { url: 'https://store.example/other-offer' } })],
      [sourceProduct({ offer: { lastUpdated: new Date('2026-09-21T11:59:59.000Z') } })],
    ];

    for (const found of scenarios) {
      vi.clearAllMocks();
      mocks.withAbortTimeout.mockImplementation(async (run: (signal: AbortSignal) => Promise<unknown>) => run(new AbortController().signal));
      mocks.withPromiseTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
      configureClaimedJob(found);
      const result = await runRequestedRefresh();

      expect(result).toEqual({ processed: true, jobId: job.id, status: 'failed' });
      expect(mocks.rpc.mock.calls.some(([name]) => name === 'persist_requested_offer')).toBe(false);
    }
  });

  it('persists a current out-of-stock offer as unavailable', async () => {
    configureClaimedJob([sourceProduct({ offer: { stock: 'out-of-stock', price: 420_000 } })]);

    const result = await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');

    expect(result.status).toBe('completed');
    expect(persistCall?.[1]).toMatchObject({ p_stock: 'out-of-stock' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ state: 'unavailable' })] }));
  });

  it('keeps an RTX 4060 versus RTX 4070 conflict pending without sending it to Jev', async () => {
    configureClaimedJob([sourceProduct({ name: 'Gigabyte GeForce RTX 4070 Eagle 12GB', offer: { price: 700_000 } })]);

    await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');

    expect(mocks.reviewProductOffers).toHaveBeenCalledWith([], { authorizedRefresh: true, sourceTitles: {} });
    expect(persistCall?.[1].p_review).toMatchObject({ status: 'needs-review', reason: 'explicit-conflict' });
  });

  it('marks a rejected persistence RPC as failed instead of updated', async () => {
    configureClaimedJob();
    mocks.rpc.mockImplementation(async (name: string) => (
      name === 'claim_offer_refresh' ? { data: job, error: null } : { data: null, error: { message: 'lease rejected' } }
    ));

    const result = await runRequestedRefresh();
    const update = mocks.from.mock.results[0].value.update;

    expect(result.status).toBe('failed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ state: 'failed' })] }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ state: 'updated' })] }));
  });

  it('throws REFRESH_LEASE_EXPIRED when the final update returns no valid lease row', async () => {
    configureClaimedJob();
    configureFinalUpdate([]);

    await expect(runRequestedRefresh()).rejects.toThrow('REFRESH_LEASE_EXPIRED');
  });
});

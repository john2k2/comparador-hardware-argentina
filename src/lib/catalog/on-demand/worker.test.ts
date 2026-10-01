import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  getServerSupabaseServiceClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  readBuilderCatalog: vi.fn(),
  getStoreScraper: vi.fn(),
  scrape: vi.fn(),
  compraGamerCatalog: vi.fn(),
  reviewProductOffers: vi.fn(),
  buildPriceStateSignature: vi.fn(),
  withAbortTimeout: vi.fn(),
  withPromiseTimeout: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/scrapers/compragamer', () => ({ fetchCompraGamerCatalogProducts: mocks.compraGamerCatalog }));
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

import { runRequestedRefresh, fetchKnownOffer, createKnownOfferContext } from './worker';
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
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ state: 'updated', comparable: true })],
    }));
  });

  it('busca una publicación de CompraGamer por ID aunque el título agrupado sea anterior', async () => {
    const currentTarget = { productId: 'mother-msi', storeId: 'compragamer', url: 'https://compragamer.com/producto/Mother_MSI_PRO_B650M_B_AM5_18056' };
    const grouped = product({ id: currentTarget.productId, name: 'Mother MSI PRO B650M-B DDR5 AM5 (Serie 7000/8000) (4797)', category: 'motherboards' });
    const observed = product({ id: 'cg-18056', name: 'Mother MSI PRO B650M-B AM5', category: 'motherboards', prices: [price({ storeId: 'compragamer', storeName: 'CompraGamer', price: 146_200, url: currentTarget.url })] });
    configureClaimedJob([observed]);
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_offer_refresh'
      ? { data: { ...job, targets: [currentTarget] }, error: null } : { data: true, error: null });
    mocks.readBuilderCatalog.mockResolvedValue([grouped]);
    expect((await runRequestedRefresh()).status).toBe('completed');
    expect(mocks.scrape).toHaveBeenCalledWith(expect.objectContaining({ query: '18056', selectedStoreIds: new Set(['compragamer']) }));
    expect(mocks.rpc).toHaveBeenCalledWith('persist_requested_offer', expect.objectContaining({ p_price: 146_200, p_url: currentTarget.url }));
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

  it('busca RAM por atributos comunes pero bloquea el conflicto real de serie en la URL exacta', async () => {
    const ramTarget = { productId: 'ram', storeId: 'mexx', url: 'https://store.example/corsair-vengeance-lpx-16gb-ddr4' };
    const grouped = product({ id: 'ram', name: 'CORSAIR VENGEANCE RS 16GB DDR4 3200 RGB', category: 'memoria-ram' });
    const observed = product({ id: 'source-ram', name: 'Corsair Vengeance LPX 16GB DDR4', category: 'memoria-ram',
      prices: [price({ storeId: 'mexx', storeName: 'Mexx', price: 100_000, url: ramTarget.url })] });
    configureClaimedJob([observed]);
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_offer_refresh'
      ? { data: { ...job, targets: [ramTarget] }, error: null } : { data: true, error: null });
    mocks.readBuilderCatalog.mockResolvedValue([grouped]);
    await runRequestedRefresh();
    expect(mocks.scrape).toHaveBeenCalledWith(expect.objectContaining({ query: 'CORSAIR 16gb ddr4' }));
    expect(mocks.rpc).toHaveBeenCalledWith('persist_requested_offer', expect.objectContaining({
      p_review: expect.objectContaining({ status: 'needs-review', reason: 'explicit-conflict' }),
    }));
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ comparable: false })],
    }));
  });

  it('persists a current out-of-stock offer as unavailable', async () => {
    configureClaimedJob([sourceProduct({ offer: { stock: 'out-of-stock', price: 420_000 } })]);

    const result = await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');

    expect(result.status).toBe('completed');
    expect(persistCall?.[1]).toMatchObject({ p_stock: 'out-of-stock' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ state: 'unavailable', comparable: false })] }));
  });

  it('keeps an RTX 4060 versus RTX 4070 conflict pending without sending it to Jev', async () => {
    configureClaimedJob([sourceProduct({ name: 'Gigabyte GeForce RTX 4070 Eagle 12GB', offer: { price: 700_000 } })]);

    await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');

    expect(mocks.reviewProductOffers).toHaveBeenCalledWith([], { authorizedRefresh: true, sourceTitles: {} });
    expect(persistCall?.[1].p_review).toMatchObject({ status: 'needs-review', reason: 'explicit-conflict' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ state: 'updated', comparable: false })],
    }));
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

  it('conserva una revisión pendiente si el revisor no devuelve otra nueva', async () => {
    configureClaimedJob([sourceProduct({ offer: { price: 420_000 } })]);
    const previous = price({ storeId: target.storeId, storeName: 'Mexx', price: 100,
      identityReview: { version: 1, status: 'needs-review', reason: 'provider-unavailable', reviewedAt: null,
        model: null, confidence: null, subject: { name: 'gpu', category: 'tarjetas-graficas', url: target.url } } });
    mocks.readBuilderCatalog.mockResolvedValue([{ ...catalogProduct(), prices: [previous] }]);
    await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_requested_offer');
    expect(persistCall?.[1].p_review).toMatchObject({ status: 'needs-review', reason: 'provider-unavailable' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ comparable: false })],
    }));
  });

  it('throws REFRESH_LEASE_EXPIRED when the final update returns no valid lease row', async () => {
    configureClaimedJob();
    configureFinalUpdate([]);

    await expect(runRequestedRefresh()).rejects.toThrow('REFRESH_LEASE_EXPIRED');
  });
});

it('comparte una lectura de publicación entre dos fichas sin compartir su dictamen de identidad', async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  configureClaimedJob([sourceProduct({ offer: { price: 420_000 } })]);
  mocks.withAbortTimeout.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => fn(new AbortController().signal));
  mocks.withPromiseTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  const context = createKnownOfferContext();
  const original = catalogProduct();
  const different = { ...original, id: 'other-id', name: 'Gigabyte RTX 4070 12GB' };
  const started = Date.parse('2026-09-21T12:00:00Z');
  vi.setSystemTime(new Date('2026-09-21T12:00:02Z'));
  const first = await fetchKnownOffer(original, target, started, context);
  const second = await fetchKnownOffer(different, { ...target, productId: different.id }, started, context);
  expect(mocks.scrape).toHaveBeenCalledTimes(1);
  expect(context.sharedReads).toBe(1);
  expect(first).not.toBeNull();
  expect(first?.price.identityReview).toBeUndefined();
  expect(second?.price.identityReview?.reason).toBe('explicit-conflict');
  vi.useRealTimers();
});


describe('adaptive known offers', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:02Z'));
    mocks.withAbortTimeout.mockImplementation(async (fn: (signal: AbortSignal) => Promise<unknown>) => fn(new AbortController().signal));
    mocks.withPromiseTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  });
  afterEach(() => vi.useRealTimers());
  it('observa un precio con stock desconocido sólo en el catálogo, sin inventar disponibilidad', async () => {
    configureClaimedJob([sourceProduct({ offer: { price:420000,stock:'unknown' } })]);
    const started=Date.parse('2026-09-21T12:00:00Z');
    expect(await fetchKnownOffer(catalogProduct(),target,started)).toBeNull();
    const observation=await fetchKnownOffer(catalogProduct(),target,started,createKnownOfferContext(true));
    expect(observation?.price.stock).toBe('unknown');
  });
  it('comparte el feed de CompraGamer entre categorías y mantiene separada la revisión de cada ficha', async () => {
    const offer={ ...target,storeId:'compragamer',url:'https://compragamer.com/producto/12345' };
    const source={ ...sourceProduct({ offer:{storeId:'compragamer',url:'https://compragamer.com/producto/gpu_12345',price:420000} }) };
    mocks.compraGamerCatalog.mockResolvedValue([source]);
    const context=createKnownOfferContext(true),started=Date.parse('2026-09-21T12:00:00Z');
    const valid=await fetchKnownOffer(catalogProduct(),offer,started,context);
    const wrong=await fetchKnownOffer({ ...catalogProduct(),category:'almacenamiento' },offer,started,context);
    expect(mocks.compraGamerCatalog).toHaveBeenCalledTimes(1);
    expect(valid?.price.price).toBe(420000);
    expect(valid?.price.identityReview).toBeUndefined();
    expect(wrong?.price.identityReview?.reason).toBe('explicit-conflict');
    expect(valid?.price.identityReview).toBeUndefined();
  });
  it('no presenta una PC completa mal categorizada como un componente comparable', async () => {
    const source = { ...sourceProduct({ name:'PC Intel i7 12700 con SSD 240GB',offer:{price:900000} }),category:'almacenamiento' as const };
    configureClaimedJob([source]);
    const observation=await fetchKnownOffer({ ...catalogProduct(),name:'PC Intel i7 12700 con SSD 240GB',category:'almacenamiento' },target,Date.parse('2026-09-21T12:00:00Z'),createKnownOfferContext(true));
    expect(observation?.price.identityReview?.reason).toBe('explicit-conflict');
  });

});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { SourceHttpError } from '@/lib/scrapers/source-http';

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
  knownDetail: vi.fn<typeof import('@/lib/scrapers/known-product-detail').fetchKnownProductDetail>(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/scrapers/compragamer', () => ({ fetchCompraGamerCatalogProducts: mocks.compraGamerCatalog }));
vi.mock('@/lib/scrapers/known-product-detail', () => ({ fetchKnownProductDetail: mocks.knownDetail }));
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
import { extractRefreshClaimDiagnostic } from '../refresh-diagnostics';

const target: RefreshTarget = {
  productId: 'gpu-4060',
  storeId: 'mexx',
  url: 'https://mexx.com.ar/gigabyte-rtx-4060',
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
    prices: [price({ storeId: target.storeId, storeName: 'Mexx', price: 420_000, ...overrides.offer })],
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
      offer: { url: 'https://mexx.com.ar/wrong-offer', price: 1 },
    }), sourceProduct({
      name: sourceTitle,
      offer: { url: target.url, price: 420_000, lastUpdated: new Date('2026-09-21T12:00:01.000Z') },
    })]);
    // The source helper above intentionally returns two products; only the exact URL is eligible.
    mocks.scrape.mockResolvedValueOnce([sourceProduct({ name: sourceTitle, offer: { url: 'https://mexx.com.ar/wrong-offer', price: 1 } }), sourceProduct({ name: sourceTitle, offer: { url: target.url, price: 420_000 } })]);

    const result = await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_verified_requested_offer');

    expect(result).toEqual({ processed: true, jobId: job.id, status: 'completed',
      attempted: 1, observed: 1, comparable: 1, failures: {} });
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
    expect(mocks.rpc).toHaveBeenCalledWith('persist_verified_requested_offer', expect.objectContaining({ p_price: 146_200, p_url: currentTarget.url }));
  });

  it('does not persist or report success when the result is empty, mismatched, or stale', async () => {
    const scenarios: Product[][] = [
      [],
      [sourceProduct({ offer: { url: 'https://mexx.com.ar/other-offer' } })],
      [sourceProduct({ offer: { lastUpdated: new Date('2026-09-21T11:59:59.000Z') } })],
    ];

    for (const found of scenarios) {
      vi.clearAllMocks();
      mocks.withAbortTimeout.mockImplementation(async (run: (signal: AbortSignal) => Promise<unknown>) => run(new AbortController().signal));
      mocks.withPromiseTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
      configureClaimedJob(found);
      const result = await runRequestedRefresh();

      expect(result).toEqual({ processed: true, jobId: job.id, status: 'failed',
        attempted: 1, observed: 0, comparable: 0, failures: { 'no-observation': 1 } });
      expect(mocks.rpc.mock.calls.some(([name]) => name === 'persist_verified_requested_offer')).toBe(false);
    }
  });

  it('busca RAM por atributos comunes pero bloquea el conflicto real de serie en la URL exacta', async () => {
    const ramTarget = { productId: 'ram', storeId: 'mexx', url: 'https://mexx.com.ar/corsair-vengeance-lpx-16gb-ddr4' };
    const grouped = product({ id: 'ram', name: 'CORSAIR VENGEANCE RS 16GB DDR4 3200 RGB', category: 'memoria-ram' });
    const observed = product({ id: 'source-ram', name: 'Corsair Vengeance LPX 16GB DDR4', category: 'memoria-ram',
      prices: [price({ storeId: 'mexx', storeName: 'Mexx', price: 100_000, url: ramTarget.url })] });
    configureClaimedJob([observed]);
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_offer_refresh'
      ? { data: { ...job, targets: [ramTarget] }, error: null } : { data: true, error: null });
    mocks.readBuilderCatalog.mockResolvedValue([grouped]);
    await runRequestedRefresh();
    expect(mocks.scrape).toHaveBeenCalledWith(expect.objectContaining({ query: 'CORSAIR 16gb ddr4' }));
    expect(mocks.rpc).toHaveBeenCalledWith('persist_verified_requested_offer', expect.objectContaining({
      p_review: expect.objectContaining({ status: 'needs-review', reason: 'explicit-conflict' }),
    }));
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ comparable: false })],
    }));
  });

  it('persists a current out-of-stock offer as unavailable', async () => {
    configureClaimedJob([sourceProduct({ offer: { stock: 'out-of-stock', price: 420_000 } })]);

    const result = await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_verified_requested_offer');

    expect(result.status).toBe('completed');
    expect(result).toMatchObject({ attempted: 1, observed: 1, comparable: 0, failures: {} });
    expect(persistCall?.[1]).toMatchObject({ p_stock: 'out-of-stock' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({ results: [expect.objectContaining({ state: 'unavailable', comparable: false })] }));
  });

  it('keeps an RTX 4060 versus RTX 4070 conflict pending without sending it to Jev', async () => {
    configureClaimedJob([sourceProduct({ name: 'Gigabyte GeForce RTX 4070 Eagle 12GB', offer: { price: 700_000 } })]);

    await runRequestedRefresh();
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_verified_requested_offer');

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
    expect(result).toMatchObject({ attempted: 1, observed: 0, comparable: 0, failures: { 'persist-failed': 1 } });
    expect(mocks.rpc).toHaveBeenCalledWith('persist_verified_requested_offer', expect.objectContaining({
      p_price: 420_000, p_url: target.url,
    }));
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
    const persistCall = mocks.rpc.mock.calls.find(([name]) => name === 'persist_verified_requested_offer');
    expect(persistCall?.[1].p_review).toMatchObject({ status: 'needs-review', reason: 'insufficient-evidence' });
    expect(mocks.from.mock.results[0].value.update).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ comparable: false })],
    }));
  });

  it('throws REFRESH_LEASE_EXPIRED when the final update returns no valid lease row', async () => {
    configureClaimedJob();
    configureFinalUpdate([]);

    await expect(runRequestedRefresh()).rejects.toThrow('REFRESH_LEASE_EXPIRED');
  });

  it.each(['response', 'rejection'])('identifica el claim fallido por %s sin reintentar ni revelar el SDK', async (mode) => {
    const raw = { code: 'PGRST003', message: 'PRIVATE_CREDENTIAL', details: 'private SQL', hint: 'private URL' };
    mocks.rpc.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(17);
      if (mode === 'rejection') throw raw;
      return { data: null, error: raw };
    });
    const error = await runRequestedRefresh().catch(error => error);
    expect(error.message).toBe('REFRESH_CLAIM_FAILED');
    expect(extractRefreshClaimDiagnostic(error)).toEqual({ rpc: 'claim_offer_refresh',
      phase: 'requested', batchIndex: 1, limit: 1, elapsedMs: 17, code: 'PGRST003' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.readBuilderCatalog).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE_CREDENTIAL|private SQL|private URL/);
  });

  it('conserva las observaciones guardadas en un resultado parcial y distingue una ficha ausente', async () => {
    configureClaimedJob();
    const missing = { ...target, productId: 'missing-product', url: 'https://mexx.com.ar/missing-product' };
    mocks.rpc.mockImplementation(async (name: string) => name === 'claim_offer_refresh'
      ? { data: { ...job, targets: [target, missing] }, error: null } : { data: true, error: null });
    const result = await runRequestedRefresh();
    expect(result).toMatchObject({ status: 'partial', attempted: 2, observed: 1, comparable: 1,
      failures: { 'product-not-found': 1 } });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'persist_verified_requested_offer')).toHaveLength(1);
  });

  it('registra un fallo de procesamiento sin contarlo como observación ni copiar su mensaje', async () => {
    configureClaimedJob();
    mocks.readBuilderCatalog.mockRejectedValueOnce(new Error('PRIVATE_CREDENTIAL'));
    const result = await runRequestedRefresh();
    expect(result).toMatchObject({ status: 'failed', attempted: 1, observed: 0, comparable: 0,
      failures: { 'processing-failed': 1 } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CREDENTIAL');
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'persist_verified_requested_offer')).toBe(false);
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
  it('el refresh solicitado lee primero la publicación exacta y conserva el estado observado', async () => {
    configureClaimedJob([sourceProduct()]);
    mocks.knownDetail.mockResolvedValueOnce(sourceProduct({ offer: { stock: 'out-of-stock', price: 415000 } }));
    const context = createKnownOfferContext(false);
    const observation = await fetchKnownOffer(catalogProduct(), target, Date.parse('2026-09-21T12:00:00Z'), context);
    expect(observation?.price).toMatchObject({ price: 415000, stock: 'out-of-stock' });
    expect(mocks.knownDetail).toHaveBeenCalledWith(target.url, expect.objectContaining({ id: 'mexx' }), 'tarjetas-graficas', expect.any(AbortSignal));
    expect(mocks.scrape).not.toHaveBeenCalled();
  });
  it('una contradicción en la ficha detiene el fallback aunque la búsqueda ofrezca el mismo enlace', async () => {
    configureClaimedJob([sourceProduct()]);
    mocks.knownDetail.mockRejectedValueOnce(new SourceHttpError('inconsistent-source'));
    const context = createKnownOfferContext(true);
    const observation = await fetchKnownOffer(catalogProduct(), target, Date.parse('2026-09-21T12:00:00Z'), context);
    expect(observation).toBeNull();
    expect(context.failures.get(target.url)).toBe('inconsistent-source');
    expect(mocks.scrape).not.toHaveBeenCalled();
  });

  it('la ausencia de un detalle soportado permite buscar la publicación exacta', async () => {
    configureClaimedJob([sourceProduct()]);
    mocks.knownDetail.mockResolvedValueOnce(null);
    const context = createKnownOfferContext(true);
    const observation = await fetchKnownOffer(catalogProduct(), target, Date.parse('2026-09-21T12:00:00Z'), context);
    expect(observation?.price.price).toBe(420000);
    expect(mocks.scrape).toHaveBeenCalledTimes(1);
    expect(context.failures.has(target.url)).toBe(false);
  });
  it('un título de plantilla sin resolver no produce observación aunque coincidan URL y precio', async () => {
    configureClaimedJob([sourceProduct({ name:'§ITEMTIT§', offer:{price:1} })]);
    expect(await fetchKnownOffer(catalogProduct(), target, Date.parse('2026-09-21T12:00:00Z'), createKnownOfferContext(true))).toBeNull();
  });
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
  it.each(['Mouse Trust Gamer', 'Teclado Logitech K120', 'Monitor Samsung 24 pulgadas'])('bloquea %s mal clasificado como procesador aunque la URL coincida', async (name) => {
    configureClaimedJob([{ ...sourceProduct({ name, offer:{price:100000} }), category:'procesadores' as const }]);
    const observation = await fetchKnownOffer({ ...catalogProduct(), name, category:'procesadores' }, target, Date.parse('2026-09-21T12:00:00Z'), createKnownOfferContext(true));
    expect(observation?.price.identityReview?.reason).toBe('explicit-conflict');
  });

  it.each([
    ['Memoria RAM Kingston 16GB DDR4 para notebook', 'memoria-ram'],
    ['CPU Cooler Deepcool AG400 (solo para PC armada)', 'refrigeracion'],
  ] as const)('no rechaza %s por mencionar el equipo compatible', async (name, category) => {
    configureClaimedJob([{ ...sourceProduct({ name, offer: { price: 100000 } }), category }]);
    const observation = await fetchKnownOffer({ ...catalogProduct(), name, category }, target,
      Date.parse('2026-09-21T12:00:00Z'), createKnownOfferContext(true));
    expect(observation).not.toBeNull();
    expect(observation?.price.identityReview).toBeUndefined();
  });

});

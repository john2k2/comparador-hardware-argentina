import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import sample from '../../../docs/reports/crecimiento-2026-09-12/G02-MUESTRA-PRIORITARIA.json';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), load: vi.fn(), fetch: vi.fn(), demands: vi.fn(), byId: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/seo/budget-guides-data', () => ({ BUDGET_GUIDES: [{ slug: 'test' }] }));
vi.mock('@/lib/seo/guide-catalog', () => ({ loadGuideCatalogProducts: mocks.load }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductByIdFromDatabase: mocks.byId }));
vi.mock('./demand-planning', async () => ({
  ...await vi.importActual<typeof import('./demand-planning')>('./demand-planning'), loadPriorityDemandPlan: mocks.demands,
}));
vi.mock('@/lib/ai/review-product-offers', () => ({ reviewProductOffers: async (products: Product[]) => products }));
vi.mock('@/lib/persistence/product-write-dedupe', () => ({ buildPriceStateSignature: () => 'test-signature' }));
vi.mock('./on-demand/worker', () => ({ fetchKnownOffer: mocks.fetch, createKnownOfferContext: () => ({ sources: new Map(), failures: new Map(), sharedReads: 0 }) }));
vi.mock('./priority-planning', async () => {
  const original = await vi.importActual<typeof import('./priority-planning')>('./priority-planning');
  return { ...original, planGuideGroups: () => [{ key: 'test/cpu', covered: false,
    targets: [{ productId: 'cpu', storeId: 'mexx', url: 'https://www.mexx.com.ar/cpu' }] }] };
});
import { runPriorityRefresh } from './priority-refresh';

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  vi.stubEnv('ENABLE_JEV_OFFER_REVIEW', '1'); vi.stubEnv('TYPESAFE_API_KEY', 'test-only-not-a-credential');
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null,
    data: name === 'check_api_rate_limit' ? { allowed: true } : true }));
  const price = { price: 100, stock: 'in-stock', storeId: 'mexx', url: 'https://www.mexx.com.ar/cpu', lastUpdated: new Date() };
  const product = { id: 'cpu', name: 'Ryzen 5 5600', category: 'procesadores', prices: [price] };
  mocks.load.mockResolvedValue([product]);
  mocks.fetch.mockResolvedValue({ product, price, sourceTitle: product.name });
  mocks.demands.mockResolvedValue({ demands: 0, products: [], groups: [], deferred: false });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('la falta de Jev no impide observar; el límite de ejecución sigue activo', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', '');
  mocks.rpc.mockResolvedValue({ error: null, data: { allowed: false } });
  expect(await runPriorityRefresh(false)).toMatchObject({ status: 'deferred', reason: 'PRIORITY_REFRESH_DEFERRED' });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('un error RPC o permiso mal formado falla sin presentar un diferimiento esperado', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: '57014' }, data: null });
  await expect(runPriorityRefresh(false)).rejects.toThrow('PRIORITY_GATE_FAILED');
  mocks.rpc.mockResolvedValueOnce({ error: null, data: {} });
  await expect(runPriorityRefresh(false)).rejects.toThrow('PRIORITY_GATE_INVALID_RESPONSE');
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.demands).not.toHaveBeenCalled();
});

it('el diferimiento no inventa conteos, ofertas ni piezas cubiertas', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: null, data: { allowed: false, retryAfterSeconds: 180 } });
  const result = await runPriorityRefresh(true);
  expect(result).toMatchObject({ status: 'deferred', includeSample: true, retryAfterSeconds: 180 });
  expect(result).not.toHaveProperty('observed'); expect(result).not.toHaveProperty('missingGuideSlots');
});

it('guías y muestra diaria se guardan antes de consumir demanda', async () => {
  const order: string[] = [];
  mocks.byId.mockImplementation(async (id: string) => {
    order.push('sample');
    return { ...((await mocks.load.mock.results[0].value)[0]), id, category: sample.products.find(item => item.id === id)!.category };
  });
  mocks.demands.mockImplementation(async () => { order.push('demand'); return { demands: 0, products: [], groups: [], deferred: false }; });
  const promise = runPriorityRefresh(true); await vi.runAllTimersAsync(); const result = await promise;
  expect(order).toEqual([...sample.products.map(() => 'sample'), 'demand']);
  expect(result).toMatchObject({ includeSample: true, demand: { status: 'completed', attempted: 0 } });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'persist_verified_priority_offer').length).toBeGreaterThan(1);
});

const demandProduct = (id: string) => ({ id, name: 'AMD Ryzen 5 7600', category: 'procesadores', prices: [] } as unknown as Product);
const demandPlan = (count = 1) => {
  const products = Array.from({ length: count }, (_, index) => demandProduct(`cpu-${index}`));
  return { demands: 3, products, deferred: false, groups: products.map(product => ({ key: `demand/${product.id}`, covered: false,
    targets: ['mexx', 'venex'].map(storeId => ({ productId: product.id, storeId, url: `https://www.${storeId}.com.ar/${product.id}` })) })) };
};

it('demanda guarda el destino exacto y la fecha observada, contando sólo ACK confirmado', async () => {
  mocks.demands.mockResolvedValue(demandPlan());
  mocks.fetch.mockImplementation(async (product: Product, target) => {
    const price = { ...target, price: 123, stock: 'in-stock', lastUpdated: new Date('2026-09-29T12:00:00Z') };
    return { product: { ...product, prices: [price] }, price, sourceTitle: product.name };
  });
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(result).toMatchObject({ demand: { source: 'search-request-signal', attempted: 1, observed: 1, comparable: 1, products: ['cpu-0'] } });
  expect(mocks.rpc).toHaveBeenLastCalledWith('persist_verified_priority_offer', expect.objectContaining({
    p_product_id: 'cpu-0', p_store_id: 'mexx', p_url: 'https://www.mexx.com.ar/cpu-0', p_observed_at: '2026-09-29T12:00:00.000Z', p_price: 123,
  }));
});

it('fallos de fuente o guardado no renuevan fechas ni inventan observaciones de demanda', async () => {
  mocks.demands.mockResolvedValue(demandPlan());
  mocks.fetch.mockImplementation(async (product: Product, target) => {
    if (target.storeId === 'mexx' && target.productId === 'cpu-0') return null;
    const price = { ...target, price: 100, stock: 'in-stock', lastUpdated: new Date() };
    return { product: { ...product, prices: [price] }, price, sourceTitle: product.name };
  });
  mocks.rpc.mockImplementation(async (name, args) => ({ error: null,
    data: name === 'check_api_rate_limit' ? { allowed: true } : args.p_product_id !== 'cpu-0' }));
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(result).toMatchObject({ demand: { attempted: 2, observed: 0, comparable: 0 },
    results: expect.arrayContaining([expect.objectContaining({ productId: 'cpu-0', observedAt: null, comparable: false })]) });
});

it('el error DB de demanda conserva las observaciones críticas y falla explícitamente', async () => {
  mocks.demands.mockRejectedValue(new Error('synthetic-private-sdk-message'));
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(result).toMatchObject({ status: 'failed', observed: 1, comparable: 1,
    demand: { status: 'failed', failureCode: 'PRIORITY_DEMAND_READ_FAILED', attempted: 0 } });
  expect(JSON.stringify(result)).not.toContain('synthetic-private-sdk-message');
});

it('preserva el máximo de diez intentos en la señal agregada', async () => {
  mocks.demands.mockResolvedValue(demandPlan(15)); mocks.fetch.mockResolvedValue(null);
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(result).toMatchObject({ demand: { attempted: 10, observed: 0, limitReached: true, status: 'deferred' } });
  expect(mocks.fetch).toHaveBeenCalledTimes(11);
});

it('no inicia otro destino sin reserva de fetch/revisión/DB; diferir demanda no marca deadline crítico', async () => {
  mocks.demands.mockResolvedValue(demandPlan(4));
  mocks.fetch.mockImplementation(async (_product, target) => {
    if (target.productId !== 'cpu') vi.setSystemTime(new Date(Date.now() + 51_000));
    return null;
  });
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(result).toMatchObject({ deadlineReached: false, demand: { status: 'deferred', attempted: 2 } });
});

it('persistencias de25s no acumulan un lote de ocho ni exceden tres minutos', async () => {
  mocks.demands.mockResolvedValue(demandPlan(15));
  const began: string[] = [], saved: string[] = [];
  let phaseStarted = 0;
  mocks.fetch.mockImplementation(async (product: Product, target) => {
    if (target.productId !== 'cpu') {
      if (!phaseStarted) phaseStarted = Date.now();
      began.push(target.productId); vi.setSystemTime(new Date(Date.now() + 1000));
    }
    const price = { ...target, price: 100, stock: 'in-stock', lastUpdated: new Date() };
    return { product: { ...product, prices: [price] }, price, sourceTitle: product.name };
  });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'check_api_rate_limit') return { error: null, data: { allowed: true } };
    if (args.p_product_id !== 'cpu') { saved.push(args.p_product_id); vi.setSystemTime(new Date(Date.now() + 25_000)); }
    expect(began.length).toBe(saved.length);
    return { error: null, data: true };
  });
  const promise = runPriorityRefresh(false); await vi.runAllTimersAsync(); const result = await promise;
  expect(began).toEqual(saved); expect(began.length).toBeLessThan(8);
  expect(Date.now() - phaseStarted).toBeLessThanOrEqual(180_000);
  expect(result).toMatchObject({ deadlineReached: false, demand: { status: 'deferred', observed: saved.length } });
});

it('cuenta solamente observaciones persistidas y nunca consume la cola pública', async () => {
  const promise = runPriorityRefresh(false);
  await vi.runAllTimersAsync();
  const result = await promise;
  expect(result).toMatchObject({ attempted: 1, observed: 1, comparable: 1, missingGuideSlots: [] });
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['check_api_rate_limit', 'persist_verified_priority_offer']);
  expect(mocks.rpc).toHaveBeenLastCalledWith('persist_verified_priority_offer', expect.objectContaining({
    p_run_started_at: '2026-09-29T12:00:00.000Z', p_observed_at: '2026-09-29T12:00:00.000Z', p_price: 100,
  }));
});

it('mantiene pendiente la pieza cuando la base rechaza el guardado', async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null,
    data: name === 'check_api_rate_limit' ? { allowed: true } : false }));
  const promise = runPriorityRefresh(false);
  await vi.runAllTimersAsync();
  expect(await promise).toMatchObject({ attempted: 1, observed: 0, comparable: 0, missingGuideSlots: ['test/cpu'],
    results: [expect.objectContaining({ state: 'failed', observedAt: null, comparable: false })] });
});

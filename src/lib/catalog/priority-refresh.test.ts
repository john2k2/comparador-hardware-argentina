import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), load: vi.fn(), fetch: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/seo/budget-guides-data', () => ({ BUDGET_GUIDES: [{ slug: 'test' }] }));
vi.mock('@/lib/seo/guide-catalog', () => ({ loadGuideCatalogProducts: mocks.load }));
vi.mock('@/lib/persistence/product-read', () => ({ readProductByIdFromDatabase: vi.fn() }));
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
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('la falta de Jev no impide observar; el límite de ejecución sigue activo', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', '');
  mocks.rpc.mockResolvedValue({ error: null, data: { allowed: false } });
  await expect(runPriorityRefresh(false)).rejects.toThrow('PRIORITY_REFRESH_DEFERRED');
  expect(mocks.fetch).not.toHaveBeenCalled();
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

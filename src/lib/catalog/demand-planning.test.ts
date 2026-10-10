import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import type { CatalogRefreshDemand } from './refresh-demand';
const mocks = vi.hoisted(() => ({ demands: vi.fn(), client: vi.fn(), selected: vi.fn(), hydrated: vi.fn(),
  select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), inside: vi.fn(), limit: vi.fn(), filter: vi.fn(), not: vi.fn() }));
vi.mock('./refresh-demand', () => ({ loadCatalogRefreshDemands: mocks.demands }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: mocks.client }));
vi.mock('@/lib/persistence/product-read-mapper', () => ({ mapDbGuideProduct: (row: Product) => row }));
import { loadPriorityDemandPlan, planDemandGroups, readDemandProducts, selectRecentDemandQueries } from './demand-planning';
const now = Date.parse('2026-10-10T18:00:00Z');
const demand = (query: string, age = 0): CatalogRefreshDemand => ({ cacheKey: query, query,
  requestCount: 100, lastRequestedAt: new Date(now - age).toISOString() });
const product = (category: Product['category'] = 'procesadores'): Product => ({ id: 'cpu',
  name: 'AMD Ryzen 5 7600', category, prices: [
    { storeId: 'mexx', storeName: 'Mexx', url: 'https://www.mexx.com.ar/ryzen-7600', price: 200,
      stock: 'in-stock', lastUpdated: new Date(now - 2 * 3600_000) },
    { storeId: 'venex', storeName: 'Venex', url: 'https://www.venex.com.ar/ryzen-7600', price: 100,
      stock: 'out-of-stock', lastUpdated: new Date(now - 2 * 3600_000) },
  ], specs: {} } as Product);
beforeEach(() => {
  vi.resetAllMocks(); mocks.demands.mockResolvedValue([]);
  mocks.selected.mockResolvedValue({ data: [], error: null }); mocks.hydrated.mockResolvedValue({ data: [], error: null });
  mocks.client.mockReturnValue({ from: () => {
    let idsOnly = true;
    const chain = { select: (field: string) => { mocks.select(field); idsOnly = field === 'id'; return chain; },
      eq: (...args: unknown[]) => { mocks.eq(...args); return chain; },
      ilike: (...args: unknown[]) => { mocks.ilike(...args); return chain; }, order: () => chain,
      in: (...args: unknown[]) => { mocks.inside(...args); return chain; },
      filter: (...args: unknown[]) => { mocks.filter(...args); return chain; },
      not: (...args: unknown[]) => { mocks.not(...args); return chain; },
      limit: (value: number) => { mocks.limit(value); return chain; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve()
        .then(() => idsOnly ? mocks.selected() : mocks.hydrated()).then(resolve, reject) };
    return chain;
  } });
});

describe('demanda reciente de destinos guardados', () => {
  it('normaliza y limita tres consultas distintas; descarta categorías solas, controles, antiguas y futuras', () => {
    const items = [demand(''), demand('  '), demand('%%'), demand('rtx\u00005090'), demand('antigua', 86400_001),
      demand('futura', -1), demand(' RTX   5090 '), demand('rtx 5090'), demand('Ryzen 7600'), demand('DDR5'), demand('SSD')];
    expect(selectRecentDemandQueries(items, now).map(item => item.query)).toEqual(['RTX 5090', 'Ryzen 7600', 'DDR5']);
    expect(selectRecentDemandQueries([{ ...demand(''), category: 'procesadores' }], now)).toEqual([]);
    expect(selectRecentDemandQueries([demand('ryzen 7600', 86400_000)], now)).toHaveLength(1);
  });
  it('selecciona máximo cinco IDs y sus referencias por demanda CPU/GPU sin ampliar categoría', async () => {
    mocks.demands.mockResolvedValue([{ ...demand('ryzen 7600'), category: 'procesadores' },
      { ...demand('rtx 5090'), category: 'tarjetas-graficas' }]);
    const gpu = { ...product('tarjetas-graficas'), id: 'gpu', name: 'RTX 5090' };
    mocks.selected.mockResolvedValueOnce({ data: [{ id: 'cpu' }], error: null }).mockResolvedValueOnce({ data: [{ id: 'gpu' }], error: null });
    mocks.hydrated.mockResolvedValueOnce({ data: [product()], error: null }).mockResolvedValueOnce({ data: [gpu], error: null });
    const plan = await loadPriorityDemandPlan(now);
    expect(mocks.demands).toHaveBeenCalledWith(20, { since: '2026-10-09T18:00:00.000Z', strict: true, maxRows: 20 });
    expect(mocks.eq.mock.calls).toEqual([['category', 'procesadores'], ['category', 'tarjetas-graficas']]);
    expect(mocks.ilike.mock.calls).toEqual([['catalog_document', '%ryzen%'], ['catalog_document', '%7600%'],
      ['catalog_document', '%rtx%'], ['catalog_document', '%5090%']]);
    expect(mocks.inside.mock.calls).toEqual([['id', ['cpu']], ['id', ['gpu']]]);
    expect(mocks.limit.mock.calls.map(([value]) => value)).toEqual([5, 1, 5, 1]);
    expect(plan.products.map(item => item.id)).toEqual(['cpu', 'gpu']);
  });
  it('categorías solas y fechas inválidas con contador alto no desplazan la query elegible', async () => {
    mocks.demands.mockResolvedValue([{ ...demand(''), category: 'procesadores', requestCount: 100 },
      { ...demand(''), category: 'tarjetas-graficas', requestCount: 100 },
      { ...demand('fecha inválida'), lastRequestedAt: 'invalid', requestCount: 100 },
      { ...demand('rtx 5090'), requestCount: 20 }]);
    const plan = await loadPriorityDemandPlan(now);
    expect(plan.demands).toBe(1); expect(mocks.selected).toHaveBeenCalledTimes(1);
    expect(mocks.ilike.mock.calls).toEqual([['catalog_document', '%rtx%'], ['catalog_document', '%5090%']]);
  });
  it('conserva destinos exactos, primero stock anterior positivo, deduplica y limita dos por producto', () => {
    const item = product();
    item.prices.push(item.prices[0], { ...item.prices[0], storeId: 'logg', url: 'https://logg.com.ar/ryzen-7600', stock: 'unknown' },
      { ...item.prices[0], url: 'http://www.mexx.com.ar/insecure' });
    const group = planDemandGroups([item], now)[0];
    expect(group.covered).toBe(false);
    expect(group.targets).toEqual(item.prices.slice(0, 2).map(price => ({ productId: item.id, storeId: price.storeId, url: price.url })));
  });
  it('sólo omite un producto por oferta comparable de menos de90min; unknown, conflicto, vencimiento o futuro no lo cubren', () => {
    const item = product(); item.prices[0].lastUpdated = new Date(now - 89 * 60000);
    expect(planDemandGroups([item], now)[0].covered).toBe(true);
    item.prices[0].lastUpdated = new Date(now - 90 * 60000);
    expect(planDemandGroups([item], now)[0].covered).toBe(false);
    item.prices[0].lastUpdated = new Date(now + 1);
    expect(planDemandGroups([item], now)[0].covered).toBe(false);
    item.prices[0].lastUpdated = new Date(now); item.prices[0].stock = 'unknown';
    expect(planDemandGroups([item], now)[0].covered).toBe(false);
    item.prices[0].stock = 'in-stock'; item.prices[0].sourceIdentity = { listingRef: 'mexx:cpu', title: 'AMD Ryzen 5 5600' };
    expect(planDemandGroups([item], now)[0].covered).toBe(false);
  });
  it('no convierte una falla DB ni una respuesta fuera de límite en vacío', async () => {
    mocks.demands.mockRejectedValueOnce(new Error('read-failed'));
    await expect(loadPriorityDemandPlan(now)).rejects.toThrow('read-failed');
    mocks.demands.mockResolvedValue([demand('ryzen 7600')]); mocks.selected.mockResolvedValueOnce({ data: null, error: { code: '57014' } });
    await expect(loadPriorityDemandPlan(now)).rejects.toThrow('PRIORITY_DEMAND_READ_FAILED');
    mocks.selected.mockResolvedValue({ data: Array.from({ length: 6 }, (_, index) => ({ id: `p-${index}` })), error: null });
    await expect(loadPriorityDemandPlan(now)).rejects.toThrow('PRIORITY_DEMAND_INVALID_RESPONSE');
  });
  it('si se acaba el remanente detiene lecturas sin descartar los productos ya leídos', async () => {
    mocks.demands.mockResolvedValue([demand('ryzen 7600'), demand('rtx 5090')]);
    mocks.selected.mockResolvedValue({ data: [{ id: 'cpu' }], error: null }); mocks.hydrated.mockResolvedValue({ data: [product()], error: null });
    let checks = 0;
    const plan = await loadPriorityDemandPlan(now, () => ++checks === 1);
    expect(mocks.selected).toHaveBeenCalledTimes(1); expect(plan.deferred).toBe(true); expect(plan.products).toHaveLength(1);
  });
  it('infiere CPU/GPU y exige todos los tokens saneados, sin OR ni cambiar modelo o variante', async () => {
    await readDemandProducts(demand('AMD Ryzen 7600X (box),%'));
    expect(mocks.eq).toHaveBeenCalledWith('category', 'procesadores');
    expect(mocks.ilike.mock.calls.map(([, value]) => value)).toEqual(['%amd%', '%ryzen%', '%7600x%', '%box%']);
    expect(mocks.hydrated).not.toHaveBeenCalled();
  });
  it.each([
    ['procesador ryzen 7600', 'procesadores', ['procesador', 'ryzen', '7600']],
    ['procesadores ryzen 7600', 'procesadores', ['cpu', 'ryzen', '7600']],
    ['ryzen 7600', 'procesadores', ['ryzen', '7600']],
    ['placa de video rtx 5090', 'tarjetas-graficas', ['gpu', 'rtx', '5090']],
    ['rtx 5090', 'tarjetas-graficas', ['rtx', '5090']],
  ])('consulta %s con los mismos sinónimos del documento de catálogo', async (query, category, tokens) => {
    await readDemandProducts(demand(query));
    expect(mocks.eq).toHaveBeenCalledWith('category', category);
    expect(mocks.ilike.mock.calls).toEqual(tokens.map(token => ['catalog_document', `%${token}%`]));
  });
  it.each([
    ['5700x', '(^|[^a-z0-9])(5700x)([^a-z0-9]|$)', 'AMD Ryzen 7 5700X3D', 'AMD Ryzen 7 5700X'],
    ['rtx 4070 ti', '(^|[^a-z0-9])(rtx[^a-z0-9]*4070[^a-z0-9]*ti)([^a-z0-9]|$)', 'RTX 4070 Ti Super', 'RTX 4070 Ti'],
    ['ram ddr5 2x16gb', '(^|[^a-z0-9])(2[^a-z0-9]*x[^a-z0-9]*16[^a-z0-9]*gb)([^a-z0-9]|$)', 'RAM DDR5 1x16GB', 'RAM DDR5 2x16GB'],
  ])('prefiltra la variante %s antes del límite y vuelve a verificar intención al hidratar', async (query, pattern, wrong, right) => {
    mocks.selected.mockResolvedValue({ data: [{ id: 'cpu' }], error: null });
    const category = query.startsWith('rtx') ? 'tarjetas-graficas' : query.startsWith('ram') ? 'memoria-ram' : 'procesadores';
    mocks.hydrated.mockResolvedValue({ data: [{ ...product(category), name: wrong }], error: null });
    expect(await readDemandProducts({ ...demand(query), category })).toEqual([]);
    expect(mocks.filter).toHaveBeenCalledWith('name', 'imatch', pattern);
    expect(mocks.filter.mock.invocationCallOrder[0]).toBeLessThan(mocks.selected.mock.invocationCallOrder[0]);
    mocks.hydrated.mockResolvedValue({ data: [{ ...product(category), name: right }], error: null });
    expect(await readDemandProducts({ ...demand(query), category })).toHaveLength(1);
    if (query.startsWith('rtx')) expect(mocks.not).toHaveBeenCalledWith('name', 'imatch', '(^|[^a-z0-9])(super)([^a-z0-9]|$)');
  });
  it('hidrata únicamente los IDs seleccionados y rechaza errores/filas ajenas', async () => {
    mocks.selected.mockResolvedValue({ data: [{ id: 'cpu' }], error: null });
    mocks.hydrated.mockResolvedValueOnce({ data: null, error: { code: '57014' } });
    await expect(readDemandProducts(demand('ryzen'))).rejects.toThrow('PRIORITY_DEMAND_READ_FAILED');
    mocks.hydrated.mockResolvedValueOnce({ data: [{ ...product(), id: 'another-variant' }], error: null });
    await expect(readDemandProducts(demand('ryzen'))).rejects.toThrow('PRIORITY_DEMAND_INVALID_RESPONSE');
    mocks.hydrated.mockResolvedValue({ data: [{ ...product('refrigeracion'), name: 'Cooler para Ryzen 7600' }], error: null });
    expect(await readDemandProducts({ ...demand('ryzen'), category: 'procesadores' })).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rangeMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rangeMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { readCategoryLandingPageFromDatabase, readProductsPageFromDatabase, readGuideCatalogCandidatesFromDatabase,readProductDetailByIdFromDatabase, readCanonicalProductIdByKey } from './product-read';
import { mapDbProduct } from './product-read-mapper';
import { buildGuideNameFilters } from './product-read-helpers';
import { resolveGuideRefreshOffers, resolveGuideComponent } from '@/lib/seo/budget-guide-pricing';
import { loadGuideCatalogProducts, loadGuidePriorityProducts } from '@/lib/seo/guide-catalog';

const row = {
  id: 'agrupado-procesadores-amd-ryzen-7600',
  name: 'AMD Ryzen 5 7600',
  category: 'procesadores',
  brand: 'AMD',
  model: 'Ryzen 5 7600',
  description: null,
  image: null,
  normalized_title: null,
  canonical_product_key: 'amd-ryzen-5-7600',
  family_key: null,
  variant_key: null,
  refresh_priority: null,
  last_scraped_at: null,
  last_normalized_at: null,
  specs: {},
  lowest_price: 200_000,
  highest_price: 210_000,
  average_price: 205_000,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
  product_prices: [
    { store_id: 'mexx', url: 'https://example.com/mexx', price: 200_000, original_price: null, stock: 'in-stock', installment_count: null, installment_amount: null, last_updated: '2026-09-12T00:00:00.000Z' },
  ],
};

describe('detalle canónico con nuevas publicaciones',()=>{
 function mockDetail(data:unknown,error:unknown=null,base:unknown=row){
  const chain={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),order:vi.fn(()=>chain),limit:vi.fn(async()=>({data,error})),maybeSingle:vi.fn(async()=>({data:base,error:null}))};
  const from=vi.fn(()=>chain);getServerSupabaseReadClientMock.mockReturnValue({from});return {chain,from};
 }
 it('consulta sólo categoría/clave exacta con límite y conserva el ID canónico',async()=>{
  const fresh={...row,id:'new-store-offer',product_prices:[{...row.product_prices[0],price:230000,last_updated:new Date().toISOString()}]};
  const {chain}=mockDetail([row,fresh]);const detail=await readProductDetailByIdFromDatabase(row.id);
  expect(chain.eq).toHaveBeenCalledWith('canonical_product_key',row.canonical_product_key);expect(chain.eq).toHaveBeenCalledWith('category','procesadores');expect(chain.limit).toHaveBeenCalledWith(201);
  expect(detail?.id).toBe(row.id);expect(detail?.prices).toEqual([expect.objectContaining({price:230000,lastUpdated:new Date(fresh.product_prices[0].last_updated)})]);
 });
 it('no presenta un fallo o una lectura truncada como detalle completo',async()=>{
  mockDetail(null,{code:'57014'});await expect(readProductDetailByIdFromDatabase(row.id)).rejects.toThrow('related offers unavailable');
  mockDetail(Array.from({length:201},()=>row));await expect(readProductDetailByIdFromDatabase(row.id)).rejects.toThrow('limit exceeded');
 });
 it('no busca relaciones cuando no existe el producto',async()=>{
  const {from,chain}=mockDetail([],null,null);expect(await readProductDetailByIdFromDatabase('missing')).toBeNull();expect(from).toHaveBeenCalledTimes(1);expect(chain.limit).not.toHaveBeenCalled();
 });
});

it('no elige una redirección outlet por la clave de un CPU normal y busca una candidata compatible',async()=>{
 const chain={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),like:vi.fn(()=>chain),order:vi.fn(()=>chain),limit:vi.fn(async()=>({data:[
  {id:'agrupado-normal',name:'AMD Ryzen 3 4100 con cooler',category:'procesadores'},
  {id:'agrupado-outlet',name:'AMD Ryzen 3 4100 OEM sin cooler OUTLET',category:'procesadores'},
 ],error:null}))};
 getServerSupabaseReadClientMock.mockReturnValue({from:()=>chain});
 const target={name:'AMD Ryzen 3 4100 sin cooler OEM OUTLET',category:'procesadores' as const,canonicalProductKey:'legacy-4100'};
 expect(await readCanonicalProductIdByKey('legacy-4100',target)).toBe('agrupado-outlet');
 chain.limit.mockResolvedValueOnce({data:[{id:'agrupado-normal',name:'AMD Ryzen 3 4100 con cooler',category:'procesadores'}],error:null});
 expect(await readCanonicalProductIdByKey('legacy-4100',target)).toBeNull();
});

describe('readCategoryLandingPageFromDatabase', () => {
  beforeEach(() => {
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rangeMock });
    rangeMock.mockResolvedValue({ data: { products: [row], total: 1501, totalPages: 126, page: 2, pageSize: 12 }, error: null });
  });

  it('lee sólo la ventana solicitada de productos agrupados y conserva el total', async () => {
    const result = await readCategoryLandingPageFromDatabase('procesadores', 2, 12);

    expect(rangeMock).toHaveBeenCalledWith('search_catalog_page', expect.objectContaining({ p_category: 'procesadores', p_page: 2, p_page_size: 12 }));
    expect(result).toMatchObject({ total: 1501, totalPages: 126, page: 2, pageSize: 12 });
    expect(result.products).toEqual([expect.objectContaining({ id: row.id, lowestPrice: 200_000 })]);
  });

  it('normalizes stores and category while preserving RPC-selected offers and statistics', async () => {
    rangeMock.mockResolvedValue({ data: { products: [{ ...row, id: 'target50', lowest_price: 50 }], total: 1501, totalPages: 32, page: 2, pageSize: 48 }, error: null });
    const result = await readProductsPageFromDatabase({ query: ' ryzen 7600 ', page: 2, pageSize: 99, storeIds: new Set([' MEXX ', 'mexx']) });
    expect(rangeMock).toHaveBeenCalledWith('search_catalog_page', expect.objectContaining({ p_query: 'ryzen 7600', p_category: 'procesadores', p_stores: ['mexx'], p_page_size: 48 }));
    expect(result.products[0]).toMatchObject({ id: 'target50', lowestPrice: 50 });
    expect(result.products[0].prices).toHaveLength(1);
  });

  it('filters current offers inside the RPC before totals and pages without an artificial price floor', async () => {
    await readProductsPageFromDatabase({ query: 'rtx 5090', onlyCurrentOffers: true, page: 2, pageSize: 12 });
    expect(rangeMock).toHaveBeenLastCalledWith('search_catalog_page', expect.objectContaining({ p_min_price: 0, p_page: 2 }));
    await readProductsPageFromDatabase({ query: 'rtx 5090', onlyCurrentOffers: true, minPrice: 100, page: 1, pageSize: 12 });
    expect(rangeMock).toHaveBeenLastCalledWith('search_catalog_page', expect.objectContaining({ p_min_price: 100 }));
    await readProductsPageFromDatabase({ query: 'rtx 5090', onlyCurrentOffers: false, page: 1, pageSize: 12 });
    expect(rangeMock).toHaveBeenLastCalledWith('search_catalog_page', expect.objectContaining({ p_min_price: null }));
  });

  it('accepts genuine empty pages but throws for unavailable, failed and malformed RPC responses', async () => {
    const params = { page: 99, pageSize: 12 };
    rangeMock.mockResolvedValue({ data: { products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 }, error: null });
    expect(await readProductsPageFromDatabase(params)).toMatchObject({ total: 0, page: 1 });
    rangeMock.mockResolvedValue({ data: null, error: { code: '42P01', message: 'missing RPC' } });
    await expect(readProductsPageFromDatabase(params)).rejects.toThrow('missing RPC');
    rangeMock.mockResolvedValue({ data: null, error: null });
    await expect(readProductsPageFromDatabase(params)).rejects.toThrow('Invalid');
    getServerSupabaseReadClientMock.mockReturnValue(null);
    await expect(readProductsPageFromDatabase(params)).rejects.toThrow('unavailable');
  });
});

describe('guide listing preservation from database rows to resolution', () => {
  const now = '2026-09-29T12:00:00.000Z';
  const fresh = '2026-09-29T11:00:00.000Z';
  const stale = '2026-09-29T08:00:00.000Z';
  const spec = {
    name: row.name, description: '', estimatedPrice: 250_000,
    category: 'procesadores' as const, searchTerms: ['ryzen 5 7600'],
  };
  const urlA = 'https://www.mexx.com.ar/amd-ryzen-5-7600-a';
  const urlB = 'https://www.mexx.com.ar/amd-ryzen-5-7600-b';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => vi.useRealTimers());

  function mockRows(firstDate: string, secondDate: string) {
    const candidate = {
      ...row,
      product_prices: [
        { ...row.product_prices[0], url: urlA, price: 200_000, last_updated: firstDate },
        { ...row.product_prices[0], url: urlB, price: 210_000, last_updated: secondDate },
        { ...row.product_prices[0], url: urlB, price: 0, last_updated: fresh },
      ],
    };
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [candidate], error: null }).then(resolve),
    };
    getServerSupabaseReadClientMock.mockReturnValue({ from: vi.fn(() => query) });
    return candidate;
  }

  it('selects the fresh alternative from the same store through the real guide loader', async () => {
    const candidate = mockRows(stale, fresh);
    const products = await loadGuideCatalogProducts();
    expect(products[0].prices.map((offer) => offer.url)).toEqual([urlA, urlB]);
    expect(resolveGuideComponent(spec, products)).toMatchObject({
      priceSource: 'catalog', price: 210_000, bestStoreUrl: urlB, storeCount: 1,
      offers: [expect.objectContaining({ url: urlB, lastUpdated: fresh })],
    });
    // El mínimo histórico conserva su URL y deja visible la alternativa vigente.
    expect(mapDbProduct(candidate).prices.map((offer) => offer.url)).toEqual([urlA, urlB]);
    expect(resolveGuideComponent(spec, [mapDbProduct(candidate)]).priceSource).toBe('catalog');
    const priorityProducts = await loadGuidePriorityProducts('procesadores', spec.searchTerms);
    expect(priorityProducts[0].prices.map((offer) => offer.url)).toEqual([urlA, urlB]);
    expect(resolveGuideComponent(spec, priorityProducts).bestStoreUrl).toBe(urlB);
  });

  it('reduces eligible listings to the cheapest offer only after eligibility', async () => {
    mockRows(fresh, fresh);
    const products = await readGuideCatalogCandidatesFromDatabase('procesadores');
    expect(products[0].prices).toHaveLength(2);
    expect(resolveGuideComponent(spec, products)).toMatchObject({
      priceSource: 'catalog', price: 200_000, bestStoreUrl: urlA, storeCount: 1,
    });
  });

  it('does not make expired alternatives buyable', async () => {
    mockRows(stale, stale);
    const products = await readGuideCatalogCandidatesFromDatabase('procesadores');
    expect(products[0].prices).toHaveLength(2);
    expect(resolveGuideComponent(spec, products).priceSource).toBe('estimate');
  });
});

it('la lectura de guía busca el modelo completo antes de limitar ocho candidatas', async () => {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  getServerSupabaseReadClientMock.mockReturnValue({ from: vi.fn(() => query) });
  await readGuideCatalogCandidatesFromDatabase('memoria-ram', 8, 'mancer 16gb ddr4 3200 vant');
  expect(query.limit).toHaveBeenCalledWith(8);
  const filter = query.or.mock.calls[0][0] as string;
  // El AND externo exige cada término; su OR admite los campos del resolver.
  const branches = filter.match(/or\([^)]+\)/g)!;
  expect(filter.startsWith('and(')).toBe(true);
  expect(branches).toHaveLength(5);
  for (const [index, token] of ['mancer', '16gb', 'ddr4', '3200', 'vant'].entries()) {
    for (const field of ['name', 'brand', 'model', 'normalized_title', 'canonical_product_key']) {
      expect(branches[index]).toContain(`${field}.ilike.%${token}%`);
    }
  }
  query.or.mockClear();
  await readGuideCatalogCandidatesFromDatabase('memoria-ram', 8, '%,()');
  expect(query.or).not.toHaveBeenCalled();
});

it('aparta identidad contradictoria después de mapear SQL sin hacer fallar toda la categoría', async () => {
  const date = new Date().toISOString();
  const mixed = { ...row, id: 'agrupado-almacenamiento-wd-green', name: 'SSD WD Green 1TB', model: 'WD Green',
    category: 'almacenamiento', canonical_product_key: 'almacenamiento::wdgreen1tb', lowest_price: 254647.83,
    product_prices: [{ ...row.product_prices[0], store_id: 'maxtecno', price: 254647.83, last_updated: date,
      url: 'https://maxtecno.com.ar/producto/disco-externo-hdd-western-digital-elements-1tb-usb-3-0/' }] };
  const valid = { ...mixed, id: 'agrupado-almacenamiento-kingston-nv3', name: 'SSD Kingston NV3 1TB', model: 'NV3',
    canonical_product_key: 'almacenamiento::kingstonnv31tb', lowest_price: 400000, highest_price: 400000, average_price: 400000,
    product_prices: [{ ...mixed.product_prices[0], price: 400000, url: 'https://maxtecno.com.ar/producto/ssd-kingston-nv3-1tb/' }] };
  getServerSupabaseReadClientMock.mockReturnValue({ rpc: rangeMock });
  rangeMock.mockResolvedValueOnce({ data: { products: [mixed, valid], total: 2, totalPages: 1, page: 1, pageSize: 12 }, error: null });
  const result = await readProductsPageFromDatabase({ category: 'almacenamiento', page: 1, pageSize: 12, onlyCurrentOffers: true });
  expect(result.products.map(({ id }) => id)).toEqual([valid.id]);
  expect(result).toMatchObject({ total: 2, totalPages: 1, identityExcludedOnPage: 1 });
  expect(result.products[0].lowestPrice).toBe(400000);
  expect(result.products[0].prices[0].lastUpdated.toISOString()).toBe(date);
  expect(mixed.product_prices[0].price).toBe(254647.83);
});


describe('destinos editoriales antes del límite de candidatas', () => {
  const now = '2026-10-10T19:00:00.000Z';
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
  afterEach(() => vi.useRealTimers());

  // El doble aplica filtros y ORDER/LIMIT como una lectura SQL, pero conserva
  // el reader, mapper y resolvers reales. No consulta ni escribe una cuenta.
  function simulateDatabase(rows: typeof row[]) {
    const patterns: Array<{ value: string; negate: boolean }> = [];
    let limit = 0;
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      filter: vi.fn((_column: string, operator: string, value: string) => {
        expect(operator).toBe('imatch'); patterns.push({ value, negate: false }); return query;
      }),
      not: vi.fn((_column: string, operator: string, value: string) => {
        expect(operator).toBe('imatch'); patterns.push({ value, negate: true }); return query;
      }),
      limit: vi.fn((value: number) => { limit = value; return query; }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({
        data: rows.filter((candidate) => patterns.every(({ value, negate }) =>
          new RegExp(value, 'i').test(candidate.name) !== negate))
          .sort((a, b) => Date.parse(b.last_scraped_at!) - Date.parse(a.last_scraped_at!)).slice(0, limit),
        error: null,
      }).then(resolve),
    };
    getServerSupabaseReadClientMock.mockReturnValue({ from: vi.fn(() => query) });
    return query;
  }

  function candidate(id: string, name: string, category = 'procesadores', date = '2026-10-10T18:45:00.000Z') {
    return { ...row, id, name, category, model: name, canonical_product_key: null,
      last_scraped_at: date, updated_at: date,
      product_prices: [{ ...row.product_prices[0], url: `https://www.mexx.com.ar/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        last_updated: date }],
    };
  }

  it.each([
    ['AMD Ryzen 5 5500 con Wraith Stealth', 'Ryzen 5 5500', 'AMD Ryzen 5 5500X3D sin cooler'],
    ['AMD Ryzen 7 5700 con cooler', 'Ryzen 7 5700', 'AMD Ryzen 7 5700GE con cooler'],
    ['AMD Ryzen 5 7600 con Wraith Stealth', 'Ryzen 5 7600', 'AMD Ryzen 5 7600X sin cooler'],
  ])('rescata %s detrás de ocho variantes más nuevas sin volver comprable una oferta vencida', async (name, exactModel, other) => {
    const spec = { name, exactModel, requiresIncludedCooler: true, category: 'procesadores' as const,
      searchTerms: [exactModel.toLowerCase()], estimatedPrice: 250_000, description: '' };
    const target = candidate('editorial-target', name, 'procesadores', '2026-10-10T13:45:00.000Z');
    const distractors = Array.from({ length: 8 }, (_, i) => candidate(`distractor-${i}`,
      i % 2 ? other : `${exactModel} sin cooler`));
    simulateDatabase([...distractors, target]);
    const before = await readGuideCatalogCandidatesFromDatabase('procesadores', 8, spec.searchTerms[0]);
    expect(before).toHaveLength(8);
    expect(resolveGuideRefreshOffers(spec, before)).toEqual([]);
    const query = simulateDatabase([...distractors, target]);
    const after = await readGuideCatalogCandidatesFromDatabase('procesadores', 8, spec.searchTerms[0], spec);
    expect(query.limit).toHaveBeenCalledWith(8);
    expect(after.map((product) => product.id)).toEqual(['editorial-target']);
    expect(resolveGuideRefreshOffers(spec, after)).toEqual([expect.objectContaining({ productId: 'editorial-target', lastUpdated: target.product_prices[0].last_updated })]);
    expect(resolveGuideComponent(spec, after).priceSource).toBe('estimate');
    expect(after[0].prices[0].stock).toBe('in-stock');
    expect(after[0].prices[0].lastUpdated.toISOString()).toBe(target.product_prices[0].last_updated);
  });

  it('exige CL36 y kit 2x16GB antes de limitar RAM del mismo modelo', async () => {
    const spec = { name: 'Patriot Viper Venom 32GB DDR5 6000MHz CL36 (2x16GB)', exactModel: 'Viper Venom',
      category: 'memoria-ram' as const, searchTerms: ['patriot 32gb ddr5 6000 viper venom'], estimatedPrice: 860_000, description: '' };
    const target = candidate('editorial-ram', spec.name, spec.category);
    const distractors = Array.from({ length: 8 }, (_, i) => candidate(`ram-${i}`,
      i % 2 ? 'Patriot Viper Venom 32GB DDR5 6000MHz CL30 (2x16GB)' : 'Patriot Viper Venom 32GB DDR5 6000MHz CL36 (1x32GB)',
      spec.category, '2026-10-10T18:50:00.000Z'));
    simulateDatabase([...distractors, target]);
    expect(resolveGuideRefreshOffers(spec, await readGuideCatalogCandidatesFromDatabase(spec.category, 8, spec.searchTerms[0]))).toEqual([]);
    simulateDatabase([...distractors, target]);
    const after = await readGuideCatalogCandidatesFromDatabase(spec.category, 8, spec.searchTerms[0], spec);
    expect(after.map((product) => product.id)).toEqual(['editorial-ram']);
    expect(resolveGuideComponent(spec, after).priceSource).toBe('catalog');
  });
});


it('el prefiltro no acepta negaciones, sufijos ni sintaxis editorial como regex', () => {
  const spec = { name: 'AMD Ryzen 7 5700 con cooler', exactModel: 'Ryzen 7 5700', requiresIncludedCooler: true };
  const filters = buildGuideNameFilters('procesadores', spec);
  const accepts = (name: string) => filters.include.every((pattern) => new RegExp(pattern, 'i').test(name))
    && filters.exclude.every((pattern) => !new RegExp(pattern, 'i').test(name));
  for (const name of ['AMD Ryzen 7 5700 C/Cooler', 'AMD Ryzen 7 5700 cooler incluido', 'AMD Ryzen 7 5700 Wraith Stealth']) expect(accepts(name)).toBe(true);
  for (const name of ['AMD Ryzen 7 5700G con cooler', 'AMD Ryzen 7 5700GE con cooler', 'AMD Ryzen 7 5700X3D con cooler',
    'AMD Ryzen 7 5700 sin cooler Wraith Stealth', 'AMD Ryzen 7 5700 Wraith Stealth cooler no incluido',
    'AMD Ryzen 7 5700 sin Wraith Stealth', 'AMD Ryzen 7 5700 no incluye AMD Wraith Stealth', 'AMD Ryzen 7 5700 BOX']) expect(accepts(name)).toBe(false);
  const unsafe = buildGuideNameFilters('procesadores', { name: 'CPU', exactModel: 'Ryzen 7 5700%),or(name.*)' });
  expect(unsafe.include[0]).toBe('(^|[^a-z0-9])(ryzen[^a-z0-9]+7[^a-z0-9]+5700[^a-z0-9]+or[^a-z0-9]+name)([^a-z0-9]|$)');
});

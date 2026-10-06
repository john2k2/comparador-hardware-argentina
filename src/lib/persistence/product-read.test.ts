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
import { resolveGuideComponent } from '@/lib/seo/budget-guide-pricing';
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rangeMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rangeMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { readCategoryLandingPageFromDatabase, readProductsPageFromDatabase, readGuideCatalogCandidatesFromDatabase } from './product-read';
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
    // El catálogo general conserva la reducción existente por tienda.
    expect(mapDbProduct(candidate).prices.map((offer) => offer.url)).toEqual([urlA]);
    expect(resolveGuideComponent(spec, [mapDbProduct(candidate)]).priceSource).toBe('estimate');
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

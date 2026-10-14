import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { catalogPageResponse, dedupeSearchResponse } from './catalog-page-response';
import { catalogPageResponse as existing, emptySearchResponse } from './search-handler-shared';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
import type { Product } from '@/lib/types';
const product = (id: string, price: number): Product => ({ id, name: 'AMD Ryzen 5 7600', category: 'procesadores', brand: 'AMD',
  model: 'Ryzen 5 7600', specs: {}, createdAt: new Date(), updatedAt: new Date(), lowestPrice: price, highestPrice: price, averagePrice: price,
  prices: [{ storeId: id, storeName: id, url: `https://www.mexx.com.ar/ryzen-7600-${id}`, price, stock: 'in-stock', installment: null, lastUpdated: new Date() }] });

describe('formatter puro extraído conserva contrato público', () => {
  it('reexporta la misma implementación y conserva forma del vacío', () => {
    expect(existing).toBe(catalogPageResponse);
    const page: ProductPageResult = { products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 };
    expect(catalogPageResponse(page)).toEqual(emptySearchResponse());
  });
  it('conserva totales de página parcial y recalcula límite tras dedupe', () => {
    const page: ProductPageResult = { products: [product('one', 200000), product('two', 210000)], total: 40, totalPages: 4, page: 2, pageSize: 12 };
    const result = catalogPageResponse(page, { sortBy: 'price-asc' });
    expect(result.pagination).toMatchObject({ offset: 12, total: 40, totalPages: 4, page: 2, pageSize: 12 });
    expect(result.pagination.limit).toBe(result.products.length);
    expect(result.facets).toEqual({ categories: [], brands: [], stores: [] });
    expect(existing(page, { sortBy: 'price-asc' })).toEqual(result);
  });
  it('en conjunto completo dedupe recalcula total sin inventar cobertura global', () => {
    const input = catalogPageResponse({ products: [product('one', 200000), product('two', 210000)], total: 2, totalPages: 1, page: 1, pageSize: 12 });
    expect(input.pagination.total).toBe(input.products.length);
    expect(dedupeSearchResponse(input)).toEqual(input);
  });
});

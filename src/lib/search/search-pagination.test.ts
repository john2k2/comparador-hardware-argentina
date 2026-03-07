import { describe, expect, it } from 'vitest';
import { paginateProducts } from './search-pagination';
import type { Product } from '@/lib/types';

function buildProduct(id: string): Product {
  const updatedAt = new Date('2026-03-06T12:00:00.000Z');

  return {
    id,
    name: `Producto ${id}`,
    category: 'perifericos',
    brand: 'Test',
    model: `Modelo ${id}`,
    description: `Producto ${id}`,
    image: '/pixel-box.svg',
    normalizedTitle: undefined,
    canonicalProductKey: undefined,
    familyKey: undefined,
    variantKey: undefined,
    refreshPriority: undefined,
    lastScrapedAt: undefined,
    lastNormalizedAt: null,
    specs: {},
    prices: [
      {
        storeId: 'test-store',
        storeName: 'Test Store',
        url: `https://example.com/${id}`,
        price: 1000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: updatedAt,
      },
    ],
    lowestPrice: 1000,
    highestPrice: 1000,
    averagePrice: 1000,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('search pagination', () => {
  it('returns the requested page slice when in range', () => {
    const products = Array.from({ length: 25 }, (_, index) => buildProduct(String(index + 1)));

    const result = paginateProducts(products, 2, 12);

    expect(result.currentPage).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.paginatedProducts.map((product) => product.id)).toEqual([
      '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
    ]);
  });

  it('clamps page below 1 and above total pages', () => {
    const products = Array.from({ length: 5 }, (_, index) => buildProduct(String(index + 1)));

    const low = paginateProducts(products, 0, 12);
    const high = paginateProducts(products, 99, 2);

    expect(low.currentPage).toBe(1);
    expect(low.totalPages).toBe(1);
    expect(low.paginatedProducts).toHaveLength(5);

    expect(high.currentPage).toBe(3);
    expect(high.totalPages).toBe(3);
    expect(high.paginatedProducts.map((product) => product.id)).toEqual(['5']);
  });

  it('keeps a stable empty state with page 1', () => {
    const result = paginateProducts([], 4, 12);

    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(0);
    expect(result.paginatedProducts).toEqual([]);
  });
});

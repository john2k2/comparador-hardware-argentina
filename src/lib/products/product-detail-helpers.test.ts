import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import {
  buildDetailSearchQuery,
  countMatchedQueryWords,
  findBestProductMatch,
  normalizeId,
  pickDescriptionUrls,
  shouldKeepByQueryWords,
  tokenizeQueryWords,
} from '@/lib/products/product-detail-helpers';

function createProduct(id: string, name: string): Product {
  const now = new Date('2026-03-26T12:00:00.000Z');

  return {
    id,
    name,
    category: 'procesadores',
    brand: 'AMD',
    model: name,
    description: 'desc',
    image: 'https://example.com/product.png',
    specs: {},
    prices: [
      {
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://store.example.com/product',
        price: 1000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: now,
      },
    ],
    lowestPrice: 1000,
    highestPrice: 1000,
    averagePrice: 1000,
    createdAt: now,
    updatedAt: now,
  };
}

describe('product-detail-helpers', () => {
  it('normalizes ids with decoding and separators', () => {
    expect(normalizeId('Mexx%2520Ryzen_7+7800X3D/')).toBe('mexx-ryzen-7-7800x3d');
  });

  it('builds a search query without store prefix and numeric code', () => {
    expect(buildDetailSearchQuery('mexx-12345-amd-ryzen-7-7800x3d')).toBe('amd ryzen 7 7800x3d');
    expect(buildDetailSearchQuery('compragamer-rtx-5070')).toBe('rtx 5070');
  });

  it('matches detail products by exact id first and by store/code fallback second', () => {
    const exact = createProduct('mexx-12345-amd-ryzen-7-7800x3d', 'AMD Ryzen 7 7800X3D');
    const sameStoreCode = createProduct('mexx-12345-amd-ryzen-7', 'AMD Ryzen 7');
    const otherStore = createProduct('venex-12345-amd-ryzen-7', 'AMD Ryzen 7');

    expect(findBestProductMatch('mexx-12345-amd-ryzen-7-7800x3d', [otherStore, sameStoreCode, exact])).toBe(exact);
    expect(findBestProductMatch('mexx-12345-ryzen-7', [otherStore, sameStoreCode])).toBe(sameStoreCode);
    expect(findBestProductMatch('missing-id', [otherStore])).toBeUndefined();
  });

  it('deduplicates and validates description urls', () => {
    const product = createProduct('mexx-1', 'AMD Ryzen 7');
    product.prices = [
      { ...product.prices[0], price: 900, url: 'https://store.example.com/a' },
      { ...product.prices[0], price: 950, url: 'invalid-url' },
      { ...product.prices[0], price: 990, url: 'https://store.example.com/a' },
      { ...product.prices[0], price: 1100, url: 'https://store.example.com/b' },
    ];

    expect(pickDescriptionUrls(product)).toEqual([
      'https://store.example.com/a',
      'https://store.example.com/b',
    ]);
  });

  it('keeps products only when enough query words match', () => {
    const words = tokenizeQueryWords('ryzen 7 7800x3d');
    expect(words).toEqual(['ryzen', '7800x3d']);
    expect(countMatchedQueryWords('AMD Ryzen 7 7800X3D', words)).toBe(2);
    expect(shouldKeepByQueryWords('AMD Ryzen 7 7800X3D', words)).toBe(true);
    expect(shouldKeepByQueryWords('AMD Ryzen 5 7600', words)).toBe(false);
  });
});

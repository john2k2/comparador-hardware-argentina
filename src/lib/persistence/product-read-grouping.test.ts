import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import {
  applyDatabaseReadTransforms,
  applyTextFilter,
  dedupeProductsByCanonicalName,
  recalculateProductPrices,
} from '@/lib/persistence/product-read-grouping';

function createProduct(input: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  const now = new Date('2026-03-26T12:00:00.000Z');
  return {
    id: input.id,
    name: input.name,
    category: input.category ?? 'procesadores',
    brand: input.brand ?? 'AMD',
    model: input.model ?? input.name,
    description: input.description ?? input.name,
    image: input.image ?? '/pixel-box.svg',
    normalizedTitle: input.normalizedTitle,
    canonicalProductKey: input.canonicalProductKey,
    familyKey: input.familyKey,
    variantKey: input.variantKey,
    refreshPriority: input.refreshPriority,
    lastScrapedAt: input.lastScrapedAt,
    lastNormalizedAt: input.lastNormalizedAt ?? null,
    specs: input.specs ?? {},
    prices: input.prices ?? [],
    lowestPrice: input.lowestPrice ?? 0,
    highestPrice: input.highestPrice ?? 0,
    averagePrice: input.averagePrice ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

describe('product-read-grouping', () => {
  it('filters by normalized text over multiple searchable fields', () => {
    const products = [
      createProduct({ id: '1', name: 'AMD Ryzen 5 7600', normalizedTitle: 'amd ryzen 5 7600' }),
      createProduct({ id: '2', name: 'Intel Core i5 14600K', brand: 'Intel' }),
    ];

    expect(applyTextFilter(products, 'ryzen 7600').map((product) => product.id)).toEqual(['1']);
  });

  it('dedupes products sharing canonical identity and same-store prices', () => {
    const olderDate = new Date('2026-03-25T12:00:00.000Z');
    const newerDate = new Date('2026-03-26T12:00:00.000Z');
    const duplicateA = createProduct({
      id: 'a',
      name: 'AMD Ryzen 5 7600',
      canonicalProductKey: 'procesadores|amd-ryzen-5-7600',
      prices: [{
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://store/a',
        price: 100,
        stock: 'out-of-stock',
        installment: null,
        lastUpdated: olderDate,
      }],
      lowestPrice: 100,
      highestPrice: 100,
      averagePrice: 100,
      updatedAt: olderDate,
      createdAt: olderDate,
    });
    const duplicateB = createProduct({
      id: 'b',
      name: 'AMD Ryzen 5 7600 Box',
      canonicalProductKey: 'procesadores|amd-ryzen-5-7600',
      image: 'https://example.com/real.png',
      prices: [{
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://store/b',
        price: 95,
        stock: 'in-stock',
        installment: null,
        lastUpdated: newerDate,
      }],
      lowestPrice: 95,
      highestPrice: 95,
      averagePrice: 95,
      updatedAt: newerDate,
      createdAt: newerDate,
    });

    const deduped = dedupeProductsByCanonicalName([duplicateA, duplicateB]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.lowestPrice).toBe(95);
    expect(deduped[0]?.image).toBe('https://example.com/real.png');
    expect(deduped[0]?.prices[0]?.stock).toBe('in-stock');
  });

  it('recalculates comparable prices after store filtering and sorts results', () => {
    const product = createProduct({
      id: 'cpu-1',
      name: 'AMD Ryzen 7 7800X3D',
      prices: [
        {
          storeId: 'mexx',
          storeName: 'Mexx',
          url: 'https://store/mexx',
          price: 900,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
        },
        {
          storeId: 'venex',
          storeName: 'Venex',
          url: 'https://store/venex',
          price: 850,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
        },
      ],
      lowestPrice: 850,
      highestPrice: 900,
      averagePrice: 875,
    });

    const recalculated = recalculateProductPrices(product, new Set(['mexx']));
    expect(recalculated?.prices).toHaveLength(1);
    expect(recalculated?.lowestPrice).toBe(900);

    const transformed = applyDatabaseReadTransforms([
      product,
      createProduct({
        id: 'cpu-2',
        name: 'AMD Ryzen 5 7600',
        prices: [{
          storeId: 'mexx',
          storeName: 'Mexx',
          url: 'https://store/mexx-7600',
          price: 500,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
        }],
        lowestPrice: 500,
        highestPrice: 500,
        averagePrice: 500,
      }),
    ], {
      searchTerm: 'ryzen',
      storeIds: new Set(['mexx']),
      sortBy: 'price-asc',
    });

    expect(transformed.map((item) => item.id)).toEqual(['cpu-2', 'cpu-1']);
    expect(transformed[1]?.lowestPrice).toBe(900);
  });
});

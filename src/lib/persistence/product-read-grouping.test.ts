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

  it('requires the complete model token and excludes component bundles', () => {
    const priced = (id: string, name: string, category: Product['category']) => createProduct({
      id,
      name,
      category,
      prices: [{
        storeId: 'test', storeName: 'Test', url: `https://example.com/${id}`, price: 100,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 100,
      highestPrice: 100,
      averagePrice: 100,
    });
    const products = [
      priced('exact', 'AMD Ryzen 5 5600X', 'procesadores'),
      priced('suffix', 'AMD Ryzen 5 5600XT', 'procesadores'),
      priced('gpu', 'Radeon RX 5600 XT', 'tarjetas-graficas'),
      priced('pc', 'PC Armada Gamer Ryzen 5 5600X RTX 4060', 'procesadores'),
    ];

    expect(applyDatabaseReadTransforms(products, { searchTerm: '5600X', sortBy: 'relevance' }).map((p) => p.id))
      .toEqual(['exact']);
  });

  it('drops marketing lookalikes and G502 Hero when applying query intent', () => {
    const priced = (id: string, name: string, category: Product['category']) => createProduct({
      id,
      name,
      category,
      prices: [{
        storeId: 'test', storeName: 'Test', url: `https://example.com/${id}`, price: 100,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 100,
      highestPrice: 100,
      averagePrice: 100,
    });

    expect(applyDatabaseReadTransforms([
      priced('x', 'Procesador Amd Am4 Ryzen 5 5600X C/Cooler', 'procesadores'),
      priced('xt', 'Micro AMD Ryzen 5 5600XT 4.7 Ghz AM4 (Mejor que 5600x)', 'procesadores'),
      priced('t', 'Micro AMD Ryzen 5 5600T 4.5 Ghz AM4 (Similar 5600xt - mejor que 5600x)', 'procesadores'),
    ], { searchTerm: 'ryzen 5600x', sortBy: 'relevance' }).map((product) => product.id)).toEqual(['x']);

    expect(applyDatabaseReadTransforms([
      priced('hero', 'Mouse Logitech G502 Gaming HERO', 'perifericos'),
      priced('g502x', 'Mouse Logitech G502 X Gaming Black', 'perifericos'),
    ], { searchTerm: 'g502 x', sortBy: 'relevance' }).map((product) => product.id)).toEqual(['g502x']);

    expect(applyDatabaseReadTransforms([
      priced('super', 'Placa De Video Gigabyte Rtx 4070 Ti Super Aero Oc 16gb', 'tarjetas-graficas'),
      priced('ti', 'Video Geforce Msi Ventus 3X RTX 4070 TI 12GB OC', 'tarjetas-graficas'),
    ], { searchTerm: 'rtx 4070 ti', sortBy: 'relevance' }).map((product) => product.id)).toEqual(['ti']);
  });

  it('ranks exact model matches ahead of newer cheaper family siblings when sort is relevance', () => {
    const olderExact = createProduct({
      id: 'exact',
      name: 'AMD Ryzen 5 5600X',
      updatedAt: new Date('2026-01-01T12:00:00.000Z'),
      prices: [{
        storeId: 'test', storeName: 'Test', url: 'https://example.com/exact', price: 400,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-01-01T12:00:00.000Z'),
      }],
      lowestPrice: 400,
      highestPrice: 400,
      averagePrice: 400,
    });
    const newerFamily = createProduct({
      id: 'family',
      name: 'AMD Ryzen 5 5600',
      updatedAt: new Date('2026-03-26T12:00:00.000Z'),
      prices: [{
        storeId: 'test', storeName: 'Test', url: 'https://example.com/family', price: 200,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 200,
      highestPrice: 200,
      averagePrice: 200,
    });

    expect(applyDatabaseReadTransforms([newerFamily, olderExact], {
      searchTerm: '5600X',
      sortBy: 'relevance',
    }).map((product) => product.id)).toEqual(['exact']);
  });

  it('does not reorder category listings when relevance has no search term', () => {
    const first = createProduct({
      id: 'newer',
      name: 'AMD Ryzen 9 9900X',
      prices: [{
        storeId: 'test', storeName: 'Test', url: 'https://example.com/9', price: 900,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 900,
      highestPrice: 900,
      averagePrice: 900,
    });
    const second = createProduct({
      id: 'older',
      name: 'AMD Ryzen 5 5600X',
      prices: [{
        storeId: 'test', storeName: 'Test', url: 'https://example.com/5', price: 200,
        stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 200,
      highestPrice: 200,
      averagePrice: 200,
    });

    expect(applyDatabaseReadTransforms([first, second], { sortBy: 'relevance' }).map((product) => product.id))
      .toEqual(['newer', 'older']);
  });

  it('keeps in-stock when a cheaper out-of-stock offer arrives for the same store', () => {
    const inStock = createProduct({
      id: 'a',
      name: 'AMD Ryzen 5 7600',
      canonicalProductKey: 'procesadores|amd-ryzen-5-7600',
      prices: [{
        storeId: 'Mexx',
        storeName: 'Mexx',
        url: 'https://store/a',
        price: 100,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date('2026-03-25T12:00:00.000Z'),
      }],
      lowestPrice: 100,
    });
    const cheaperOos = createProduct({
      id: 'b',
      name: 'AMD Ryzen 5 7600 Box',
      canonicalProductKey: 'procesadores|amd-ryzen-5-7600',
      prices: [{
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://store/b',
        price: 80,
        stock: 'out-of-stock',
        installment: null,
        lastUpdated: new Date('2026-03-26T12:00:00.000Z'),
      }],
      lowestPrice: 80,
    });

    const deduped = dedupeProductsByCanonicalName([inStock, cheaperOos]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.prices).toHaveLength(1);
    expect(deduped[0]?.prices[0]?.stock).toBe('in-stock');
    expect(deduped[0]?.lowestPrice).toBe(100);
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

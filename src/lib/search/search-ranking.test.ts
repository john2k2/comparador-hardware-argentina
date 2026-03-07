import { describe, expect, it } from 'vitest';
import {
  hasRequiredSingleCharVariants,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  scoreProductRelevance,
  shouldKeepByQueryIntent,
  sortProductsBySearchRelevance,
} from './search-ranking';
import type { HardwareCategory, Product } from '@/lib/types';

function buildProduct(
  name: string,
  options?: Partial<Product> & { category?: HardwareCategory; lowestPrice?: number },
): Product {
  const lowestPrice = options?.lowestPrice ?? 100000;
  const updatedAt = options?.updatedAt ?? new Date('2026-03-06T12:00:00.000Z');

  return {
    id: options?.id ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    category: options?.category ?? 'perifericos',
    brand: options?.brand ?? 'Test',
    model: options?.model ?? name,
    description: options?.description ?? name,
    image: options?.image ?? '/pixel-box.svg',
    normalizedTitle: options?.normalizedTitle,
    canonicalProductKey: options?.canonicalProductKey,
    familyKey: options?.familyKey,
    variantKey: options?.variantKey,
    refreshPriority: options?.refreshPriority,
    lastScrapedAt: options?.lastScrapedAt,
    lastNormalizedAt: options?.lastNormalizedAt ?? null,
    specs: options?.specs ?? {},
    prices: options?.prices ?? [
      {
        storeId: 'test-store',
        storeName: 'Test Store',
        url: 'https://example.com/product',
        price: lowestPrice,
        stock: 'in-stock',
        installment: null,
        lastUpdated: updatedAt,
      },
    ],
    lowestPrice,
    highestPrice: options?.highestPrice ?? lowestPrice,
    averagePrice: options?.averagePrice ?? lowestPrice,
    createdAt: options?.createdAt ?? updatedAt,
    updatedAt,
  };
}

describe('search ranking', () => {
  it('parses single-char and strict variants from query', () => {
    expect(parseSingleCharQueryVariants('mouse logitech g502 x')).toEqual(['x']);
    expect(parseStrictVariantQueryTokens('msi shadow 2x oc rtx 5060')).toEqual(['shadow']);
  });

  it('enforces variant intent from the query', () => {
    const queryWords = ['g502', 'x'];

    expect(hasRequiredSingleCharVariants('Mouse Logitech G502 X Gaming Black', queryWords, ['x'])).toBe(true);
    expect(hasRequiredSingleCharVariants('Mouse Logitech G502 Hero', queryWords, ['x'])).toBe(false);

    expect(shouldKeepByQueryIntent('MSI RTX 5060 Shadow 2X OC 8GB', ['msi', 'shadow', '5060'], [], ['shadow'])).toBe(true);
    expect(shouldKeepByQueryIntent('MSI RTX 5060 Ventus 2X OC 8GB', ['msi', 'shadow', '5060'], [], ['shadow'])).toBe(false);
  });

  it('penalizes bundles when the query is for a single product', () => {
    const exact = buildProduct('Mouse Logitech G502 X Gaming Black', { lowestPrice: 120000 });
    const bundle = buildProduct('Combo Mouse Logitech G502 X + Mousepad', { lowestPrice: 90000 });
    const queryWords = ['mouse', 'logitech', 'g502'];

    expect(scoreProductRelevance(exact, queryWords, 'mouse logitech g502 x')).toBeGreaterThan(
      scoreProductRelevance(bundle, queryWords, 'mouse logitech g502 x'),
    );
  });

  it('sorts exact non-bundle matches ahead of cheaper bundles', () => {
    const products = [
      buildProduct('Combo Mouse Logitech G502 X + Mousepad', { lowestPrice: 90000 }),
      buildProduct('Mouse Logitech G502 X Gaming Black', { lowestPrice: 120000 }),
      buildProduct('Mouse Logitech G502 Hero', { lowestPrice: 100000 }),
    ];

    const sorted = sortProductsBySearchRelevance(products, 'mouse logitech g502 x');

    expect(sorted.map((product) => product.name)).toEqual([
      'Mouse Logitech G502 X Gaming Black',
      'Mouse Logitech G502 Hero',
      'Combo Mouse Logitech G502 X + Mousepad',
    ]);
  });
});

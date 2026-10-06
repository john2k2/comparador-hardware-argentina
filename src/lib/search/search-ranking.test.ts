import { describe, expect, it } from 'vitest';
import {
  hasRequiredSingleCharVariants,
  matchesSearchQueryIntent,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  queryAgreesWithProductModel,
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

  it('normalizes common hardware search synonyms to one comparable term', async () => {
    const { normalizeSearchText } = await import('./search-ranking');

    expect(normalizeSearchText('Placa de video RTX 5070')).toBe('gpu rtx 5070');
    expect(normalizeSearchText('GPU RTX 5070')).toBe('gpu rtx 5070');
    expect(normalizeSearchText('Micro Ryzen 7600')).toBe('cpu ryzen 7600');
    expect(normalizeSearchText('CPU Ryzen 7600')).toBe('cpu ryzen 7600');
  });

  it('enforces variant intent from the query', () => {
    const queryWords = ['g502', 'x'];

    expect(hasRequiredSingleCharVariants('Mouse Logitech G502 X Gaming Black', queryWords, ['x'])).toBe(true);
    expect(hasRequiredSingleCharVariants('Mouse Logitech G502 Hero', queryWords, ['x'])).toBe(false);

    expect(shouldKeepByQueryIntent('MSI RTX 5060 Shadow 2X OC 8GB', ['msi', 'shadow', '5060'], [], ['shadow'])).toBe(true);
    expect(shouldKeepByQueryIntent('MSI RTX 5060 Ventus 2X OC 8GB', ['msi', 'shadow', '5060'], [], ['shadow'])).toBe(false);
  });

  it.each([
    ['Motherboard Gigabyte B550M DS3H', true],
    ['Motherboard Gigabyte B550M DS3H rev 1.7', true],
    ['Motherboard Gigabyte B550M AORUS Elite', false],
    ['Motherboard Gigabyte B550M S2H', false],
  ])('respeta el modelo DS3H en una búsqueda con marca y chipset: %s', (name, expected) => {
    expect(matchesSearchQueryIntent(name, 'Motherboard Gigabyte B550M DS3H')).toBe(expected);
  });

  it('permite otros modelos cuando la búsqueda no pide DS3H', () => {
    expect(matchesSearchQueryIntent('Motherboard Gigabyte B550M AORUS Elite', 'Motherboard Gigabyte B550M')).toBe(true);
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

  it('ranks a complete model token ahead of suffix and GPU lookalikes', () => {
    const products = [
      buildProduct('AMD Ryzen 5 5600XT', { category: 'procesadores' }),
      buildProduct('Radeon RX 5600 XT', { category: 'tarjetas-graficas' }),
      buildProduct('AMD Ryzen 5 5600X', { category: 'procesadores' }),
    ];

    expect(sortProductsBySearchRelevance(products, '5600X', 'procesadores')[0]?.name)
      .toBe('AMD Ryzen 5 5600X');
  });

  it('rejects marketing copy that mentions the queried model on a different SKU', () => {
    expect(queryAgreesWithProductModel(
      'ryzen 5600x',
      'Micro AMD Ryzen 5 5600XT 4.7 Ghz AM4 (Mejor que 5600x)',
    )).toBe(false);
    expect(queryAgreesWithProductModel(
      'ryzen 5600x',
      'Micro AMD Ryzen 5 5600T 4.5 Ghz AM4 (Similar 5600xt - mejor que 5600x)',
    )).toBe(false);
    expect(queryAgreesWithProductModel(
      'ryzen 5600x',
      'Procesador Amd Am4 Ryzen 5 5600X C/Cooler',
    )).toBe(true);
    expect(queryAgreesWithProductModel('5600', 'AMD Ryzen 5 5600X')).toBe(true);
    expect(queryAgreesWithProductModel('5600', 'AMD Ryzen 5 5600XT')).toBe(true);
  });

  it('requires exact GPU suffixes when the query specifies them', () => {
    expect(queryAgreesWithProductModel(
      'rtx 4070 ti',
      'Placa De Video Gigabyte Rtx 4070 Ti Super Aero Oc 16gb',
    )).toBe(false);
    expect(queryAgreesWithProductModel(
      'rtx 4070 ti super',
      'Placa De Video Gigabyte Rtx 4070 Ti Super Aero Oc 16gb',
    )).toBe(true);
    expect(queryAgreesWithProductModel('rtx 4070 ti', 'Video Geforce Msi Ventus 3X RTX 4070 TI 12GB OC')).toBe(true);
    expect(queryAgreesWithProductModel('rtx 4070 ti', 'PLACA DE VIDEO ASUS TUF RTX 4070 TI S OC 16GB GAMING')).toBe(false);
    expect(queryAgreesWithProductModel('rtx 4070 ti super', 'PLACA DE VIDEO ASUS TUF RTX 4070 TI S OC 16GB GAMING')).toBe(true);
    expect(queryAgreesWithProductModel('rtx 4070', 'Placa De Video Gigabyte Rtx 4070 Ti Super Aero Oc 16gb')).toBe(true);
  });

  it('hides a desktop-named kit if a store URL is SODIMM', () => {
    expect(queryAgreesWithProductModel(
      'ddr5 32gb',
      'Memoria PC Fury DDR5 32GB 5600 Beast RGB Negra',
      ['https://katech.com.ar/producto/memoria-ram-sodimm-32gb-ddr5-4800-crucial-ct/'],
    )).toBe(false);
  });

  it('hides SODIMM unless the query asks for portable RAM', () => {
    expect(queryAgreesWithProductModel(
      'ddr5 32gb',
      'MEMORIA RAM SODIMM 32GB DDR5 4800 CRUCIAL CT',
    )).toBe(false);
    expect(queryAgreesWithProductModel(
      'ddr5 32gb sodimm',
      'MEMORIA RAM SODIMM 32GB DDR5 4800 CRUCIAL CT',
    )).toBe(true);
    expect(queryAgreesWithProductModel(
      'ddr5 32gb',
      'Memoria Ram Adata XPG Lancer Black 32GB 5600Mhz DDR5 CL46',
    )).toBe(true);
  });

  it('enforces G502 X via query intent including the raw query', () => {
    const words = ['g502'];
    expect(shouldKeepByQueryIntent('Mouse Logitech G502 Gaming HERO', words, ['x'], [], 'g502 x')).toBe(false);
    expect(shouldKeepByQueryIntent('Mouse Logitech G502 X Gaming Black', words, ['x'], [], 'g502 x')).toBe(true);
  });

  it('ranks all-OOS matches behind products with stock', () => {
    const oos = buildProduct('AMD Ryzen 5 5600X Box', {
      category: 'procesadores',
      lowestPrice: 200000,
      prices: [{
        storeId: 'mexx',
        storeName: 'Mexx',
        url: 'https://example.com/oos',
        price: 200000,
        stock: 'out-of-stock',
        installment: null,
        lastUpdated: new Date('2026-03-06T12:00:00.000Z'),
      }],
    });
    const inStock = buildProduct('AMD Ryzen 5 5600X Tray', {
      category: 'procesadores',
      lowestPrice: 400000,
    });

    expect(sortProductsBySearchRelevance([oos, inStock], '5600X', 'procesadores')[0]?.name)
      .toBe('AMD Ryzen 5 5600X Tray');
  });

  it('does not use an inherited lowest price when prices are empty', () => {
    const inheritedPrice = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-inherited-price',
      category: 'tarjetas-graficas',
      lowestPrice: 100000,
      prices: [],
    });
    const available = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-available',
      category: 'tarjetas-graficas',
      lowestPrice: 240000,
    });

    expect(sortProductsBySearchRelevance([inheritedPrice, available], 'RTX 5060', 'tarjetas-graficas')[0]?.id)
      .toBe('rtx-5060-available');
  });

  it('does not rank an identity-review offer ahead of a comparable offer', () => {
    const needsReview = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-needs-review',
      category: 'tarjetas-graficas',
      lowestPrice: 120000,
      prices: [{
        storeId: 'test-store',
        storeName: 'Test Store',
        url: 'https://example.com/rtx-5060-review',
        price: 120000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
        identityReview: {
          version: 1,
          status: 'needs-review',
          reason: 'low-confidence',
          reviewedAt: null,
          model: null,
          confidence: null,
          subject: {
            name: 'NVIDIA GeForce RTX 5060',
            category: 'tarjetas-graficas',
            url: 'https://example.com/rtx-5060-review',
          },
        },
      }],
    });
    const comparable = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-comparable',
      category: 'tarjetas-graficas',
      lowestPrice: 240000,
    });

    expect(sortProductsBySearchRelevance([needsReview, comparable], 'RTX 5060', 'tarjetas-graficas')[0]?.id)
      .toBe('rtx-5060-comparable');
  });

  it('does not count unknown stock or zero-price offers as comparable', () => {
    const invalidOffers = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-invalid-offers',
      category: 'tarjetas-graficas',
      lowestPrice: 0,
      prices: [
        {
          storeId: 'zero-price',
          storeName: 'Zero Price',
          url: 'https://example.com/rtx-5060-zero',
          price: 0,
          stock: 'in-stock',
          installment: null,
          lastUpdated: new Date(),
        },
        {
          storeId: 'unknown-stock',
          storeName: 'Unknown Stock',
          url: 'https://example.com/rtx-5060-unknown',
          price: 180000,
          stock: 'unknown',
          installment: null,
          lastUpdated: new Date(),
        },
      ],
    });
    const comparable = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-stocked',
      category: 'tarjetas-graficas',
      lowestPrice: 240000,
    });

    expect(sortProductsBySearchRelevance([invalidOffers, comparable], 'RTX 5060', 'tarjetas-graficas')[0]?.id)
      .toBe('rtx-5060-stocked');
  });

  it('uses the offer lastUpdated for freshness instead of product updatedAt', () => {
    const now = Date.now();
    const freshOfferUpdatedAt = new Date(now - 2 * 60 * 60 * 1000);
    const staleOfferUpdatedAt = new Date(now - 26 * 60 * 60 * 1000);
    const fresh = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-fresh-offer',
      category: 'tarjetas-graficas',
      updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      lowestPrice: 240000,
      prices: [{
        storeId: 'fresh-store',
        storeName: 'Fresh Store',
        url: 'https://example.com/rtx-5060-fresh',
        price: 240000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: freshOfferUpdatedAt,
      }],
    });
    const stale = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-stale-offer',
      category: 'tarjetas-graficas',
      updatedAt: new Date(now),
      lowestPrice: 240000,
      prices: [{
        storeId: 'stale-store',
        storeName: 'Stale Store',
        url: 'https://example.com/rtx-5060-stale',
        price: 240000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: staleOfferUpdatedAt,
      }],
    });

    expect(sortProductsBySearchRelevance([stale, fresh], 'RTX 5060', 'tarjetas-graficas')[0]?.id)
      .toBe('rtx-5060-fresh-offer');
  });

  it('keeps pending products at the end without dropping them', () => {
    const fresh = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-fresh',
      category: 'tarjetas-graficas',
    });
    const pending = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-pending',
      category: 'tarjetas-graficas',
      prices: [{
        storeId: 'pending-store',
        storeName: 'Pending Store',
        url: 'https://example.com/rtx-5060-pending',
        price: 120000,
        stock: 'in-stock',
        installment: null,
        lastUpdated: new Date(),
        identityReview: {
          version: 1,
          status: 'needs-review',
          reason: 'low-confidence',
          reviewedAt: null,
          model: null,
          confidence: null,
          subject: {
            name: 'NVIDIA GeForce RTX 5060',
            category: 'tarjetas-graficas',
            url: 'https://example.com/rtx-5060-pending',
          },
        },
      }],
    });
    const noComparableOffer = buildProduct('NVIDIA GeForce RTX 5060', {
      id: 'rtx-5060-no-comparable-offer',
      category: 'tarjetas-graficas',
      lowestPrice: 999999,
      prices: [],
    });

    const sorted = sortProductsBySearchRelevance(
      [pending, noComparableOffer, fresh],
      'RTX 5060',
      'tarjetas-graficas',
    );

    expect(sorted).toHaveLength(3);
    expect(sorted.map((product) => product.id)).toEqual([
      'rtx-5060-fresh',
      'rtx-5060-pending',
      'rtx-5060-no-comparable-offer',
    ]);
  });

  it('prefers an equally relevant product with several current offers', () => {
    const stale = buildProduct('AMD Ryzen 5 7600 Box', {
      category: 'procesadores',
      lastScrapedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    const fresh = buildProduct('AMD Ryzen 5 7600 Box', {
      category: 'procesadores',
      lastScrapedAt: new Date('2026-03-20T10:00:00.000Z'),
      prices: [
        {
          storeId: 'mexx', storeName: 'Mexx', url: 'https://example.com/mexx', price: 300000,
          stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-20T10:00:00.000Z'),
        },
        {
          storeId: 'venex', storeName: 'Venex', url: 'https://example.com/venex', price: 305000,
          stock: 'in-stock', installment: null, lastUpdated: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
    });
    const queryWords = ['ryzen', '7600'];
    const now = new Date('2026-03-20T12:00:00.000Z').getTime();

    expect(scoreProductRelevance(fresh, queryWords, 'ryzen 7600', 'procesadores', now))
      .toBeGreaterThan(scoreProductRelevance(stale, queryWords, 'ryzen 7600', 'procesadores', now));
  });
});

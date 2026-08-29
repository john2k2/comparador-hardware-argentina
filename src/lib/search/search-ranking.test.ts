import { describe, expect, it } from 'vitest';
import {
  hasRequiredSingleCharVariants,
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
});

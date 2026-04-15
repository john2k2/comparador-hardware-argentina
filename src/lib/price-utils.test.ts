import { describe, expect, it } from 'vitest';
import type { ProductPrice } from './types';
import {
  computeComparableStorePriceStats,
  parseLocalizedArsPrice,
  pickBestStorePrices,
} from './price-utils';

function buildPrice(overrides: Partial<ProductPrice>): ProductPrice {
  return {
    storeId: 'store-a',
    storeName: 'Store A',
    url: 'https://example.com/producto',
    price: 250_000,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-03-13T12:00:00.000Z'),
    ...overrides,
  };
}

describe('price-utils', () => {
  it('parseLocalizedArsPrice respeta separadores locales de ARS', () => {
    expect(parseLocalizedArsPrice('$ 248.496,11')).toBe(248_496);
    expect(parseLocalizedArsPrice('248.496')).toBe(248_496);
    expect(parseLocalizedArsPrice('ARS 248496,50')).toBe(248_497);
  });

  it('parseLocalizedArsPrice no concatena numeros de cuotas con el precio', () => {
    // Bug fix: antes "3 cuotas de $82.832" se parseaba como 382832
    expect(parseLocalizedArsPrice('3 cuotas de $82.832')).toBe(82_832);
    expect(parseLocalizedArsPrice('Antes: $300.000 Ahora: $248.496')).toBe(248_496);
  });

  it('pickBestStorePrices deja la mejor opcion por tienda', () => {
    const picked = pickBestStorePrices([
      buildPrice({
        storeId: 'venex',
        storeName: 'Venex',
        price: 320_000,
        lastUpdated: new Date('2026-03-13T10:00:00.000Z'),
      }),
      buildPrice({
        storeId: 'venex',
        storeName: 'Venex',
        price: 300_000,
        lastUpdated: new Date('2026-03-13T11:00:00.000Z'),
      }),
      buildPrice({
        storeId: 'mexx',
        storeName: 'Mexx',
        price: 305_000,
      }),
    ]);

    expect(picked).toHaveLength(2);
    expect(picked.map((price) => [price.storeId, price.price])).toEqual([
      ['venex', 300_000],
      ['mexx', 305_000],
    ]);
  });

  it('computeComparableStorePriceStats filtra outliers altos absurdos sin romper precios reales', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 260_000 }),
      buildPrice({ storeId: 'mexx', storeName: 'Mexx', price: 262_000 }),
      buildPrice({ storeId: 'compugarden', storeName: 'Compugarden', price: 24_849_611 }),
    ]);

    expect(stats.comparablePrices).toHaveLength(2);
    expect(stats.discardedPrices).toHaveLength(1);
    expect(stats.lowest).toBe(260_000);
    expect(stats.highest).toBe(262_000);
    expect(stats.average).toBe(261_000);
  });

  it('computeComparableStorePriceStats tambien filtra un outlier alto cuando solo hay dos tiendas', () => {
    const stats = computeComparableStorePriceStats([
      buildPrice({ storeId: 'venex', storeName: 'Venex', price: 255_000 }),
      buildPrice({ storeId: 'compugarden', storeName: 'Compugarden', price: 24_849_611 }),
    ]);

    expect(stats.comparablePrices.map((price) => price.storeId)).toEqual(['venex']);
    expect(stats.discardedPrices.map((price) => price.storeId)).toEqual(['compugarden']);
    expect(stats.highest).toBe(255_000);
  });
});

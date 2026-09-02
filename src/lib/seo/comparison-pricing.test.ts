import { describe, expect, it } from 'vitest';
import type { ProductPrice } from '@/lib/types';
import { resolveComparisonPricing } from './comparison-pricing';

function offer(overrides: Partial<ProductPrice> & Pick<ProductPrice, 'storeId' | 'price'>): ProductPrice {
  return {
    storeName: overrides.storeName ?? overrides.storeId,
    url: `https://example.com/${overrides.storeId}`,
    stock: 'in-stock',
    installment: null,
    lastUpdated: new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('resolveComparisonPricing', () => {
  it('no declara ganador ni delta cuando un lado no tiene ofertas en stock', () => {
    const pricing = resolveComparisonPricing({
      product1Name: 'RTX 4060',
      product2Name: 'RX 7600',
      product1Prices: [],
      product2Prices: [offer({ storeId: 'shopgamer', storeName: 'ShopGamer', price: 957_728 })],
    });

    expect(pricing.canDeclareWinner).toBe(false);
    expect(pricing.cheaperName).toBeNull();
    expect(pricing.priceDiff).toBeNull();
    expect(pricing.side1.offerCount).toBe(0);
    expect(pricing.side2.offerCount).toBe(1);
    expect(pricing.side2.bestPrice).toBe(957_728);
    expect(pricing.storeCoverageCopy).not.toMatch(/20/);
  });

  it('no deja que un precio 0 o un OOS gane como más barato', () => {
    const pricing = resolveComparisonPricing({
      product1Name: 'RTX 4060',
      product2Name: 'RX 7600',
      product1Prices: [
        offer({ storeId: 'ghost', price: 0 }),
        offer({ storeId: 'oos', price: 100_000, stock: 'out-of-stock' }),
      ],
      product2Prices: [offer({ storeId: 'mexx', storeName: 'Mexx', price: 400_000 })],
    });

    expect(pricing.canDeclareWinner).toBe(false);
    expect(pricing.side1.bestPrice).toBeNull();
    expect(pricing.side2.bestPrice).toBe(400_000);
  });

  it('declara ganador solo con dos lados en stock y cuenta tiendas reales', () => {
    const pricing = resolveComparisonPricing({
      product1Name: 'RTX 4060',
      product2Name: 'RX 7600',
      product1Prices: [
        offer({ storeId: 'venex', storeName: 'Venex', price: 500_000 }),
        offer({ storeId: 'mexx', storeName: 'Mexx', price: 520_000 }),
      ],
      product2Prices: [
        offer({ storeId: 'venex', storeName: 'Venex', price: 480_000 }),
        offer({ storeId: 'fullh4rd', storeName: 'FullH4rd', price: 490_000 }),
      ],
    });

    expect(pricing.canDeclareWinner).toBe(true);
    expect(pricing.cheaperName).toBe('RX 7600');
    expect(pricing.priceDiff).toBe(20_000);
    expect(pricing.storeCount).toBe(3);
    expect(pricing.storeCoverageCopy).toContain('3 tiendas');
    expect(pricing.side1.offerCount).toBe(2);
    expect(pricing.side2.offerCount).toBe(2);
  });
});

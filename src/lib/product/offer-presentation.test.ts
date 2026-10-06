import { describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import { buildOfferPresentation } from './offer-presentation';

const now = Date.parse('2026-10-06T15:00:00Z');
const product = { name: 'AMD Ryzen 7 7800X3D', category: 'procesadores' } as Product;
function offer(storeId: string, price: number, overrides: Partial<ProductPrice> = {}): ProductPrice {
  return { storeId, storeName: storeId, url: 'https://store.example/amd-ryzen-7-7800x3d',
    price, stock: 'in-stock', installment: null, lastUpdated: new Date(now), ...overrides };
}

describe('offer presentation', () => {
  it('orders recent offers before cheaper historical references and accepts observations from four hours ago', () => {
    const old = offer('old', 10_000, { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS - 1) });
    const expensive = offer('expensive', 120_000);
    const best = offer('best', 100_000, { lastUpdated: new Date(now - 4 * 60 * 60 * 1000) });
    const prices = [old, expensive, best];
    const result = buildOfferPresentation(product, prices, now);
    expect(result.recentPrices).toEqual([best, expensive]);
    expect(result.referencePrices).toEqual([old]);
    expect(result.bestOffer).toBe(best);
    expect([result.lowest, result.highest]).toEqual([100_000, 120_000]);
    expect(prices).toEqual([old, expensive, best]);
  });

  it.each([
    { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS - 1) },
    { lastUpdated: new Date(now + 120_000) },
    { lastUpdated: new Date(NaN) },
    { stock: 'unknown' as const },
    { stock: 'out-of-stock' as const },
    { url: '' },
    { url: 'javascript:alert(1)' },
    { url: 'https://user:password@store.example/item' },
    { url: 'https://store.example/amd-ryzen-7-7700x' },
    { price: 0 },
    { price: NaN },
    { price: Infinity },
  ])('keeps an ineligible offer out of the minimum: %j', (overrides) => {
    const invalid = offer('invalid', 10_000, overrides);
    const valid = offer('valid', 100_000);
    const result = buildOfferPresentation(product, [invalid, valid], now);
    expect(result.recentPrices).toEqual([valid]);
    expect(result.referencePrices).toEqual([invalid]);
    expect(result.lowest).toBe(100_000);
  });

  it('applies outlier checks only to recent eligible candidates', () => {
    const best = offer('best', 100_000);
    const other = offer('other', 120_000);
    const outlier = offer('outlier', 1_000_000);
    const references = [1, 2, 3, 4].map((id) => offer(`old-${id}`, 1_000_000,
      { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS - 1) }));
    const result = buildOfferPresentation(product, [outlier, ...references, other, best], now);
    expect(result.recentPrices).toEqual([best, other]);
    expect(result.referencePrices).toContain(outlier);
    expect(result.lowest).toBe(100_000);
    expect(result.highest).toBe(120_000);
  });

  it('recalculates the best offer and the range as the shared clock crosses expiry', () => {
    const expiring = offer('expiring', 100_000, { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS) });
    const remaining = offer('remaining', 120_000);
    const prices = [remaining, expiring];
    expect(buildOfferPresentation(product, prices, now).bestOffer).toBe(expiring);
    const after = buildOfferPresentation(product, prices, now + 1);
    expect(after.recentPrices).toEqual([remaining]);
    expect(after.referencePrices).toEqual([expiring]);
    expect([after.lowest, after.highest]).toEqual([120_000, 120_000]);
    const expired = buildOfferPresentation(product, prices, now + CATALOG_OFFER_FRESH_MS + 1);
    expect(expired.bestOffer).toBeUndefined();
    expect([expired.lowest, expired.highest]).toEqual([0, 0]);
  });

  it('uses the received clock to choose a publication of the same store', () => {
    const expiring = offer('STORE', 100_000, { lastUpdated: new Date(now - CATALOG_OFFER_FRESH_MS) });
    const newer = offer('store', 120_000);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 1);
    try {
      expect(buildOfferPresentation(product, [newer, expiring], now).bestOffer).toBe(expiring);
      expect(buildOfferPresentation(product, [newer, expiring], now + 1).bestOffer).toBe(newer);
    } finally { clock.mockRestore(); }
  });
});

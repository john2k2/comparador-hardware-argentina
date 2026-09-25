import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { buildProductRefreshTargets } from './product-refresh-targets';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function offer(storeId: string, observedAt: string, url = `https://${storeId}.example/cpu`): ProductPrice {
  return { storeId, storeName: storeId, url, price: 200_000, stock: 'in-stock', installment: null, lastUpdated: new Date(observedAt) };
}

function product(prices: ProductPrice[]): Product {
  return {
    id: 'agrupado-procesadores-intel-i5-12400', name: 'Intel Core i5 12400', category: 'procesadores',
    brand: 'Intel', model: 'i5 12400', specs: {}, prices, lowestPrice: 200_000,
    highestPrice: 200_000, averagePrice: 200_000, createdAt: NOW, updatedAt: NOW,
  };
}

describe('buildProductRefreshTargets', () => {
  afterEach(() => vi.useRealTimers());

  it('selects stale or identity-pending offers and leaves fresh confirmed offers alone', () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const fresh = offer('fresh', '2026-09-25T11:00:00.000Z');
    const pending = offer('pending', '2026-09-25T11:00:00.000Z');
    pending.identityReview = {
      version: 1, status: 'needs-review', reason: 'low-confidence', reviewedAt: NOW.toISOString(),
      model: 'jev-1.13.0', confidence: 0.5,
      subject: { name: 'intel core i5 12400', category: 'procesadores', url: pending.url },
    };
    const stale = offer('stale', '2026-09-25T08:00:00.000Z');

    expect(buildProductRefreshTargets(product([stale, fresh, pending]))).toEqual([
      { productId: 'agrupado-procesadores-intel-i5-12400', storeId: 'pending', url: pending.url },
      { productId: 'agrupado-procesadores-intel-i5-12400', storeId: 'stale', url: stale.url },
    ]);
  });

  it('caps requests at eight unique HTTPS offers and rejects invalid identifiers', () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const offers = Array.from({ length: 10 }, (_, index) => offer(`store-${index}`, '2026-09-25T08:00:00.000Z'));
    offers.push(offer('store-0', '2026-09-25T08:00:00.000Z', offers[0].url));
    offers.push(offer('http-store', '2026-09-25T08:00:00.000Z', 'http://example.com/cpu'));

    expect(buildProductRefreshTargets(product(offers))).toHaveLength(8);
    expect(buildProductRefreshTargets({ ...product(offers), id: 'invalid id' })).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { filterCurrentCatalogProducts } from './search-availability';
import { paginateProducts } from './search-pagination';
import { createSearchCacheEntry } from './search-cache-utils';

const now = new Date('2026-10-05T13:00:00Z');
function product(id: string, overrides: Partial<ProductPrice> = {}): Product {
  return {
    id, name: 'Mouse Logitech G502', brand: 'Logitech', model: 'G502', category: 'perifericos', specs: {},
    prices: [{ storeId: 'test-store', storeName: 'Tienda', url: 'https://store.example/mouse-logitech-g502',
      price: 100, stock: 'in-stock', installment: null, lastUpdated: now, ...overrides }],
    lowestPrice: 100, highestPrice: 100, averagePrice: 100, createdAt: now, updatedAt: now,
  };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe('current catalog results', () => {
  it('filters expired, missing, unsafe, unverified and unavailable offers before paginating', () => {
    const current = Array.from({ length: 14 }, (_, i) => product(`current-${i}`));
    const unpriced = { ...product('no-offer'), prices: [] };
    const excluded = [product('old', { lastUpdated: new Date('2026-10-03T13:00:00Z') }), unpriced,
      product('unknown-stock', { stock: 'unknown' }), product('sold-out', { stock: 'out-of-stock' }),
      product('zero', { price: 0 }), product('no-url', { url: '' }), product('invalid-url', { url: 'javascript:alert(1)' }),
      product('future', { lastUpdated: new Date('2026-10-06T13:00:00Z') }),
      product('pending', { identityReview: { version: 1, status: 'needs-review', reason: 'low-confidence',
        reviewedAt: now.toISOString(), model: 'jev', confidence: 0.5,
        subject: { name: 'mouse logitech g502', category: 'perifericos', url: 'https://store.example/mouse-logitech-g502' } } })];
    const all = [...excluded, ...current];
    expect(filterCurrentCatalogProducts(all)).toEqual(current);
    const second = paginateProducts(filterCurrentCatalogProducts(all), 2, 12);
    expect(second.totalPages).toBe(2);
    expect(second.paginatedProducts.map((item) => item.id)).toEqual(['current-12', 'current-13']);
    expect(filterCurrentCatalogProducts(all, true)).toEqual(all);
  });

  it('expires the client cache when the last current offer for a displayed product expires', () => {
    const item = product('expiring', { lastUpdated: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 15_000) });
    const payload = { products: [item], pagination: { limit: 1, offset: 0, total: 1, totalPages: 1, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
    expect(createSearchCacheEntry(payload).expiresAt).toBe(now.getTime() + 15_000);
    item.prices.push({ ...item.prices[0], storeId: 'other', lastUpdated: now });
    expect(createSearchCacheEntry(payload).expiresAt).toBe(now.getTime() + 90_000);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductPrice } from '@/lib/types';
import { filterCurrentCatalogProducts } from './search-availability';
import { paginateProducts } from './search-pagination';
import { createSearchCacheEntry, readStoredSearch, writeStoredSearch } from './search-cache-utils';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';

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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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

  it('expires the client cache when any comparable offer expires even while another remains current', () => {
    const item = product('expiring', { lastUpdated: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 15_000) });
    const payload = { products: [item], pagination: { limit: 1, offset: 0, total: 1, totalPages: 1, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
    expect(createSearchCacheEntry(payload).expiresAt).toBe(now.getTime() + 15_000);
    item.prices.push({ ...item.prices[0], storeId: 'other', lastUpdated: now });
    expect(createSearchCacheEntry(payload).expiresAt).toBe(now.getTime() + 15_000);
  });
  it('invalidates a cached maximum-price result before its cheapest offer expires and the card moves above the bound', () => {
    const item = product('price-bound', { lastUpdated: new Date(now.getTime() - 86400_000 + 15_000) });
    item.prices.push({ ...item.prices[0], storeId: 'other', price: 200, lastUpdated: now });
    const payload = { products: [item], pagination: { limit: 1, offset: 0, total: 1, totalPages: 1, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { sessionStorage: { getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const key = 'q=mouse|maxPrice=150|page=1';
    writeStoredSearch(key, createSearchCacheEntry(payload));
    expect(readStoredSearch(key)?.payload.products[0].lowestPrice).toBeLessThanOrEqual(150);
    vi.advanceTimersByTime(16_000);
    expect(Math.min(...getRecentProductOffers(item).map(offer => offer.price))).toBeGreaterThan(150);
    expect(readStoredSearch(key)).toBeNull();
    expect(storage.size).toBe(0);
    expect(item.prices[0].lastUpdated).toEqual(new Date(now.getTime() - 86400_000 + 15_000));
  });
  it('invalidates price ordering before a formerly cheaper product becomes dearer than the next result', () => {
    const first = product('first', { lastUpdated: new Date(now.getTime() - 86400_000 + 15_000) });
    first.prices.push({ ...first.prices[0], storeId: 'other', price: 200, lastUpdated: now });
    const second = product('second', { price: 150 }); second.lowestPrice = 150;
    const payload = { products: [first, second], pagination: { limit: 2, offset: 0, total: 2, totalPages: 1, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
    const entry = createSearchCacheEntry(payload);
    expect(entry.expiresAt).toBe(now.getTime() + 15_000);
    vi.advanceTimersByTime(16_000);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now());
    expect(Math.min(...getRecentProductOffers(first).map(offer => offer.price)))
      .toBeGreaterThan(Math.min(...getRecentProductOffers(second).map(offer => offer.price)));
  });
  it('preserves the normal TTL for historical references and ignores unknown-stock offers as expiration inputs', () => {
    const old = product('reference', { lastUpdated: new Date(now.getTime() - 2 * 86400_000) });
    const current = product('current');
    current.prices.push({ ...current.prices[0], stock: 'unknown', lastUpdated: new Date(now.getTime() - 86400_000 + 15_000) });
    const payload = { products: [old, current], pagination: { limit: 2, offset: 0, total: 2, totalPages: 1, page: 1, pageSize: 12 },
      facets: { categories: [], brands: [], stores: [] } };
    expect(createSearchCacheEntry(payload).expiresAt).toBe(now.getTime() + 90_000);
    expect(payload.products[0].prices[0].lastUpdated).toEqual(old.prices[0].lastUpdated);
  });
});

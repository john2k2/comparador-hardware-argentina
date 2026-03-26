import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { hasStaleProducts, isProductStale } from '@/lib/persistence/product-staleness';

function createProduct(updatedAt: Date | undefined): Product {
  const now = new Date('2026-03-26T12:00:00.000Z');

  return {
    id: 'test-product',
    name: 'Test Product',
    category: 'procesadores',
    brand: 'AMD',
    model: 'Test Product',
    specs: {},
    prices: [],
    lowestPrice: 100,
    highestPrice: 100,
    averagePrice: 100,
    createdAt: now,
    updatedAt: updatedAt ?? now,
  };
}

describe('product-staleness', () => {
  it('treats products without a valid updatedAt as stale', () => {
    const invalid = createProduct(undefined);
    Object.assign(invalid, { updatedAt: undefined });

    expect(isProductStale(invalid, 60_000, Date.parse('2026-03-26T12:01:00.000Z'))).toBe(true);
  });

  it('detects stale and fresh products using the provided clock', () => {
    const fresh = createProduct(new Date('2026-03-26T11:59:30.000Z'));
    const stale = createProduct(new Date('2026-03-26T11:00:00.000Z'));
    const nowMs = Date.parse('2026-03-26T12:00:00.000Z');

    expect(isProductStale(fresh, 60_000, nowMs)).toBe(false);
    expect(isProductStale(stale, 60_000, nowMs)).toBe(true);
  });

  it('returns whether any product in the batch is stale', () => {
    const fresh = createProduct(new Date());
    const stale = createProduct(new Date(Date.now() - 120_000));

    expect(hasStaleProducts([], 60_000)).toBe(false);
    expect(hasStaleProducts([fresh], 60_000)).toBe(false);
    expect(hasStaleProducts([fresh, stale], 60_000)).toBe(true);
  });
});

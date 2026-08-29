import { describe, expect, it } from 'vitest';
import {
  STALE_PRODUCT_PRICE_POLICY,
  selectStaleProductPricesToPrune,
} from './stale-product-prices';

const now = new Date('2026-08-29T18:00:00.000Z');

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

describe('selectStaleProductPricesToPrune', () => {
  it('prunes old URLs for a store that still appears in the snapshot', () => {
    const stale = selectStaleProductPricesToPrune({
      now,
      persisted: [
        {
          product_id: 'cpu-1',
          store_id: 'mexx',
          url: 'https://mexx.test/old',
          last_updated: daysAgo(1),
        },
        {
          product_id: 'cpu-1',
          store_id: 'mexx',
          url: 'https://mexx.test/current',
          last_updated: hoursAgo(2),
        },
      ],
      snapshot: [
        {
          product_id: 'cpu-1',
          store_id: 'mexx',
          url: 'https://mexx.test/current',
        },
      ],
      products: [{ id: 'cpu-1', last_scraped_at: now.toISOString() }],
    });

    expect(stale).toEqual([
      {
        product_id: 'cpu-1',
        store_id: 'mexx',
        url: 'https://mexx.test/old',
      },
    ]);
  });

  it('does not prune a long-tail store just because the product price is old', () => {
    const stale = selectStaleProductPricesToPrune({
      now,
      persisted: [
        {
          product_id: 'ssd-1',
          store_id: 'venex',
          url: 'https://venex.test/ssd',
          last_updated: daysAgo(40),
        },
      ],
      snapshot: [],
      products: [{ id: 'ssd-1', last_scraped_at: daysAgo(20) }],
    });

    expect(stale).toEqual([]);
  });

  it('prunes a ghost store when the product was scraped recently and the offer is old', () => {
    const stale = selectStaleProductPricesToPrune({
      now,
      persisted: [
        {
          product_id: 'gpu-1',
          store_id: 'fullhard',
          url: 'https://fullhard.test/gone',
          last_updated: daysAgo(STALE_PRODUCT_PRICE_POLICY.ghostPriceOlderThanDays + 1),
        },
        {
          product_id: 'gpu-1',
          store_id: 'compragamer',
          url: 'https://compragamer.test/live',
          last_updated: hoursAgo(3),
        },
      ],
      snapshot: [
        {
          product_id: 'gpu-1',
          store_id: 'compragamer',
          url: 'https://compragamer.test/live',
        },
      ],
      products: [{
        id: 'gpu-1',
        last_scraped_at: hoursAgo(STALE_PRODUCT_PRICE_POLICY.productFreshWithinHours - 1),
      }],
    });

    expect(stale).toEqual([
      {
        product_id: 'gpu-1',
        store_id: 'fullhard',
        url: 'https://fullhard.test/gone',
      },
    ]);
  });
});

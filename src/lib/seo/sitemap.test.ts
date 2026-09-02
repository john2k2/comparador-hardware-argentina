import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, requestedRanges } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  requestedRanges: [] as Array<[number, number]>,
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { countIndexedProducts } from './sitemap';

function buildRow(index: number) {
  return {
    id: `group:${index}`,
    updated_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    canonical_product_key: `product-${index}`,
    product_prices: [
      { store_id: 'store-a', price: 100, url: 'https://store-a.example/product' },
      { store_id: 'store-b', price: 110, url: 'https://store-b.example/product' },
    ],
  };
}

describe('product sitemap reads', () => {
  beforeEach(() => {
    requestedRanges.length = 0;
    const rows = Array.from({ length: 5_001 }, (_, index) => buildRow(index));
    const query = {
      select: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn((from: number, to: number) => {
        requestedRanges.push([from, to]);
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      }),
    };

    getServerSupabaseReadClientMock.mockReturnValue({
      from: vi.fn(() => query),
    });
  });

  it('paginates Supabase until every indexable product is read', async () => {
    await expect(countIndexedProducts()).resolves.toBe(5_001);
    expect(requestedRanges).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
      [3_000, 3_999],
      [4_000, 4_999],
      [5_000, 5_999],
    ]);
  });
});

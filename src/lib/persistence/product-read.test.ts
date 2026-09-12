import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rangeMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rangeMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { readCategoryLandingPageFromDatabase } from './product-read';

const row = {
  id: 'agrupado-procesadores-amd-ryzen-7600',
  name: 'AMD Ryzen 5 7600',
  category: 'procesadores',
  brand: 'AMD',
  model: 'Ryzen 5 7600',
  description: null,
  image: null,
  normalized_title: null,
  canonical_product_key: 'amd-ryzen-5-7600',
  family_key: null,
  variant_key: null,
  refresh_priority: null,
  last_scraped_at: null,
  last_normalized_at: null,
  specs: {},
  lowest_price: 200_000,
  highest_price: 210_000,
  average_price: 205_000,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
  product_prices: [
    { store_id: 'mexx', url: 'https://example.com/mexx', price: 200_000, original_price: null, stock: 'in-stock', installment_count: null, installment_amount: null, last_updated: '2026-09-12T00:00:00.000Z' },
  ],
};

describe('readCategoryLandingPageFromDatabase', () => {
  beforeEach(() => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: rangeMock,
    };
    getServerSupabaseReadClientMock.mockReturnValue({ from: vi.fn(() => query) });
    rangeMock.mockResolvedValue({ data: [row], error: null, count: 25 });
  });

  it('lee sólo la ventana solicitada de productos agrupados y conserva el total', async () => {
    const result = await readCategoryLandingPageFromDatabase('procesadores', 2, 12);

    expect(rangeMock).toHaveBeenCalledWith(12, 23);
    expect(result).toMatchObject({ total: 25, totalPages: 3, page: 2, pageSize: 12 });
    expect(result.products).toEqual([expect.objectContaining({ id: row.id, lowestPrice: 200_000 })]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rpcMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { countIndexedProducts, readProductSitemapPage } from './sitemap';

describe('product sitemap reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rpcMock });
  });

  it('asks PostgreSQL for the count without loading catalog rows', async () => {
    rpcMock.mockResolvedValue({ data: 5_001, error: null });

    await expect(countIndexedProducts()).resolves.toBe(5_001);
    expect(rpcMock).toHaveBeenCalledWith('count_indexable_sitemap_products');
  });

  it('asks PostgreSQL for the requested page', async () => {
    const rows = [{
      id: 'agrupado-cpu-1',
      updated_at: '2026-09-12T00:00:00.000Z',
      canonical_product_key: 'cpu-1',
    }];
    rpcMock.mockResolvedValue({ data: rows, error: null });

    await expect(readProductSitemapPage(2, 500)).resolves.toEqual(rows);
    expect(rpcMock).toHaveBeenCalledWith('read_indexable_sitemap_products', {
      p_page: 2,
      p_page_size: 500,
    });
  });

  it('returns an empty result when the database is unavailable', async () => {
    getServerSupabaseReadClientMock.mockReturnValue(null);

    await expect(countIndexedProducts()).resolves.toBe(0);
    await expect(readProductSitemapPage(0)).resolves.toEqual([]);
  });
});

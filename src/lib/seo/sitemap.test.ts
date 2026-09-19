import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rpcMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { countIndexedProducts, readIndexedProductCount, readProductSitemapPage } from './sitemap';

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

  it('retries one transient count failure before degrading the sitemap index', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'temporary failure' } })
      .mockResolvedValueOnce({ data: 5_001, error: null });

    await expect(readIndexedProductCount()).resolves.toEqual({ count: 5_001, source: 'database' });
    expect(rpcMock).toHaveBeenCalledTimes(2);
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

  it('reuses the last reliable count when the database is temporarily unavailable', async () => {
    rpcMock.mockResolvedValueOnce({ data: 5_001, error: null });
    await expect(readIndexedProductCount()).resolves.toEqual({ count: 5_001, source: 'database' });
    getServerSupabaseReadClientMock.mockReturnValue(null);

    await expect(readIndexedProductCount()).resolves.toEqual({ count: 5_001, source: 'memory' });
    await expect(countIndexedProducts()).resolves.toBe(5_001);
    await expect(readProductSitemapPage(0)).resolves.toEqual([]);
  });
});

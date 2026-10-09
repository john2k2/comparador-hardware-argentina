import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerSupabaseReadClientMock, rpcMock, abortSignalMock } = vi.hoisted(() => ({
  getServerSupabaseReadClientMock: vi.fn(),
  rpcMock: vi.fn(),
  abortSignalMock: vi.fn(),
}));

vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: getServerSupabaseReadClientMock,
}));

import { countIndexedProducts, readIndexedProductCount, readProductSitemapPage } from './sitemap';

describe('product sitemap reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rpcMock });
    rpcMock.mockImplementation(() => ({ abortSignal: abortSignalMock }));
  });

  it('asks PostgreSQL for the count without loading catalog rows', async () => {
    abortSignalMock.mockResolvedValue({ data: 5_001, error: null });

    await expect(countIndexedProducts()).resolves.toBe(5_001);
    expect(rpcMock).toHaveBeenCalledWith('count_indexable_sitemap_products');
    expect(abortSignalMock).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('retries one transient count failure before degrading the sitemap index', async () => {
    abortSignalMock
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
    abortSignalMock.mockResolvedValue({ data: rows, error: null });

    await expect(readProductSitemapPage(2, 500)).resolves.toEqual({ status: 'available', rows });
    expect(rpcMock).toHaveBeenCalledWith('read_indexable_sitemap_products', {
      p_page: 2,
      p_page_size: 500,
    });
  });

  it('reuses the last reliable count when the database is temporarily unavailable', async () => {
    abortSignalMock.mockResolvedValueOnce({ data: 5_001, error: null });
    await expect(readIndexedProductCount()).resolves.toEqual({ count: 5_001, source: 'database' });
    getServerSupabaseReadClientMock.mockReturnValue(null);

    await expect(readIndexedProductCount()).resolves.toEqual({ count: 5_001, source: 'memory' });
    await expect(countIndexedProducts()).resolves.toBe(5_001);
    await expect(readProductSitemapPage(0)).resolves.toEqual({ status: 'unavailable' });
  });
});


describe('sitemap no confunde fallos con ausencia de productos', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([null, '', undefined, {}, -1, 0.5])('rechaza un conteo inválido %j', async (data) => {
    vi.resetModules();
    const reader = await import('./sitemap');
    rpcMock.mockReturnValue({ abortSignal: abortSignalMock });
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rpcMock });
    abortSignalMock.mockResolvedValue({ data, error: null });
    expect(await reader.readIndexedProductCount()).toEqual({ count: null, source: 'unavailable' });
  });
  it('distingue cero confirmado de excepciones sin perder el último conteo válido', async () => {
    vi.resetModules();
    const reader = await import('./sitemap');
    rpcMock.mockReturnValue({ abortSignal: abortSignalMock });
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rpcMock });
    abortSignalMock.mockResolvedValueOnce({ data: 0, error: null });
    expect(await reader.readIndexedProductCount()).toEqual({ count: 0, source: 'database' });
    abortSignalMock.mockRejectedValue(new Error('connection closed'));
    expect(await reader.readIndexedProductCount()).toEqual({ count: 0, source: 'memory' });
  });
  it('una página vacía confirmada se distingue de respuesta inválida, error y excepción', async () => {
    rpcMock.mockReturnValue({ abortSignal: abortSignalMock });
    getServerSupabaseReadClientMock.mockReturnValue({ rpc: rpcMock });
    abortSignalMock.mockResolvedValueOnce({ data: [], error: null });
    expect(await readProductSitemapPage(0)).toEqual({ status: 'available', rows: [] });
    for (const result of [{ data: null, error: null }, { data: [], error: { message: 'timeout' } },
      { data: [null], error: null }, { data: [{ id: 'individual' }], error: null }]) {
      abortSignalMock.mockResolvedValueOnce(result);
      expect(await readProductSitemapPage(0)).toEqual({ status: 'unavailable' });
    }
    abortSignalMock.mockRejectedValueOnce(new Error('offline'));
    expect(await readProductSitemapPage(0)).toEqual({ status: 'unavailable' });
  });
});

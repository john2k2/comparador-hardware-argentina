import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSharedCache = vi.fn();
const setSharedCache = vi.fn();
const rpc = vi.fn();
const getServerSupabaseServiceClient = vi.fn();
const loggerWarn = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/shared-cache', () => ({ getSharedCache, setSharedCache }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarn } }));

describe('price index server data', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSharedCache.mockResolvedValue(undefined);
    getServerSupabaseServiceClient.mockReturnValue({ rpc });
  });

  it('serves the six-hour shared cache without querying the database', async () => {
    const cached = { status: 'ready', updatedAt: '2026-06-01T00:00:00.000Z', coverage: null, series: [] };
    getSharedCache.mockResolvedValue(cached);
    const { getHardwarePriceIndex } = await import('./server');

    await expect(getHardwarePriceIndex(90)).resolves.toEqual(cached);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('queries the service-only RPC and caches a valid snapshot for six hours', async () => {
    rpc.mockResolvedValue({
      data: [{ day: '2026-06-01', category: 'almacenamiento', median_price_ars: '80000', product_count: '3', offer_count: '5' }],
      error: null,
    });
    const { getHardwarePriceIndex, PRICE_INDEX_CACHE_TTL_MS } = await import('./server');

    const result = await getHardwarePriceIndex(90);

    expect(rpc).toHaveBeenCalledWith('hardware_price_index', { p_days: 90 });
    expect(result.status).toBe('ready');
    expect(setSharedCache).toHaveBeenCalledWith('price-index', 'v1:90', result, PRICE_INDEX_CACHE_TTL_MS);
  });

  it('fails safely when credentials or the RPC are unavailable', async () => {
    getServerSupabaseServiceClient.mockReturnValue(null);
    const { getHardwarePriceIndex } = await import('./server');

    const result = await getHardwarePriceIndex(90);

    expect(result.status).toBe('empty');
    expect(result.series).toEqual([]);
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('does not cache or manufacture values after a database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } });
    const { getHardwarePriceIndex } = await import('./server');

    const result = await getHardwarePriceIndex(30);

    expect(result.status).toBe('empty');
    expect(setSharedCache).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith('No se pudo cargar el indice de precios de hardware', expect.any(Object));
  });
});

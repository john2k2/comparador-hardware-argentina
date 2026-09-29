import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: vi.fn() }));
import { deleteProductPriceIdentities } from './stale-product-prices-maintenance';

describe('limpieza transaccional de ofertas', () => {
  it('conserva identidad y cuenta filas realmente borradas, no solicitudes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const rows = [{ product_id: 'cpu', store_id: 'mexx', url: 'https://example.invalid/a' },
      { product_id: 'cpu', store_id: 'mexx', url: 'https://example.invalid/already-removed' }];
    const client = { rpc } as unknown as Parameters<typeof deleteProductPriceIdentities>[0];
    expect(await deleteProductPriceIdentities(client, rows)).toBe(1);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('delete_catalog_offers', { p_offers: rows });
    expect(await deleteProductPriceIdentities(client, [])).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('propaga fallos sin intentar borrados separados', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'transaction failed' } }) } as unknown as Parameters<typeof deleteProductPriceIdentities>[0];
    await expect(deleteProductPriceIdentities(client, [{ product_id: 'cpu', store_id: 'mexx', url: 'url' }])).rejects.toThrow('transaction failed');
  });
});

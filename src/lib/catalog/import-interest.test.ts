import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { importCatalogInterest } from './import-interest';
import { parseCatalogInterest } from './analytics-interest';

const rows = parseCatalogInterest({ periodStart: '2026-10-03', periodEnd: '2026-10-09',
  products: Array.from({ length: 205 }, (_, i) => ({ productId: `product-${i}`, viewUsers: 5, outboundUsers: 2 })) }, new Date('2026-10-12T12:00:00Z'));

function fixture(options: { failedRead?: number; missingRead?: number; writeError?: boolean; unconfirmed?: boolean } = {}) {
  let reads = 0;
  const upsert = vi.fn(() => ({ select: vi.fn(async () => ({ error: options.writeError ? { message: 'write failed' } : null,
    data: options.unconfirmed ? [] : rows.map(row => ({ product_id: row.product_id })) })) }));
  const client = { from: vi.fn((table: string) => table === 'products' ? { select: () => ({ in: async (_: string, ids: string[]) => {
    reads++;
    return { error: reads === options.failedRead ? { message: 'read failed' } : null,
      data: ids.slice(reads === options.missingRead ? 1 : 0).map(id => ({ id })) };
  } }) } : { upsert }) } as unknown as SupabaseClient;
  return { client, upsert };
}

describe('importCatalogInterest', () => {
  it('un fallo o ID inexistente en un lote tardío no deja importaciones parciales', async () => {
    for (const options of [{ failedRead: 3 }, { missingRead: 2 }]) {
      const { client, upsert } = fixture(options);
      await expect(importCatalogInterest(client, rows)).rejects.toThrow();
      expect(upsert).not.toHaveBeenCalled();
    }
  });
  it('confirma todos los IDs tras una sola escritura', async () => {
    const { client, upsert } = fixture();
    await expect(importCatalogInterest(client, rows)).resolves.toMatchObject({ imported: 205, skipped: 0 });
    expect(upsert).toHaveBeenCalledExactlyOnceWith(rows, { onConflict: 'product_id' });
  });
  it('no declara éxito si la escritura falla o no confirma sus filas', async () => {
    for (const options of [{ writeError: true }, { unconfirmed: true }]) {
      await expect(importCatalogInterest(fixture(options).client, rows)).rejects.toThrow();
    }
  });
});

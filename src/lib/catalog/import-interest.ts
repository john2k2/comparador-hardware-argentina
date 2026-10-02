import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogInterest } from './analytics-interest';

/** Validar el catálogo completo antes de una única escritura transaccional. */
export async function importCatalogInterest(client: SupabaseClient, rows: CatalogInterest[]) {
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const found = await client.from('products').select('id').in('id', batch.map(row => row.product_id));
    if (found.error) throw new Error('REFRESH_READ_FAILED');
    const ids = new Set((found.data ?? []).map(row => row.id));
    if (batch.some(row => !ids.has(row.product_id))) throw new Error('REFRESH_UNKNOWN_INTEREST_PRODUCT');
  }
  if (rows.length === 0) return { source: 'analytics-unique-users', imported: 0, skipped: 0 };
  const result = await client.from('catalog_refresh_interest').upsert(rows, { onConflict: 'product_id' }).select('product_id');
  if (result.error) throw new Error('REFRESH_INTEREST_IMPORT_FAILED');
  const confirmed = new Set((result.data ?? []).map(row => row.product_id));
  if (confirmed.size !== rows.length || rows.some(row => !confirmed.has(row.product_id)))
    throw new Error('REFRESH_INTEREST_IMPORT_UNCONFIRMED');
  return { source: 'analytics-unique-users', imported: confirmed.size, skipped: 0 };
}

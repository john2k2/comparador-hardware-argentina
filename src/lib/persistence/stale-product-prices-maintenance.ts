import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import {
  selectStaleProductPricesToPrune,
  type ProductFreshness,
  type ProductPriceIdentity,
  type PersistedProductPrice,
} from './stale-product-prices';

const PAGE_SIZE = 1000;
const DELETE_CHUNK_SIZE = 25;

export type StaleProductPricesCleanupResult = {
  deletedRows: number;
  scannedRows: number;
  executedAt: string;
};

type SupabaseServiceClient = NonNullable<ReturnType<typeof getServerSupabaseServiceClient>>;

async function readAllRows<T>(
  supabase: SupabaseServiceClient,
  table: 'products' | 'product_prices',
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Error read ${table}: ${error.message}`);
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return rows;
}

export async function deleteProductPriceIdentities(
  supabase: SupabaseServiceClient,
  rows: ProductPriceIdentity[],
): Promise<number> {
  let deleted = 0;

  for (let index = 0; index < rows.length; index += DELETE_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + DELETE_CHUNK_SIZE);
    const results = await Promise.all(chunk.map(async (row) => {
      const { error } = await supabase
        .from('product_prices')
        .delete()
        .eq('product_id', row.product_id)
        .eq('store_id', row.store_id)
        .eq('url', row.url);

      if (error) {
        throw new Error(`Error delete product_prices: ${error.message}`);
      }
    }));
    deleted += results.length;
  }

  return deleted;
}

export async function pruneGhostStorePrices(now = new Date()): Promise<StaleProductPricesCleanupResult> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('pruneGhostStorePrices: Supabase service client unavailable');
  }

  const [products, persisted] = await Promise.all([
    readAllRows<ProductFreshness>(supabase, 'products', 'id,last_scraped_at'),
    readAllRows<PersistedProductPrice>(supabase, 'product_prices', 'product_id,store_id,url,last_updated'),
  ]);

  const stale = selectStaleProductPricesToPrune({
    persisted,
    snapshot: [],
    products,
    now,
  });
  const deletedRows = await deleteProductPriceIdentities(supabase, stale);

  return {
    deletedRows,
    scannedRows: persisted.length,
    executedAt: now.toISOString(),
  };
}

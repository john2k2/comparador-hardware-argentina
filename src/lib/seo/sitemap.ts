import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

export const PRODUCT_SITEMAP_PAGE_SIZE = 2000;
export const INDEXABLE_PRODUCT_ID_PREFIX = 'agrupado-';

type ProductSitemapRow = {
  id: string;
  updated_at: string | null;
  canonical_product_key: string | null;
  product_prices?: Array<{
    store_id: string | null;
    price: number | string | null;
    url: string | null;
  }> | null;
};

export function isIndexableProductId(id: string): boolean {
  return id.startsWith(INDEXABLE_PRODUCT_ID_PREFIX);
}

export async function countIndexedProducts(): Promise<number> {
  const rows = await readAllIndexableProductRows();
  return rows.length;
}

async function readAllIndexableProductRows(): Promise<ProductSitemapRow[]> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('products')
    .select('id, updated_at, canonical_product_key, product_prices(store_id, price, url)')
    .like('id', `${INDEXABLE_PRODUCT_ID_PREFIX}%`)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, 4999);

  if (error) {
    console.warn('[sitemap] grouped products omitted:', error.message);
    return [];
  }

  const eligibleRows = ((data ?? []) as ProductSitemapRow[]).filter((row) => {
    const comparableStores = new Set(
      (row.product_prices ?? [])
        .filter((price) => Number(price.price ?? 0) > 0 && Boolean(price.url))
        .map((price) => price.store_id)
        .filter(Boolean),
    );

    return comparableStores.size >= 2;
  });

  const winners = new Map<string, ProductSitemapRow>();

  for (const row of eligibleRows) {
    const dedupeKey = row.canonical_product_key?.trim() || row.id;
    if (!winners.has(dedupeKey)) {
      winners.set(dedupeKey, row);
    }
  }

  return [...winners.values()];
}

export async function readProductSitemapPage(page: number, pageSize = PRODUCT_SITEMAP_PAGE_SIZE): Promise<ProductSitemapRow[]> {
  const safePageSize = Math.max(1, pageSize);
  const safePage = Math.max(0, Math.trunc(page));
  const from = safePage * safePageSize;
  const to = from + safePageSize - 1;
  const rows = await readAllIndexableProductRows();
  return rows.slice(from, to + 1);
}

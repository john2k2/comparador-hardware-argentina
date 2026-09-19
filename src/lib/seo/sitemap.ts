import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

// Supabase limita las respuestas REST a 1.000 filas. El índice debe usar el
// mismo tamaño para que cada página listada contenga todas sus URLs.
export const PRODUCT_SITEMAP_PAGE_SIZE = 1000;
export { INDEXABLE_PRODUCT_ID_PREFIX, isIndexableProductId } from '@/lib/seo/product-indexing';

export type ProductSitemapRow = {
  id: string;
  updated_at: string | null;
  canonical_product_key: string | null;
};

export type ProductSitemapCountResult = {
  count: number | null;
  source: 'database' | 'memory' | 'unavailable';
};

let lastKnownIndexedProductCount: number | null = null;

export async function readIndexedProductCount(): Promise<ProductSitemapCountResult> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) {
    return lastKnownIndexedProductCount === null
      ? { count: null, source: 'unavailable' }
      : { count: lastKnownIndexedProductCount, source: 'memory' };
  }

  const { data, error } = await supabase.rpc('count_indexable_sitemap_products');
  if (error) {
    console.warn('[sitemap] grouped product count unavailable:', error.message);
    return lastKnownIndexedProductCount === null
      ? { count: null, source: 'unavailable' }
      : { count: lastKnownIndexedProductCount, source: 'memory' };
  }

  const count = Math.max(0, Number(data ?? 0));
  lastKnownIndexedProductCount = count;
  return { count, source: 'database' };
}

export async function countIndexedProducts(): Promise<number> {
  return (await readIndexedProductCount()).count ?? 0;
}

export async function readProductSitemapPage(page: number, pageSize = PRODUCT_SITEMAP_PAGE_SIZE): Promise<ProductSitemapRow[]> {
  const safePageSize = Math.min(PRODUCT_SITEMAP_PAGE_SIZE, Math.max(1, pageSize));
  const safePage = Math.max(0, Math.trunc(page));
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('read_indexable_sitemap_products', {
    p_page: safePage,
    p_page_size: safePageSize,
  });

  if (error) {
    console.warn('[sitemap] grouped product page unavailable:', error.message);
    return [];
  }

  return (data ?? []) as ProductSitemapRow[];
}

import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

export const PRODUCT_SITEMAP_PAGE_SIZE = 2000;
export const INDEXABLE_PRODUCT_ID_PREFIX = 'agrupado-';

type ProductSitemapRow = {
  id: string;
  updated_at: string | null;
};

export function isIndexableProductId(id: string): boolean {
  return id.startsWith(INDEXABLE_PRODUCT_ID_PREFIX);
}

export async function countIndexedProducts(): Promise<number> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return 0;

  const { count: groupedCount, error: groupedError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .like('id', `${INDEXABLE_PRODUCT_ID_PREFIX}%`);

  if (groupedError) {
    console.warn('[sitemap] grouped product count omitted:', groupedError.message);
    return 0;
  }

  return groupedCount ?? 0;
}

export async function readProductSitemapPage(page: number, pageSize = PRODUCT_SITEMAP_PAGE_SIZE): Promise<ProductSitemapRow[]> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const safePageSize = Math.max(1, pageSize);
  const safePage = Math.max(0, Math.trunc(page));
  const from = safePage * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error } = await supabase
    .from('products')
    .select('id, updated_at')
    .like('id', `${INDEXABLE_PRODUCT_ID_PREFIX}%`)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn('[sitemap] product page omitted:', error.message);
    return [];
  }

  return (data ?? []) as ProductSitemapRow[];
}

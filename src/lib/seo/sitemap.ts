import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';

export const SITE_URL = 'https://comparador-hardware.com.ar';
export const PRODUCT_SITEMAP_PAGE_SIZE = 2000;

type ProductSitemapRow = {
  id: string;
  updated_at: string | null;
};

export function toAbsoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function countIndexedProducts(): Promise<number> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.warn('[sitemap] product count omitted:', error.message);
    return 0;
  }

  return count ?? 0;
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
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn('[sitemap] product page omitted:', error.message);
    return [];
  }

  return (data ?? []) as ProductSitemapRow[];
}

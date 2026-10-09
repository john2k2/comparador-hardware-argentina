import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { logger } from '@/lib/logger';
import { isIndexableProductId } from './product-indexing';

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

const PRODUCT_COUNT_MAX_ATTEMPTS = 2;
const PRODUCT_COUNT_RETRY_DELAY_MS = 75;
const SITEMAP_READ_TIMEOUT_MS = 2_500;

export type ProductSitemapPageResult =
  | { status: 'available'; rows: ProductSitemapRow[] }
  | { status: 'unavailable' };

let lastKnownIndexedProductCount: number | null = null;

function waitBeforeCountRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PRODUCT_COUNT_RETRY_DELAY_MS));
}

export async function readIndexedProductCount(): Promise<ProductSitemapCountResult> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) {
    return lastKnownIndexedProductCount === null
      ? { count: null, source: 'unavailable' }
      : { count: lastKnownIndexedProductCount, source: 'memory' };
  }

  for (let attempt = 1; attempt <= PRODUCT_COUNT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc('count_indexable_sitemap_products')
        .abortSignal(AbortSignal.timeout(SITEMAP_READ_TIMEOUT_MS));
      // Number(null) y Number('') son cero: no acreditan un catálogo vacío.
      const count = typeof data === 'number' || (typeof data === 'string' && /^\d+$/.test(data)) ? Number(data) : NaN;
      if (!error && Number.isSafeInteger(count) && count >= 0) {
        lastKnownIndexedProductCount = count;
        return { count, source: 'database' };
      }
    } catch { /* El último conteo confirmado puede sostener el índice. */ }
    if (attempt < PRODUCT_COUNT_MAX_ATTEMPTS) {
      await waitBeforeCountRetry();
    }
  }

  logger.warn('Conteo de productos del sitemap no disponible');
  return lastKnownIndexedProductCount === null
    ? { count: null, source: 'unavailable' }
    : { count: lastKnownIndexedProductCount, source: 'memory' };
}

export async function countIndexedProducts(): Promise<number | null> {
  return (await readIndexedProductCount()).count;
}

export async function readProductSitemapPage(page: number, pageSize = PRODUCT_SITEMAP_PAGE_SIZE): Promise<ProductSitemapPageResult> {
  const safePageSize = Math.min(PRODUCT_SITEMAP_PAGE_SIZE, Math.max(1, pageSize));
  const safePage = Math.max(0, Math.trunc(page));
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return { status: 'unavailable' };

  try {
    const { data, error } = await supabase.rpc('read_indexable_sitemap_products', {
      p_page: safePage,
      p_page_size: safePageSize,
    }).abortSignal(AbortSignal.timeout(SITEMAP_READ_TIMEOUT_MS));
    if (!error && Array.isArray(data) && data.length <= safePageSize && data.every((row) =>
      row && typeof row.id === 'string' && isIndexableProductId(row.id)
      && (row.updated_at === null || typeof row.updated_at === 'string')
      && (row.canonical_product_key === null || typeof row.canonical_product_key === 'string'))) {
      return { status: 'available', rows: data as ProductSitemapRow[] };
    }
  } catch { /* Una excepción de transporte tampoco demuestra ausencia de URLs. */ }
  logger.warn('Página de productos del sitemap no disponible', { page: safePage });
  return { status: 'unavailable' };
}

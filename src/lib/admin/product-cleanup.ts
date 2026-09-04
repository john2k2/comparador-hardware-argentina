import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import {
  selectProductsToDeindex,
  summarizeProductsHealth,
  type GroupedProduct,
  type ProductCleanupCandidate,
  type ProductsHealth,
} from './product-cleanup-selection';

const GROUPED_PRODUCT_PREFIX = 'agrupado-';
const PAGE_SIZE = 1000;

type SupabaseServiceClient = NonNullable<ReturnType<typeof getServerSupabaseServiceClient>>;

function requireClient(): SupabaseServiceClient {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase no disponible');
  }
  return supabase;
}

/**
 * Reads every row of a query, page by page.
 *
 * PostgREST caps a single response, so an unpaginated read silently truncates
 * once the table outgrows that cap - which here would misreport healthy
 * products as having no offers.
 */
async function readAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Error leyendo ${label}: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function readGroupedProducts(supabase: SupabaseServiceClient): Promise<GroupedProduct[]> {
  return readAllPages<GroupedProduct>(
    (from, to) => supabase
      .from('products')
      .select('id, name')
      .like('id', `${GROUPED_PRODUCT_PREFIX}%`)
      .range(from, to),
    'products',
  );
}

async function readPricedProductIds(supabase: SupabaseServiceClient): Promise<string[]> {
  const rows = await readAllPages<{ product_id: string }>(
    (from, to) => supabase
      .from('product_prices')
      .select('product_id')
      .gt('price', 0)
      .range(from, to),
    'product_prices',
  );

  return rows.map((row) => row.product_id);
}

async function readZeroAggregateProductIds(supabase: SupabaseServiceClient): Promise<string[]> {
  const rows = await readAllPages<{ id: string }>(
    (from, to) => supabase
      .from('products')
      .select('id')
      .like('id', `${GROUPED_PRODUCT_PREFIX}%`)
      .or('lowest_price.eq.0,highest_price.eq.0')
      .range(from, to),
    'products con precio agregado en $0',
  );

  return rows.map((row) => row.id);
}

async function readCleanupInputs(supabase: SupabaseServiceClient) {
  const [groupedProducts, pricedProductIds, zeroPriceProductIds] = await Promise.all([
    readGroupedProducts(supabase),
    readPricedProductIds(supabase),
    readZeroAggregateProductIds(supabase),
  ]);

  return { groupedProducts, pricedProductIds, zeroPriceProductIds };
}

/**
 * Marks grouped products with no usable offer as non-indexable.
 *
 * These render as a product page with nothing to compare, so leaving them
 * indexable feeds Google thin pages.
 */
export async function cleanupZeroPriceProducts(): Promise<{
  cleaned: number;
  total: number;
  details: ProductCleanupCandidate[];
}> {
  const supabase = requireClient();
  const details = selectProductsToDeindex(await readCleanupInputs(supabase));

  for (const product of details) {
    const { error } = await supabase
      .from('products')
      .update({
        is_indexable: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.id);

    if (error) {
      throw new Error(`Error marcando ${product.id} como no indexable: ${error.message}`);
    }
  }

  return {
    cleaned: details.length,
    total: details.length,
    details,
  };
}

export async function checkProductsHealth(): Promise<ProductsHealth> {
  const supabase = requireClient();
  return summarizeProductsHealth(await readCleanupInputs(supabase));
}

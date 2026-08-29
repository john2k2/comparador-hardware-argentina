import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { applyDatabaseReadTransforms } from '@/lib/persistence/product-read-grouping';
import {
  applySharedProductFilters,
  clampLimit,
  EMPTY_RESULT_ERROR_CODES,
  PRODUCT_SELECT_FIELDS,
  sanitizeSearchTerm,
} from '@/lib/persistence/product-read-helpers';
import { mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type {
  DbProductRow,
  ProductPageResult,
  ReadProductsPageParams,
  ReadProductsParams,
} from '@/lib/persistence/product-read-types';
import { paginateProducts } from '@/lib/search/search-pagination';
import type { Product } from '@/lib/types';

export type { ProductSort } from '@/lib/persistence/product-read-types';

export async function readProductByIdFromDatabase(id: string) {
  const supabase = getServerSupabaseReadClient();
  if (!supabase || !id) return null;

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return null;
    throw new Error(`readProductByIdFromDatabase: ${error.message}`);
  }

  if (!data) return null;
  return mapDbProduct(data as DbProductRow);
}

export async function readCanonicalProductIdByKey(canonicalProductKey: string) {
  const supabase = getServerSupabaseReadClient();
  if (!supabase || !canonicalProductKey) return null;

  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('canonical_product_key', canonicalProductKey)
    .like('id', 'agrupado-%')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return null;
    throw new Error(`readCanonicalProductIdByKey: ${error.message}`);
  }

  return data?.id ?? null;
}

export async function readProductsFromDatabase(params: ReadProductsParams) {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const searchTerm = params.query ? sanitizeSearchTerm(params.query) : '';
  const requestedLimit = clampLimit(params.limit);

  let queryBuilder = supabase
    .from('products')
    .select(PRODUCT_SELECT_FIELDS)
    .order('updated_at', { ascending: false })
    .limit(requestedLimit);

  queryBuilder = applySharedProductFilters(queryBuilder, {
    category: params.category,
    // Price filters are applied after grouping/recalculating prices so the UI
    // filters the same comparable price that it displays.
    searchTerm: searchTerm || undefined,
  });

  const { data, error } = await queryBuilder;

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return [];
    throw new Error(`readProductsFromDatabase: ${error.message}`);
  }

  return applyDatabaseReadTransforms(
    (data as DbProductRow[] | null)?.map(mapDbProduct) ?? [],
    {
      searchTerm: searchTerm || undefined,
      storeIds: params.storeIds,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sortBy: params.sortBy ?? 'relevance',
    },
  );
}

export async function readProductsPageFromDatabase(params: ReadProductsPageParams): Promise<ProductPageResult> {
  const pageSize = Math.max(1, Math.trunc(params.pageSize) || 1);
  const requestedPage = Math.max(1, Math.trunc(params.page) || 1);

  const products = await readProductsFromDatabase({
    query: params.query,
    category: params.category,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    storeIds: params.storeIds,
    sortBy: params.sortBy,
    limit: params.limit ?? 1000,
  });

  const pageSlice = paginateProducts(products, requestedPage, pageSize);

  return {
    products: pageSlice.paginatedProducts,
    total: products.length,
    totalPages: pageSlice.totalPages,
    page: pageSlice.currentPage,
    pageSize,
  };
}

export async function readPopularProductsFromDatabase(limit: number = 8): Promise<Product[]> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_FIELDS)
    .like('id', 'agrupado-%')
    .gt('lowest_price', 0)
    .order('updated_at', { ascending: false })
    .limit(clampLimit(limit));

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return [];
    throw new Error(`readPopularProductsFromDatabase: ${error.message}`);
  }

  return ((data as DbProductRow[] | null) ?? [])
    .map(mapDbProduct)
    .filter((p) => p.prices.length >= 2);
}


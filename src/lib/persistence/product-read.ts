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
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
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
      sortBy: params.sortBy ?? 'relevance',
    },
  );
}

export async function readProductsPageFromDatabase(params: ReadProductsPageParams): Promise<ProductPageResult> {
  const pageSize = Math.max(1, Math.trunc(params.pageSize) || 1);
  const requestedPage = Math.max(1, Math.trunc(params.page) || 1);
  const offset = (requestedPage - 1) * pageSize;
  const supabase = getServerSupabaseReadClient();

  if (!supabase) {
    return { products: [], total: 0, totalPages: 0, page: requestedPage, pageSize };
  }

  const searchTerm = params.query ? sanitizeSearchTerm(params.query) : '';

  let dataQuery = supabase
    .from('products')
    .select(PRODUCT_SELECT_FIELDS, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  dataQuery = applySharedProductFilters(dataQuery, {
    category: params.category,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    searchTerm: searchTerm || undefined,
  });

  const [{ data, error, count }, totalResult] = await Promise.all([
    dataQuery,
    buildTotalCountQuery(supabase, params.category, params.minPrice, params.maxPrice, searchTerm),
  ]);

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) {
      return { products: [], total: 0, totalPages: 0, page: requestedPage, pageSize };
    }
    throw new Error(`readProductsPageFromDatabase: ${error.message}`);
  }

  const total = count ?? totalResult;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const page = Math.max(1, Math.min(requestedPage, Math.max(totalPages, 1)));

  return {
    products: applyDatabaseReadTransforms(
      (data as DbProductRow[] | null)?.map(mapDbProduct) ?? [],
      {
        searchTerm: searchTerm || undefined,
        storeIds: params.storeIds,
        sortBy: params.sortBy ?? 'relevance',
      },
    ),
    total,
    totalPages,
    page,
    pageSize,
  };
}

async function buildTotalCountQuery(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseReadClient>>,
  category?: ReadProductsParams['category'],
  minPrice?: ReadProductsParams['minPrice'],
  maxPrice?: ReadProductsParams['maxPrice'],
  searchTerm?: string,
): Promise<number> {
  const countQuery = applySharedProductFilters(
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true }),
    {
      category,
      minPrice,
      maxPrice,
      searchTerm: searchTerm || undefined,
    },
  );

  const { count, error } = await countQuery;
  if (error || count === null) return 0;
  return count;
}


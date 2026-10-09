import { cache } from 'react';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import { applyDatabaseReadTransforms } from '@/lib/persistence/product-read-grouping';
import {
  applySharedProductFilters,
  buildGuideSearchOrFilter,
  clampLimit,
  EMPTY_RESULT_ERROR_CODES,
  PRODUCT_SELECT_FIELDS,
  sanitizeSearchTerm,
} from '@/lib/persistence/product-read-helpers';
import { mapDbGuideProduct, mapDbProduct } from '@/lib/persistence/product-read-mapper';
import type {
  DbProductRow,
  ProductPageResult,
  ReadProductsPageParams,
  ReadProductsParams,
} from '@/lib/persistence/product-read-types';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import type { DbCatalogPage } from './product-read-types';
import { toNumber } from './product-read-helpers';
import type { Product } from '@/lib/types';
import { mergeCanonicalDetailOffers, shareExactProductVariant } from './product-detail-offers';
import { guardCategoryPage } from '@/lib/search/category-page-guard';
import { guardIdentityPage } from '@/lib/search/identity-page-guard';

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

export async function readCanonicalProductIdByKey(canonicalProductKey: string, product?: Pick<Product,'name'|'category'|'canonicalProductKey'>) {
  const supabase = getServerSupabaseReadClient();
  if (!supabase || !canonicalProductKey || !product) return null;

  const { data, error } = await supabase
    .from('products')
    .select('id,name,category')
    .eq('canonical_product_key', canonicalProductKey)
    .like('id', 'agrupado-%')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(20);

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return null;
    throw new Error(`readCanonicalProductIdByKey: ${error.message}`);
  }

  if(!Array.isArray(data)) throw new Error('Invalid canonical product candidates');
  return data.find(candidate=>shareExactProductVariant(product,{...candidate,canonicalProductKey}))?.id??null;
}

// Fuera de un render de Server Components React cache no memoriza: cada request lee de nuevo.
const readProductRowByIdPerRequest = cache(readProductByIdFromDatabase);

/** Resuelve el agrupado canónico desde la fila base, en paralelo con las ofertas relacionadas del detalle. */
export const readCanonicalProductIdForProductId = cache(async (id: string): Promise<string | null> => {
  const product = await readProductRowByIdPerRequest(id);
  if (!product?.canonicalProductKey) return null;
  return readCanonicalProductIdByKey(product.canonicalProductKey, product);
});

/** La ficha canónica incorpora altas recientes con la misma identidad exacta. */
export const readProductDetailByIdFromDatabase = cache(async (id: string): Promise<Product | null> => {
  const product=await readProductRowByIdPerRequest(id);
  if (!product?.canonicalProductKey) return product;
  const supabase=getServerSupabaseReadClient();
  if (!supabase) throw new Error('Product detail database unavailable');
  const {data,error}=await supabase.from('products').select(PRODUCT_SELECT_FIELDS)
    .eq('canonical_product_key',product.canonicalProductKey).eq('category',product.category)
    .order('id').limit(201);
  if (error || !Array.isArray(data)) throw new Error('Product detail related offers unavailable');
  // No presentar una agrupación truncada como completa ni hacer lecturas sin límite.
  if (data.length>200) throw new Error('Product detail related offers limit exceeded');
  return mergeCanonicalDetailOffers(product,(data as DbProductRow[]).map(mapDbGuideProduct));
});

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
  const pageSize = Math.min(48, Math.max(1, Math.trunc(params.pageSize) || 12));
  const requestedPage = Math.max(1, Math.trunc(params.page) || 1);
  const supabase = getServerSupabaseReadClient();
  if (!supabase) throw new Error('Catalog database unavailable');
  const query = params.query?.trim() ?? '';
  const requestedCategory = params.category ?? inferHardwareCategoryFromName(query);
  const { data, error } = await supabase.rpc('search_catalog_page', {
    p_query: query,
    p_category: requestedCategory ?? null,
    p_stores: [...new Set([...params.storeIds ?? []].map((id) => id.trim().toLowerCase()).filter(Boolean))].sort(),
    // A non-null floor activates the RPC's current comparable-offer filter
    // before totals and pagination. Zero adds no artificial price minimum.
    p_min_price: params.minPrice ?? (params.onlyCurrentOffers ? 0 : null),
    p_max_price: params.maxPrice ?? null,
    p_sort: params.sortBy ?? 'relevance',
    p_page: requestedPage,
    p_page_size: pageSize,
  });
  if (error) throw new Error(`readProductsPageFromDatabase: ${error.message}`);
  if (!data || !Array.isArray(data.products) || !Number.isInteger(data.total)
    || !Number.isInteger(data.totalPages) || !Number.isInteger(data.page)
    || !Number.isInteger(data.pageSize)) throw new Error('Invalid catalog page response');
  const result = data as DbCatalogPage;
  const guarded = guardCategoryPage(result.products.map(mapCatalogProduct), requestedCategory);
  const identity = guardIdentityPage(guarded.products, params);
  return { ...result, products: identity.products, categoryExcludedOnPage: guarded.excluded,
    identityExcludedOnPage: identity.identityExcludedOnPage };
}

// SQL decide selección, estadísticas y orden. El mapper conserva sanitización y
// revisión de identidad, pero no vuelve a reducir las publicaciones de la página.
function mapCatalogProduct(row: DbProductRow): Product {
  return {
    ...mapDbGuideProduct(row),
    lowestPrice: toNumber(row.lowest_price, 0),
    highestPrice: toNumber(row.highest_price, 0), averagePrice: toNumber(row.average_price, 0),
  };
}

/** Las categorías usan el mismo contrato paginado que la búsqueda pública. */
export async function readCategoryLandingPageFromDatabase(
  category: NonNullable<ReadProductsParams['category']>,
  page: number,
  pageSize: number,
): Promise<ProductPageResult> {
  return readProductsPageFromDatabase({ category, page, pageSize, onlyCurrentOffers: true });
}

/**
 * Lectura liviana para las guías de presupuesto. Las guías sólo necesitan un
 * conjunto representativo de productos agrupados y comprables por categoría;
 * cargar cientos de filas por pieza agota el presupuesto de CPU del Worker.
 */
export async function readGuideCatalogCandidatesFromDatabase(
  category: NonNullable<ReadProductsParams['category']>,
  limit: number = 24,
  query?: string,
): Promise<Product[]> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) throw new Error('Guide catalog database unavailable');

  const requestedLimit = Math.min(48, Math.max(1, Math.trunc(limit) || 1));
  const searchTerm = query ? sanitizeSearchTerm(query) : '';
  let queryBuilder = supabase
    .from('products')
    .select(PRODUCT_SELECT_FIELDS)
    .eq('category', category)
    .gt('lowest_price', 0)
    .order('last_scraped_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(requestedLimit);
  // Las consultas por modelo también admiten una oferta individual recién
  // observada, aunque todavía no se haya persistido su agrupación canónica.
  if (!searchTerm) queryBuilder = queryBuilder.like('id', 'agrupado-%');
  else {
    const filter = buildGuideSearchOrFilter(searchTerm);
    if (!filter) return [];
    queryBuilder = queryBuilder.or(filter);
  }
  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`readGuideCatalogCandidatesFromDatabase: ${error.message}`);
  }

  return ((data as DbProductRow[] | null) ?? []).map(mapDbGuideProduct);
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

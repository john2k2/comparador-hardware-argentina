import { stores as staticStores } from '@/lib/scrapers/static-data';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import type { HardwareCategory, Product, StockStatus } from '@/lib/types';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { sanitizeProduct } from '@/lib/product-sanitizer';
import { buildProductIdentityKey, extractExactModelIdentity, normalizeIdentityText } from '@/lib/product-identity';

export type ProductSort = 'relevance' | 'price-asc' | 'price-desc' | 'name' | 'newest';

interface ReadProductsParams {
  query?: string;
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  storeIds?: Set<string>;
  sortBy?: ProductSort;
  limit?: number;
}

interface ReadProductsPageParams extends ReadProductsParams {
  page: number;
  pageSize: number;
}

type ProductPageResult = {
  products: Product[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

interface DbProductPriceRow {
  store_id: string;
  url: string;
  price: number | string;
  original_price: number | string | null;
  stock: string | null;
  installment_count: number | null;
  installment_amount: number | string | null;
  last_updated: string | null;
}

interface DbProductRow {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string | null;
  image: string | null;
  normalized_title: string | null;
  canonical_product_key: string | null;
  family_key: string | null;
  variant_key: string | null;
  refresh_priority: string | null;
  last_scraped_at: string | null;
  last_normalized_at: string | null;
  specs: Record<string, string> | null;
  lowest_price: number | string;
  highest_price: number | string;
  average_price: number | string;
  created_at: string;
  updated_at: string;
  product_prices?: DbProductPriceRow[] | null;
}

const DEFAULT_LIMIT = 240;
const MAX_LIMIT = 1200;
const EMPTY_RESULT_ERROR_CODES = new Set(['PGRST116']);
const storeNameById = new Map<string, string>(staticStores.map((store) => [store.id, store.name]));
const DEDUPE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por',
  'vga', 'placa', 'video', 'procesador', 'micro', 'cpu', 'gpu', 'gamer',
]);

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toStockStatus(value: string | null | undefined): StockStatus {
  if (value === 'in-stock' || value === 'low-stock' || value === 'out-of-stock') return value;
  return 'unknown';
}

function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[%,()']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyTextFilter(products: Product[], query: string): Product[] {
  const normalizedQuery = normalizeIdentityText(query);
  const words = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length > 1);

  if (words.length === 0) return products;

  return products.filter((product) => {
    const searchable = [
      product.name,
      product.brand,
      product.model,
      product.normalizedTitle ?? '',
      product.familyKey ?? '',
      product.variantKey ?? '',
      product.canonicalProductKey ?? '',
    ]
      .map((value) => normalizeIdentityText(value))
      .join(' ');
    return words.some((word) => searchable.includes(word));
  });
}

function normalizeGroupName(value: string): string {
  return normalizeIdentityText(value).replace(/\+/g, ' ');
}

function buildIdentityFallback(product: Product): string {
  return [product.brand, product.model, product.name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
}

function tokenizeNameForDedupe(value: string): string[] {
  return normalizeGroupName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !DEDUPE_STOPWORDS.has(token));
}

function extractProductFingerprint(name: string): { brand: string | null; chip: string | null; memory: string | null } {
  const normalized = normalizeGroupName(name);
  const brand = (normalized.match(/\b(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|amd|intel)\b/) ?? [])[1] ?? null;
  const chip = (normalized.match(/\b(rtx\s*\d{3,4}(?:\s*(?:ti|super))?|rx\s*\d{3,4}(?:\s*xt)?|ryzen\s*[3579]\s*\d{3,5}(?:x3d|gt|ge|xt|x|g|f)?|core\s*i[3579]\s*\d{4,5}[a-z]{0,2})\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  const memory = (normalized.match(/\b(\d{1,2}\s*gb)\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  return { brand, chip, memory };
}

function hasSameStoreAndPrice(first: Product, second: Product): boolean {
  for (const firstPrice of first.prices) {
    for (const secondPrice of second.prices) {
      if (firstPrice.storeId === secondPrice.storeId && firstPrice.price === secondPrice.price) {
        return true;
      }
    }
  }
  return false;
}

function isSubsetTokens(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) return false;
  if (first.size > second.size) return false;
  for (const token of first) {
    if (!second.has(token)) return false;
  }
  return true;
}

function canFuzzyMerge(existing: Product, candidate: Product): boolean {
  if (existing.category !== candidate.category) return false;

  const existingExactModel = extractExactModelIdentity(existing.category, existing.name);
  const candidateExactModel = extractExactModelIdentity(candidate.category, candidate.name);
  if (existingExactModel && candidateExactModel && existingExactModel === candidateExactModel) {
    return true;
  }

  const existingFingerprint = extractProductFingerprint(existing.name);
  const candidateFingerprint = extractProductFingerprint(candidate.name);

  if (!hasSameStoreAndPrice(existing, candidate)) return false;

  if (!existingFingerprint.chip || !candidateFingerprint.chip) return false;
  if (existingFingerprint.chip !== candidateFingerprint.chip) return false;

  if (existingFingerprint.brand && candidateFingerprint.brand && existingFingerprint.brand !== candidateFingerprint.brand) {
    return false;
  }
  if (existingFingerprint.memory && candidateFingerprint.memory && existingFingerprint.memory !== candidateFingerprint.memory) {
    return false;
  }

  const existingTokens = new Set(tokenizeNameForDedupe(existing.name));
  const candidateTokens = new Set(tokenizeNameForDedupe(candidate.name));
  return isSubsetTokens(existingTokens, candidateTokens) || isSubsetTokens(candidateTokens, existingTokens);
}

function mergeGroupedPrices(current: Product['prices'], incoming: Product['prices']): Product['prices'] {
  const merged = [...current];

  for (const candidate of incoming) {
    const existingIndex = merged.findIndex((price) => price.storeId === candidate.storeId);
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateUpdatedMs = candidate.lastUpdated.getTime();
    const existingUpdatedMs = existing.lastUpdated.getTime();
    const isNewer = candidateUpdatedMs > existingUpdatedMs;
    const isCheaper = candidate.price < existing.price;
    const recoversStock = existing.stock === 'out-of-stock' && candidate.stock !== 'out-of-stock';

    if (isNewer || isCheaper || recoversStock) {
      merged[existingIndex] = candidate;
    }
  }

  return merged;
}

function dedupeProductsByCanonicalName(products: Product[]): Product[] {
  if (products.length <= 1) return products;

  const grouped = new Map<string, Product>();

  for (const product of products) {
    const normalizedName = normalizeGroupName(product.name);
    if (!normalizedName) continue;

    const key = product.canonicalProductKey
      ?? buildProductIdentityKey(product.category, normalizedName, buildIdentityFallback(product));
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...product,
        prices: [...product.prices],
      });
      continue;
    }

    const mergedPrices = mergeGroupedPrices(existing.prices, product.prices);
    const stats = computeComparableStorePriceStats(mergedPrices);

    const pickedImage = existing.image === '/pixel-box.svg' && product.image !== '/pixel-box.svg'
      ? product.image
      : existing.image;

    grouped.set(key, {
      ...existing,
      prices: stats.comparablePrices,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      image: pickedImage,
      updatedAt: existing.updatedAt > product.updatedAt ? existing.updatedAt : product.updatedAt,
      createdAt: existing.createdAt < product.createdAt ? existing.createdAt : product.createdAt,
    });
  }

  const exactDeduped = Array.from(grouped.values());
  const final: Product[] = [];

  for (const candidate of exactDeduped) {
    const targetIndex = final.findIndex((existing) => canFuzzyMerge(existing, candidate));
    if (targetIndex < 0) {
      final.push(candidate);
      continue;
    }

    const existing = final[targetIndex];
    const mergedPrices = mergeGroupedPrices(existing.prices, candidate.prices);
    const stats = computeComparableStorePriceStats(mergedPrices);

    const preferredName = tokenizeNameForDedupe(candidate.name).length > tokenizeNameForDedupe(existing.name).length
      ? candidate.name
      : existing.name;

    final[targetIndex] = {
      ...existing,
      name: preferredName,
      model: preferredName,
      prices: stats.comparablePrices,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      updatedAt: existing.updatedAt > candidate.updatedAt ? existing.updatedAt : candidate.updatedAt,
      createdAt: existing.createdAt < candidate.createdAt ? existing.createdAt : candidate.createdAt,
    };
  }

  return final;
}

function sortProducts(products: Product[], sortBy: ProductSort): Product[] {
  const sorted = [...products];

  if (sortBy === 'price-asc') {
    sorted.sort((a, b) => a.lowestPrice - b.lowestPrice);
  } else if (sortBy === 'price-desc') {
    sorted.sort((a, b) => b.lowestPrice - a.lowestPrice);
  } else if (sortBy === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } else if (sortBy === 'newest') {
    sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  return sorted;
}

function recalculateProductPrices(product: Product, allowedStoreIds?: Set<string>): Product | null {
  const filteredPrices = allowedStoreIds
    ? product.prices.filter((priceInfo) => allowedStoreIds.has(priceInfo.storeId.toLowerCase()))
    : product.prices;

  if (filteredPrices.length === 0) return null;

  const stats = computeComparableStorePriceStats(filteredPrices);

  return {
    ...product,
    prices: stats.comparablePrices,
    lowestPrice: stats.lowest,
    highestPrice: stats.highest,
    averagePrice: stats.average,
  };
}

function mapDbProduct(row: DbProductRow): Product {
  const prices = (row.product_prices ?? []).map((price) => {
    const installmentCount = price.installment_count;
    const installmentAmount = toNumber(price.installment_amount, 0);

    return {
      storeId: price.store_id,
      storeName: storeNameById.get(price.store_id) ?? price.store_id,
      url: price.url,
      price: toNumber(price.price, 0),
      originalPrice: price.original_price === null ? undefined : toNumber(price.original_price, 0),
      stock: toStockStatus(price.stock),
      installment: installmentCount && installmentCount > 0
        ? {
            count: installmentCount,
            amount: installmentAmount,
            totalAmount: installmentAmount * installmentCount,
            interest: false,
          }
        : null,
      lastUpdated: toDate(price.last_updated),
    };
  });

  const comparableStats = computeComparableStorePriceStats(prices);
  const hasComparablePrices = comparableStats.comparablePrices.length > 0;

  const mapped: Product = {
    id: row.id,
    name: row.name,
    category: row.category as HardwareCategory,
    brand: row.brand || 'Generica',
    model: row.model || row.name,
    description: row.description ?? row.name,
    image: row.image ?? '/pixel-box.svg',
    normalizedTitle: row.normalized_title ?? row.name,
    canonicalProductKey: row.canonical_product_key ?? undefined,
    familyKey: row.family_key ?? undefined,
    variantKey: row.variant_key ?? undefined,
    refreshPriority: (row.refresh_priority as Product['refreshPriority']) ?? undefined,
    lastScrapedAt: row.last_scraped_at ? toDate(row.last_scraped_at) : undefined,
    lastNormalizedAt: row.last_normalized_at ? toDate(row.last_normalized_at) : null,
    specs: row.specs ?? {},
    prices: hasComparablePrices ? comparableStats.comparablePrices : prices,
    lowestPrice: hasComparablePrices
      ? comparableStats.lowest
      : toNumber(row.lowest_price, prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : 0),
    highestPrice: hasComparablePrices
      ? comparableStats.highest
      : toNumber(row.highest_price, prices.length > 0 ? Math.max(...prices.map((p) => p.price)) : 0),
    averagePrice: toNumber(
      row.average_price,
      hasComparablePrices
        ? comparableStats.average
        : (prices.length > 0 ? prices.reduce((acc, current) => acc + current.price, 0) / prices.length : 0),
    ),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };

  return sanitizeProduct(mapped);
}

export async function readProductByIdFromDatabase(id: string): Promise<Product | null> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase || !id) return null;

  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      category,
      brand,
      model,
      description,
      image,
      normalized_title,
      canonical_product_key,
      family_key,
      variant_key,
      refresh_priority,
      last_scraped_at,
      last_normalized_at,
      specs,
      lowest_price,
      highest_price,
      average_price,
      created_at,
      updated_at,
      product_prices (
        store_id,
        url,
        price,
        original_price,
        stock,
        installment_count,
        installment_amount,
        last_updated
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return null;
    throw new Error(`readProductByIdFromDatabase: ${error.message}`);
  }

  if (!data) return null;
  return mapDbProduct(data as DbProductRow);
}

export async function readProductsFromDatabase(params: ReadProductsParams): Promise<Product[]> {
  const supabase = getServerSupabaseReadClient();
  if (!supabase) return [];

  const searchTerm = params.query ? sanitizeSearchTerm(params.query) : '';
  const requestedLimit = clampLimit(params.limit);

  let queryBuilder = supabase
    .from('products')
    .select(`
      id,
      name,
      category,
      brand,
      model,
      description,
      image,
      normalized_title,
      canonical_product_key,
      family_key,
      variant_key,
      refresh_priority,
      last_scraped_at,
      last_normalized_at,
      specs,
      lowest_price,
      highest_price,
      average_price,
      created_at,
      updated_at,
      product_prices (
        store_id,
        url,
        price,
        original_price,
        stock,
        installment_count,
        installment_amount,
        last_updated
      )
    `)
    .order('updated_at', { ascending: false })
    .limit(requestedLimit);

  if (params.category) {
    queryBuilder = queryBuilder.eq('category', params.category);
  }
  if (params.minPrice !== undefined) {
    queryBuilder = queryBuilder.gte('lowest_price', params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    queryBuilder = queryBuilder.lte('lowest_price', params.maxPrice);
  }
  if (searchTerm) {
    queryBuilder = queryBuilder.or(
      `name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,normalized_title.ilike.%${searchTerm}%,family_key.ilike.%${searchTerm}%,variant_key.ilike.%${searchTerm}%`,
    );
  }

  const { data, error } = await queryBuilder;

  if (error) {
    if (EMPTY_RESULT_ERROR_CODES.has(error.code ?? '')) return [];
    throw new Error(`readProductsFromDatabase: ${error.message}`);
  }

  let products = (data as DbProductRow[] | null)?.map(mapDbProduct) ?? [];

  if (searchTerm) {
    products = applyTextFilter(products, searchTerm);
  }

  products = dedupeProductsByCanonicalName(products);

  if (params.storeIds && params.storeIds.size > 0) {
    products = products
      .map((product) => recalculateProductPrices(product, params.storeIds))
      .filter((product): product is Product => Boolean(product));
  }

  return sortProducts(products, params.sortBy ?? 'relevance');
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
    .select(`
      id,
      name,
      category,
      brand,
      model,
      description,
      image,
      normalized_title,
      canonical_product_key,
      family_key,
      variant_key,
      refresh_priority,
      last_scraped_at,
      last_normalized_at,
      specs,
      lowest_price,
      highest_price,
      average_price,
      created_at,
      updated_at,
      product_prices (
        store_id,
        url,
        price,
        original_price,
        stock,
        installment_count,
        installment_amount,
        last_updated
      )
    `, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.category) {
    dataQuery = dataQuery.eq('category', params.category);
  }
  if (params.minPrice !== undefined) {
    dataQuery = dataQuery.gte('lowest_price', params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    dataQuery = dataQuery.lte('lowest_price', params.maxPrice);
  }
  if (searchTerm) {
    dataQuery = dataQuery.or(
      `name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,normalized_title.ilike.%${searchTerm}%,family_key.ilike.%${searchTerm}%,variant_key.ilike.%${searchTerm}%`,
    );
  }

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

  let products = (data as DbProductRow[] | null)?.map(mapDbProduct) ?? [];

  if (searchTerm) {
    products = applyTextFilter(products, searchTerm);
  }

  products = dedupeProductsByCanonicalName(products);

  if (params.storeIds && params.storeIds.size > 0) {
    products = products
      .map((product) => recalculateProductPrices(product, params.storeIds))
      .filter((product): product is Product => Boolean(product));
  }

  return {
    products: sortProducts(products, params.sortBy ?? 'relevance'),
    total,
    totalPages,
    page,
    pageSize,
  };
}

async function buildTotalCountQuery(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseReadClient>>,
  category?: HardwareCategory,
  minPrice?: number,
  maxPrice?: number,
  searchTerm?: string,
): Promise<number> {
  let countQuery = supabase
    .from('products')
    .select('id', { count: 'exact', head: true });

  if (category) {
    countQuery = countQuery.eq('category', category);
  }
  if (minPrice !== undefined) {
    countQuery = countQuery.gte('lowest_price', minPrice);
  }
  if (maxPrice !== undefined) {
    countQuery = countQuery.lte('lowest_price', maxPrice);
  }
  if (searchTerm) {
    countQuery = countQuery.or(
      `name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,normalized_title.ilike.%${searchTerm}%,family_key.ilike.%${searchTerm}%,variant_key.ilike.%${searchTerm}%`,
    );
  }

  const { count, error } = await countQuery;
  if (error || count === null) return 0;
  return count;
}


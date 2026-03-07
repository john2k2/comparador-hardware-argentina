import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type { Product } from '@/lib/types';
import { buildCatalogMetadata } from '@/lib/catalog/catalog-metadata';

const UPSERT_CHUNK_SIZE = 250;
const HISTORY_CHUNK_SIZE = 500;
const LAST_PRICE_SIGNATURE_CACHE_MAX = 120_000;

const lastPersistedPriceSignatureByKey = new Map<string, string>();

type ProductRow = {
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
  refresh_priority: string;
  last_scraped_at: string;
  last_normalized_at: string | null;
  specs: Record<string, string>;
  lowest_price: number;
  highest_price: number;
  average_price: number;
  last_seen_at: string;
  updated_at: string;
};

type ProductPriceRow = {
  product_id: string;
  store_id: string;
  url: string;
  price: number;
  original_price: number | null;
  stock: 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';
  installment_count: number | null;
  installment_amount: number | null;
  last_updated: string;
  updated_at: string;
};

type PriceHistoryRow = {
  product_id: string;
  store_id: string;
  price: number;
  original_price: number | null;
  stock: 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';
  recorded_at: string;
};

function toIsoDate(value: Date | string | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function toStock(value: string | undefined): 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown' {
  if (value === 'in-stock' || value === 'low-stock' || value === 'out-of-stock') {
    return value;
  }
  return 'unknown';
}

function chunk<T>(rows: T[], size: number): T[][] {
  if (rows.length <= size) return [rows];

  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function rememberPriceSignature(key: string, signature: string): void {
  if (lastPersistedPriceSignatureByKey.has(key)) {
    lastPersistedPriceSignatureByKey.delete(key);
  }
  lastPersistedPriceSignatureByKey.set(key, signature);

  while (lastPersistedPriceSignatureByKey.size > LAST_PRICE_SIGNATURE_CACHE_MAX) {
    const oldestKey = lastPersistedPriceSignatureByKey.keys().next().value as string | undefined;
    if (!oldestKey) break;
    lastPersistedPriceSignatureByKey.delete(oldestKey);
  }
}

async function readTrackedProductIds(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseServiceClient>>,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set<string>();

  const trackedIds = new Set<string>();
  const chunks = chunk(productIds, UPSERT_CHUNK_SIZE);

  for (const batch of chunks) {
    const [{ data: favoritesData, error: favoritesError }, { data: alertsData, error: alertsError }] = await Promise.all([
      supabase
        .from('user_favorites')
        .select('product_id')
        .in('product_id', batch),
      supabase
        .from('price_alerts')
        .select('product_id')
        .in('product_id', batch)
        .eq('is_active', true),
    ]);

    if (favoritesError) {
      console.warn('[Catalog Persist] user_favorites tracking lookup omitido:', favoritesError.message);
    } else {
      for (const row of favoritesData ?? []) {
        const productId = String(row.product_id ?? '').trim();
        if (productId) trackedIds.add(productId);
      }
    }

    if (alertsError) {
      console.warn('[Catalog Persist] price_alerts tracking lookup omitido:', alertsError.message);
    } else {
      for (const row of alertsData ?? []) {
        const productId = String(row.product_id ?? '').trim();
        if (productId) trackedIds.add(productId);
      }
    }
  }

  return trackedIds;
}

export async function persistProductsSnapshot(products: Product[]): Promise<void> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase || products.length === 0) {
    return;
  }

  const trackedProductIds = await readTrackedProductIds(
    supabase,
    Array.from(new Set(products.map((product) => product.id).filter(Boolean))),
  );
  const enrichedProducts = await buildCatalogMetadata(products, trackedProductIds);
  const now = new Date();
  const productRowsById = new Map<string, ProductRow>();
  const productPriceRowsByKey = new Map<string, ProductPriceRow>();
  const historyRows: PriceHistoryRow[] = [];

  for (const product of enrichedProducts) {
    const updatedAt = toIsoDate(product.updatedAt, now);

    productRowsById.set(product.id, {
      id: product.id,
      name: product.name,
      category: product.category,
      brand: product.brand || 'Generica',
      model: product.model || product.name,
      description: product.description ?? null,
      image: product.image ?? null,
      normalized_title: product.normalizedTitle ?? product.name,
      canonical_product_key: product.canonicalProductKey ?? null,
      family_key: product.familyKey ?? null,
      variant_key: product.variantKey ?? null,
      refresh_priority: product.refreshPriority ?? 'normal',
      last_scraped_at: toIsoDate(product.lastScrapedAt, now),
      last_normalized_at: toIsoDate(product.lastNormalizedAt ?? now, now),
      specs: product.specs ?? {},
      lowest_price: product.lowestPrice ?? 0,
      highest_price: product.highestPrice ?? 0,
      average_price: product.averagePrice ?? 0,
      last_seen_at: now.toISOString(),
      updated_at: updatedAt,
    });

    for (const price of product.prices ?? []) {
      if (!price.storeId || !price.url) continue;
      const key = `${product.id}|${price.storeId}|${price.url}`;
      const lastUpdated = toIsoDate(price.lastUpdated, now);
      const stock = toStock(price.stock);
      const installmentCount = price.installment?.count ?? null;
      const installmentAmount = price.installment?.amount ?? null;
      const signature = [
        price.price ?? 0,
        price.originalPrice ?? '',
        stock,
        installmentCount ?? '',
        installmentAmount ?? '',
      ].join('|');
      const previousSignature = lastPersistedPriceSignatureByKey.get(key);
      const changedSinceLastPersist = previousSignature !== signature;

      if (changedSinceLastPersist) {
        productPriceRowsByKey.set(key, {
          product_id: product.id,
          store_id: price.storeId,
          url: price.url,
          price: price.price ?? 0,
          original_price: price.originalPrice ?? null,
          stock,
          installment_count: installmentCount,
          installment_amount: installmentAmount,
          last_updated: lastUpdated,
          updated_at: now.toISOString(),
        });
      }

      if (changedSinceLastPersist) {
        historyRows.push({
          product_id: product.id,
          store_id: price.storeId,
          price: price.price ?? 0,
          original_price: price.originalPrice ?? null,
          stock,
          recorded_at: lastUpdated,
        });
      }

      rememberPriceSignature(key, signature);
    }
  }

  const productRows = Array.from(productRowsById.values());
  const priceRows = Array.from(productPriceRowsByKey.values());

  for (const batch of chunk(productRows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('products').upsert(batch, {
      onConflict: 'id',
    });
    if (error) {
      throw new Error(`Error upsert products: ${error.message}`);
    }
  }

  for (const batch of chunk(priceRows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('product_prices').upsert(batch, {
      onConflict: 'product_id,store_id,url',
    });
    if (error) {
      throw new Error(`Error upsert product_prices: ${error.message}`);
    }
  }

  for (const batch of chunk(historyRows, HISTORY_CHUNK_SIZE)) {
    const { error } = await supabase.from('price_history').insert(batch);
    if (error) {
      throw new Error(`Error insert price_history: ${error.message}`);
    }
  }
}

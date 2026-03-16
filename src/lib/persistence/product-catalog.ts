import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import { stores as staticStores } from '@/lib/scrapers/static-data';
import type { Product } from '@/lib/types';
import { buildCatalogMetadata } from '@/lib/catalog/catalog-metadata';
import {
  buildProductPriceRowKey,
  planPriceRowPersistence,
  planProductRowPersistence,
} from '@/lib/persistence/product-write-dedupe';

const UPSERT_CHUNK_SIZE = 250;
const HISTORY_CHUNK_SIZE = 500;

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
  content_signature: string;
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
  state_signature: string;
};

type PriceHistoryRow = {
  product_id: string;
  store_id: string;
  price: number;
  original_price: number | null;
  stock: 'in-stock' | 'low-stock' | 'out-of-stock' | 'unknown';
  recorded_at: string;
};

type PersistedProductStateRow = {
  id: string;
  content_signature: string | null;
  last_seen_at: string | null;
  last_scraped_at: string | null;
};

type PersistedProductPriceStateRow = {
  product_id: string;
  store_id: string;
  url: string;
  state_signature: string | null;
  last_updated: string | null;
};

type StoreRow = {
  id: string;
  name: string;
  logo: string;
  url: string;
  color: string;
  is_active?: boolean;
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
  if (rows.length === 0) return [];
  if (rows.length <= size) return [rows];

  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
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
      console.warn('[Catalog Persist] user_favorites tracking lookup skipped:', favoritesError.message);
    } else {
      for (const row of favoritesData ?? []) {
        const productId = String(row.product_id ?? '').trim();
        if (productId) trackedIds.add(productId);
      }
    }

    if (alertsError) {
      console.warn('[Catalog Persist] price_alerts tracking lookup skipped:', alertsError.message);
    } else {
      for (const row of alertsData ?? []) {
        const productId = String(row.product_id ?? '').trim();
        if (productId) trackedIds.add(productId);
      }
    }
  }

  return trackedIds;
}

async function readPersistedCatalogState(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseServiceClient>>,
  productIds: string[],
): Promise<{
  productsById: Map<string, PersistedProductStateRow>;
  pricesByKey: Map<string, PersistedProductPriceStateRow>;
}> {
  const productsById = new Map<string, PersistedProductStateRow>();
  const pricesByKey = new Map<string, PersistedProductPriceStateRow>();
  if (productIds.length === 0) {
    return { productsById, pricesByKey };
  }

  const chunks = chunk(productIds, UPSERT_CHUNK_SIZE);
  for (const batch of chunks) {
    const [{ data: productsData, error: productsError }, { data: pricesData, error: pricesError }] = await Promise.all([
      supabase
        .from('products')
        .select('id,content_signature,last_seen_at,last_scraped_at')
        .in('id', batch),
      supabase
        .from('product_prices')
        .select('product_id,store_id,url,state_signature,last_updated')
        .in('product_id', batch),
    ]);

    if (productsError) {
      throw new Error(`Error read persisted products: ${productsError.message}`);
    }
    if (pricesError) {
      throw new Error(`Error read persisted product_prices: ${pricesError.message}`);
    }

    for (const row of (productsData ?? []) as PersistedProductStateRow[]) {
      productsById.set(row.id, row);
    }
    for (const row of (pricesData ?? []) as PersistedProductPriceStateRow[]) {
      pricesByKey.set(buildProductPriceRowKey(row), row);
    }
  }

  return { productsById, pricesByKey };
}

async function ensurePersistedStores(
  supabase: NonNullable<ReturnType<typeof getServerSupabaseServiceClient>>,
  storeIds: string[],
): Promise<void> {
  const uniqueStoreIds = Array.from(new Set(storeIds.filter(Boolean)));
  if (uniqueStoreIds.length === 0) return;

  const { data, error } = await supabase
    .from('stores')
    .select('id')
    .in('id', uniqueStoreIds);

  if (error) {
    throw new Error(`Error read stores: ${error.message}`);
  }

  const persistedStoreIds = new Set((data ?? []).map((row) => String(row.id ?? '').trim()).filter(Boolean));
  const missingStores: StoreRow[] = staticStores
    .filter((store) => uniqueStoreIds.includes(store.id) && !persistedStoreIds.has(store.id))
    .map((store) => ({
      id: store.id,
      name: store.name,
      logo: store.logo,
      url: store.url,
      color: store.color,
      is_active: true,
    }));

  if (missingStores.length === 0) return;

  const { error: upsertError } = await supabase.from('stores').upsert(missingStores, {
    onConflict: 'id',
  });

  if (upsertError) {
    throw new Error(`Error upsert stores: ${upsertError.message}`);
  }
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
  const candidateProductRowsById = new Map<string, ProductRow>();
  const candidatePriceRowsByKey = new Map<string, ProductPriceRow>();

  for (const product of enrichedProducts) {
    const updatedAt = toIsoDate(product.updatedAt, now);
    const lastScrapedAt = toIsoDate(product.lastScrapedAt, now);
    const lastNormalizedAt = product.lastNormalizedAt ? toIsoDate(product.lastNormalizedAt, now) : null;

    const productRowBase = {
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
      specs: product.specs ?? {},
      lowest_price: product.lowestPrice ?? 0,
      highest_price: product.highestPrice ?? 0,
      average_price: product.averagePrice ?? 0,
    } as const;
    const productPlan = planProductRowPersistence(productRowBase, undefined, now);

    candidateProductRowsById.set(product.id, {
      ...productRowBase,
      last_scraped_at: lastScrapedAt,
      last_normalized_at: lastNormalizedAt,
      last_seen_at: now.toISOString(),
      updated_at: updatedAt,
      content_signature: productPlan.contentSignature,
    });

    for (const price of product.prices ?? []) {
      if (!price.storeId || !price.url) continue;
      const lastUpdated = toIsoDate(price.lastUpdated, now);
      const stock = toStock(price.stock);
      const installmentCount = price.installment?.count ?? null;
      const installmentAmount = price.installment?.amount ?? null;
      const priceRowBase = {
        price: price.price ?? 0,
        original_price: price.originalPrice ?? null,
        stock,
        installment_count: installmentCount,
        installment_amount: installmentAmount,
      } as const;
      const pricePlan = planPriceRowPersistence(priceRowBase, undefined, now);
      const key = buildProductPriceRowKey({
        product_id: product.id,
        store_id: price.storeId,
        url: price.url,
      });

      candidatePriceRowsByKey.set(key, {
        product_id: product.id,
        store_id: price.storeId,
        url: price.url,
        ...priceRowBase,
        last_updated: lastUpdated,
        updated_at: now.toISOString(),
        state_signature: pricePlan.stateSignature,
      });
    }
  }

  const productIds = Array.from(candidateProductRowsById.keys());
  const { productsById, pricesByKey } = await readPersistedCatalogState(supabase, productIds);
  const productRows: ProductRow[] = [];
  const priceRows: ProductPriceRow[] = [];
  const historyRows: PriceHistoryRow[] = [];

  for (const row of candidateProductRowsById.values()) {
    const plan = planProductRowPersistence({
      name: row.name,
      category: row.category,
      brand: row.brand,
      model: row.model,
      description: row.description,
      image: row.image,
      normalized_title: row.normalized_title,
      canonical_product_key: row.canonical_product_key,
      family_key: row.family_key,
      variant_key: row.variant_key,
      refresh_priority: row.refresh_priority,
      specs: row.specs,
      lowest_price: row.lowest_price,
      highest_price: row.highest_price,
      average_price: row.average_price,
    }, productsById.get(row.id), now);
    row.content_signature = plan.contentSignature;

    if (plan.shouldUpsert) {
      productRows.push(row);
    }
  }

  for (const row of candidatePriceRowsByKey.values()) {
    const key = buildProductPriceRowKey(row);
    const plan = planPriceRowPersistence({
      price: row.price,
      original_price: row.original_price,
      stock: row.stock,
      installment_count: row.installment_count,
      installment_amount: row.installment_amount,
    }, pricesByKey.get(key), now);
    row.state_signature = plan.stateSignature;

    if (plan.shouldUpsert) {
      priceRows.push(row);
    }

    if (plan.changed) {
      historyRows.push({
        product_id: row.product_id,
        store_id: row.store_id,
        price: row.price,
        original_price: row.original_price,
        stock: row.stock,
        recorded_at: row.last_updated,
      });
    }
  }

  for (const batch of chunk(productRows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('products').upsert(batch, {
      onConflict: 'id',
    });
    if (error) {
      throw new Error(`Error upsert products: ${error.message}`);
    }
  }

  await ensurePersistedStores(
    supabase,
    priceRows.map((row) => row.store_id),
  );

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

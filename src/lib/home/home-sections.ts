import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { hydrateProducts } from '@/lib/product-serialization';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';
import type { Product } from '@/lib/types';

type HistoryRow = {
  product_id: string;
  store_id: string;
  price: number | string;
  recorded_at: string;
};

type HistoryPoint = {
  price: number;
  recordedAtMs: number;
};

type CurrentPricePoint = {
  product: Product;
  storeId: string;
  currentPrice: number;
  currentUpdatedAtMs: number;
};

type DropCandidate = {
  product: Product;
  dropAmount: number;
  dropPercent: number;
};

export type HomeSectionsData = {
  featuredProducts: Product[];
  priceDropProducts: Product[];
  featuredFallbackUsed: boolean;
  priceDropFallbackUsed: boolean;
  rules: {
    featured: {
      stock: string[];
      freshnessHours: number;
      perCategoryBestPrice: boolean;
      limit: number;
    };
    priceDrop: {
      minPercent: number;
      minAmountArs: number;
      windowHours: number;
      source: 'price_history';
      fallbackSnapshot: false;
      limit: number;
    };
  };
};

const FEATURED_PRODUCTS_LIMIT = 8;
const PRICE_DROP_PRODUCTS_LIMIT = 8;
const FEATURED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PRICE_DROP_WINDOW_HOURS = 24;
const PRICE_DROP_WINDOW_MS = PRICE_DROP_WINDOW_HOURS * 60 * 60 * 1000;
const PRICE_DROP_MIN_PERCENT = 0.05;
const PRICE_DROP_MIN_AMOUNT_ARS = 10_000;
const DB_PRODUCTS_LIMIT = 600;
const MAX_HISTORY_ROWS = 20_000;
const HOME_SECTIONS_CACHE_TTL_MS = 5 * 60 * 1000;

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function isInStockProduct(product: Product): boolean {
  return product.prices.some((price) => price.stock === 'in-stock' || price.stock === 'low-stock');
}

function isFreshProduct(product: Product, maxAgeMs: number): boolean {
  const updatedAtMs = product.updatedAt?.getTime?.();
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs <= maxAgeMs;
}

function pickFeaturedProducts(products: Product[], limit: number): Product[] {
  const eligible = products.filter((product) => isInStockProduct(product) && isFreshProduct(product, FEATURED_MAX_AGE_MS));
  if (eligible.length === 0) return [];

  const byCategory = new Map<string, Product>();
  const cheapestFirst = [...eligible].sort((a, b) => {
    const byPrice = a.lowestPrice - b.lowestPrice;
    if (byPrice !== 0) return byPrice;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  for (const product of cheapestFirst) {
    if (!byCategory.has(product.category)) {
      byCategory.set(product.category, product);
    }
  }

  const selected = [...byCategory.values()].sort((a, b) => {
    const byFreshness = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (byFreshness !== 0) return byFreshness;
    return a.lowestPrice - b.lowestPrice;
  });

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  const selectedIds = new Set(selected.map((product) => product.id));
  const remaining = eligible
    .filter((product) => !selectedIds.has(product.id))
    .sort((a, b) => {
      const byFreshness = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (byFreshness !== 0) return byFreshness;
      return a.lowestPrice - b.lowestPrice;
    });

  return [...selected, ...remaining].slice(0, limit);
}

function pickFallbackHomeProducts(products: Product[], limit: number, excludedIds: Set<string> = new Set()): Product[] {
  const inStock = products.filter((product) => !excludedIds.has(product.id) && isInStockProduct(product));
  const source = inStock.length > 0 ? inStock : products.filter((product) => !excludedIds.has(product.id));

  return [...source]
    .sort((a, b) => {
      const byFreshness = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (byFreshness !== 0) return byFreshness;

      const byStoreCount = b.prices.length - a.prices.length;
      if (byStoreCount !== 0) return byStoreCount;

      return a.lowestPrice - b.lowestPrice;
    })
    .slice(0, limit);
}

function qualifiesPriceDrop(dropAmount: number, dropPercent: number): boolean {
  if (dropAmount <= 0) return false;
  return dropAmount >= PRICE_DROP_MIN_AMOUNT_ARS || dropPercent >= PRICE_DROP_MIN_PERCENT;
}

function rankDropCandidates(candidates: DropCandidate[], limit: number): Product[] {
  return candidates
    .sort((a, b) => {
      const byPercent = b.dropPercent - a.dropPercent;
      if (byPercent !== 0) return byPercent;

      const byAmount = b.dropAmount - a.dropAmount;
      if (byAmount !== 0) return byAmount;

      return b.product.updatedAt.getTime() - a.product.updatedAt.getTime();
    })
    .slice(0, limit)
    .map((entry) => entry.product);
}

function selectCurrentPricePoints(products: Product[], minUpdatedAtMs: number): CurrentPricePoint[] {
  const byPair = new Map<string, CurrentPricePoint>();

  for (const product of products) {
    for (const price of product.prices) {
      const currentPrice = price.price;
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      if (!price.storeId) continue;

      const currentUpdatedAtMs = price.lastUpdated?.getTime?.();
      const normalizedUpdatedAtMs = typeof currentUpdatedAtMs === 'number' && Number.isFinite(currentUpdatedAtMs)
        ? currentUpdatedAtMs
        : product.updatedAt.getTime();
      if (!Number.isFinite(normalizedUpdatedAtMs) || normalizedUpdatedAtMs < minUpdatedAtMs) continue;

      const key = `${product.id}|${price.storeId}`;
      const existing = byPair.get(key);

      if (!existing) {
        byPair.set(key, {
          product,
          storeId: price.storeId,
          currentPrice,
          currentUpdatedAtMs: normalizedUpdatedAtMs,
        });
        continue;
      }

      if (currentPrice < existing.currentPrice) {
        byPair.set(key, {
          product,
          storeId: price.storeId,
          currentPrice,
          currentUpdatedAtMs: normalizedUpdatedAtMs,
        });
        continue;
      }

      if (currentPrice === existing.currentPrice && normalizedUpdatedAtMs > existing.currentUpdatedAtMs) {
        byPair.set(key, {
          product,
          storeId: price.storeId,
          currentPrice,
          currentUpdatedAtMs: normalizedUpdatedAtMs,
        });
      }
    }
  }

  return [...byPair.values()];
}

function buildHistoryMap(rows: HistoryRow[]): Map<string, HistoryPoint[]> {
  const historyByPair = new Map<string, HistoryPoint[]>();

  for (const row of rows) {
    const price = toNumber(row.price, 0);
    if (price <= 0) continue;

    const recordedAtMs = new Date(row.recorded_at).getTime();
    if (!Number.isFinite(recordedAtMs)) continue;

    const key = `${row.product_id}|${row.store_id}`;
    const bucket = historyByPair.get(key);

    if (bucket) {
      bucket.push({ price, recordedAtMs });
    } else {
      historyByPair.set(key, [{ price, recordedAtMs }]);
    }
  }

  for (const bucket of historyByPair.values()) {
    bucket.sort((a, b) => b.recordedAtMs - a.recordedAtMs);
  }

  return historyByPair;
}

function resolveBaselineFromHistory(history: HistoryPoint[], current: CurrentPricePoint): number | null {
  if (history.length === 0) return null;

  for (const point of history) {
    const olderThanCurrent = point.recordedAtMs < current.currentUpdatedAtMs - 1000;
    if (olderThanCurrent && point.price > current.currentPrice) {
      return point.price;
    }
  }

  for (const point of history) {
    if (point.price > current.currentPrice) {
      return point.price;
    }
  }

  return null;
}

function pickPriceDropProductsFromHistory(
  products: Product[],
  rows: HistoryRow[],
  limit: number,
  minUpdatedAtMs: number,
): Product[] {
  if (rows.length === 0) return [];

  const historyByPair = buildHistoryMap(rows);
  const currentPricePoints = selectCurrentPricePoints(products, minUpdatedAtMs);
  const bestByProductId = new Map<string, DropCandidate>();

  for (const current of currentPricePoints) {
    const key = `${current.product.id}|${current.storeId}`;
    const history = historyByPair.get(key);
    if (!history || history.length === 0) continue;

    const baseline = resolveBaselineFromHistory(history, current);
    if (!baseline) continue;

    const dropAmount = baseline - current.currentPrice;
    const dropPercent = dropAmount / baseline;
    if (!qualifiesPriceDrop(dropAmount, dropPercent)) continue;

    const existing = bestByProductId.get(current.product.id);
    if (!existing) {
      bestByProductId.set(current.product.id, {
        product: current.product,
        dropAmount,
        dropPercent,
      });
      continue;
    }

    if (dropPercent > existing.dropPercent || (dropPercent === existing.dropPercent && dropAmount > existing.dropAmount)) {
      bestByProductId.set(current.product.id, {
        product: current.product,
        dropAmount,
        dropPercent,
      });
    }
  }

  return rankDropCandidates([...bestByProductId.values()], limit);
}

async function readRecentHistoryRows(sinceIso: string): Promise<HistoryRow[]> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('price_history')
    .select('product_id,store_id,price,recorded_at')
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: false })
    .limit(MAX_HISTORY_ROWS);

  if (error) {
    throw new Error(`readRecentHistoryRows: ${error.message}`);
  }

  return (data ?? []) as HistoryRow[];
}

export async function getHomeSectionsData(): Promise<HomeSectionsData> {
  const cached = await getSharedCache<HomeSectionsData>('home-sections', 'homepage-v1');
  if (cached) {
    return {
      ...cached,
      featuredProducts: hydrateProducts(cached.featuredProducts ?? []),
      priceDropProducts: hydrateProducts(cached.priceDropProducts ?? []),
    };
  }

  const dropWindowStartMs = Date.now() - PRICE_DROP_WINDOW_MS;
  const dropWindowStartIso = new Date(dropWindowStartMs).toISOString();
  const products = await readProductsFromDatabase({
    sortBy: 'newest',
    limit: DB_PRODUCTS_LIMIT,
  });

  const featuredPrimary = pickFeaturedProducts(products, FEATURED_PRODUCTS_LIMIT);
  const featuredFallback = featuredPrimary.length === 0
    ? pickFallbackHomeProducts(products, FEATURED_PRODUCTS_LIMIT)
    : [];
  const featuredProducts = featuredPrimary.length > 0 ? featuredPrimary : featuredFallback;
  const featuredFallbackUsed = featuredPrimary.length === 0 && featuredFallback.length > 0;

  // Si todavia no hay productos destacados, usar cualquier producto disponible
  if (featuredProducts.length === 0 && products.length > 0) {
    featuredProducts.push(...products.slice(0, FEATURED_PRODUCTS_LIMIT));
  }
  const historyRows = await readRecentHistoryRows(dropWindowStartIso).catch((historyError) => {
    console.warn('[Home Sections] Historial de precios no disponible:', historyError);
    return [] as HistoryRow[];
  });

  const priceDropPrimary = pickPriceDropProductsFromHistory(
    products,
    historyRows,
    PRICE_DROP_PRODUCTS_LIMIT,
    dropWindowStartMs,
  );
  const priceDropFallback = priceDropPrimary.length === 0
    ? pickFallbackHomeProducts(products, PRICE_DROP_PRODUCTS_LIMIT, new Set(featuredProducts.map((product) => product.id)))
    : [];
  const priceDropProducts = priceDropPrimary.length > 0 ? priceDropPrimary : priceDropFallback;
  const priceDropFallbackUsed = priceDropPrimary.length === 0 && priceDropFallback.length > 0;

  // Si todavia no hay productos con bajada de precio, usar cualquier producto disponible (excluyendo destacados)
  if (priceDropProducts.length === 0 && products.length > 0) {
    const featuredIds = new Set(featuredProducts.map((product) => product.id));
    const remainingProducts = products.filter((product) => !featuredIds.has(product.id));
    priceDropProducts.push(...remainingProducts.slice(0, PRICE_DROP_PRODUCTS_LIMIT));
  }

  const payload: HomeSectionsData = {
    featuredProducts,
    priceDropProducts,
    featuredFallbackUsed,
    priceDropFallbackUsed,
    rules: {
      featured: {
        stock: ['in-stock', 'low-stock'],
        freshnessHours: 24,
        perCategoryBestPrice: true,
        limit: FEATURED_PRODUCTS_LIMIT,
      },
      priceDrop: {
        minPercent: PRICE_DROP_MIN_PERCENT,
        minAmountArs: PRICE_DROP_MIN_AMOUNT_ARS,
        windowHours: PRICE_DROP_WINDOW_HOURS,
        source: 'price_history',
        fallbackSnapshot: false,
        limit: PRICE_DROP_PRODUCTS_LIMIT,
      },
    },
  };

  await setSharedCache('home-sections', 'homepage-v1', payload, HOME_SECTIONS_CACHE_TTL_MS);
  return payload;
}

import type { Product } from '@/lib/types';
import { withAbortTimeout } from '@/lib/async/with-abort-timeout';
import { withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import { hydrateProduct } from '@/lib/product-serialization';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { fetchProductDescriptionFromUrl, isWeakProductDescription } from '@/lib/scrapers/product-description';
import { scheduleInternalRefresh } from '@/lib/server/internal-refresh';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { pickDescriptionUrls } from '@/lib/products/product-detail-helpers';
import { normalizeProductContent } from '@/lib/products/normalize-product-content';

export const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
export const SCRAPER_TIMEOUT_MS = 25_000;
export const PERSISTENCE_TIMEOUT_MS = 7_000;
export const DB_STALE_AFTER_MS = 20 * 60 * 1000;
export const BACKGROUND_REFRESH_TIMEOUT_MS = 60 * 1000;
export const PRODUCTS_RATE_LIMIT = { limit: 50, windowMs: 60 * 1000 };

export const inFlightDetailRequests = new Map<string, Promise<Product | null>>();
export const inFlightBackgroundProductsRefreshes = new Map<string, Promise<void>>();

export async function getCachedDetail(normalizedId: string): Promise<Product | null | undefined> {
  const cached = await getSharedCache<Product | null>('product-detail', normalizedId);
  if (cached === undefined || cached === null) return cached;
  return hydrateProduct(cached);
}

export async function setCachedDetail(normalizedId: string, product: Product | null): Promise<void> {
  await setSharedCache('product-detail', normalizedId, product, DETAIL_CACHE_TTL_MS);
}

export function scheduleBackgroundProductsRefresh(
  request: import('next/server').NextRequest,
  refreshKey: string,
): void {
  scheduleInternalRefresh({
    request,
    refreshKey,
    inFlightRefreshes: inFlightBackgroundProductsRefreshes,
    timeoutMs: BACKGROUND_REFRESH_TIMEOUT_MS,
    timeoutLabel: 'products-background-refresh',
    logPrefix: '[API Products]',
  });
}

export async function normalizeAndEnrichProduct(product: Product): Promise<Product> {
  const normalized = normalizeProductContent(product);
  if (!isWeakProductDescription(normalized.description, normalized.name)) {
    return normalized;
  }

  const urls = pickDescriptionUrls(normalized);
  for (const url of urls) {
    const extracted = await fetchProductDescriptionFromUrl(url, normalized.name);
    if (extracted && !isWeakProductDescription(extracted, normalized.name)) {
      return {
        ...normalized,
        description: extracted,
      };
    }
  }

  return normalized;
}

export async function persistProductDetailSnapshot(product: Product): Promise<void> {
  await withPromiseTimeout(
    persistProductsSnapshot([product]),
    PERSISTENCE_TIMEOUT_MS,
    'supabase-persist-detail',
  ).catch((persistError) => {
    console.warn('[API Products] Persistencia detalle omitida:', persistError);
  });
}

export function createObservedProductsSourceRunner(
  runObservedStoreScrape: typeof import('@/lib/telemetry/operational-metrics').runObservedStoreScrape,
) {
  return (
    storeId: string,
    storeName: string,
    run: (signal: AbortSignal) => Promise<Product[]>,
  ) =>
    runObservedStoreScrape({
      endpoint: '/api/products',
      storeId,
      storeName,
      run: () => withAbortTimeout(
        (signal) => run(signal),
        SCRAPER_TIMEOUT_MS,
        storeId,
      ),
    });
}

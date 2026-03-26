import type { HardwareCategory, Product } from '../types';
import { MonitoredEndpoint, recordStoreScrapeEvent, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { logger } from '../logger';
import { runWithConcurrency, selectStoresByIds } from './multi-store';
import {
  CATEGORY_SLUGS,
  type WooRequestOptions,
  type WooStore,
  WOO_CATEGORY_MAX_PAGES,
  WOO_CONCURRENCY,
  WOOCOMMERCE_STORES,
  WOO_SEARCH_MAX_PAGES,
  fetchWooCommerceProductBySlug,
  scrapeWooPages,
} from './woocommerce-shared';

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const storeBackoffUntil = new Map<string, number>();

function getBlockedUntil(store: WooStore): number | null {
  const blockedUntil = storeBackoffUntil.get(store.id);
  return blockedUntil && blockedUntil > Date.now() ? blockedUntil : null;
}

function recordWooBlockedStore(store: WooStore, endpoint: MonitoredEndpoint, blockedUntil: number): Product[] {
  recordStoreScrapeEvent({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    startedAtMs: Date.now(),
    latencyMs: 0,
    resultCount: 0,
    status: 'blocked',
    message: `Backoff activo hasta ${new Date(blockedUntil).toISOString()}`,
  });
  return [];
}

function markWooBackoff(store: WooStore, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
    storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
    logger.warn(`[WooCommerce] ${store.name} bloquea scraping (${message})`);
    return;
  }

  logger.error(`[WooCommerce] ${store.name} error: ${message}`);
}

function clearWooBackoff(store: WooStore, results: Product[]): void {
  if (results.length > 0) {
    storeBackoffUntil.delete(store.id);
  }
}

function selectWooStores(storeIds?: Iterable<string>): WooStore[] {
  return selectStoresByIds(WOOCOMMERCE_STORES, storeIds);
}

export async function fetchWooCommerceProductById(
  productId: string,
  category: HardwareCategory,
  options?: WooRequestOptions,
): Promise<Product | null> {
  return fetchWooCommerceProductBySlug(productId, category, options);
}

export async function fetchWooCommerceSearch(
  query: string,
  category: HardwareCategory,
  store: WooStore,
  endpoint: MonitoredEndpoint = '/api/search',
  options?: WooRequestOptions,
): Promise<Product[]> {
  const blockedUntil = getBlockedUntil(store);
  if (blockedUntil) {
    return recordWooBlockedStore(store, endpoint, blockedUntil);
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      if (options?.signal?.aborted) return [];
      const url = `${store.baseUrl}/?s=${encodeURIComponent(query)}&post_type=product`;

      try {
        logger.info(`[WooCommerce] ${store.name} buscando: ${query}`);
        const results = await scrapeWooPages(url, store, category, WOO_SEARCH_MAX_PAGES, options);
        clearWooBackoff(store, results);
        logger.info(`[WooCommerce] ${store.name} -> ${results.length} productos`);
        return results;
      } catch (error) {
        markWooBackoff(store, error);
        throw error;
      }
    },
  });
}

export async function fetchWooCommerceCategory(
  category: HardwareCategory,
  store: WooStore,
  endpoint: MonitoredEndpoint = '/api/products',
  options?: WooRequestOptions,
): Promise<Product[]> {
  const blockedUntil = getBlockedUntil(store);
  if (blockedUntil) {
    return recordWooBlockedStore(store, endpoint, blockedUntil);
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      if (options?.signal?.aborted) return [];

      const slugs = CATEGORY_SLUGS[category] ?? [];
      for (const slug of slugs) {
        try {
          const url = `${store.baseUrl}/product-category/${slug}/`;
          const results = await scrapeWooPages(url, store, category, WOO_CATEGORY_MAX_PAGES, options);
          if (results.length > 0) {
            clearWooBackoff(store, results);
            logger.info(`[WooCommerce] ${store.name} categoria '${slug}' -> ${results.length} productos`);
            return results;
          }
        } catch (error) {
          markWooBackoff(store, error);
          throw error;
        }
      }

      if (slugs.length === 0) return [];

      const fallbackSearchUrl = `${store.baseUrl}/?s=${encodeURIComponent(slugs[0])}&post_type=product`;
      try {
        const fallbackResults = await scrapeWooPages(
          fallbackSearchUrl,
          store,
          category,
          WOO_SEARCH_MAX_PAGES,
          options,
        );
        clearWooBackoff(store, fallbackResults);
        return fallbackResults;
      } catch (error) {
        markWooBackoff(store, error);
        throw error;
      }
    },
  });
}

export async function fetchAllWooCommerceSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const stores = selectWooStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, WOO_CONCURRENCY, async (store) =>
    Promise.resolve(fetchWooCommerceSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllWooCommerceCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: WooRequestOptions,
): Promise<Product[]> {
  const stores = selectWooStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, WOO_CONCURRENCY, async (store) =>
    Promise.resolve(fetchWooCommerceCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

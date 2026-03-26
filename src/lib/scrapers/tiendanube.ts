import type { HardwareCategory, Product } from '../types';
import { MonitoredEndpoint, recordStoreScrapeEvent, runObservedStoreScrape } from '../telemetry/operational-metrics';
import { logger } from '../logger';
import { runWithConcurrency, selectStoresByIds } from './multi-store';
import {
  CATEGORY_SEARCH_TERMS,
  type TiendaNubeRequestOptions,
  TIENDANUBE_CATEGORY_MAX_PAGES,
  TIENDANUBE_CONCURRENCY,
  TIENDANUBE_SEARCH_MAX_PAGES,
  type TiendaNubeStore,
  TIENDANUBE_STORES,
  fetchTiendaNubeProductFromStore,
  scrapeTiendaNubePages,
} from './tiendanube-shared';

const STORE_BACKOFF_MS = 30 * 60 * 1000;
const storeBackoffUntil = new Map<string, number>();

function getBlockedUntil(store: TiendaNubeStore): number | null {
  const blockedUntil = storeBackoffUntil.get(store.id);
  return blockedUntil && blockedUntil > Date.now() ? blockedUntil : null;
}

function recordBlockedStore(store: TiendaNubeStore, endpoint: MonitoredEndpoint, blockedUntil: number): Product[] {
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

function handleStoreError(store: TiendaNubeStore, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HTTP 403') || message.includes('HTTP 429')) {
    storeBackoffUntil.set(store.id, Date.now() + STORE_BACKOFF_MS);
    logger.warn(`[TiendaNube] ${store.name} bloquea scraping (${message})`);
    return;
  }

  logger.error(`[TiendaNube] ${store.name} error: ${message}`);
}

function clearBackoff(store: TiendaNubeStore, results: Product[]): void {
  if (results.length > 0) {
    storeBackoffUntil.delete(store.id);
  }
}

function selectTiendaNubeStores(storeIds?: Iterable<string>): TiendaNubeStore[] {
  return selectStoresByIds(TIENDANUBE_STORES, storeIds);
}

export async function fetchTiendaNubeSearch(
  query: string,
  category: HardwareCategory,
  store: TiendaNubeStore,
  endpoint: MonitoredEndpoint = '/api/search',
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const blockedUntil = getBlockedUntil(store);
  if (blockedUntil) {
    return recordBlockedStore(store, endpoint, blockedUntil);
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      const url = `${store.baseUrl}/search/?q=${encodeURIComponent(query)}`;

      try {
        const results = await scrapeTiendaNubePages(url, store, category, TIENDANUBE_SEARCH_MAX_PAGES, options);
        clearBackoff(store, results);
        logger.info(`[TiendaNube] ${store.name} -> ${results.length} productos`);
        return results;
      } catch (error) {
        handleStoreError(store, error);
        throw error;
      }
    },
  });
}

export async function fetchTiendaNubeCategory(
  category: HardwareCategory,
  store: TiendaNubeStore,
  endpoint: MonitoredEndpoint = '/api/products',
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const blockedUntil = getBlockedUntil(store);
  if (blockedUntil) {
    return recordBlockedStore(store, endpoint, blockedUntil);
  }

  return runObservedStoreScrape({
    endpoint,
    storeId: store.id,
    storeName: store.name,
    run: async () => {
      const terms = CATEGORY_SEARCH_TERMS[category] ?? [];

      for (const term of terms) {
        try {
          const url = `${store.baseUrl}/search/?q=${encodeURIComponent(term)}`;
          const results = await scrapeTiendaNubePages(url, store, category, TIENDANUBE_CATEGORY_MAX_PAGES, options);
          if (results.length > 0) {
            clearBackoff(store, results);
            return results;
          }
        } catch (error) {
          handleStoreError(store, error);
          throw error;
        }
      }

      return [];
    },
  });
}

export async function fetchAllTiendaNubeSearch(
  query: string,
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/search',
  storeIds?: Iterable<string>,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const stores = selectTiendaNubeStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, TIENDANUBE_CONCURRENCY, async (store) =>
    Promise.resolve(fetchTiendaNubeSearch(query, category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchAllTiendaNubeCategory(
  category: HardwareCategory,
  endpoint: MonitoredEndpoint = '/api/products',
  storeIds?: Iterable<string>,
  options?: TiendaNubeRequestOptions,
): Promise<Product[]> {
  const stores = selectTiendaNubeStores(storeIds);
  if (stores.length === 0) return [];

  const settled = await runWithConcurrency(stores, TIENDANUBE_CONCURRENCY, async (store) =>
    Promise.resolve(fetchTiendaNubeCategory(category, store, endpoint, options)).then(
      (value) => ({ status: 'fulfilled' as const, value }),
      () => ({ status: 'rejected' as const }),
    ));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function fetchTiendaNubeProductById(
  productId: string,
  category: HardwareCategory,
  options?: TiendaNubeRequestOptions,
): Promise<Product | null> {
  return fetchTiendaNubeProductFromStore(productId, category, options);
}

import type { HardwareCategory, Product } from '@/lib/types';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import { withConcurrencyLimit } from '@/lib/async/concurrency';
import { normalizeProductTitlesWithStats } from '@/lib/ai/normalize-products';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { normalizeProductContent } from '@/lib/products/normalize-product-content';
import { sanitizeProducts } from '@/lib/product-sanitizer';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { filterProductStores, groupSearchProducts } from '@/lib/search/search-dedupe';
import { SEARCH_PAGE_SIZE, paginateProducts } from '@/lib/search/search-pagination';
import {
  normalizeSearchText,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  shouldKeepByQueryIntent,
  sortProductsBySearchRelevance,
} from '@/lib/search/search-ranking';
import { STORE_SCRAPERS, FRAMEWORK_SCRAPERS } from '@/lib/scrapers/scraper-registry';
import { runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { logger } from '@/lib/logger';
import {
  type SortBy,
  PERSISTENCE_TIMEOUT_MS,
  SCRAPER_TIMEOUT_MS,
  MAX_CONCURRENT_SCRAPERS,
  setCachedSearchResponse,
  shouldRunStore,
} from '@/lib/search/search-handler-shared';

type RunLiveSearchInput = {
  query: string;
  category?: HardwareCategory;
  selectedStoreIds: Set<string>;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  sortBy: SortBy;
  cacheKey: string;
  bypassDb: boolean;
};

export async function runLiveSearch({
  query,
  category,
  selectedStoreIds,
  minPrice,
  maxPrice,
  page,
  sortBy,
  cacheKey,
  bypassDb,
}: RunLiveSearchInput): Promise<{ payload: SearchApiResponse; normalizationSummaryNote: string | null }> {
  logger.info('Running live global search', {
    endpoint: '/api/search',
    query,
    category,
  });
  const defaultCategory = category ?? inferHardwareCategoryFromName(query);
  const sourceTasks: Promise<Product[]>[] = [];

  // Scrapers de tiendas individuales (via registry)
  for (const scraper of STORE_SCRAPERS) {
    if (!shouldRunStore(selectedStoreIds, scraper.id)) continue;

    const searchUrl = scraper.buildSearchUrl
      ? scraper.buildSearchUrl(query)
      : query;

    sourceTasks.push(
      runObservedStoreScrape({
        endpoint: '/api/search',
        storeId: scraper.id,
        storeName: scraper.displayName,
        run: () => withAbortTimeout(
          (signal) => scraper.fn({ query, searchUrl, category: defaultCategory, signal }),
          SCRAPER_TIMEOUT_MS,
          scraper.id,
        ),
      }),
    );
  }

  // Framework scrapers (manejan multiples tiendas internas)
  // P0: Pasar selectedStoreIds para filtrar tiendas internas
  for (const scraper of FRAMEWORK_SCRAPERS) {
    sourceTasks.push(
      withAbortTimeout(
        (signal) => scraper.fn({ query, searchUrl: query, category: defaultCategory, selectedStoreIds, signal }),
        SCRAPER_TIMEOUT_MS,
        scraper.id,
      ).catch(() => [] as Product[]),
    );
  }

  // Ejecutar con limite de concurrencia para no sobrecargar el servidor
  const sourceResults = await withConcurrencyLimit(
    sourceTasks.map((task) => () => task),
    MAX_CONCURRENT_SCRAPERS,
  );
  let liveProducts: Product[] = sanitizeProducts(sourceResults.flat());

  // P0: Aplicar filtros baratos ANTES de la normalización AI para reducir
  // la cantidad de titulos que necesitan procesamiento costoso
  if (category) liveProducts = liveProducts.filter((product) => product.category === category);
  if (minPrice !== undefined) liveProducts = liveProducts.filter((product) => product.lowestPrice >= minPrice);
  if (maxPrice !== undefined) liveProducts = liveProducts.filter((product) => product.lowestPrice <= maxPrice);
  if (selectedStoreIds.size > 0) {
    liveProducts = liveProducts
      .map((product) => filterProductStores(product, selectedStoreIds))
      .filter((product): product is Product => Boolean(product));
  }

  // P0: Eliminado el primer filtro shouldKeepByQueryIntent que era redundante
  // (se aplicaba sobre nombres sin normalizar, antes del grouping)

  const allTitles = Array.from(new Set(liveProducts.map((product) => product.name)));
  let normalizedTitlesMap = new Map<string, string>();
  let normalizationSummaryNote: string | null = null;

  if (allTitles.length > 0) {
    logger.info('Normalizing unique search titles', {
      endpoint: '/api/search',
      query,
      titleCount: allTitles.length,
    });
    const normalization = await normalizeProductTitlesWithStats(allTitles, {
      useDatabaseCache: !bypassDb,
      queryContext: query,
    }).catch((normalizationError) => {
      logger.warn('AI title normalization skipped', {
        endpoint: '/api/search',
        query,
        error: normalizationError,
      });
      return {
        map: new Map(allTitles.map((title) => [title, title])),
        stats: {
          requestedTitles: allTitles.length,
          uniqueTitles: allTitles.length,
          memoryHits: 0,
          dbHits: 0,
          heuristicCount: 0,
          fallbackCount: allTitles.length,
          deferredCount: 0,
          dbUpsertAttempted: 0,
          dbUpserted: 0,
          fallbackRatePct: 100,
          fallbackReasons: {
            heuristic: 0,
            deferred: 0,
            error: allTitles.length,
          },
        },
      };
    });

    normalizedTitlesMap = normalization.map;
    normalizationSummaryNote = [
      `NORM_FB_${normalization.stats.fallbackRatePct.toFixed(1)}PCT`,
      `NORM_HEUR_${normalization.stats.heuristicCount}`,
      `NORM_DB_${normalization.stats.dbHits}`,
    ].join('|');

    if (normalization.stats.fallbackCount > 0) {
      logger.warn('Search title normalization used fallback', {
        endpoint: '/api/search',
        query,
        fallbackRatePct: normalization.stats.fallbackRatePct,
        fallbackCount: normalization.stats.fallbackCount,
        uniqueTitles: normalization.stats.uniqueTitles,
        fallbackReasons: normalization.stats.fallbackReasons,
      });
    } else {
      logger.info('Search title normalization completed without fallback', {
        endpoint: '/api/search',
        query,
        memoryHits: normalization.stats.memoryHits,
        dbHits: normalization.stats.dbHits,
        heuristicCount: normalization.stats.heuristicCount,
      });
    }

    if (normalization.stats.dbUpsertAttempted > 0 && normalization.stats.dbUpserted < normalization.stats.dbUpsertAttempted) {
      logger.warn('Search normalization persistence was partial', {
        endpoint: '/api/search',
        query,
        dbUpserted: normalization.stats.dbUpserted,
        dbUpsertAttempted: normalization.stats.dbUpsertAttempted,
      });
    }
  }

  const queryWords = normalizeSearchText(query).split(/\s+/).filter((word) => word.length > 1);
  const singleCharVariants = parseSingleCharQueryVariants(query);
  const strictVariants = parseStrictVariantQueryTokens(query);

  liveProducts = groupSearchProducts(
    liveProducts.map((product) => normalizeProductContent(product)),
    normalizedTitlesMap,
    queryWords,
    query,
    category,
  );

  // P0: Unico filtro shouldKeepByQueryIntent, despues del grouping (nombres ya normalizados)
  if (queryWords.length > 0) {
    liveProducts = liveProducts.filter((product) => shouldKeepByQueryIntent(product.name, queryWords, singleCharVariants, strictVariants));
  }

  if (sortBy === 'price-asc') {
    liveProducts.sort((a, b) => a.lowestPrice - b.lowestPrice);
  } else if (sortBy === 'price-desc') {
    liveProducts.sort((a, b) => b.lowestPrice - a.lowestPrice);
  } else if (sortBy === 'name') {
    liveProducts.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  } else if (sortBy === 'newest') {
    liveProducts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } else {
    liveProducts = sortProductsBySearchRelevance(liveProducts, query, category);
  }

  const total = liveProducts.length;
  const pageSlice = paginateProducts(liveProducts, page, SEARCH_PAGE_SIZE);
  logger.info('Live search completed', {
    endpoint: '/api/search',
    query,
    category,
    totalResults: total,
    page: pageSlice.currentPage,
  });

  const payload: SearchApiResponse = {
    products: pageSlice.paginatedProducts,
    pagination: {
      limit: pageSlice.paginatedProducts.length,
      offset: (pageSlice.currentPage - 1) * SEARCH_PAGE_SIZE,
      total,
      totalPages: pageSlice.totalPages,
      page: pageSlice.currentPage,
      pageSize: SEARCH_PAGE_SIZE,
    },
    facets: {
      categories: [],
      brands: [],
      stores: [],
    },
  };

  await withPromiseTimeout(persistProductsSnapshot(liveProducts), PERSISTENCE_TIMEOUT_MS, 'supabase-persist')
    .catch((persistError) => {
      logger.warn('Live search snapshot persistence skipped', {
        endpoint: '/api/search',
        query,
        error: persistError,
      });
    });

  await setCachedSearchResponse(cacheKey, payload);
  snapshotProducts(payload.products);
  return { payload, normalizationSummaryNote };
}

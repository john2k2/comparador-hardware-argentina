import type { HardwareCategory, Product } from '@/lib/types';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
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
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { searchCompraGamerProducts } from '@/lib/scrapers/compragamer';
import { fetchAllFoxtiendaSearch } from '@/lib/scrapers/foxtienda';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchGamingCityProducts } from '@/lib/scrapers/gamingcity';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchLoggProducts } from '@/lib/scrapers/logg';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchPortalTechProducts } from '@/lib/scrapers/portaltech';
import { fetchAllPrestashopSearch } from '@/lib/scrapers/prestashop';
import { fetchAllQloudSearch } from '@/lib/scrapers/qloud';
import { fetchAllTiendaNubeSearch } from '@/lib/scrapers/tiendanube';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchWiztechProducts } from '@/lib/scrapers/wiztech';
import { fetchAllWooCommerceSearch } from '@/lib/scrapers/woocommerce';
import { fetchXtpcProducts } from '@/lib/scrapers/xtpc';
import { runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { logger } from '@/lib/logger';
import {
  type SortBy,
  PERSISTENCE_TIMEOUT_MS,
  SCRAPER_TIMEOUT_MS,
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
  const mexxSearchUrl = `https://www.mexx.com.ar/buscar/?p=${encodeURIComponent(query)}`;
  const fullh4rdSearchUrl = `https://www.fullh4rd.com.ar/cat/search/${encodeURIComponent(query)}`;
  const venexSearchUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodeURIComponent(query)}`;

  logger.info('Running live global search', {
    endpoint: '/api/search',
    query,
    category,
  });
  const defaultCategory = category ?? inferHardwareCategoryFromName(query);
  const sourceTasks: Promise<Product[]>[] = [];

  const observeSearchSource = (
    storeId: string,
    storeName: string,
    run: (signal: AbortSignal) => Promise<Product[]>,
  ) =>
    runObservedStoreScrape({
      endpoint: '/api/search',
      storeId,
      storeName,
      run: () => withAbortTimeout(
        (signal) => run(signal),
        SCRAPER_TIMEOUT_MS,
        storeId,
      ),
    });

  if (shouldRunStore(selectedStoreIds, 'mexx')) sourceTasks.push(observeSearchSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxSearchUrl, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'venex')) sourceTasks.push(observeSearchSource('venex', 'Venex', (signal) => fetchVenexProducts(venexSearchUrl, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'fullh4rd')) sourceTasks.push(observeSearchSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'maximus')) sourceTasks.push(observeSearchSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'gamingcity')) sourceTasks.push(observeSearchSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'gezatek')) sourceTasks.push(observeSearchSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'compugarden')) sourceTasks.push(observeSearchSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'logg')) sourceTasks.push(observeSearchSource('logg', 'Logg', (signal) => fetchLoggProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'portaltech')) sourceTasks.push(observeSearchSource('portaltech', 'Portal Tech', (signal) => fetchPortalTechProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'compragamer')) sourceTasks.push(observeSearchSource('compragamer', 'CompraGamer', (signal) => searchCompraGamerProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'xtpc')) sourceTasks.push(observeSearchSource('xtpc', 'Xt-PC', (signal) => fetchXtpcProducts(query, defaultCategory, signal)));
  if (shouldRunStore(selectedStoreIds, 'wiztech')) sourceTasks.push(observeSearchSource('wiztech', 'WizTech', (signal) => fetchWiztechProducts(query, defaultCategory, signal)));

  sourceTasks.push(
    withAbortTimeout((signal) => fetchAllFoxtiendaSearch(query, defaultCategory, '/api/search', selectedStoreIds, { signal }), SCRAPER_TIMEOUT_MS, 'foxtienda').catch(() => [] as Product[]),
    withAbortTimeout((signal) => fetchAllQloudSearch(query, defaultCategory, '/api/search', selectedStoreIds, { signal }), SCRAPER_TIMEOUT_MS, 'qloud').catch(() => [] as Product[]),
    withAbortTimeout((signal) => fetchAllPrestashopSearch(query, defaultCategory, '/api/search', selectedStoreIds, { signal }), SCRAPER_TIMEOUT_MS, 'prestashop').catch(() => [] as Product[]),
    withAbortTimeout((signal) => fetchAllTiendaNubeSearch(query, defaultCategory, '/api/search', selectedStoreIds, { signal }), SCRAPER_TIMEOUT_MS, 'tiendanube').catch(() => [] as Product[]),
    withAbortTimeout((signal) => fetchAllWooCommerceSearch(query, defaultCategory, '/api/search', selectedStoreIds, { signal }), SCRAPER_TIMEOUT_MS, 'woocommerce').catch(() => [] as Product[]),
  );

  const sourceResults = sourceTasks.length > 0 ? await Promise.all(sourceTasks) : [];
  let liveProducts: Product[] = sanitizeProducts(sourceResults.flat());

  const queryWords = normalizeSearchText(query).split(/\s+/).filter((word) => word.length > 1);
  const singleCharVariants = parseSingleCharQueryVariants(query);
  const strictVariants = parseStrictVariantQueryTokens(query);

  if (queryWords.length > 0) {
    liveProducts = liveProducts.filter((product) => shouldKeepByQueryIntent(product.name, queryWords, singleCharVariants, strictVariants));
  }

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
          geminiCount: 0,
          fallbackCount: allTitles.length,
          deferredFallbackCount: 0,
          geminiBatches: 0,
          geminiBatchFailures: 1,
          dbUpsertAttempted: 0,
          dbUpserted: 0,
          fallbackRatePct: 100,
          fallbackReasons: {
            no_ai: 0,
            quota_backoff: 0,
            deferred_budget: 0,
            batch_error: allTitles.length,
          },
        },
      };
    });

    normalizedTitlesMap = normalization.map;
    normalizationSummaryNote = [
      `NORM_FB_${normalization.stats.fallbackRatePct.toFixed(1)}PCT`,
      `NORM_GEM_${normalization.stats.geminiCount}`,
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
        geminiCount: normalization.stats.geminiCount,
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

  liveProducts = groupSearchProducts(
    liveProducts.map((product) => normalizeProductContent(product)),
    normalizedTitlesMap,
    queryWords,
    query,
    category,
  );

  if (queryWords.length > 0) {
    liveProducts = liveProducts.filter((product) => shouldKeepByQueryIntent(product.name, queryWords, singleCharVariants, strictVariants));
  }
  if (category) liveProducts = liveProducts.filter((product) => product.category === category);
  if (minPrice !== undefined) liveProducts = liveProducts.filter((product) => product.lowestPrice >= minPrice);
  if (maxPrice !== undefined) liveProducts = liveProducts.filter((product) => product.lowestPrice <= maxPrice);
  if (selectedStoreIds.size > 0) {
    liveProducts = liveProducts
      .map((product) => filterProductStores(product, selectedStoreIds))
      .filter((product): product is Product => Boolean(product));
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

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { type HardwareCategory, type Product } from '@/lib/types';
import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchGamingCityProducts } from '@/lib/scrapers/gamingcity';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { fetchAllFoxtiendaSearch } from '@/lib/scrapers/foxtienda';
import { fetchLoggProducts } from '@/lib/scrapers/logg';
import { fetchPortalTechProducts } from '@/lib/scrapers/portaltech';
import { fetchAllPrestashopSearch } from '@/lib/scrapers/prestashop';
import { fetchAllQloudSearch } from '@/lib/scrapers/qloud';
import { searchCompraGamerProducts } from '@/lib/scrapers/compragamer';
import { fetchAllTiendaNubeSearch } from '@/lib/scrapers/tiendanube';
import { fetchAllWooCommerceSearch } from '@/lib/scrapers/woocommerce';
import { fetchWiztechProducts } from '@/lib/scrapers/wiztech';
import { fetchXtpcProducts } from '@/lib/scrapers/xtpc';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { hasStaleProducts } from '@/lib/persistence/product-staleness';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { hydrateProducts } from '@/lib/product-serialization';
import { normalizeProductTitlesWithStats } from '@/lib/ai/normalize-products';
import {
  inferHardwareCategoryFromName,
  isHardwareCategory,
} from '@/lib/catalog/hardware-categories';
import { normalizeProductContent } from '@/lib/products/normalize-product-content';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { sanitizeProducts } from '@/lib/product-sanitizer';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { scheduleInternalRefresh } from '@/lib/server/internal-refresh';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { SEARCH_PAGE_SIZE, paginateProducts } from '@/lib/search/search-pagination';
import { filterProductStores, groupSearchProducts } from '@/lib/search/search-dedupe';
import {
  normalizeSearchText,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  shouldKeepByQueryIntent,
  sortProductsBySearchRelevance,
} from '@/lib/search/search-ranking';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';

type SortBy = 'relevance' | 'price-asc' | 'price-desc' | 'name' | 'newest';

const VALID_SORTS = new Set<SortBy>(['relevance', 'price-asc', 'price-desc', 'name', 'newest']);
const SCRAPER_TIMEOUT_MS = 25000;
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const PERSISTENCE_TIMEOUT_MS = 7000;
const DB_STALE_AFTER_MS = 20 * 60 * 1000;
const BACKGROUND_REFRESH_TIMEOUT_MS = 60 * 1000;
const SEARCH_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const inFlightSearchRequests = new Map<string, Promise<SearchApiResponse>>();
const inFlightBackgroundSearchRefreshes = new Map<string, Promise<void>>();

function parseNonNegativeNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parsePositiveInteger(value: string | null, fallback = 1): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function parseStoreIds(value: string | null): Set<string> {
  if (!value) return new Set<string>();
  const ids = value
    .split(',')
    .map((storeId) => storeId.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids);
}

function shouldRunStore(selectedStoreIds: Set<string>, storeId: string): boolean {
  return selectedStoreIds.size === 0 || selectedStoreIds.has(storeId.toLowerCase());
}

function hasSearchFiltersIntent(input: {
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}): boolean {
  return Boolean(
    input.category
    || input.minPrice !== undefined
    || input.maxPrice !== undefined
    || input.stores.size > 0,
  );
}

function scheduleBackgroundSearchRefresh(request: NextRequest, refreshKey: string): void {
  scheduleInternalRefresh({
    request,
    refreshKey,
    inFlightRefreshes: inFlightBackgroundSearchRefreshes,
    timeoutMs: BACKGROUND_REFRESH_TIMEOUT_MS,
    timeoutLabel: 'search-background-refresh',
    logPrefix: '[API Search]',
  });
}

function buildResponsePagination(total: number, page: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = total > 0 ? Math.ceil(total / safePageSize) : 0;
  const currentPage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
  const offset = (currentPage - 1) * safePageSize;

  return {
    limit: total > 0 ? Math.min(safePageSize, Math.max(0, total - offset)) : 0,
    offset,
    total,
    totalPages,
    page: currentPage,
    pageSize: safePageSize,
  };
}

function emptySearchResponse(page = 1, pageSize = SEARCH_PAGE_SIZE): SearchApiResponse {
  return {
    products: [],
    pagination: buildResponsePagination(0, page, pageSize),
    facets: { categories: [], brands: [], stores: [] },
  };
}

function buildSearchCacheKey(input: {
  query: string;
  category?: HardwareCategory;
  sortBy: SortBy;
  page: number;
  minPrice?: number;
  maxPrice?: number;
  stores: Set<string>;
}) {
  const stores = Array.from(input.stores).sort().join(',');
  return [
    `q=${input.query.toLowerCase()}`,
    `cat=${input.category ?? ''}`,
    `sort=${input.sortBy}`,
    `page=${input.page}`,
    `min=${input.minPrice ?? ''}`,
    `max=${input.maxPrice ?? ''}`,
    `stores=${stores}`,
  ].join('|');
}

async function getCachedSearchResponse(cacheKey: string): Promise<SearchApiResponse | null> {
  const cached = await getSharedCache<SearchApiResponse>('search-response', cacheKey);
  if (!cached) return null;

  return {
    ...cached,
    products: hydrateProducts(cached.products ?? []),
  };
}

async function setCachedSearchResponse(cacheKey: string, payload: SearchApiResponse): Promise<void> {
  await setSharedCache('search-response', cacheKey, payload, SEARCH_CACHE_TTL_MS);
}

export async function GET(request: NextRequest) {
  const requestStartedAtMs = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get('q') ?? '').trim();
  const bypassDb = searchParams.get('bypassDb') === '1';
  const internalRefreshRequest = request.headers.get('x-internal-refresh') === '1';
  const isRefreshRequest = searchParams.get('refresh') === '1';
  const categoryParam = searchParams.get('category');
  const category = isHardwareCategory(categoryParam) ? categoryParam : undefined;
  const rawSortBy = searchParams.get('sortBy');
  const sortBy: SortBy = rawSortBy && VALID_SORTS.has(rawSortBy as SortBy) ? (rawSortBy as SortBy) : 'relevance';
  const page = parsePositiveInteger(searchParams.get('page'));
  const selectedStoreIds = parseStoreIds(searchParams.get('stores'));

  const rawMinPrice = parseNonNegativeNumber(searchParams.get('minPrice'));
  const rawMaxPrice = parseNonNegativeNumber(searchParams.get('maxPrice'));
  const minPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.min(rawMinPrice, rawMaxPrice) : rawMinPrice;
  const maxPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.max(rawMinPrice, rawMaxPrice) : rawMaxPrice;
  const cacheKey = buildSearchCacheKey({
    query,
    category,
    sortBy,
    page,
    minPrice,
    maxPrice,
    stores: selectedStoreIds,
  });
  let defaultRateLimitHeaders: Record<string, string> | null = null;

  const respond = <T>(
    body: T,
    init?: ResponseInit,
    meta?: { success?: boolean; resultCount?: number; note?: string },
  ) => {
    const statusCode = init?.status ?? 200;
    recordEndpointRequestEvent({
      endpoint: '/api/search',
      startedAtMs: requestStartedAtMs,
      statusCode,
      success: meta?.success ?? statusCode < 500,
      resultCount: meta?.resultCount ?? 0,
      note: meta?.note,
    });
    const headers = new Headers(init?.headers);
    if (defaultRateLimitHeaders) {
      for (const [header, value] of Object.entries(defaultRateLimitHeaders)) {
        headers.set(header, value);
      }
    }
    return NextResponse.json(body, {
      ...init,
      headers,
    });
  };

  if (bypassDb && !internalRefreshRequest) {
    const authorization = request.headers.get('authorization');
    const tokenFromHeader = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : null;
    const cookieStore = await cookies();
    const tokenFromCookie = cookieStore.get('sb-access-token')?.value ?? null;
    const adminUser = await resolveAdminAccessFromToken(tokenFromHeader || tokenFromCookie);
    if (!adminUser) {
      return respond(
        { error: 'bypassDb requiere privilegios de admin' },
        { status: 403 },
        {
          success: false,
          resultCount: 0,
          note: 'FORBIDDEN_BYPASS_DB',
        },
      );
    }
  }

  if (!internalRefreshRequest) {
    const rateResult = await checkRateLimit(`/api/search:${getRequestIp(request)}`, SEARCH_RATE_LIMIT);
    defaultRateLimitHeaders = buildRateLimitHeaders(rateResult);
    if (!rateResult.allowed) {
      return respond(
        { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateResult.retryAfterSeconds),
          },
        },
        {
          success: false,
          resultCount: 0,
          note: 'RATE_LIMIT',
        },
      );
    }
  }

  const hasFilterIntent = hasSearchFiltersIntent({
    category,
    minPrice,
    maxPrice,
    stores: selectedStoreIds,
  });
  const hasSearchIntent = Boolean(query || hasFilterIntent);

  if (!hasSearchIntent) {
    const payload = emptySearchResponse(page);
    return respond(payload, undefined, {
      success: true,
      resultCount: payload.products.length,
      note: 'EMPTY_QUERY',
    });
  }

  if (!bypassDb) {
    const cached = await getCachedSearchResponse(cacheKey);
    if (cached) {
      const staleCache = hasStaleProducts(cached.products, DB_STALE_AFTER_MS);
      if (query && staleCache && !isRefreshRequest) {
        scheduleBackgroundSearchRefresh(request, cacheKey);
      }

      snapshotProducts(cached.products);
      return respond(cached, {
        headers: { 'X-Search-Cache': staleCache ? 'HIT-STALE' : 'HIT' },
      }, {
        success: true,
        resultCount: cached.products.length,
        note: staleCache ? 'HIT_STALE' : 'HIT',
      });
    }
  }

  try {
    if (!bypassDb) {
      const databasePage = await readProductsPageFromDatabase({
        query: query || undefined,
        category,
        minPrice,
        maxPrice,
        storeIds: selectedStoreIds,
        sortBy,
        page,
        pageSize: SEARCH_PAGE_SIZE,
      }).catch((databaseError) => {
        console.warn('[API Search] Lectura DB-first omitida:', databaseError);
        return { products: [], total: 0, totalPages: 0, page, pageSize: SEARCH_PAGE_SIZE };
      });

      if (databasePage.total > 0) {
        const staleDatabase = hasStaleProducts(databasePage.products, DB_STALE_AFTER_MS);
        if (query && staleDatabase && !isRefreshRequest) {
          scheduleBackgroundSearchRefresh(request, cacheKey);
        }

        const payload: SearchApiResponse = {
          products: databasePage.products,
          pagination: {
            limit: databasePage.products.length,
            offset: (databasePage.page - 1) * databasePage.pageSize,
            total: databasePage.total,
            totalPages: databasePage.totalPages,
            page: databasePage.page,
            pageSize: databasePage.pageSize,
          },
          facets: {
            categories: [],
            brands: [],
            stores: [],
          },
        };

        await setCachedSearchResponse(cacheKey, payload);
        snapshotProducts(payload.products);

        return respond(payload, {
          headers: { 'X-Search-Cache': staleDatabase ? 'DB-STALE' : 'DB' },
        }, {
          success: true,
          resultCount: payload.products.length,
          note: staleDatabase ? 'DB_STALE' : 'DB_HIT',
        });
      }
    }

    if (!query) {
      const emptyPayload = emptySearchResponse(page);
      if (!bypassDb) {
        await setCachedSearchResponse(cacheKey, emptyPayload);
      }
      return respond(emptyPayload, {
        headers: { 'X-Search-Cache': 'DB-EMPTY' },
      }, {
        success: true,
        resultCount: 0,
        note: 'DB_EMPTY_FILTER_ONLY',
      });
    }

    const pending = inFlightSearchRequests.get(cacheKey);
    if (pending) {
      const payload = await pending;
      return respond(payload, {
        headers: { 'X-Search-Cache': 'INFLIGHT' },
      }, {
        success: true,
        resultCount: payload.products.length,
        note: 'INFLIGHT',
      });
    }

    let normalizationSummaryNote: string | null = null;

    const searchPromise = (async (): Promise<SearchApiResponse> => {
      const mexxSearchUrl = `https://www.mexx.com.ar/buscar/?p=${encodeURIComponent(query)}`;
      const fullh4rdSearchUrl = `https://www.fullh4rd.com.ar/cat/search/${encodeURIComponent(query)}`;
      const venexSearchUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodeURIComponent(query)}`;

      console.log(`[API Search] Buscando globalmente: ${query}`);

      const defaultCategory = category ?? inferHardwareCategoryFromName(query);
      const sourceTasks: Promise<Product[]>[] = [];

      if (shouldRunStore(selectedStoreIds, 'mexx')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'mexx',
            storeName: 'Mexx',
            run: () => withAbortTimeout(
              (signal) => fetchMexxProducts(mexxSearchUrl, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'mexx',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'venex')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'venex',
            storeName: 'Venex',
            run: () => withAbortTimeout(
              (signal) => fetchVenexProducts(venexSearchUrl, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'venex',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'fullh4rd')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'fullh4rd',
            storeName: 'FullH4rd',
            run: () => withAbortTimeout(
              (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'fullh4rd',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'maximus')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'maximus',
            storeName: 'Maximus',
            run: () => withAbortTimeout(
              (signal) => fetchMaximusProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'maximus',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'gamingcity')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'gamingcity',
            storeName: 'Gaming City',
            run: () => withAbortTimeout(
              (signal) => fetchGamingCityProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'gamingcity',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'gezatek')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'gezatek',
            storeName: 'Gezatek',
            run: () => withAbortTimeout(
              (signal) => fetchGezatekProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'gezatek',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'compugarden')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'compugarden',
            storeName: 'Compugarden',
            run: () => withAbortTimeout(
              (signal) => fetchCompugardenProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'compugarden',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'logg')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'logg',
            storeName: 'Logg',
            run: () => withAbortTimeout(
              (signal) => fetchLoggProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'logg',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'portaltech')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'portaltech',
            storeName: 'Portal Tech',
            run: () => withAbortTimeout(
              (signal) => fetchPortalTechProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'portaltech',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'compragamer')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'compragamer',
            storeName: 'CompraGamer',
            run: () => withAbortTimeout(
              (signal) => searchCompraGamerProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'compragamer',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'xtpc')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'xtpc',
            storeName: 'Xt-PC',
            run: () => withAbortTimeout(
              (signal) => fetchXtpcProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'xtpc',
            ),
          }),
        );
      }

      if (shouldRunStore(selectedStoreIds, 'wiztech')) {
        sourceTasks.push(
          runObservedStoreScrape({
            endpoint: '/api/search',
            storeId: 'wiztech',
            storeName: 'WizTech',
            run: () => withAbortTimeout(
              (signal) => fetchWiztechProducts(query, defaultCategory, signal),
              SCRAPER_TIMEOUT_MS,
              'wiztech',
            ),
          }),
        );
      }

      sourceTasks.push(
        withAbortTimeout(
          (signal) => fetchAllFoxtiendaSearch(
            query,
            defaultCategory,
            '/api/search',
            selectedStoreIds,
            { signal },
          ),
          SCRAPER_TIMEOUT_MS,
          'foxtienda',
        ).catch(() => [] as Product[]),
      );

      sourceTasks.push(
        withAbortTimeout(
          (signal) => fetchAllQloudSearch(
            query,
            defaultCategory,
            '/api/search',
            selectedStoreIds,
            { signal },
          ),
          SCRAPER_TIMEOUT_MS,
          'qloud',
        ).catch(() => [] as Product[]),
      );

      sourceTasks.push(
        withAbortTimeout(
          (signal) => fetchAllPrestashopSearch(
            query,
            defaultCategory,
            '/api/search',
            selectedStoreIds,
            { signal },
          ),
          SCRAPER_TIMEOUT_MS,
          'prestashop',
        ).catch(() => [] as Product[]),
      );

      sourceTasks.push(
        withAbortTimeout(
          (signal) => fetchAllTiendaNubeSearch(
            query,
            defaultCategory,
            '/api/search',
            selectedStoreIds,
            { signal },
          ),
          SCRAPER_TIMEOUT_MS,
          'tiendanube',
        ).catch(() => [] as Product[]),
      );

      sourceTasks.push(
        withAbortTimeout(
          (signal) => fetchAllWooCommerceSearch(
            query,
            defaultCategory,
            '/api/search',
            selectedStoreIds,
            { signal },
          ),
          SCRAPER_TIMEOUT_MS,
          'woocommerce',
        ).catch(() => [] as Product[]),
      );

      const sourceResults = sourceTasks.length > 0 ? await Promise.all(sourceTasks) : [];

      let liveProducts: Product[] = sanitizeProducts(sourceResults.flat());

      const queryWords = normalizeSearchText(query)
        .split(/\s+/)
        .filter((word) => word.length > 1);
      const singleCharVariants = parseSingleCharQueryVariants(query);
      const strictVariants = parseStrictVariantQueryTokens(query);

      if (queryWords.length > 0) {
        liveProducts = liveProducts.filter((product) =>
          shouldKeepByQueryIntent(product.name, queryWords, singleCharVariants, strictVariants),
        );
      }

      const allTitles = Array.from(new Set(liveProducts.map((product) => product.name)));
      let normalizedTitlesMap = new Map<string, string>();
      if (allTitles.length > 0) {
        console.log(`[API Search] Normalizando ${allTitles.length} titulos unicos con Gemini...`);
        const normalization = await normalizeProductTitlesWithStats(allTitles, {
          useDatabaseCache: !bypassDb,
          queryContext: query,
        })
          .catch((normalizationError) => {
            console.warn('[API Search] Normalizacion IA omitida por timeout/error:', normalizationError);
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
          console.warn(
            `[API Search] Normalizacion con fallback ${normalization.stats.fallbackRatePct}% `
            + `(${normalization.stats.fallbackCount}/${normalization.stats.uniqueTitles}) `
            + `reasons=${JSON.stringify(normalization.stats.fallbackReasons)}`,
          );
        } else {
          console.log(
            `[API Search] Normalizacion completa sin fallback. `
            + `memory=${normalization.stats.memoryHits} db=${normalization.stats.dbHits} gemini=${normalization.stats.geminiCount}.`,
          );
        }

        if (normalization.stats.dbUpsertAttempted > 0 && normalization.stats.dbUpserted < normalization.stats.dbUpsertAttempted) {
          console.warn(
            `[API Search] Persistencia de normalizaciones parcial: `
            + `${normalization.stats.dbUpserted}/${normalization.stats.dbUpsertAttempted}.`,
          );
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
        liveProducts = liveProducts.filter((product) => {
          return shouldKeepByQueryIntent(product.name, queryWords, singleCharVariants, strictVariants);
        });
      }

      if (category) {
        liveProducts = liveProducts.filter((product) => product.category === category);
      }

      if (minPrice !== undefined) {
        liveProducts = liveProducts.filter((product) => product.lowestPrice >= minPrice);
      }

      if (maxPrice !== undefined) {
        liveProducts = liveProducts.filter((product) => product.lowestPrice <= maxPrice);
      }

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
      console.log(`[API Search] Busqueda finalizada. Encontrados: ${total}`);

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
          console.warn('[API Search] Persistencia en Supabase omitida:', persistError);
        });

      await setCachedSearchResponse(cacheKey, payload);
      snapshotProducts(payload.products);
      return payload;
    })();

    const trackedPromise = searchPromise.finally(() => {
      inFlightSearchRequests.delete(cacheKey);
    });

    inFlightSearchRequests.set(cacheKey, trackedPromise);

    const payload = await trackedPromise;

    const missNote = normalizationSummaryNote
      ? `${isRefreshRequest ? 'REFRESH' : 'MISS'}|${normalizationSummaryNote}`
      : (isRefreshRequest ? 'REFRESH' : 'MISS');

    return respond(payload, {
      headers: { 'X-Search-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' },
    }, {
      success: true,
      resultCount: payload.products.length,
      note: missNote,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return respond(
      { error: 'Error al buscar productos de manera global' },
      { status: 500 },
      {
        success: false,
        resultCount: 0,
        note: 'ERROR',
      },
    );
  }
}


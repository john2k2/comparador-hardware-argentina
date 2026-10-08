import { cookies } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { isTrustedInternalRefreshRequest } from '@/lib/server/internal-refresh-auth';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { hasStaleProducts } from '@/lib/persistence/product-staleness';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { sortProducts } from '@/lib/persistence/product-read-grouping';
import { sortProductsBySearchRelevance } from '@/lib/search/search-ranking';
import { createObservedProductsSourceRunner } from '@/lib/products/products-handler-shared';
import { resolveLiveProductsList } from '@/lib/products/products-list-service';
import { inferHardwareCategoryFromName, isHardwareCategory } from '@/lib/catalog/hardware-categories';
import { runLiveSearch } from '@/lib/search/search-live';
import {
  type SortBy,
  DB_STALE_AFTER_MS,
  SEARCH_RATE_LIMIT,
  VALID_SORTS,
  buildSearchCacheKey,
  catalogPageResponse,
  emptySearchResponse,
  getCachedSearchResponse,
  hasSearchFiltersIntent,
  hasCurrentSearchPagePrices,
  inFlightSearchRequests,
  parseNonNegativeNumber,
  parsePositiveInteger,
  parseStoreIds,
  pruneInFlightRequests,
  scheduleBackgroundSearchRefresh,
  setCachedSearchResponse,
} from '@/lib/search/search-handler-shared';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { dedupeNearDuplicates, filterProductStores } from '@/lib/search/search-dedupe';
import { paginateProducts, SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import type { HardwareCategory, Product } from '@/lib/types';
import { logger } from '@/lib/logger';
import { recordCatalogRefreshDemand } from '@/lib/catalog/refresh-demand';
import { isStableRuntimeMode, shouldSkipLiveScraping } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { filterCurrentCatalogProducts } from './search-availability';
import { createCoalescedRead } from '@/lib/server/coalesced-read';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';

type SearchDatabaseRead = { page: ProductPageResult; cacheWrite?: Promise<void> };
const readPendingSearchPage = createCoalescedRead<SearchDatabaseRead>();

async function scheduleCatalogRefreshDemand(input: Parameters<typeof recordCatalogRefreshDemand>[0]): Promise<void> {
  const record = async () => {
    try {
      await recordCatalogRefreshDemand(input);
    } catch {
      // La intención es auxiliar: una falla no invalida la página de precios leída.
      logger.warn('Catalog refresh demand write skipped', { stage: 'after-response' });
    }
  };
  try {
    // Next conserva el trabajo mediante waitUntil; no abandonar una promesa al responder.
    after(record);
  } catch {
    // Lectores directos o adapters sin contexto conservan la escritura esperada.
    await record();
  }
}

function buildPayloadFromProducts(products: Product[], page: number): SearchApiResponse {
  const pageSlice = paginateProducts(products, page, SEARCH_PAGE_SIZE);

  return {
    products: pageSlice.paginatedProducts,
    pagination: {
      limit: pageSlice.paginatedProducts.length,
      offset: (pageSlice.currentPage - 1) * SEARCH_PAGE_SIZE,
      total: products.length,
      totalPages: pageSlice.totalPages,
      page: pageSlice.currentPage,
      pageSize: SEARCH_PAGE_SIZE,
    },
    facets: { categories: [], brands: [], stores: [] },
  };
}

function filterFallbackCategoryProducts(
  products: Product[],
  input: {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    selectedStoreIds: Set<string>;
    sortBy: SortBy;
    includeUnavailable?: boolean;
  },
): Product[] {
  let next = dedupeNearDuplicates(products);

  if (input.minPrice !== undefined) next = next.filter((product) => product.lowestPrice >= input.minPrice!);
  if (input.maxPrice !== undefined) next = next.filter((product) => product.lowestPrice <= input.maxPrice!);

  if (input.selectedStoreIds.size > 0) {
    next = next
      .map((product) => filterProductStores(product, input.selectedStoreIds))
      .filter((product): product is Product => Boolean(product));
  }
  next = filterCurrentCatalogProducts(next, input.includeUnavailable);

  if (input.sortBy === 'relevance' && input.query) {
    return sortProductsBySearchRelevance(next, input.query);
  }

  return input.sortBy === 'relevance' ? next : sortProducts(next, input.sortBy);
}

async function buildStableSearchFallback(input: {
  query: string;
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  selectedStoreIds: Set<string>;
  sortBy: SortBy;
  page: number;
  includeUnavailable?: boolean;
}): Promise<SearchApiResponse> {
  const fallbackCategory = input.category ?? inferHardwareCategoryFromName(input.query);
  const fixtureProducts = getStableFixtureProducts({
    query: input.query,
    category: fallbackCategory,
    selectedStoreIds: input.selectedStoreIds,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    sortBy: input.sortBy,
  });
  return buildPayloadFromProducts(filterCurrentCatalogProducts(fixtureProducts, input.includeUnavailable), input.page);
}

export async function GET(request: NextRequest) {
  const requestStartedAtMs = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get('q') ?? '').trim();
  const bypassDb = searchParams.get('bypassDb') === '1';
  const internalRefreshRequest = isTrustedInternalRefreshRequest(request);
  const isRefreshRequest = searchParams.get('refresh') === '1';
  const categoryParam = searchParams.get('category');
  const category = isHardwareCategory(categoryParam) ? categoryParam : undefined;
  const effectiveCategory = category ?? (query ? inferHardwareCategoryFromName(query) : undefined);
  const rawSortBy = searchParams.get('sortBy');
  const sortBy: SortBy = rawSortBy && VALID_SORTS.has(rawSortBy as SortBy) ? (rawSortBy as SortBy) : 'relevance';
  const page = parsePositiveInteger(searchParams.get('page'));
  const includeUnavailable = searchParams.get('includeUnavailable') === '1';
  const selectedStoreIds = parseStoreIds(searchParams.get('stores'));
  const rawMinPrice = parseNonNegativeNumber(searchParams.get('minPrice'));
  const rawMaxPrice = parseNonNegativeNumber(searchParams.get('maxPrice'));
  const minPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.min(rawMinPrice, rawMaxPrice) : rawMinPrice;
  const maxPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.max(rawMinPrice, rawMaxPrice) : rawMaxPrice;
  const cacheKey = buildSearchCacheKey({ query, category: effectiveCategory, sortBy, page, minPrice, maxPrice, stores: selectedStoreIds, includeUnavailable });
  let defaultRateLimitHeaders: Record<string, string> | null = null;
  let privilegedBypass = false;

  const respond = <T>(body: T, init?: ResponseInit, meta?: { success?: boolean; resultCount?: number; note?: string }) => {
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
      for (const [header, value] of Object.entries(defaultRateLimitHeaders)) headers.set(header, value);
    }
    return NextResponse.json(body, { ...init, headers });
  };

  if (bypassDb && !internalRefreshRequest) {
    const authorization = request.headers.get('authorization');
    const tokenFromHeader = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
    const cookieStore = await cookies();
    const tokenFromCookie = cookieStore.get('sb-access-token')?.value ?? null;
    const adminUser = await resolveAdminAccessFromToken(tokenFromHeader || tokenFromCookie);
    if (!adminUser) {
      return respond({ error: 'bypassDb requiere privilegios de admin' }, { status: 403 }, { success: false, resultCount: 0, note: 'FORBIDDEN_BYPASS_DB' });
    }
    privilegedBypass = true;
  }

  const hasFilterIntent = hasSearchFiltersIntent({ category: effectiveCategory, minPrice, maxPrice, stores: selectedStoreIds });
  const hasSearchIntent = Boolean(query || hasFilterIntent);
  const stableRuntimeMode = isStableRuntimeMode();
  // La caché se lee junto al rate limit, pero sólo se usa después de admitir la solicitud.
  const cachedRead = hasSearchIntent && !stableRuntimeMode && !bypassDb && !isRefreshRequest
    ? getCachedSearchResponse(cacheKey, includeUnavailable)
    : null;
  cachedRead?.catch(() => undefined);

  const rateResult = await checkRateLimit(`/api/search:${getRequestIp(request)}`, SEARCH_RATE_LIMIT);
  defaultRateLimitHeaders = buildRateLimitHeaders(rateResult);
  if (!rateResult.allowed) {
    return respond(
      { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
      { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } },
      { success: false, resultCount: 0, note: 'RATE_LIMIT' },
    );
  }

  const catalogOnlyMode = shouldSkipLiveScraping({
    internalRefresh: internalRefreshRequest,
    privilegedBypass,
  });

  if (!hasSearchIntent) {
    const payload = emptySearchResponse(page);
    return respond(payload, undefined, { success: true, resultCount: payload.products.length, note: 'EMPTY_QUERY' });
  }

  if (stableRuntimeMode) {
    return respond(await buildStableSearchFallback({ query, category: effectiveCategory, minPrice, maxPrice,
      selectedStoreIds, sortBy, page, includeUnavailable }), { headers: { 'X-Search-Cache': 'STABLE-FIXTURE' } });
  }

  if (cachedRead) {
    const cached = await cachedRead;
    if (cached) {
      const staleCache = hasStaleProducts(cached.products, DB_STALE_AFTER_MS);
      if (staleCache || cached.pagination.total === 0) {
        await scheduleCatalogRefreshDemand({ query: query || undefined, category: effectiveCategory });
        if (staleCache && query) scheduleBackgroundSearchRefresh(request, cacheKey);
      }
      // Revalidar también si el adapter tuvo que esperar la escritura de demanda.
      if (includeUnavailable || hasCurrentSearchPagePrices(cached.products)) {
        return respond(cached, { headers: { 'X-Search-Cache': staleCache ? 'HIT-STALE' : 'HIT' } }, { success: true, resultCount: cached.products.length, note: staleCache ? 'HIT_STALE' : 'HIT' });
      }
    }
  }

  try {
    if (!bypassDb || catalogOnlyMode) {
      const databaseParams = {
        query: query || undefined,
        category: effectiveCategory,
        minPrice,
        maxPrice,
        storeIds: selectedStoreIds,
        sortBy,
        page, pageSize: SEARCH_PAGE_SIZE,
        onlyCurrentOffers: !includeUnavailable,
      };
      const normalRead = !bypassDb && !isRefreshRequest && !internalRefreshRequest;
      const read = async (): Promise<SearchDatabaseRead> => ({ page: await readProductsPageFromDatabase(databaseParams) });
      const readKey = JSON.stringify(['search-db-first-v1', query, effectiveCategory ?? null,
        sortBy, page, SEARCH_PAGE_SIZE, minPrice ?? null, maxPrice ?? null,
        [...selectedStoreIds].sort(), includeUnavailable, searchParams.get('preferDb') === '1']);
      const handleReadError = (databaseError: unknown) => {
        logger.warn('DB-first search read skipped', {
          endpoint: '/api/search',
          query,
          category: effectiveCategory,
          error: databaseError,
        });
        if (catalogOnlyMode) throw databaseError;
        return null;
      };
      let databaseRead = await (normalRead ? readPendingSearchPage(readKey, read) : read()).catch(handleReadError);
      let rereads = 0;
      let demandRecorded = false;
      let backgroundScheduled = false;
      const reread = async () => {
        if (rereads >= 1) throw new Error('SEARCH_PAGE_NO_LONGER_CURRENT');
        rereads++;
        databaseRead = await read().catch(handleReadError);
      };

      while (databaseRead) {
        const databasePage = databaseRead.page;
        const stillCurrent = () => includeUnavailable || hasCurrentSearchPagePrices(databasePage.products);
        if (normalRead && !stillCurrent()) {
          await reread();
          continue;
        }
        const staleDatabase = hasStaleProducts(databasePage.products, DB_STALE_AFTER_MS);
        if (!demandRecorded && ((staleDatabase && !isRefreshRequest) || databasePage.total === 0)) {
          await scheduleCatalogRefreshDemand({ query: query || undefined, category: effectiveCategory });
          demandRecorded = true;
        }
        if (staleDatabase && !isRefreshRequest && query && !backgroundScheduled) {
          scheduleBackgroundSearchRefresh(request, cacheKey);
          backgroundScheduled = true;
        }

        const payload = catalogPageResponse(databasePage);
        if (normalRead) {
          if (!stillCurrent()) {
            await reread();
            continue;
          }
          // Cada consumidor valida; sólo el primero reclama esta escritura del resultado.
          databaseRead.cacheWrite ??= Promise.resolve().then(async () => {
            if (stillCurrent()) await setCachedSearchResponse(cacheKey, payload);
          });
          await databaseRead.cacheWrite;
          if (!stillCurrent()) {
            await reread();
            continue;
          }
        } else {
          await setCachedSearchResponse(cacheKey, payload);
        }
        return respond(payload, { headers: { 'X-Search-Cache': databasePage.total === 0 ? 'CATALOG-PENDING' : staleDatabase ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: payload.products.length, note: staleDatabase ? 'DB_STALE' : 'DB_HIT' });
      }
    }

    if (!query && effectiveCategory) {
      const observeSource = createObservedProductsSourceRunner(runObservedStoreScrape);
      const liveCategoryProducts = await resolveLiveProductsList(effectiveCategory, undefined, observeSource, internalRefreshRequest || privilegedBypass, selectedStoreIds);
      const refreshedDatabasePage = await readProductsPageFromDatabase({
        query: undefined,
        category: effectiveCategory,
        minPrice,
        maxPrice,
        storeIds: selectedStoreIds,
        sortBy,
        page, pageSize: SEARCH_PAGE_SIZE,
        onlyCurrentOffers: !includeUnavailable,
      }).catch((databaseError) => {
        logger.warn('DB category reread after live refresh skipped', {
          endpoint: '/api/search',
          category: effectiveCategory,
          error: databaseError,
        });
        return null;
      });

      if (refreshedDatabasePage && refreshedDatabasePage.total > 0) {
        const payload = catalogPageResponse(refreshedDatabasePage);
        if (!bypassDb) await setCachedSearchResponse(cacheKey, payload);
        return respond(payload, { headers: { 'X-Search-Cache': isRefreshRequest ? 'CATEGORY-REFRESH-DB' : 'CATEGORY-MISS-DB' } }, { success: true, resultCount: payload.products.length, note: isRefreshRequest ? 'CATEGORY_REFRESH_DB' : 'CATEGORY_MISS_DB' });
      }

      const fallbackProducts = filterFallbackCategoryProducts(liveCategoryProducts, {
        query,
        minPrice,
        maxPrice,
        selectedStoreIds,
        sortBy,
        includeUnavailable,
      });
      const payload = buildPayloadFromProducts(fallbackProducts, page);

      if (!bypassDb && payload.pagination.total > 0) await setCachedSearchResponse(cacheKey, payload);
      return respond(payload, { headers: { 'X-Search-Cache': isRefreshRequest ? 'CATEGORY-REFRESH-LIVE' : 'CATEGORY-MISS-LIVE' } }, { success: true, resultCount: payload.products.length, note: isRefreshRequest ? 'CATEGORY_REFRESH_LIVE' : 'CATEGORY_MISS_LIVE' });
    }

    if (!query) {
      const emptyPayload = emptySearchResponse(page);
      return respond(emptyPayload, { headers: { 'X-Search-Cache': 'DB-EMPTY' } }, { success: true, resultCount: 0, note: 'DB_EMPTY_FILTER_ONLY' });
    }

    const pending = inFlightSearchRequests.get(cacheKey);
    if (pending) {
      const payload = await pending;
      return respond(payload, { headers: { 'X-Search-Cache': 'INFLIGHT' } }, { success: true, resultCount: payload.products.length, note: 'INFLIGHT' });
    }

    const searchPromise = runLiveSearch({
      query,
      category: effectiveCategory,
      selectedStoreIds,
      minPrice,
      maxPrice,
      page,
      sortBy,
      cacheKey,
      bypassDb,
      authorizedRefresh: internalRefreshRequest || privilegedBypass,
      includeUnavailable,
    }).then(async (result) => {
      const refreshedPage = await readProductsPageFromDatabase({
        query, category: effectiveCategory, storeIds: selectedStoreIds, minPrice, maxPrice,
        sortBy, page, pageSize: SEARCH_PAGE_SIZE,
        onlyCurrentOffers: !includeUnavailable,
      }).catch(() => null);
      if (!refreshedPage) return result;
      const payload = catalogPageResponse(refreshedPage);
      await setCachedSearchResponse(cacheKey, payload);
      return { ...result, payload };
    });

    const trackedPromise = searchPromise.finally(() => {
      inFlightSearchRequests.delete(cacheKey);
    });

    pruneInFlightRequests();
    inFlightSearchRequests.set(cacheKey, trackedPromise.then((result) => result.payload));
    const { payload, normalizationSummaryNote } = await trackedPromise;

    const missNote = normalizationSummaryNote ? `${isRefreshRequest ? 'REFRESH' : 'MISS'}|${normalizationSummaryNote}` : (isRefreshRequest ? 'REFRESH' : 'MISS');
    return respond(payload, { headers: { 'X-Search-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' } }, { success: true, resultCount: payload.products.length, note: missNote });
  } catch (error) {
    logger.error('Search API error', {
      endpoint: '/api/search',
      query,
        category: effectiveCategory,
      error,
    });
    return respond({ error: 'Error al buscar productos de manera global' }, { status: catalogOnlyMode ? 503 : 500 }, { success: false, resultCount: 0, note: 'ERROR' });
  }
}

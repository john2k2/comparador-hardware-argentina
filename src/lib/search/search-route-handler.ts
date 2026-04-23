import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { hasStaleProducts } from '@/lib/persistence/product-staleness';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { readProductsFromDatabase } from '@/lib/persistence/product-read';
import { sortProducts } from '@/lib/persistence/product-read-grouping';
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
  emptySearchResponse,
  getCachedSearchResponse,
  hasSearchFiltersIntent,
  inFlightSearchRequests,
  parseNonNegativeNumber,
  parsePositiveInteger,
  parseStoreIds,
  pruneInFlightRequests,
  scheduleBackgroundSearchRefresh,
  setCachedSearchResponse,
} from '@/lib/search/search-handler-shared';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { dedupeNearDuplicates, filterProductStores } from '@/lib/search/search-dedupe';
import { paginateProducts, SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import type { HardwareCategory, Product } from '@/lib/types';
import { logger } from '@/lib/logger';
import { shouldSkipLiveScraping } from '@/lib/server/runtime-flags';
import { normalizeSearchText } from '@/lib/search/search-ranking';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';

type DatabasePage = Awaited<ReturnType<typeof readProductsPageFromDatabase>>;

function hasUsableDatabasePage(page: DatabasePage): boolean {
  return page.total > 0 || page.products.length > 0;
}

function buildPayloadFromDatabasePage(page: DatabasePage): SearchApiResponse {
  return {
    products: page.products,
    pagination: {
      limit: page.products.length,
      offset: (page.page - 1) * page.pageSize,
      total: page.total,
      totalPages: page.totalPages,
      page: page.page,
      pageSize: page.pageSize,
    },
    facets: { categories: [], brands: [], stores: [] },
  };
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
    minPrice?: number;
    maxPrice?: number;
    selectedStoreIds: Set<string>;
    sortBy: SortBy;
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
}): Promise<SearchApiResponse> {
  const fallbackCategory = input.category ?? inferHardwareCategoryFromName(input.query);
  const baseProducts = await readProductsFromDatabase({
    category: fallbackCategory,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    storeIds: input.selectedStoreIds,
    sortBy: input.sortBy,
    limit: 250,
  }).catch(() => []);

  const normalizedQuery = normalizeSearchText(input.query);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  const filteredProducts = baseProducts.filter((product) => {
    const normalizedName = normalizeSearchText(product.name);
    if (normalizedQuery && normalizedName.includes(normalizedQuery)) return true;
    return queryWords.every((word) => normalizedName.includes(word));
  });

  if (filteredProducts.length === 0) {
    const fixtureProducts = getStableFixtureProducts({
      query: input.query,
      category: fallbackCategory,
      selectedStoreIds: input.selectedStoreIds,
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      sortBy: input.sortBy,
    });

    if (fixtureProducts.length === 0) {
      return emptySearchResponse(input.page);
    }

    return buildPayloadFromProducts(fixtureProducts, input.page);
  }

  return buildPayloadFromProducts(filteredProducts, input.page);
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
  const cacheKey = buildSearchCacheKey({ query, category, sortBy, page, minPrice, maxPrice, stores: selectedStoreIds });
  let defaultRateLimitHeaders: Record<string, string> | null = null;

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
  }

  const rateResult = await checkRateLimit(`/api/search:${getRequestIp(request)}`, SEARCH_RATE_LIMIT);
  defaultRateLimitHeaders = buildRateLimitHeaders(rateResult);
  if (!rateResult.allowed) {
    return respond(
      { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
      { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } },
      { success: false, resultCount: 0, note: 'RATE_LIMIT' },
    );
  }

  const hasFilterIntent = hasSearchFiltersIntent({ category, minPrice, maxPrice, stores: selectedStoreIds });
  const hasSearchIntent = Boolean(query || hasFilterIntent);
  const stableRuntimeMode = shouldSkipLiveScraping();

  if (!hasSearchIntent) {
    const payload = emptySearchResponse(page);
    return respond(payload, undefined, { success: true, resultCount: payload.products.length, note: 'EMPTY_QUERY' });
  }

  if (!bypassDb && !isRefreshRequest) {
    const cached = await getCachedSearchResponse(cacheKey);
    if (cached) {
      const staleCache = hasStaleProducts(cached.products, DB_STALE_AFTER_MS);
      if (query && staleCache && !isRefreshRequest) scheduleBackgroundSearchRefresh(request, cacheKey);
      snapshotProducts(cached.products);
      return respond(cached, { headers: { 'X-Search-Cache': staleCache ? 'HIT-STALE' : 'HIT' } }, { success: true, resultCount: cached.products.length, note: staleCache ? 'HIT_STALE' : 'HIT' });
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
        logger.warn('DB-first search read skipped', {
          endpoint: '/api/search',
          query,
          category,
          error: databaseError,
        });
        return { products: [], total: 0, totalPages: 0, page, pageSize: SEARCH_PAGE_SIZE };
      });

      if (hasUsableDatabasePage(databasePage)) {
        const staleDatabase = hasStaleProducts(databasePage.products, DB_STALE_AFTER_MS);
        if (query && staleDatabase && !isRefreshRequest) scheduleBackgroundSearchRefresh(request, cacheKey);

        const payload = buildPayloadFromDatabasePage(databasePage);

        await setCachedSearchResponse(cacheKey, payload);
        snapshotProducts(payload.products);
        return respond(payload, { headers: { 'X-Search-Cache': staleDatabase ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: payload.products.length, note: staleDatabase ? 'DB_STALE' : 'DB_HIT' });
      }
    }

    if (!query && category) {
      if (stableRuntimeMode) {
        const emptyPayload = emptySearchResponse(page);
        return respond(
          emptyPayload,
          { headers: { 'X-Search-Cache': 'STABLE-EMPTY' } },
          { success: true, resultCount: 0, note: 'STABLE_MODE_SKIP_CATEGORY_LIVE' },
        );
      }

      const observeSource = createObservedProductsSourceRunner(runObservedStoreScrape);
      const liveCategoryProducts = await resolveLiveProductsList(category, undefined, observeSource);
      const refreshedDatabasePage = await readProductsPageFromDatabase({
        query: undefined,
        category,
        minPrice,
        maxPrice,
        storeIds: selectedStoreIds,
        sortBy,
        page,
        pageSize: SEARCH_PAGE_SIZE,
      }).catch((databaseError) => {
        logger.warn('DB category reread after live refresh skipped', {
          endpoint: '/api/search',
          category,
          error: databaseError,
        });
        return null;
      });

      if (refreshedDatabasePage && hasUsableDatabasePage(refreshedDatabasePage)) {
        const payload = buildPayloadFromDatabasePage(refreshedDatabasePage);
        if (!bypassDb) await setCachedSearchResponse(cacheKey, payload);
        snapshotProducts(payload.products);
        return respond(payload, { headers: { 'X-Search-Cache': isRefreshRequest ? 'CATEGORY-REFRESH-DB' : 'CATEGORY-MISS-DB' } }, { success: true, resultCount: payload.products.length, note: isRefreshRequest ? 'CATEGORY_REFRESH_DB' : 'CATEGORY_MISS_DB' });
      }

      const fallbackProducts = filterFallbackCategoryProducts(liveCategoryProducts, {
        minPrice,
        maxPrice,
        selectedStoreIds,
        sortBy,
      });
      const payload = buildPayloadFromProducts(fallbackProducts, page);

      if (!bypassDb && payload.pagination.total > 0) await setCachedSearchResponse(cacheKey, payload);
      snapshotProducts(payload.products);
      return respond(payload, { headers: { 'X-Search-Cache': isRefreshRequest ? 'CATEGORY-REFRESH-LIVE' : 'CATEGORY-MISS-LIVE' } }, { success: true, resultCount: payload.products.length, note: isRefreshRequest ? 'CATEGORY_REFRESH_LIVE' : 'CATEGORY_MISS_LIVE' });
    }

    if (!query) {
      const emptyPayload = emptySearchResponse(page);
      return respond(emptyPayload, { headers: { 'X-Search-Cache': 'DB-EMPTY' } }, { success: true, resultCount: 0, note: 'DB_EMPTY_FILTER_ONLY' });
    }

    if (stableRuntimeMode) {
      const stablePayload = await buildStableSearchFallback({
        query,
        category,
        minPrice,
        maxPrice,
        selectedStoreIds,
        sortBy,
        page,
      });
      return respond(
        stablePayload,
        { headers: { 'X-Search-Cache': stablePayload.products.length > 0 ? 'STABLE-DB-FALLBACK' : 'STABLE-EMPTY' } },
        {
          success: true,
          resultCount: stablePayload.products.length,
          note: stablePayload.products.length > 0 ? 'STABLE_MODE_DB_FALLBACK' : 'STABLE_MODE_SKIP_LIVE_SEARCH',
        },
      );
    }

    const pending = inFlightSearchRequests.get(cacheKey);
    if (pending) {
      const payload = await pending;
      return respond(payload, { headers: { 'X-Search-Cache': 'INFLIGHT' } }, { success: true, resultCount: payload.products.length, note: 'INFLIGHT' });
    }

    const searchPromise = runLiveSearch({
      query,
      category,
      selectedStoreIds,
      minPrice,
      maxPrice,
      page,
      sortBy,
      cacheKey,
      bypassDb,
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
      category,
      error,
    });
    return respond({ error: 'Error al buscar productos de manera global' }, { status: 500 }, { success: false, resultCount: 0, note: 'ERROR' });
  }
}

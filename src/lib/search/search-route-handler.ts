import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordEndpointRequestEvent } from '@/lib/telemetry/operational-metrics';
import { hasStaleProducts } from '@/lib/persistence/product-staleness';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { isHardwareCategory } from '@/lib/catalog/hardware-categories';
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
  scheduleBackgroundSearchRefresh,
  setCachedSearchResponse,
} from '@/lib/search/search-handler-shared';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import { logger } from '@/lib/logger';

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

  if (!hasSearchIntent) {
    const payload = emptySearchResponse(page);
    return respond(payload, undefined, { success: true, resultCount: payload.products.length, note: 'EMPTY_QUERY' });
  }

  if (!bypassDb) {
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

      if (databasePage.total > 0) {
        const staleDatabase = hasStaleProducts(databasePage.products, DB_STALE_AFTER_MS);
        if (query && staleDatabase && !isRefreshRequest) scheduleBackgroundSearchRefresh(request, cacheKey);

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
          facets: { categories: [], brands: [], stores: [] },
        };

        await setCachedSearchResponse(cacheKey, payload);
        snapshotProducts(payload.products);
        return respond(payload, { headers: { 'X-Search-Cache': staleDatabase ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: payload.products.length, note: staleDatabase ? 'DB_STALE' : 'DB_HIT' });
      }
    }

    if (!query) {
      const emptyPayload = emptySearchResponse(page);
      if (!bypassDb) await setCachedSearchResponse(cacheKey, emptyPayload);
      return respond(emptyPayload, { headers: { 'X-Search-Cache': 'DB-EMPTY' } }, { success: true, resultCount: 0, note: 'DB_EMPTY_FILTER_ONLY' });
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

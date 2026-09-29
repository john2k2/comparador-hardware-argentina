import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { HardwareCategory } from '@/lib/types';
import { reviewProductOffers } from '@/lib/ai/review-product-offers';
import { isHardwareCategory } from '@/lib/catalog/hardware-categories';
import { readProductByIdFromDatabase, readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { hasStaleProducts } from '@/lib/persistence/product-staleness';
import { normalizeId } from '@/lib/products/product-detail-helpers';
import { resolveLiveProductDetail } from '@/lib/products/products-detail-service';
import {
  createObservedProductsSourceRunner,
  DB_STALE_AFTER_MS,
  getCachedDetail,
  inFlightDetailRequests,
  normalizeAndEnrichProduct,
  persistProductDetailSnapshot,
  PRODUCTS_RATE_LIMIT,
  scheduleBackgroundProductsRefresh,
  setCachedDetail,
} from '@/lib/products/products-handler-shared';
import { resolveLiveProductsList } from '@/lib/products/products-list-service';
import { normalizeProductContent } from '@/lib/products/normalize-product-content';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { isTrustedInternalRefreshRequest } from '@/lib/server/internal-refresh-auth';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { logger } from '@/lib/logger';
import { recordCatalogRefreshDemand } from '@/lib/catalog/refresh-demand';
import { isStableRuntimeMode, shouldSkipLiveScraping } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { catalogPageResponse, parseNonNegativeNumber, parsePositiveInteger, parseStoreIds, VALID_SORTS, type SortBy } from '@/lib/search/search-handler-shared';
import { paginateProducts } from '@/lib/search/search-pagination';
import { applyDatabaseReadTransforms } from '@/lib/persistence/product-read-grouping';

export async function GET(request: NextRequest) {
  const endpointStartedAtMs = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const category = searchParams.get('category');
  const query = searchParams.get('q')?.trim();
  const bypassDb = searchParams.get('bypassDb') === '1';
  const preferDb = searchParams.get('preferDb') === '1';
  const internalRefreshRequest = isTrustedInternalRefreshRequest(request);
  const isRefreshRequest = searchParams.get('refresh') === '1';
  const stableRuntimeMode = isStableRuntimeMode();
  let privilegedBypass = false;
  let defaultRateLimitHeaders: Record<string, string> | null = null;

  const respond = <T>(body: T, init?: ResponseInit, meta?: { success?: boolean; resultCount?: number; note?: string }) => {
    const statusCode = init?.status ?? 200;
    recordEndpointRequestEvent({
      endpoint: '/api/products',
      startedAtMs: endpointStartedAtMs,
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

  const rateResult = await checkRateLimit(`/api/products:${getRequestIp(request)}`, PRODUCTS_RATE_LIMIT);
  defaultRateLimitHeaders = buildRateLimitHeaders(rateResult);
  if (!rateResult.allowed) {
    return respond(
      { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
      { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } },
      { success: false, resultCount: 0, note: 'RATE_LIMIT' },
    );
  }

  const observeSource = createObservedProductsSourceRunner(runObservedStoreScrape);
  const catalogOnlyMode = shouldSkipLiveScraping({
    internalRefresh: internalRefreshRequest,
    privilegedBypass,
  });

  try {
    if (id) {
      const detailKey = normalizeId(id);
      let hasNegativeDetailCache = false;

      if (!bypassDb) {
        if (!preferDb) {
          const cachedProduct = await getCachedDetail(detailKey);
          if (cachedProduct !== undefined) {
            if (cachedProduct) {
              const hydrated = await normalizeAndEnrichProduct(cachedProduct);
              const staleCachedDetail = hasStaleProducts([hydrated], DB_STALE_AFTER_MS);
              if (staleCachedDetail && !isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
              return respond(hydrated, { headers: { 'X-Product-Cache': staleCachedDetail ? 'HIT-STALE' : 'HIT' } }, { success: true, resultCount: 1, note: staleCachedDetail ? 'DETAIL_HIT_STALE' : 'DETAIL_HIT' });
            }
            hasNegativeDetailCache = true;
          }
        }

        const databaseProduct = await readProductByIdFromDatabase(id).catch((databaseError) => {
          logger.warn('DB-first product detail read skipped', {
            endpoint: '/api/products',
            id,
            error: databaseError,
          });
          return null;
        });

        if (databaseProduct) {
          const normalized = normalizeProductContent(databaseProduct);
          const staleDatabaseDetail = hasStaleProducts([normalized], DB_STALE_AFTER_MS);
          if (staleDatabaseDetail && !isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          await setCachedDetail(detailKey, normalized);
          return respond(normalized, { headers: { 'X-Product-Cache': staleDatabaseDetail ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: 1, note: staleDatabaseDetail ? 'DETAIL_DB_STALE' : 'DETAIL_DB' });
        }

        if (hasNegativeDetailCache) {
          if (!isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          return respond({ error: 'Producto no encontrado en vivo (cache)' }, { status: 404 }, { success: false, resultCount: 0, note: 'DETAIL_CACHE_NOT_FOUND' });
        }
      }

      if (catalogOnlyMode) {
        if (stableRuntimeMode) {
          const fixtureProduct = getStableFixtureProducts({}).find((product) => product.id === id) ?? null;
          if (fixtureProduct) {
            return respond(
              fixtureProduct,
              { headers: { 'X-Product-Cache': 'STABLE-FIXTURE' } },
              { success: true, resultCount: 1, note: 'DETAIL_STABLE_FIXTURE' },
            );
          }
        }

        return respond(
          { error: 'Producto no disponible en modo estable sin datos persistidos' },
          { status: 404, headers: { 'X-Product-Cache': stableRuntimeMode ? 'STABLE-NO-LIVE' : 'CATALOG-PENDING' } },
          { success: false, resultCount: 0, note: stableRuntimeMode ? 'DETAIL_STABLE_SKIP_LIVE' : 'DETAIL_CATALOG_PENDING' },
        );
      }

      const pendingDetail = inFlightDetailRequests.get(detailKey);
      if (pendingDetail) {
        const sharedProduct = await pendingDetail;
        if (sharedProduct) {
          const hydrated = await normalizeAndEnrichProduct(sharedProduct);
          await setCachedDetail(detailKey, hydrated);
          return respond(hydrated, { headers: { 'X-Product-Cache': 'INFLIGHT' } }, { success: true, resultCount: 1, note: 'DETAIL_INFLIGHT' });
        }
      }

      const trackedDetailPromise = resolveLiveProductDetail(id, category, observeSource).finally(() => {
        inFlightDetailRequests.delete(detailKey);
      });
      inFlightDetailRequests.set(detailKey, trackedDetailPromise);

      const liveProduct = await trackedDetailPromise;
      if (liveProduct) {
        const normalized = await normalizeAndEnrichProduct(liveProduct);
        const [hydrated] = await reviewProductOffers([normalized], { authorizedRefresh: internalRefreshRequest || privilegedBypass });
        await persistProductDetailSnapshot(hydrated);
        await setCachedDetail(detailKey, hydrated);
        return respond(hydrated, { headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' } }, { success: true, resultCount: 1, note: isRefreshRequest ? 'DETAIL_REFRESH' : 'DETAIL_MISS' });
      }

      await setCachedDetail(detailKey, null);
      return respond({ error: 'Producto no encontrado en vivo (requiere DB para historial)' }, { status: 404 }, { success: false, resultCount: 0, note: 'DETAIL_NOT_FOUND' });
    }

    const categorySlug: HardwareCategory | undefined = isHardwareCategory(category) ? category : undefined;
    const listRefreshKey = `list:${categorySlug}:${(query ?? '').toLowerCase()}`;
    const page = parsePositiveInteger(searchParams.get('page'));
    const pageSize = Math.min(48, parsePositiveInteger(searchParams.get('pageSize'), 12));
    const rawSort = searchParams.get('sortBy') ?? searchParams.get('sort');
    const sortBy: SortBy = VALID_SORTS.has(rawSort as SortBy) ? rawSort as SortBy : 'relevance';
    const storeIds = parseStoreIds(searchParams.get('stores'));
    const rawMin = parseNonNegativeNumber(searchParams.get('minPrice'));
    const rawMax = parseNonNegativeNumber(searchParams.get('maxPrice'));
    const minPrice = rawMin !== undefined && rawMax !== undefined ? Math.min(rawMin, rawMax) : rawMin;
    const maxPrice = rawMin !== undefined && rawMax !== undefined ? Math.max(rawMin, rawMax) : rawMax;
    const readParams = { query, category: categorySlug, sortBy, storeIds, minPrice, maxPrice, page, pageSize };
    const fromCompleteList = (products: import('@/lib/types').Product[]) => {
      const slice = paginateProducts(products, page, pageSize);
      return catalogPageResponse({ products: slice.paginatedProducts, total: products.length,
        totalPages: slice.totalPages, page: slice.currentPage, pageSize });
    };
    if (stableRuntimeMode) {
      return respond(fromCompleteList(getStableFixtureProducts({ ...readParams, selectedStoreIds: storeIds })),
        { headers: { 'X-Product-Cache': 'STABLE-FIXTURE' } });
    }

    if (!bypassDb) {
      const databasePage = await readProductsPageFromDatabase(readParams).catch((databaseError) => {
        logger.warn('DB-first product list read skipped', {
          endpoint: '/api/products',
          category: categorySlug,
          query,
          error: databaseError,
        });
        if (catalogOnlyMode) throw databaseError;
        return null;
      });

      if (databasePage && (databasePage.total > 0 || catalogOnlyMode)) {
        const databaseProducts = databasePage.products;
        const staleDatabaseProducts = hasStaleProducts(databaseProducts, DB_STALE_AFTER_MS);
        if (staleDatabaseProducts && !isRefreshRequest) {
          // Esperar la escritura evita que el runtime serverless la cancele al
          // devolver la respuesta. Sólo se ejecuta para catálogo vencido.
          await recordCatalogRefreshDemand({ query: query || undefined, category: categorySlug });
          scheduleBackgroundProductsRefresh(request, listRefreshKey);
        }
        return respond(catalogPageResponse(databasePage), { headers: { 'X-Product-Cache': staleDatabaseProducts ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: databaseProducts.length, note: staleDatabaseProducts ? 'CATEGORY_DB_STALE' : 'CATEGORY_DB' });
      }
    }

    if (catalogOnlyMode) {
      return respond(catalogPageResponse(await readProductsPageFromDatabase(readParams)));
    }

    const liveProducts = await resolveLiveProductsList(categorySlug ?? 'procesadores', query || undefined, observeSource, internalRefreshRequest || privilegedBypass, storeIds);
    const refreshedPage = await readProductsPageFromDatabase(readParams).catch(() => null);
    const payload = refreshedPage && refreshedPage.total > 0 ? catalogPageResponse(refreshedPage)
      : fromCompleteList(applyDatabaseReadTransforms(liveProducts, { searchTerm: query, storeIds, minPrice, maxPrice, sortBy }));
    return respond(payload, { headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' } }, { success: true, resultCount: payload.products.length, note: isRefreshRequest ? 'CATEGORY_REFRESH' : 'CATEGORY_LIST' });
  } catch (error) {
    logger.error('Products API error', {
      endpoint: '/api/products',
      id,
      category,
      query,
      error,
    });
    return respond({ error: 'Error al obtener productos' }, { status: !id && catalogOnlyMode ? 503 : 500 }, { success: false, resultCount: 0, note: 'ERROR' });
  }
}

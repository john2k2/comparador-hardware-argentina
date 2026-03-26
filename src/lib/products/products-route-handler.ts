import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { HardwareCategory } from '@/lib/types';
import { getSnapshotProductById, snapshotProducts } from '@/lib/cache/search-snapshot';
import { isHardwareCategory } from '@/lib/catalog/hardware-categories';
import { readProductByIdFromDatabase, readProductsFromDatabase } from '@/lib/persistence/product-read';
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
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const endpointStartedAtMs = Date.now();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const category = searchParams.get('category');
  const query = searchParams.get('q')?.trim();
  const bypassDb = searchParams.get('bypassDb') === '1';
  const internalRefreshRequest = request.headers.get('x-internal-refresh') === '1';
  const isRefreshRequest = searchParams.get('refresh') === '1';
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

  try {
    if (!id && !category && !query) {
      return respond({ products: [] }, undefined, { success: true, resultCount: 0, note: 'EMPTY_QUERY' });
    }

    if (id) {
      const detailKey = normalizeId(id);
      let hasNegativeDetailCache = false;

      if (!bypassDb) {
        const cachedProduct = await getCachedDetail(detailKey);
        if (cachedProduct !== undefined) {
          if (cachedProduct) {
            const hydrated = await normalizeAndEnrichProduct(cachedProduct);
            const staleCachedDetail = hasStaleProducts([hydrated], DB_STALE_AFTER_MS);
            if (staleCachedDetail && !isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
            await setCachedDetail(detailKey, hydrated);
            snapshotProducts([hydrated]);
            return respond(hydrated, { headers: { 'X-Product-Cache': staleCachedDetail ? 'HIT-STALE' : 'HIT' } }, { success: true, resultCount: 1, note: staleCachedDetail ? 'DETAIL_HIT_STALE' : 'DETAIL_HIT' });
          }
          hasNegativeDetailCache = true;
        }

        const snapshotProduct = getSnapshotProductById(id);
        if (snapshotProduct) {
          const hydrated = await normalizeAndEnrichProduct(snapshotProduct);
          const staleSnapshotDetail = hasStaleProducts([hydrated], DB_STALE_AFTER_MS);
          if (staleSnapshotDetail && !isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          await setCachedDetail(detailKey, hydrated);
          snapshotProducts([hydrated]);
          return respond(hydrated, { headers: { 'X-Product-Cache': staleSnapshotDetail ? 'SNAPSHOT-STALE' : 'SNAPSHOT' } }, { success: true, resultCount: 1, note: staleSnapshotDetail ? 'DETAIL_SNAPSHOT_STALE' : 'DETAIL_SNAPSHOT' });
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
          snapshotProducts([normalized]);
          return respond(normalized, { headers: { 'X-Product-Cache': staleDatabaseDetail ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: 1, note: staleDatabaseDetail ? 'DETAIL_DB_STALE' : 'DETAIL_DB' });
        }

        if (hasNegativeDetailCache) {
          if (!isRefreshRequest) scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          return respond({ error: 'Producto no encontrado en vivo (cache)' }, { status: 404 }, { success: false, resultCount: 0, note: 'DETAIL_CACHE_NOT_FOUND' });
        }
      }

      const pendingDetail = inFlightDetailRequests.get(detailKey);
      if (pendingDetail) {
        const sharedProduct = await pendingDetail;
        if (sharedProduct) {
          const hydrated = await normalizeAndEnrichProduct(sharedProduct);
          await setCachedDetail(detailKey, hydrated);
          snapshotProducts([hydrated]);
          return respond(hydrated, { headers: { 'X-Product-Cache': 'INFLIGHT' } }, { success: true, resultCount: 1, note: 'DETAIL_INFLIGHT' });
        }
      }

      const trackedDetailPromise = resolveLiveProductDetail(id, category, observeSource).finally(() => {
        inFlightDetailRequests.delete(detailKey);
      });
      inFlightDetailRequests.set(detailKey, trackedDetailPromise);

      const liveProduct = await trackedDetailPromise;
      if (liveProduct) {
        const hydrated = await normalizeAndEnrichProduct(liveProduct);
        await persistProductDetailSnapshot(hydrated);
        await setCachedDetail(detailKey, hydrated);
        snapshotProducts([hydrated]);
        return respond(hydrated, { headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' } }, { success: true, resultCount: 1, note: isRefreshRequest ? 'DETAIL_REFRESH' : 'DETAIL_MISS' });
      }

      const snapshotAfterScrape = getSnapshotProductById(id);
      if (snapshotAfterScrape) {
        const hydrated = await normalizeAndEnrichProduct(snapshotAfterScrape);
        await persistProductDetailSnapshot(hydrated);
        await setCachedDetail(detailKey, hydrated);
        snapshotProducts([hydrated]);
        return respond(hydrated, { headers: { 'X-Product-Cache': 'SNAPSHOT' } }, { success: true, resultCount: 1, note: 'DETAIL_SNAPSHOT_AFTER_SCRAPE' });
      }

      await setCachedDetail(detailKey, null);
      return respond({ error: 'Producto no encontrado en vivo (requiere DB para historial)' }, { status: 404 }, { success: false, resultCount: 0, note: 'DETAIL_NOT_FOUND' });
    }

    const categorySlug: HardwareCategory = isHardwareCategory(category) ? category : 'procesadores';
    const listRefreshKey = `list:${categorySlug}:${(query ?? '').toLowerCase()}`;

    if (!bypassDb) {
      const databaseProducts = await readProductsFromDatabase({
        query: query || undefined,
        category: categorySlug,
        sortBy: 'relevance',
        limit: 1000,
      }).catch((databaseError) => {
        logger.warn('DB-first product list read skipped', {
          endpoint: '/api/products',
          category: categorySlug,
          query,
          error: databaseError,
        });
        return [];
      });

      if (databaseProducts.length > 0) {
        const staleDatabaseProducts = hasStaleProducts(databaseProducts, DB_STALE_AFTER_MS);
        if (staleDatabaseProducts && !isRefreshRequest) scheduleBackgroundProductsRefresh(request, listRefreshKey);
        snapshotProducts(databaseProducts);
        return respond({ products: databaseProducts, pagination: { limit: databaseProducts.length, offset: 0, total: databaseProducts.length } }, { headers: { 'X-Product-Cache': staleDatabaseProducts ? 'DB-STALE' : 'DB' } }, { success: true, resultCount: databaseProducts.length, note: staleDatabaseProducts ? 'CATEGORY_DB_STALE' : 'CATEGORY_DB' });
      }
    }

    const liveProducts = await resolveLiveProductsList(categorySlug, query || undefined, observeSource);
    return respond({ products: liveProducts, pagination: { limit: liveProducts.length, offset: 0, total: liveProducts.length } }, { headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' } }, { success: true, resultCount: liveProducts.length, note: isRefreshRequest ? 'CATEGORY_REFRESH' : 'CATEGORY_LIST' });
  } catch (error) {
    logger.error('Products API error', {
      endpoint: '/api/products',
      id,
      category,
      query,
      error,
    });
    return respond({ error: 'Error al obtener productos' }, { status: 500 }, { success: false, resultCount: 0, note: 'ERROR' });
  }
}

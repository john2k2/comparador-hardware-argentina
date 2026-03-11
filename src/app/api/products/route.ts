import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Product, HardwareCategory } from '@/lib/types';

import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchCompraGamerProducts, searchCompraGamerProducts } from '@/lib/scrapers/compragamer';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchGamingCityProducts, getGamingCityCategoryUrl } from '@/lib/scrapers/gamingcity';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { fetchLoggProducts } from '@/lib/scrapers/logg';
import { fetchAllWooCommerceCategory, fetchAllWooCommerceSearch, fetchWooCommerceProductById } from '@/lib/scrapers/woocommerce';
import { fetchProductDescriptionFromUrl, isWeakProductDescription } from '@/lib/scrapers/product-description';
import { getSnapshotProductById, snapshotProducts } from '@/lib/cache/search-snapshot';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { hydrateProduct } from '@/lib/product-serialization';
import { readProductByIdFromDatabase, readProductsFromDatabase } from '@/lib/persistence/product-read';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { sanitizeProduct } from '@/lib/product-sanitizer';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';

const VALID_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'perifericos',
];

const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const SCRAPER_TIMEOUT_MS = 25000;
const PERSISTENCE_TIMEOUT_MS = 7000;
const DB_STALE_AFTER_MS = 20 * 60 * 1000;
const BACKGROUND_REFRESH_TIMEOUT_MS = 60 * 1000;
const PRODUCTS_RATE_LIMIT = { limit: 50, windowMs: 60 * 1000 };
const inFlightDetailRequests = new Map<string, Promise<Product | null>>();
const inFlightBackgroundProductsRefreshes = new Map<string, Promise<void>>();

function isHardwareCategory(value: string | null): value is HardwareCategory {
  return value !== null && VALID_CATEGORIES.includes(value as HardwareCategory);
}

function normalizeId(value: string): string {
  let decoded = value.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded
    .toLowerCase()
    .replace(/%2e/gi, '.')
    .replace(/\+/g, '-')
    .replace(/_/g, '-')
    .replace(/\./g, '-')
    .replace(/\/+$/g, '')
    .replace(/-+/g, '-')
    .trim();
}

function extractPrefixAndCode(id: string): { prefix: string; code?: string } {
  const normalized = normalizeId(id);
  const parts = normalized.split('-').filter(Boolean);
  const prefix = parts[0] ?? '';
  const second = parts[1];
  return {
    prefix,
    code: second && /^\d+$/.test(second) ? second : undefined,
  };
}

function buildDetailSearchQuery(id: string): string {
  const parts = normalizeId(id).split('-').filter(Boolean);
  if (parts.length <= 1) return normalizeId(id);

  const secondIsCode = /^\d+$/.test(parts[1] ?? '');
  const queryParts = secondIsCode ? parts.slice(2) : parts.slice(1);
  const rawQuery = queryParts.join(' ');
  return rawQuery
    .replace(/[^a-z0-9+\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForQueryMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQueryWords(value: string): string[] {
  return normalizeForQueryMatch(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

function countMatchedQueryWords(name: string, queryWords: string[]): number {
  if (queryWords.length === 0) return 0;
  const normalizedName = normalizeForQueryMatch(name);
  return queryWords.reduce((acc, word) => acc + (normalizedName.includes(word) ? 1 : 0), 0);
}

function shouldKeepByQueryWords(name: string, queryWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  const matched = countMatchedQueryWords(name, queryWords);
  if (queryWords.length === 1) return matched === 1;
  if (queryWords.length === 2) return matched === 2;
  return matched >= Math.ceil(queryWords.length * 0.7);
}

function findBestProductMatch(targetId: string, products: Product[]): Product | undefined {
  if (products.length === 0) return undefined;

  const normalizedTarget = normalizeId(targetId);
  const exact = products.find((product) => normalizeId(product.id) === normalizedTarget);
  if (exact) return exact;

  const { prefix: targetPrefix, code: targetCode } = extractPrefixAndCode(normalizedTarget);
  if (!targetPrefix) return undefined;

  const sameStoreProducts = products.filter((product) => extractPrefixAndCode(product.id).prefix === targetPrefix);
  if (sameStoreProducts.length === 0) return undefined;

  if (targetCode) {
    const withSameCode = sameStoreProducts.filter((product) => extractPrefixAndCode(product.id).code === targetCode);
    if (withSameCode.length > 0) {
      return withSameCode[0];
    }
  }

  return sameStoreProducts.find((product) => normalizeId(product.id).includes(normalizedTarget));
}

async function getCachedDetail(id: string): Promise<Product | null | undefined> {
  const cached = await getSharedCache<Product | null>('product-detail', normalizeId(id));
  if (cached === undefined || cached === null) return cached;
  return hydrateProduct(cached);
}

async function setCachedDetail(id: string, product: Product | null): Promise<void> {
  await setSharedCache('product-detail', normalizeId(id), product, DETAIL_CACHE_TTL_MS);
}

function categoryToSearchTerm(category: HardwareCategory): string {
  if (category === 'tarjetas-graficas') return 'placa de video';
  if (category === 'motherboards') return 'motherboard';
  if (category === 'memoria-ram') return 'memoria ram';
  if (category === 'almacenamiento') return 'ssd';
  if (category === 'fuentes-alimentacion') return 'fuente';
  if (category === 'gabinetes') return 'gabinete';
  if (category === 'refrigeracion') return 'cooler';
  if (category === 'perifericos') return 'perifericos';
  return 'procesador';
}

function inferDetailCategory(value: string): HardwareCategory {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('rtx')
    || normalized.includes('radeon')
    || normalized.includes('geforce')
    || normalized.includes('rx ')
    || normalized.includes('placa de video')
    || normalized.includes('gpu')
  ) {
    return 'tarjetas-graficas';
  }

  if (
    normalized.includes('ryzen')
    || normalized.includes('core i')
    || normalized.includes('ultra ')
    || normalized.includes('procesador')
    || normalized.includes('cpu')
  ) {
    return 'procesadores';
  }

  if (normalized.includes('mother') || normalized.includes('placa madre')) {
    return 'motherboards';
  }

  if (normalized.includes('ddr4') || normalized.includes('ddr5') || normalized.includes('ram')) {
    return 'memoria-ram';
  }

  if (normalized.includes('ssd') || normalized.includes('nvme') || normalized.includes('hdd') || normalized.includes('disco')) {
    return 'almacenamiento';
  }

  if (normalized.includes('fuente') || normalized.includes('psu')) {
    return 'fuentes-alimentacion';
  }

  if (normalized.includes('gabinete') || normalized.includes('case')) {
    return 'gabinetes';
  }

  if (normalized.includes('cooler') || normalized.includes('refrigeracion') || normalized.includes('ventilador')) {
    return 'refrigeracion';
  }

  return 'perifericos';
}

function normalizeProductContent(product: Product): Product {
  const sanitized = sanitizeProduct(product);
  const normalizedDescription = sanitized.description?.trim() || sanitized.name;
  const normalizedModel = sanitized.model?.trim() || sanitized.name;
  return {
    ...sanitized,
    description: normalizedDescription,
    model: normalizedModel,
  };
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function pickDescriptionUrls(product: Product): string[] {
  const orderedPrices = [...(product.prices ?? [])].sort((a, b) => a.price - b.price);
  const candidates = orderedPrices.map((price) => price.url).filter((url): url is string => isValidHttpUrl(url));
  return Array.from(new Set(candidates)).slice(0, 2);
}

function isProductStale(product: Product, staleAfterMs: number, nowMs: number): boolean {
  const updatedAtMs = product.updatedAt?.getTime?.();
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs)) return true;
  return nowMs - updatedAtMs > staleAfterMs;
}

function hasStaleProducts(products: Product[], staleAfterMs = DB_STALE_AFTER_MS): boolean {
  if (products.length === 0) return false;
  const nowMs = Date.now();
  return products.some((product) => isProductStale(product, staleAfterMs, nowMs));
}

function scheduleBackgroundProductsRefresh(request: NextRequest, refreshKey: string): void {
  if (inFlightBackgroundProductsRefreshes.has(refreshKey)) return;

  const refreshUrl = new URL(request.url);
  refreshUrl.searchParams.set('bypassDb', '1');
  refreshUrl.searchParams.set('refresh', '1');

  const refreshPromise = withAbortTimeout(
    async (signal) => {
      const response = await fetch(refreshUrl.toString(), {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'x-internal-refresh': '1',
        },
        signal,
      });
      if (!response.ok) {
        throw new Error(`refresh request failed with HTTP ${response.status}`);
      }
    },
    BACKGROUND_REFRESH_TIMEOUT_MS,
    'products-background-refresh',
  )
    .catch((refreshError) => {
      console.warn('[API Products] Background refresh error:', refreshError);
    })
    .finally(() => {
      inFlightBackgroundProductsRefreshes.delete(refreshKey);
    });

  inFlightBackgroundProductsRefreshes.set(refreshKey, refreshPromise);
}

async function fetchCompraGamerByQuery(
  query: string,
  category: HardwareCategory,
  signal?: AbortSignal,
): Promise<Product[]> {
  return searchCompraGamerProducts(query, category, signal);
}

async function normalizeAndEnrichProduct(product: Product): Promise<Product> {
  const normalized = normalizeProductContent(product);
  if (!isWeakProductDescription(normalized.description, normalized.name)) {
    return normalized;
  }

  const urls = pickDescriptionUrls(normalized);
  for (const url of urls) {
    const extracted = await fetchProductDescriptionFromUrl(url, normalized.name);
    if (extracted && !isWeakProductDescription(extracted, normalized.name)) {
      return {
        ...normalized,
        description: extracted,
      };
    }
  }

  return normalized;
}

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

  const respond = <T>(
    body: T,
    init?: ResponseInit,
    meta?: { success?: boolean; resultCount?: number; note?: string },
  ) => {
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
    const rateResult = await checkRateLimit(`/api/products:${getRequestIp(request)}`, PRODUCTS_RATE_LIMIT);
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

  const observeSource = (
    storeId: string,
    storeName: string,
    run: (signal: AbortSignal) => Promise<Product[]>,
  ) =>
    runObservedStoreScrape({
      endpoint: '/api/products',
      storeId,
      storeName,
      run: () => withAbortTimeout(
        (signal) => run(signal),
        SCRAPER_TIMEOUT_MS,
        storeId,
      ),
    });

  try {
    if (!id && !category && !query) {
      return respond({ products: [] }, undefined, {
        success: true,
        resultCount: 0,
        note: 'EMPTY_QUERY',
      });
    }

    if (id) {
      const detailKey = normalizeId(id);
      let hasNegativeDetailCache = false;
      if (!bypassDb) {
        const cachedProduct = await getCachedDetail(id);
        if (cachedProduct !== undefined) {
          if (cachedProduct) {
            const hydrated = await normalizeAndEnrichProduct(cachedProduct);
            const staleCachedDetail = hasStaleProducts([hydrated]);
            if (staleCachedDetail && !isRefreshRequest) {
              scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
            }

            await setCachedDetail(id, hydrated);
            snapshotProducts([hydrated]);
            return respond(hydrated, {
              headers: { 'X-Product-Cache': staleCachedDetail ? 'HIT-STALE' : 'HIT' },
            }, {
              success: true,
              resultCount: 1,
              note: staleCachedDetail ? 'DETAIL_HIT_STALE' : 'DETAIL_HIT',
            });
          }
          hasNegativeDetailCache = true;
        }

        const snapshotProduct = getSnapshotProductById(id);
        if (snapshotProduct) {
          const hydrated = await normalizeAndEnrichProduct(snapshotProduct);
          const staleSnapshotDetail = hasStaleProducts([hydrated]);
          if (staleSnapshotDetail && !isRefreshRequest) {
            scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          }

          await setCachedDetail(id, hydrated);
          snapshotProducts([hydrated]);
          return respond(hydrated, {
            headers: { 'X-Product-Cache': staleSnapshotDetail ? 'SNAPSHOT-STALE' : 'SNAPSHOT' },
          }, {
            success: true,
            resultCount: 1,
            note: staleSnapshotDetail ? 'DETAIL_SNAPSHOT_STALE' : 'DETAIL_SNAPSHOT',
          });
        }

        const databaseProduct = await readProductByIdFromDatabase(id).catch((databaseError) => {
          console.warn('[API Products] Lectura DB-first detalle omitida:', databaseError);
          return null;
        });

        if (databaseProduct) {
          const normalized = normalizeProductContent(databaseProduct);
          const staleDatabaseDetail = hasStaleProducts([normalized]);
          if (staleDatabaseDetail && !isRefreshRequest) {
            scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          }

          await setCachedDetail(id, normalized);
          snapshotProducts([normalized]);
          return respond(normalized, {
            headers: { 'X-Product-Cache': staleDatabaseDetail ? 'DB-STALE' : 'DB' },
          }, {
            success: true,
            resultCount: 1,
            note: staleDatabaseDetail ? 'DETAIL_DB_STALE' : 'DETAIL_DB',
          });
        }

        if (hasNegativeDetailCache) {
          if (!isRefreshRequest) {
            scheduleBackgroundProductsRefresh(request, `detail:${detailKey}`);
          }

          return respond({ error: 'Producto no encontrado en vivo (cache)' }, { status: 404 }, {
            success: false,
            resultCount: 0,
            note: 'DETAIL_CACHE_NOT_FOUND',
          });
        }
      }

      const pendingDetail = inFlightDetailRequests.get(detailKey);
      if (pendingDetail) {
        const sharedProduct = await pendingDetail;
        if (sharedProduct) {
          const hydrated = await normalizeAndEnrichProduct(sharedProduct);
          await setCachedDetail(id, hydrated);
          snapshotProducts([hydrated]);
          return respond(hydrated, {
            headers: { 'X-Product-Cache': 'INFLIGHT' },
          }, {
            success: true,
            resultCount: 1,
            note: 'DETAIL_INFLIGHT',
          });
        }
      }

      const resolveDetailPromise = (async (): Promise<Product | null> => {
        console.log(`[API Products] Re-scrapeando producto en vivo por ID: ${id}`);
        const storePrefix = id.split('-')[0];
        const cleanQuery = buildDetailSearchQuery(id).substring(0, 60);
        const { code } = extractPrefixAndCode(id);
        const searchQuery = code || cleanQuery || normalizeId(id);

        const mexxSearchUrl = `https://www.mexx.com.ar/buscar/?p=${encodeURIComponent(searchQuery)}`;
        const fullh4rdSearchUrl = `https://www.fullh4rd.com.ar/cat/search/${encodeURIComponent(searchQuery)}`;
        const venexSearchUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodeURIComponent(searchQuery)}`;

        const fallbackCategory: HardwareCategory = isHardwareCategory(category)
          ? category
          : inferDetailCategory(`${searchQuery} ${id}`);
        const wooProduct = await withAbortTimeout(
          (signal) => fetchWooCommerceProductById(id, fallbackCategory, { signal }),
          SCRAPER_TIMEOUT_MS,
          'woocommerce-detail',
        ).catch(() => null);
        if (wooProduct) return wooProduct;

        const searchPromises: Promise<Product[]>[] = [];
        if (storePrefix === 'mexx') {
          searchPromises.push(observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxSearchUrl, fallbackCategory, signal)));
        } else if (storePrefix === 'venex') {
          searchPromises.push(observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexSearchUrl, fallbackCategory, signal)));
        } else if (storePrefix === 'fh') {
          searchPromises.push(observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, fallbackCategory, signal)));
        } else if (storePrefix === 'maximus') {
          searchPromises.push(observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(searchQuery, fallbackCategory, signal)));
        } else if (storePrefix === 'gamingcity') {
          searchPromises.push(observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(cleanQuery || searchQuery, fallbackCategory, signal)));
        } else if (storePrefix === 'gezatek') {
          searchPromises.push(observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(searchQuery, fallbackCategory, signal)));
        } else if (storePrefix === 'compugarden') {
          searchPromises.push(observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(searchQuery, fallbackCategory, signal)));
        } else if (storePrefix === 'logg') {
          searchPromises.push(observeSource('logg', 'Logg', (signal) => fetchLoggProducts(cleanQuery || searchQuery, fallbackCategory, signal)));
        } else if (storePrefix === 'cg' || storePrefix === 'compragamer') {
          searchPromises.push(observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerByQuery(searchQuery, fallbackCategory, signal)));
        } else {
          searchPromises.push(
            observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxSearchUrl, fallbackCategory, signal)),
            observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexSearchUrl, fallbackCategory, signal)),
            observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdSearchUrl, fallbackCategory, signal)),
            observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(searchQuery, fallbackCategory, signal)),
            observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(cleanQuery || searchQuery, fallbackCategory, signal)),
            observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(searchQuery, fallbackCategory, signal)),
            observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(searchQuery, fallbackCategory, signal)),
            observeSource('logg', 'Logg', (signal) => fetchLoggProducts(cleanQuery || searchQuery, fallbackCategory, signal)),
            observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerByQuery(searchQuery, fallbackCategory, signal)),
            withAbortTimeout(
              (signal) => fetchAllWooCommerceSearch(searchQuery, fallbackCategory, '/api/products', undefined, { signal }),
              SCRAPER_TIMEOUT_MS,
              'woocommerce',
            )
              .catch(() => [] as Product[]),
          );
        }

        const idResults = await Promise.all(searchPromises);
        const foundProducts: Product[] = idResults.flat();
        return findBestProductMatch(id, foundProducts) ?? null;
      })();

      const trackedDetailPromise = resolveDetailPromise.finally(() => {
        inFlightDetailRequests.delete(detailKey);
      });
      inFlightDetailRequests.set(detailKey, trackedDetailPromise);

      const liveProduct = await trackedDetailPromise;
      if (liveProduct) {
        const hydrated = await normalizeAndEnrichProduct(liveProduct);
        await withPromiseTimeout(persistProductsSnapshot([hydrated]), PERSISTENCE_TIMEOUT_MS, 'supabase-persist')
          .catch((persistError) => {
            console.warn('[API Products] Persistencia detalle omitida:', persistError);
          });
        await setCachedDetail(id, hydrated);
        snapshotProducts([hydrated]);
        return respond(hydrated, {
          headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' },
        }, {
          success: true,
          resultCount: 1,
          note: isRefreshRequest ? 'DETAIL_REFRESH' : 'DETAIL_MISS',
        });
      }

      const snapshotAfterScrape = getSnapshotProductById(id);
      if (snapshotAfterScrape) {
        const hydrated = await normalizeAndEnrichProduct(snapshotAfterScrape);
        await setCachedDetail(id, hydrated);
        snapshotProducts([hydrated]);
        return respond(hydrated, {
          headers: { 'X-Product-Cache': 'SNAPSHOT' },
        }, {
          success: true,
          resultCount: 1,
          note: 'DETAIL_SNAPSHOT_AFTER_SCRAPE',
        });
      }

      await setCachedDetail(id, null);
      return respond({ error: 'Producto no encontrado en vivo (requiere DB para historial)' }, { status: 404 }, {
        success: false,
        resultCount: 0,
        note: 'DETAIL_NOT_FOUND',
      });
    }

    const categorySlug: HardwareCategory = isHardwareCategory(category) ? category : 'procesadores';
    const categorySearchTerm = categoryToSearchTerm(categorySlug);
    const nonWooQuery = query || categorySearchTerm;
    let mexxUrl = 'https://www.mexx.com.ar/productos-rubro/procesadores/';
    let fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/procesador';
    let venexUrl = 'https://www.venex.com.ar/componentes-de-pc/microprocesadores';
    let gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
    let cgCategoryId = 27;

    if (categorySlug === 'tarjetas-graficas') {
      mexxUrl = 'https://www.mexx.com.ar/productos-rubro/placas-de-video/';
      fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/video';
      venexUrl = 'https://www.venex.com.ar/componentes-de-pc/placas-de-video';
      gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
      cgCategoryId = 6;
    } else if (categorySlug === 'motherboards') {
      mexxUrl = 'https://www.mexx.com.ar/productos-rubro/motherboards/';
      fullh4rdUrl = 'https://www.fullh4rd.com.ar/cat/search/mother';
      venexUrl = 'https://www.venex.com.ar/componentes-de-pc/mothers';
      gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
      cgCategoryId = 26;
    } else if (categorySlug === 'perifericos') {
      const encodedPeripheralQuery = encodeURIComponent(nonWooQuery);
      mexxUrl = `https://www.mexx.com.ar/buscar/?p=${encodedPeripheralQuery}`;
      fullh4rdUrl = `https://www.fullh4rd.com.ar/cat/search/${encodedPeripheralQuery}`;
      venexUrl = `https://www.venex.com.ar/resultados-busqueda.htm?keywords=${encodedPeripheralQuery}`;
      gamingCityUrl = getGamingCityCategoryUrl(categorySlug);
    }

    console.log(`[API] Iniciando scraping paralelo para la categoria: ${categorySlug}`);
    const listRefreshKey = `list:${categorySlug}:${(query ?? '').toLowerCase()}`;

    if (!bypassDb) {
      const databaseProducts = await readProductsFromDatabase({
        query: query || undefined,
        category: categorySlug,
        sortBy: 'relevance',
        limit: 1000,
      }).catch((databaseError) => {
        console.warn('[API Products] Lectura DB-first listado omitida:', databaseError);
        return [] as Product[];
      });

      if (databaseProducts.length > 0) {
        const staleDatabaseProducts = hasStaleProducts(databaseProducts);
        if (staleDatabaseProducts && !isRefreshRequest) {
          scheduleBackgroundProductsRefresh(request, listRefreshKey);
        }

        snapshotProducts(databaseProducts);
        return respond({
          products: databaseProducts,
          pagination: {
            limit: databaseProducts.length,
            offset: 0,
            total: databaseProducts.length,
          },
        }, {
          headers: { 'X-Product-Cache': staleDatabaseProducts ? 'DB-STALE' : 'DB' },
        }, {
          success: true,
          resultCount: databaseProducts.length,
          note: staleDatabaseProducts ? 'CATEGORY_DB_STALE' : 'CATEGORY_DB',
        });
      }
    }

    const results = await Promise.all([
      observeSource('mexx', 'Mexx', (signal) => fetchMexxProducts(mexxUrl, categorySlug, signal)),
      observeSource('venex', 'Venex', (signal) => fetchVenexProducts(venexUrl, categorySlug, signal)),
      observeSource('fullh4rd', 'FullH4rd', (signal) => fetchFullh4rdProducts(fullh4rdUrl, categorySlug, signal)),
      observeSource('maximus', 'Maximus', (signal) => fetchMaximusProducts(nonWooQuery, categorySlug, signal)),
      observeSource('gamingcity', 'Gaming City', (signal) => fetchGamingCityProducts(query || gamingCityUrl, categorySlug, signal)),
      observeSource('gezatek', 'Gezatek', (signal) => fetchGezatekProducts(nonWooQuery, categorySlug, signal)),
      observeSource('compugarden', 'Compugarden', (signal) => fetchCompugardenProducts(nonWooQuery, categorySlug, signal)),
      observeSource('logg', 'Logg', (signal) => fetchLoggProducts(query || '', categorySlug, signal)),
      observeSource('compragamer', 'CompraGamer', (signal) => fetchCompraGamerProducts(cgCategoryId, categorySlug, signal)),
      query
        ? withAbortTimeout(
          (signal) => fetchAllWooCommerceSearch(query, categorySlug, '/api/products', undefined, { signal }),
          SCRAPER_TIMEOUT_MS,
          'woocommerce',
        ).catch(() => [] as Product[])
        : withAbortTimeout(
          (signal) => fetchAllWooCommerceCategory(categorySlug, '/api/products', undefined, { signal }),
          SCRAPER_TIMEOUT_MS,
          'woocommerce',
        ).catch(() => [] as Product[]),
    ]);

    let liveProducts: Product[] = results.flat();
    console.log(`[API] Scraping terminado. Total productos extraidos en vivo: ${liveProducts.length}`);

    const uniqueMap = new Map<string, Product>();
    for (const product of liveProducts) {
      if (!uniqueMap.has(product.id)) {
        uniqueMap.set(product.id, normalizeProductContent(product));
      }
    }
    liveProducts = Array.from(uniqueMap.values());
    console.log(`[API] Tras eliminar duplicados intencionales: ${liveProducts.length}`);

    if (query) {
      const normalizedQuery = normalizeForQueryMatch(query);
      const queryWords = tokenizeQueryWords(query);
      liveProducts = liveProducts.filter((product) => {
        const normalizedName = normalizeForQueryMatch(product.name);
        if (normalizedQuery && normalizedName.includes(normalizedQuery)) return true;
        return shouldKeepByQueryWords(product.name, queryWords);
      });

      liveProducts.sort((a, b) => {
        const scoreDiff = countMatchedQueryWords(b.name, queryWords) - countMatchedQueryWords(a.name, queryWords);
        if (scoreDiff !== 0) return scoreDiff;
        return a.lowestPrice - b.lowestPrice;
      });
    }

    await withPromiseTimeout(persistProductsSnapshot(liveProducts), PERSISTENCE_TIMEOUT_MS, 'supabase-persist')
      .catch((persistError) => {
        console.warn('[API Products] Persistencia listado omitida:', persistError);
      });

    snapshotProducts(liveProducts);

    return respond({
      products: liveProducts,
      pagination: {
        limit: liveProducts.length,
        offset: 0,
        total: liveProducts.length,
      },
    }, {
      headers: { 'X-Product-Cache': isRefreshRequest ? 'REFRESH' : 'MISS' },
    }, {
      success: true,
      resultCount: liveProducts.length,
      note: isRefreshRequest ? 'CATEGORY_REFRESH' : 'CATEGORY_LIST',
    });
  } catch (error) {
    console.error('Products API error:', error);
    return respond(
      { error: 'Error al obtener productos' },
      { status: 500 },
      {
        success: false,
        resultCount: 0,
        note: 'ERROR',
      },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { HardwareCategory, Product } from '@/lib/types';
import { fetchMexxProducts } from '@/lib/scrapers/mexx';
import { fetchVenexProducts } from '@/lib/scrapers/venex';
import { fetchFullh4rdProducts } from '@/lib/scrapers/fullh4rd';
import { fetchMaximusProducts } from '@/lib/scrapers/maximus';
import { fetchGezatekProducts } from '@/lib/scrapers/gezatek';
import { fetchCompugardenProducts } from '@/lib/scrapers/compugarden';
import { searchCompraGamerProducts } from '@/lib/scrapers/compragamer';
import { fetchAllWooCommerceSearch } from '@/lib/scrapers/woocommerce';
import { snapshotProducts } from '@/lib/cache/search-snapshot';
import { recordEndpointRequestEvent, runObservedStoreScrape } from '@/lib/telemetry/operational-metrics';
import { persistProductsSnapshot } from '@/lib/persistence/product-catalog';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { hydrateProducts } from '@/lib/product-serialization';
import { normalizeProductTitlesWithStats } from '@/lib/ai/normalize-products';
import { resolveAdminAccessFromToken } from '@/lib/server/admin-auth';
import { sanitizeProduct, sanitizeProducts } from '@/lib/product-sanitizer';
import { buildRateLimitHeaders, checkRateLimit, getRequestIp } from '@/lib/server/rate-limit';
import { getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { SEARCH_PAGE_SIZE, paginateProducts } from '@/lib/search/search-pagination';
import {
  normalizeSearchText,
  parseSingleCharQueryVariants,
  parseStrictVariantQueryTokens,
  scoreProductRelevance,
  shouldKeepByQueryIntent,
  sortProductsBySearchRelevance,
} from '@/lib/search/search-ranking';
import {
  buildProductFamilyKey,
  buildProductIdentityKey,
  buildProductVariantKey,
  extractExactModelIdentity,
} from '@/lib/product-identity';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';

type SortBy = 'relevance' | 'price-asc' | 'price-desc' | 'name' | 'newest';

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

const VALID_SORTS = new Set<SortBy>(['relevance', 'price-asc', 'price-desc', 'name', 'newest']);
const SCRAPER_TIMEOUT_MS = 25000;
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const PERSISTENCE_TIMEOUT_MS = 7000;
const DB_STALE_AFTER_MS = 20 * 60 * 1000;
const BACKGROUND_REFRESH_TIMEOUT_MS = 60 * 1000;
const SEARCH_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const DEDUPE_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por',
  'vga', 'placa', 'video', 'procesador', 'micro', 'cpu', 'gpu', 'gamer',
]);
const inFlightSearchRequests = new Map<string, Promise<SearchApiResponse>>();
const inFlightBackgroundSearchRefreshes = new Map<string, Promise<void>>();

function isHardwareCategory(value: string | null): value is HardwareCategory {
  return value !== null && VALID_CATEGORIES.includes(value as HardwareCategory);
}

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

function scheduleBackgroundSearchRefresh(request: NextRequest, refreshKey: string): void {
  if (inFlightBackgroundSearchRefreshes.has(refreshKey)) return;

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
    'search-background-refresh',
  )
    .catch((refreshError) => {
      console.warn('[API Search] Background refresh error:', refreshError);
    })
    .finally(() => {
      inFlightBackgroundSearchRefreshes.delete(refreshKey);
    });

  inFlightBackgroundSearchRefreshes.set(refreshKey, refreshPromise);
}

function inferCategoryFromName(name: string): HardwareCategory {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('ryzen') || lowerName.includes('core i') || lowerName.includes('procesador')) {
    return 'procesadores';
  }
  if (lowerName.includes('rtx') || lowerName.includes('radeon') || lowerName.includes('geforce') || lowerName.includes('placa de video')) {
    return 'tarjetas-graficas';
  }
  if (lowerName.includes('mother') || lowerName.includes('placa madre')) {
    return 'motherboards';
  }
  if (lowerName.includes('ddr4') || lowerName.includes('ddr5') || lowerName.includes('ram')) {
    return 'memoria-ram';
  }
  if (lowerName.includes('ssd') || lowerName.includes('nvme') || lowerName.includes('hdd')) {
    return 'almacenamiento';
  }
  if (lowerName.includes('fuente') || lowerName.includes('psu')) {
    return 'fuentes-alimentacion';
  }
  if (lowerName.includes('gabinete') || lowerName.includes('case')) {
    return 'gabinetes';
  }
  if (lowerName.includes('cooler') || lowerName.includes('refrigeracion') || lowerName.includes('ventilador')) {
    return 'refrigeracion';
  }
  if (
    lowerName.includes('mouse')
    || lowerName.includes('teclado')
    || lowerName.includes('keyboard')
    || lowerName.includes('monitor')
    || lowerName.includes('auricular')
    || lowerName.includes('headset')
    || lowerName.includes('headphone')
    || lowerName.includes('parlante')
    || lowerName.includes('speaker')
    || lowerName.includes('microfono')
    || lowerName.includes('microphone')
    || lowerName.includes('webcam')
    || lowerName.includes('camara web')
    || lowerName.includes('joystick')
    || lowerName.includes('gamepad')
    || lowerName.includes('mousepad')
    || lowerName.includes('alfombrilla')
    || lowerName.includes('logitech')
    || lowerName.includes('razer')
    || lowerName.includes('redragon')
    || lowerName.includes('steelseries')
    || lowerName.includes('keychron')
  ) {
    return 'perifericos';
  }
  return 'perifericos';
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

function slugifyGroupPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function hashGroupKey(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function buildGroupedProductId(product: Product, normalizedTitle: string, groupKey: string): string {
  const readable = slugifyGroupPart(normalizedTitle).slice(0, 48) || 'item';
  const fingerprint = hashGroupKey(`${product.category}|${groupKey}`);
  return `agrupado-${product.category}-${readable}-${fingerprint}`;
}

function buildIdentityFallback(product: Product): string {
  return [product.brand, product.model, product.name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ');
}

function buildCanonicalGroupKey(product: Product, normalizedTitle: string): string {
  return buildProductIdentityKey(product.category, normalizedTitle, buildIdentityFallback(product));
}

function mergePriceOptions(
  current: Product['prices'],
  incoming: Product['prices'],
): Product['prices'] {
  const merged = [...current];

  for (const candidate of incoming) {
    const existingIndex = merged.findIndex((price) => price.storeId === candidate.storeId);
    if (existingIndex < 0) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateIsBetter = candidate.price < existing.price
      || (existing.stock === 'out-of-stock' && candidate.stock !== 'out-of-stock');

    if (candidateIsBetter) {
      merged[existingIndex] = candidate;
    }
  }

  return merged;
}

function computePriceStats(prices: Product['prices']): { lowest: number; highest: number; average: number } {
  if (prices.length === 0) {
    return { lowest: 0, highest: 0, average: 0 };
  }

  const values = prices.map((price) => price.price);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const average = Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
  return { lowest, highest, average };
}

function tokenizeForDedupe(value: string): string[] {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !DEDUPE_STOPWORDS.has(token));
}

function extractFingerprint(value: string): { brand: string | null; chip: string | null; memory: string | null } {
  const normalized = normalizeSearchText(value);
  const brand = (normalized.match(/\b(asus|gigabyte|msi|zotac|palit|inno3d|asrock|pny|xfx|sapphire|amd|intel)\b/) ?? [])[1] ?? null;
  const chip = (normalized.match(/\b(rtx\s*\d{3,4}(?:\s*(?:ti|super))?|rx\s*\d{3,4}(?:\s*xt)?|ryzen\s*[3579]\s*\d{3,5}(?:x3d|gt|ge|xt|x|g|f)?|core\s*i[3579]\s*\d{4,5}[a-z]{0,2})\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  const memory = (normalized.match(/\b(\d{1,2}\s*gb)\b/) ?? [])[1]?.replace(/\s+/g, '') ?? null;
  return { brand, chip, memory };
}

function shareStoreAndPrice(first: Product, second: Product): boolean {
  for (const a of first.prices) {
    for (const b of second.prices) {
      if (a.storeId === b.storeId && a.price === b.price) {
        return true;
      }
    }
  }
  return false;
}

function isSubset(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) return false;
  if (first.size > second.size) return false;
  for (const token of first) {
    if (!second.has(token)) return false;
  }
  return true;
}

function canMergeNearDuplicate(existing: Product, candidate: Product): boolean {
  if (existing.category !== candidate.category) return false;

  const existingExactModel = extractExactModelIdentity(existing.category, existing.name);
  const candidateExactModel = extractExactModelIdentity(candidate.category, candidate.name);
  if (existingExactModel && candidateExactModel && existingExactModel === candidateExactModel) {
    return true;
  }

  const existingFingerprint = extractFingerprint(existing.name);
  const candidateFingerprint = extractFingerprint(candidate.name);

  if (!shareStoreAndPrice(existing, candidate)) return false;

  if (!existingFingerprint.chip || !candidateFingerprint.chip) return false;
  if (existingFingerprint.chip !== candidateFingerprint.chip) return false;
  if (existingFingerprint.brand && candidateFingerprint.brand && existingFingerprint.brand !== candidateFingerprint.brand) return false;
  if (existingFingerprint.memory && candidateFingerprint.memory && existingFingerprint.memory !== candidateFingerprint.memory) return false;

  const existingTokens = new Set(tokenizeForDedupe(existing.name));
  const candidateTokens = new Set(tokenizeForDedupe(candidate.name));
  return isSubset(existingTokens, candidateTokens) || isSubset(candidateTokens, existingTokens);
}

function mergeProductEntries(existing: Product, candidate: Product): Product {
  const mergedPrices = mergePriceOptions(existing.prices, candidate.prices);
  const stats = computePriceStats(mergedPrices);
  const existingTokens = tokenizeForDedupe(existing.name).length;
  const candidateTokens = tokenizeForDedupe(candidate.name).length;
  const preferred = candidateTokens > existingTokens ? candidate : existing;
  const mergedImage = existing.image === '/pixel-box.svg' && candidate.image !== '/pixel-box.svg'
    ? candidate.image
    : existing.image;

  return {
    ...existing,
    name: preferred.name,
    model: preferred.model,
    brand: preferred.brand,
    image: mergedImage,
    prices: mergedPrices,
    lowestPrice: stats.lowest,
    highestPrice: stats.highest,
    averagePrice: stats.average,
    updatedAt: existing.updatedAt > candidate.updatedAt ? existing.updatedAt : candidate.updatedAt,
  };
}

function dedupeNearDuplicates(products: Product[]): Product[] {
  if (products.length <= 1) return products;
  const deduped: Product[] = [];

  for (const candidate of products) {
    const index = deduped.findIndex((existing) => canMergeNearDuplicate(existing, candidate));
    if (index < 0) {
      deduped.push(candidate);
      continue;
    }

    deduped[index] = mergeProductEntries(deduped[index], candidate);
  }

  return deduped;
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
      const staleCache = hasStaleProducts(cached.products);
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
        const staleDatabase = hasStaleProducts(databasePage.products);
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

      const defaultCategory = category ?? inferCategoryFromName(query);
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

      const uniqueMap = new Map<string, Product>();

      for (const product of liveProducts) {
        const normalizedName = normalizedTitlesMap.get(product.name) || product.name;
        const groupKey = buildCanonicalGroupKey(product, normalizedName);
        const identityFallback = buildIdentityFallback(product);
        const familyKey = buildProductFamilyKey(product.category, normalizedName, identityFallback) ?? undefined;
        const variantKey = buildProductVariantKey(product.category, normalizedName, identityFallback);

        if (!uniqueMap.has(groupKey)) {
          const normalizedProduct = normalizeProductContent(product);

          uniqueMap.set(groupKey, {
            ...normalizedProduct,
            id: buildGroupedProductId(product, normalizedName, groupKey),
            name: normalizedProduct.name,
            model: normalizedProduct.model,
            normalizedTitle: normalizedName,
            canonicalProductKey: groupKey,
            familyKey,
            variantKey,
          });
        } else {
          const existingProduct = uniqueMap.get(groupKey)!;
          const mergedPrices = mergePriceOptions(existingProduct.prices, product.prices);
          const stats = computePriceStats(mergedPrices);

          let finalImage = existingProduct.image;
          if (finalImage === '/pixel-box.svg' && product.image !== '/pixel-box.svg') {
            finalImage = product.image;
          }

          const existingScore = scoreProductRelevance(existingProduct, queryWords, query, category);
          const incomingScore = scoreProductRelevance(product, queryWords, query, category);
          const shouldReplaceDisplay = incomingScore > existingScore;

          uniqueMap.set(groupKey, {
            ...existingProduct,
            prices: mergedPrices,
            lowestPrice: stats.lowest,
            highestPrice: stats.highest,
            averagePrice: stats.average,
            image: finalImage,
            name: shouldReplaceDisplay ? product.name : existingProduct.name,
            model: shouldReplaceDisplay ? product.model : existingProduct.model,
            brand: shouldReplaceDisplay ? product.brand : existingProduct.brand,
            normalizedTitle: shouldReplaceDisplay ? normalizedName : existingProduct.normalizedTitle,
            canonicalProductKey: groupKey,
            familyKey: existingProduct.familyKey ?? familyKey,
            variantKey: existingProduct.variantKey ?? variantKey,
            updatedAt: existingProduct.updatedAt > product.updatedAt ? existingProduct.updatedAt : product.updatedAt,
          });
        }
      }
      liveProducts = Array.from(uniqueMap.values());
      liveProducts = dedupeNearDuplicates(liveProducts);

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
        liveProducts = liveProducts.filter((product) =>
          product.prices.some((priceInfo) => selectedStoreIds.has(priceInfo.storeId.toLowerCase())),
        );
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


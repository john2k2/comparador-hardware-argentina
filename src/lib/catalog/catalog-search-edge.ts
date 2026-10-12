import { d1Adapter } from '../../../scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs';
import { createD1CatalogReader } from './d1-catalog-reader';
import { inferHardwareCategoryFromName, isHardwareCategory } from './hardware-categories';
import { catalogPageResponse } from '@/lib/search/catalog-page-response';
import type { SearchApiResponse } from '@/lib/search/search-api';
import type { ProductSort } from '@/lib/persistence/product-read-types';
import type { D1PageCacheStorage } from './d1-page-cache';

export interface CatalogSearchEdgeEnv {
  CATALOG_EDGE_SEARCH?: string;
  CATALOG_READ_BACKEND?: string;
  CATALOG_FINGERPRINT?: string;
  CATALOG_RESPONSE_CACHE?: string;
  CATALOG_DB?: { prepare?: unknown };
}
const sorts = new Set<ProductSort>(['relevance', 'price-asc', 'price-desc', 'name', 'newest']);
const limit = 30, windowMs = 60000, maxBuckets = 1000;
type Bucket = { count: number; reset: number };
type Dependencies = { now?: () => number; cache?: () => D1PageCacheStorage | undefined;
  createReader?: typeof createD1CatalogReader };
const nonNegative = (value: string | null) => value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
const pageNumber = (value: string | null) => value !== null && Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.trunc(Number(value)) : 1;

/** Sólo catálogo público: no Next, auth, Supabase, fetch HTTP ni escrituras. */
export function createCatalogSearchEdgeHandler(deps: Dependencies = {}) {
  const now = deps.now ?? Date.now, createReader = deps.createReader ?? createD1CatalogReader;
  const buckets = new Map<string, Bucket>();
  return async function handle(request: Request, env: CatalogSearchEdgeEnv): Promise<Response | null> {
    if (env.CATALOG_EDGE_SEARCH !== '1' || env.CATALOG_READ_BACKEND !== 'd1') return null;
    const url = new URL(request.url);
    if (url.pathname !== '/api/search') return null;
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Search-Cache': 'D1-EDGE' };
    const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body),
      { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
    if (request.method !== 'GET') return reply({ error: 'Método no permitido.' }, 405, { Allow: 'GET' });
    const query = (url.searchParams.get('q') ?? '').trim();
    const storeIds = new Set((url.searchParams.get('stores') ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean));
    if (query.length > 240 || storeIds.size > 80 || url.href.length > 8192)
      return reply({ error: 'Parámetros de búsqueda inválidos.' }, 400);
    if (url.searchParams.get('bypassDb') === '1') return reply({ error: 'bypassDb requiere privilegios de admin' }, 403);
    const ip = (request.headers.get('cf-connecting-ip')?.trim()
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim() || 'unknown').slice(0, 128);
    const clock = now(), previous = buckets.get(ip);
    const bucket = previous && previous.reset > clock ? previous : { count: 0, reset: clock + windowMs };
    buckets.delete(ip); buckets.set(ip, bucket);
    if (buckets.size > maxBuckets) buckets.delete(buckets.keys().next().value!);
    if (bucket.count < limit) bucket.count++;
    else {
      headers['X-RateLimit-Limit'] = String(limit); headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = String(Math.ceil(bucket.reset / 1000));
      return reply({ error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' }, 429,
        { 'Retry-After': String(Math.max(1, Math.ceil((bucket.reset - clock) / 1000))) });
    }
    headers['X-RateLimit-Limit'] = String(limit); headers['X-RateLimit-Remaining'] = String(limit - bucket.count);
    headers['X-RateLimit-Reset'] = String(Math.ceil(bucket.reset / 1000));
    const categoryParam = url.searchParams.get('category');
    const category = isHardwareCategory(categoryParam) ? categoryParam : query ? inferHardwareCategoryFromName(query) : undefined;
    const rawSort = url.searchParams.get('sortBy'), sortBy: ProductSort = sorts.has(rawSort as ProductSort) ? rawSort as ProductSort : 'relevance';
    const rawMin = nonNegative(url.searchParams.get('minPrice')), rawMax = nonNegative(url.searchParams.get('maxPrice'));
    const minPrice = rawMin !== undefined && rawMax !== undefined ? Math.min(rawMin, rawMax) : rawMin;
    const maxPrice = rawMin !== undefined && rawMax !== undefined ? Math.max(rawMin, rawMax) : rawMax;
    const page = pageNumber(url.searchParams.get('page'));
    if (!query && !category && minPrice === undefined && maxPrice === undefined && storeIds.size === 0) {
      const empty: SearchApiResponse = { products: [], pagination: { limit: 0, offset: 0, total: 0, totalPages: 0, page: 1, pageSize: 12 },
        facets: { categories: [], brands: [], stores: [] } };
      return reply(empty);
    }
    try {
      if (!env.CATALOG_FINGERPRINT || !/^[a-f0-9]{64}$/.test(env.CATALOG_FINGERPRINT)
        || !env.CATALOG_DB || typeof env.CATALOG_DB.prepare !== 'function') throw new Error('CATALOG_EDGE_CONFIGURATION_INVALID');
      let pageCache: D1PageCacheStorage | undefined;
      if (env.CATALOG_RESPONSE_CACHE === '1') {
        try { pageCache = deps.cache ? deps.cache() : (globalThis.caches as CacheStorage & { default?: Cache } | undefined)?.default; }
        catch { /* Sin Cache API se conserva la lectura certificada. */ }
      }
      const reader = await createReader(d1Adapter(env.CATALOG_DB), { expectedCatalogFingerprint: env.CATALOG_FINGERPRINT, now, pageCache });
      const result = await reader.readProductsPage({ query: query || undefined, category, minPrice, maxPrice,
        storeIds, sortBy, page, pageSize: 12, onlyCurrentOffers: url.searchParams.get('includeUnavailable') !== '1' });
      return reply(catalogPageResponse(result, { minPrice, maxPrice, sortBy }));
    } catch {
      return reply({ error: 'No pudimos consultar el catálogo. Intentá nuevamente.' }, 503);
    }
  };
}

import { queryClockCertificate } from '../../../scripts/pilots/cloudflare-catalog/query-clock.mjs';
import { queryCacheProbe, queryCertificate, snapshotInterval } from '../../../scripts/pilots/cloudflare-catalog/response-cache.mjs';
import { validateParams, type CatalogSqlParams, type CatalogSqlReader } from '../../../scripts/pilots/cloudflare-catalog/engine.mjs';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
import type { Product } from '@/lib/types';
import { isHardwareCategory } from './hardware-categories';

export interface D1PageCacheStorage {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<unknown>;
}
export type PageCertificate = { generation: string; validFrom: number; createdAt: number; validUntil: number;
  expires: number; clockVersion: number };
type Probe = Omit<PageCertificate, 'createdAt' | 'validUntil'>;
export type PageCachePlan = { key: Request; clock: number; probe: Probe; snapshot: string; params: CatalogSqlParams;
  storeCertificate: PageCertificate | null };
const format = 1;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
async function digest(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function d1PageCacheKey(fingerprint: string, snapshot: string, params: CatalogSqlParams,
  preferCurrentRepresentative = true): Promise<Request> {
  const input = validateParams(params);
  const canonical = { p_query: input.p_query, p_category: input.p_category,
    p_stores: [...new Set(input.p_stores.map(id => id.trim().toLowerCase()).filter(Boolean))].sort(),
    p_min_price: input.p_min_price, p_max_price: input.p_max_price, p_sort: input.p_sort,
    p_page: input.p_page, p_page_size: input.p_page_size };
  const hash = await digest(JSON.stringify({ format, fingerprint, snapshot: await digest(snapshot),
    preferCurrentRepresentative, params: canonical }));
  return new Request(`https://catalog-cache.internal.invalid/__d1_page/v${format}/${hash}`);
}

function validCertificate(value: unknown, probe: Probe, now: number): value is PageCertificate {
  if (!object(value)) return false;
  return value.clockVersion === 1 && value.generation === probe.generation && value.validFrom === probe.validFrom
    && ['createdAt', 'validUntil', 'expires'].every(key => Number.isFinite(value[key]))
    && Number(value.createdAt) >= probe.validFrom && Number(value.createdAt) <= now
    && Number(value.expires) === Math.min(Number(value.createdAt) + 60000, Number(value.validUntil))
    && Number(value.expires) > now && Number(value.validUntil) > Number(value.createdAt);
}
function date(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? parsed : null;
}
function revivePage(raw: unknown): ProductPageResult | null {
  if (!object(raw) || !Array.isArray(raw.products) || !['total', 'totalPages', 'page', 'pageSize'].every(key => Number.isSafeInteger(raw[key]))
    || Number(raw.total) < 0 || Number(raw.pageSize) < 1 || Number(raw.pageSize) > 48
    || raw.totalPages !== Math.ceil(Number(raw.total) / Number(raw.pageSize)) || Number(raw.page) < 1
    || Number(raw.page) > Math.max(1, Number(raw.totalPages)) || raw.products.length > Number(raw.pageSize)
    || (raw.total === 0 ? raw.products.length !== 0 : raw.products.length === 0)) return null;
  const products: Product[] = [];
  for (const item of raw.products) {
    if (!object(item) || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name
      || typeof item.category !== 'string' || !isHardwareCategory(item.category) || !object(item.specs)
      || typeof item.brand !== 'string' || typeof item.model !== 'string' || !Array.isArray(item.prices)
      || !['lowestPrice', 'highestPrice', 'averagePrice'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && Number(item[key]) >= 0)) return null;
    const createdAt = date(item.createdAt), updatedAt = date(item.updatedAt);
    const lastScrapedAt = item.lastScrapedAt == null ? undefined : date(item.lastScrapedAt);
    const lastNormalizedAt = item.lastNormalizedAt == null ? null : date(item.lastNormalizedAt);
    if (!createdAt || !updatedAt || lastScrapedAt === null || item.lastNormalizedAt != null && !lastNormalizedAt) return null;
    const prices: Product['prices'] = [];
    for (const offer of item.prices) {
      if (!object(offer) || typeof offer.storeId !== 'string' || !offer.storeId || typeof offer.storeName !== 'string'
        || typeof offer.url !== 'string' || typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price <= 0
        || !['in-stock', 'low-stock', 'out-of-stock', 'unknown'].includes(String(offer.stock))) return null;
      const lastUpdated = date(offer.lastUpdated);
      if (!lastUpdated) return null;
      prices.push({ ...offer, lastUpdated } as Product['prices'][number]);
    }
    products.push({ ...item, createdAt, updatedAt, lastScrapedAt, lastNormalizedAt, prices } as Product);
  }
  return { ...raw, products } as ProductPageResult;
}

/** Sólo artefactos ya validados; nunca consulta Supabase ni modifica ofertas. */
export function createD1PageCache(db: CatalogSqlReader, storage: D1PageCacheStorage,
  fingerprint: string, now: () => number) {
  return {
    async plan(params: CatalogSqlParams, snapshot: string, currentOnly: boolean): Promise<PageCachePlan | null> {
      if (!currentOnly || params.p_min_price !== 0) return null;
      const clock = now(), probe = queryCacheProbe(snapshot, clock) as Probe | null;
      if (!probe) return null;
      const global = snapshotInterval(snapshot, clock);
      const storeCertificate = params.p_stores?.length ? global ? queryCertificate(probe, global.validUntil, clock) as PageCertificate : null : null;
      if (params.p_stores?.length && !storeCertificate) return null;
      return { key: await d1PageCacheKey(fingerprint, snapshot, params), clock, probe, snapshot, params, storeCertificate };
    },
    checkClock(plan: PageCachePlan, certificate: PageCertificate | null, cacheHit = false) {
      const clock = now();
      if (clock < plan.clock || certificate && (clock >= certificate.validUntil || cacheHit && clock >= certificate.expires))
        throw new Error('CATALOG_CLOCK_INTERVAL_EXPIRED');
    },
    async read(plan: PageCachePlan): Promise<{ page: ProductPageResult; certificate: PageCertificate } | null> {
      let body: unknown;
      try {
        const response = await storage.match(plan.key);
        if (!response || response.status !== 200 || response.headers.get('X-D1-Page-Format') !== String(format)) return null;
        const text = await response.text();
        if (response.headers.get('X-D1-Page-Hash') !== await digest(text)) return null;
        body = JSON.parse(text);
      } catch { return null; }
      if (!object(body) || body.fingerprint !== fingerprint || !validCertificate(body.certificate, plan.probe, plan.clock)
        || plan.storeCertificate && body.certificate.validUntil > plan.storeCertificate.validUntil) return null;
      const page = revivePage(body.page);
      if (!page) return null;
      if (now() < plan.clock || now() >= body.certificate.validUntil) throw new Error('CATALOG_CLOCK_INTERVAL_EXPIRED');
      if (now() >= body.certificate.expires) return null;
      return { page, certificate: body.certificate };
    },
    async certificate(plan: PageCachePlan): Promise<PageCertificate | null> {
      if (plan.storeCertificate) return plan.storeCertificate;
      try {
        const certificate: unknown = await queryClockCertificate(db, plan.params, { now: plan.clock, snapshot: plan.snapshot });
        return validCertificate(certificate, plan.probe, plan.clock) ? certificate : null;
      } catch { return null; }
    },
    async write(plan: PageCachePlan, certificate: PageCertificate, page: ProductPageResult): Promise<void> {
      const clock = now(), ttl = Math.floor((certificate.expires - clock) / 1000);
      if (ttl < 1 || !validCertificate(certificate, plan.probe, clock)) return;
      const text = JSON.stringify({ fingerprint, certificate, page });
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`,
        'X-D1-Page-Format': String(format), 'X-D1-Page-Hash': await digest(text) };
      try { await storage.put(plan.key, new Response(text, { headers })); } catch { /* Caché auxiliar: la página validada sigue disponible. */ }
    },
  };
}

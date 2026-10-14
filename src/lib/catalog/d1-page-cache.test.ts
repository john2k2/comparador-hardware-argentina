import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1PageCache, d1PageCacheKey, type D1PageCacheStorage } from './d1-page-cache';
import type { CatalogSqlReader } from './d1-catalog-reader';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
const now = Date.parse('2026-10-12T01:00:00Z'), fingerprint = 'a'.repeat(64);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
function fixture(deadline = now + 120000) {
  const entries = new Map<string, Response>();
  const storage: D1PageCacheStorage = { match: vi.fn(async request => entries.get(request.url)?.clone()),
    put: vi.fn(async (request, response) => { entries.set(request.url, response.clone()); }) };
  const first = vi.fn(async () => ({ next_transition: new Date(deadline).toISOString() }));
  const db: CatalogSqlReader = { first, all: vi.fn(async () => []) };
  const snapshot = JSON.stringify({ projectionVersion: 1,
    counts: { products: 1, product_prices: 1, stores: 1, catalog_price_summaries: 1 },
    cache: { version: 1, generation: 'g1', validFrom: new Date(now - 1).toISOString(), validUntil: new Date(deadline).toISOString() } });
  const cache = createD1PageCache(db, storage, fingerprint, () => Date.now());
  const stamp = new Date(now - 1000), params = { p_min_price: 0, p_query: 'rtx', p_page: 1, p_page_size: 12 };
  const page: ProductPageResult = { total: 1, totalPages: 1, page: 1, pageSize: 12, products: [{
    id: 'gpu', name: 'RTX 4060 8GB', category: 'tarjetas-graficas', brand: 'NVIDIA', model: 'RTX 4060', specs: {},
    lowestPrice: 200000, highestPrice: 200000, averagePrice: 200000, createdAt: stamp, updatedAt: stamp,
    lastScrapedAt: stamp, lastNormalizedAt: stamp,
    prices: [{ storeId: 'venex', storeName: 'Venex', url: 'https://www.venex.com.ar/rtx', stock: 'in-stock',
      price: 200000, installment: null, lastUpdated: stamp }],
  }] };
  return { storage, entries, first, snapshot, cache, params, page };
}
async function hash(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join(''); }

describe('caché de páginas D1 separada del piloto y certificado temporal', () => {
  it('keys normalizadas aíslan fingerprint/snapshot/policy y usan origen fijo interno', async () => {
    const f = fixture(), original = await d1PageCacheKey(fingerprint, f.snapshot, { ...f.params, p_stores: ['VENEX', ' venex '] });
    const same = await d1PageCacheKey(fingerprint, f.snapshot, { p_stores: ['venex'], ...f.params });
    expect(original.url).toBe(same.url); expect(original.url).toContain('https://catalog-cache.internal.invalid/__d1_page/v1/');
    for (const other of [await d1PageCacheKey('b'.repeat(64), f.snapshot, f.params),
      await d1PageCacheKey(fingerprint, f.snapshot + ' ', f.params), await d1PageCacheKey(fingerprint, f.snapshot, f.params, false)])
      expect(other.url).not.toBe((await d1PageCacheKey(fingerprint, f.snapshot, f.params)).url);
  });
  it('MISS/HIT preserva todos los tipos Date y TTL/deadline <=60 segundos', async () => {
    const f = fixture(now + 20000), plan = (await f.cache.plan(f.params, f.snapshot, true))!;
    expect(await f.cache.read(plan)).toBeNull();
    const certificate = (await f.cache.certificate(plan))!;
    expect(certificate.expires).toBe(now + 20000);
    await f.cache.write(plan, certificate, f.page);
    const hit = (await f.cache.read(plan))!;
    expect(hit.page).toEqual(f.page);
    expect(hit.page.products[0].createdAt).toBeInstanceOf(Date);
    expect(hit.page.products[0].lastScrapedAt).toBeInstanceOf(Date);
    expect(hit.page.products[0].lastNormalizedAt).toBeInstanceOf(Date);
    expect(hit.page.products[0].prices[0].lastUpdated).toBeInstanceOf(Date);
    vi.setSystemTime(now + 20000);
    expect(await f.cache.read((await f.cache.plan(f.params, f.snapshot, true))!)).toBeNull();
    expect(f.first).toHaveBeenCalledTimes(1);
  });
  it('histórico/piso extra/frame no acreditado no consultan guard ni caché', async () => {
    const f = fixture();
    expect(await f.cache.plan(f.params, f.snapshot, false)).toBeNull();
    expect(await f.cache.plan({ ...f.params, p_min_price: 100 }, f.snapshot, true)).toBeNull();
    expect(await f.cache.plan(f.params, '{}', true)).toBeNull();
    expect(f.first).not.toHaveBeenCalled(); expect(f.storage.match).not.toHaveBeenCalled();
  });
  it('stores sólo frame global vigente; sinstores certificado query funciona al vencer el frame', async () => {
    const f = fixture(now + 500);
    expect(await f.cache.plan({ ...f.params, p_stores: ['venex'] }, f.snapshot, true)).not.toBeNull();
    vi.setSystemTime(now + 501);
    expect(await f.cache.plan({ ...f.params, p_stores: ['venex'] }, f.snapshot, true)).toBeNull();
    expect(await f.cache.plan(f.params, f.snapshot, true)).not.toBeNull();
  });
  it.each(['createdAt', 'lastScrapedAt', 'priceDate', 'total', 'stock'])('payload inválido %s aun con hash correcto produce MISS', async field => {
    const f = fixture(), plan = (await f.cache.plan(f.params, f.snapshot, true))!, certificate = (await f.cache.certificate(plan))!;
    await f.cache.write(plan, certificate, f.page);
    const entry = f.entries.get(plan.key.url)!, raw = JSON.parse(await entry.text());
    if (field === 'total') raw.page.products = [];
    else if (field === 'stock') raw.page.products[0].prices[0].stock = 'available-on-backorder';
    else if (field === 'priceDate') raw.page.products[0].prices[0].lastUpdated = 'invalid';
    else raw.page.products[0][field] = 'invalid';
    const text = JSON.stringify(raw), headers = new Headers(entry.headers); headers.set('X-D1-Page-Hash', await hash(text));
    f.entries.set(plan.key.url, new Response(text, { headers }));
    expect(await f.cache.read(plan)).toBeNull();
  });
  it('TTL cruzado durante await posterior a HIT rechaza respuesta; artefacto caducado no se guarda', async () => {
    const f = fixture(), plan = (await f.cache.plan(f.params, f.snapshot, true))!, certificate = (await f.cache.certificate(plan))!;
    await f.cache.write(plan, certificate, f.page);
    vi.setSystemTime(now + 60001);
    expect(() => f.cache.checkClock(plan, certificate, true)).toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
    await f.cache.write(plan, certificate, f.page);
    expect(f.storage.put).toHaveBeenCalledTimes(1);
  });
  it('fallo del guard sólo desactiva caché, sin fabricar un certificado/resultado vacío', async () => {
    const f = fixture(), plan = (await f.cache.plan(f.params, f.snapshot, true))!;
    f.first.mockRejectedValueOnce(new Error('CLOCK_QUERY_FAILED'));
    expect(await f.cache.certificate(plan)).toBeNull();
    expect(f.storage.put).not.toHaveBeenCalled();
  });
});

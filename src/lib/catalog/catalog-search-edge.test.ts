import { describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { createCatalogSearchEdgeHandler, type CatalogSearchEdgeEnv } from './catalog-search-edge';
import { catalogPageResponse } from '@/lib/search/catalog-page-response';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
const fingerprint = 'a'.repeat(64);
function fixture() {
  const result: ProductPageResult = { products: [{ id: 'gpu', name: 'RTX 4060 8GB', category: 'tarjetas-graficas', brand: 'NVIDIA',
    model: 'RTX 4060', specs: {}, createdAt: new Date(), updatedAt: new Date(), lowestPrice: 200000, highestPrice: 200000, averagePrice: 200000,
    prices: [{ storeId: 'venex', storeName: 'Venex', url: 'https://www.venex.com.ar/rtx-4060', price: 200000,
      stock: 'in-stock', installment: null, lastUpdated: new Date() }] }], total: 1, totalPages: 1, page: 1, pageSize: 12 };
  const readProductsPage = vi.fn(async () => result), prepare = vi.fn();
  const createReader = vi.fn(async () => ({ readProductsPage, readProductDetailById: async () => null, readCanonicalProductIdByKey: async () => null }));
  let clock = Date.now();
  const cache = vi.fn(() => ({ match: vi.fn(), put: vi.fn() }));
  const handle = createCatalogSearchEdgeHandler({ createReader, now: () => clock, cache });
  const env: CatalogSearchEdgeEnv = { CATALOG_EDGE_SEARCH: '1', CATALOG_READ_BACKEND: 'd1', CATALOG_FINGERPRINT: fingerprint,
    CATALOG_DB: { prepare } };
  const request = (query = 'q=RTX', init?: RequestInit) => new Request(`https://site.example/api/search?${query}`, init);
  return { result, readProductsPage, prepare, createReader, cache, handle, env, request, advance: (ms: number) => { clock += ms; } };
}
describe('API búsqueda edge sólo con backend/certificación explícitos', () => {
  it('apagado/backend distinto/ruta ajena devuelven null sin DB', async () => {
    const f = fixture();
    for (const env of [{}, { ...f.env, CATALOG_EDGE_SEARCH: '0' }, { ...f.env, CATALOG_READ_BACKEND: 'supabase' }])
      expect(await f.handle(f.request(), env)).toBeNull();
    expect(await f.handle(new Request('https://site.example/api/products'), f.env)).toBeNull();
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.createReader).not.toHaveBeenCalled();
  });
  it('método/query/store excesivos y bypass no consultan DB', async () => {
    const f = fixture();
    expect((await f.handle(f.request('q=RTX', { method: 'POST' }), f.env))!.status).toBe(405);
    expect((await f.handle(f.request(`q=${'x'.repeat(241)}`), f.env))!.status).toBe(400);
    expect((await f.handle(f.request(`stores=${Array.from({ length: 81 }, (_, i) => `s${i}`).join(',')}`), f.env))!.status).toBe(400);
    expect((await f.handle(f.request('q=RTX&bypassDb=1'), f.env))!.status).toBe(403);
    expect(f.createReader).not.toHaveBeenCalled();
  });
  it('consulta vacía retorna el mismo contrato sin inventario/credenciales', async () => {
    const f = fixture(), response = (await f.handle(f.request('q=++&page=9'), { ...f.env, CATALOG_DB: undefined }))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(catalogPageResponse({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 }));
    expect(f.createReader).not.toHaveBeenCalled();
  });
  it('normaliza contrato público y usa formatter común con JSON/fechas iguales', async () => {
    const f = fixture(), response = (await f.handle(f.request('q=++ryzen+7600++&stores=+MEXX+,mexx,VENEX&minPrice=400&maxPrice=100&page=2.8&sortBy=price-asc&includeUnavailable=1'), f.env))!;
    expect(f.readProductsPage).toHaveBeenCalledWith({ query: 'ryzen 7600', category: 'procesadores', minPrice: 100, maxPrice: 400,
      storeIds: new Set(['mexx', 'venex']), sortBy: 'price-asc', page: 2, pageSize: 12, onlyCurrentOffers: false });
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(catalogPageResponse(f.result, { minPrice: 100, maxPrice: 400, sortBy: 'price-asc' }))));
    expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(response.headers.get('X-Search-Cache')).toBe('D1-EDGE');
    expect(f.cache).not.toHaveBeenCalled();
    await f.handle(f.request('q=RTX+4060&page=NaN&sortBy=invalid&category=invalid&minPrice=-1'), { ...f.env, CATALOG_RESPONSE_CACHE: '1' });
    expect(f.readProductsPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sortBy: 'relevance', category: 'tarjetas-graficas',
      minPrice: undefined, onlyCurrentOffers: true }));
    expect(f.cache).toHaveBeenCalledTimes(1);
  });
  it('faltan binding/fingerprint/certificación o error D1 =>503 sin fallback', async () => {
    const f = fixture();
    for (const env of [{ ...f.env, CATALOG_DB: undefined }, { ...f.env, CATALOG_FINGERPRINT: '' }])
      expect((await f.handle(f.request(), env))!.status).toBe(503);
    f.createReader.mockRejectedValueOnce(new Error('CATALOG_PRODUCTION_NOT_READY'));
    expect((await f.handle(f.request(), f.env))!.status).toBe(503);
    f.readProductsPage.mockRejectedValueOnce(new Error('DB_DOWN'));
    expect((await f.handle(f.request(), f.env))!.status).toBe(503);
  });
  it('adapter real exige manifiesto, sin SDK/HTTP ni consulta de tienda', async () => {
    const prepare = vi.fn(() => ({ bind: () => ({ all: async () => ({ success: true,
      results: [{ snapshot: '{}', production: null }], meta: {} }) }) }));
    const handler = createCatalogSearchEdgeHandler();
    const response = await handler(new Request('https://site.example/api/search?q=RTX'), { CATALOG_EDGE_SEARCH: '1',
      CATALOG_READ_BACKEND: 'd1', CATALOG_FINGERPRINT: fingerprint, CATALOG_DB: { prepare } });
    expect(response!.status).toBe(503); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('rate local30/min prioriza CFIP, se renueva y no hace escrituras', async () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) expect((await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'one', 'x-forwarded-for': `fake-${i}` } }), f.env))!.status).toBe(200);
    const rejected = (await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'one', 'x-forwarded-for': 'new-spoof' } }), f.env))!;
    expect(rejected.status).toBe(429); expect(rejected.headers.get('Retry-After')).toBe('60');
    expect((await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'two' } }), f.env))!.status).toBe(200);
    f.advance(60000); expect((await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'one' } }), f.env))!.status).toBe(200);
    expect(f.createReader).not.toHaveBeenCalled();
  });
  it('LRU acotada expulsa el bucket antiguo al admitir más de 1000 IP', async () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'old' } }), f.env);
    for (let i = 0; i < 1000; i++) await f.handle(f.request('', { headers: { 'cf-connecting-ip': `ip-${i}` } }), f.env);
    expect((await f.handle(f.request('', { headers: { 'cf-connecting-ip': 'old' } }), f.env))!.status).toBe(200);
  });
  it('artefacto esbuild no arrastra Next/Supabase/SDK/server-only/HTTP writers', async () => {
    const result = await build({ entryPoints: ['src/lib/catalog/catalog-search-edge.ts'], bundle: true, write: false,
      format: 'esm', platform: 'browser', metafile: true, target: 'es2022', tsconfig: 'tsconfig.json' });
    expect(Object.keys(result.metafile!.inputs).some(path => /node_modules\/(?:next|@supabase|@opennextjs)|server-only|server\/supabase|shared-cache|internal-refresh|product-catalog/.test(path))).toBe(false);
    expect(result.outputFiles[0].text).not.toContain('from "next/');
    expect(result.outputFiles[0].text).not.toContain('fetch(');
  });
});

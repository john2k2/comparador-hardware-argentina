import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createD1CatalogReader, type CatalogSqlReader } from './d1-catalog-reader';
import { proveManufacturerRamAttributes } from '@/lib/quality/offer-attribute-proof';
import { normalizeIdentityText } from '@/lib/product-identity';
import { computeCurrentStorePriceStats } from '@/lib/price-utils';
import { listingReference } from '@/lib/scrapers/listing-reference';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import type { D1PageCacheStorage } from './d1-page-cache';

const now = Date.parse('2026-10-12T01:00:00Z'), fingerprint = 'a'.repeat(64);
const databases: DatabaseSync[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.useRealTimers(); });
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  db.exec(readFileSync(new URL('../../../scripts/pilots/cloudflare-catalog/schema.sql', import.meta.url), 'utf8'));
  const sql: string[] = [];
  const adapter: CatalogSqlReader = {
    async all(query, values = []) { sql.push(query); return db.prepare(query).all(...values as (string | number | null)[]) as Record<string, unknown>[]; },
    async first(query, values = []) { sql.push(query); return db.prepare(query).get(...values as (string | number | null)[]) as Record<string, unknown> | undefined; },
  };
  const stamp = new Date(now - 1800000).toISOString();
  for (const store of ['compragamer', 'venex']) db.prepare('INSERT INTO stores VALUES(?,?)').run(store, JSON.stringify({ id: store, name: store }));
  function add(id: string, name: string, sku: string | undefined, ref: string, price: number, store = 'compragamer', identity = id) {
    const category = sku ? 'memoria-ram' : 'tarjetas-graficas';
    const url = store === 'compragamer' ? `https://compragamer.com/producto/RAM_${ref}` : `https://www.venex.com.ar/${ref}`;
    const listingRef = listingReference(store, url)!, specs = sku ? { SKU: sku } : {};
    const sourceIdentity = { title: name, storeSku: sku, listingRef };
    const subject = { title: name, sku, specs };
    const review = sku ? { version: 1, status: 'consistent', reason: 'manufacturer-ram', reviewedAt: stamp, model: null,
      confidence: null, subject: { name: normalizeIdentityText(name), category, url }, sourceIdentity,
      proof: proveManufacturerRamAttributes(subject, subject, { storeId: store, url, listingRef }) } : undefined;
    const row: DbProductRow = { id, name, category, brand: sku ? 'Corsair' : 'NVIDIA', model: name,
      description: null, image: null, normalized_title: name, canonical_product_key: `legacy-${identity}`,
      family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: stamp, last_normalized_at: null,
      specs, lowest_price: price, highest_price: price, average_price: price, created_at: stamp, updated_at: stamp };
    const document = normalizeIdentityText(name), offer = { id: `offer-${id}`, product_id: id, store_id: store,
      price, original_price: null, stock: 'in-stock', url, last_updated: stamp, installment_count: null,
      installment_amount: null, source_identity: sourceIdentity, identity_review: review, price_condition: 'special' };
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, category, identity, document, document, 1,
      Number(id.startsWith('agrupado-')), stamp, stamp, JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id, document);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, price, price, price, 1, url, 0,
      JSON.stringify([store]), null, null, stamp, '{}');
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id, id, store, price, url, JSON.stringify(offer));
    for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)')
      .run(id, kind, offer.id, store, price, offer.stock, url, stamp);
    return row;
  }
  const rgb = 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
  add('agrupado-rgb', rgb, 'CMG16GX4M1E3200C16', '15558', 283600, 'compragamer', 'rgb');
  add('cg-15558', rgb, 'CMG16GX4M1E3200C16', '15558', 283600, 'compragamer', 'rgb');
  add('cg-15522', 'Memoria Corsair DDR4 8GB 3200MHz Vengeance LPX Black CL16', 'CMK8GX4M1E3200C16', '15522', 129990);
  add('cg-16112', 'Memoria Corsair DDR5 16GB 5600MHz Vengeance Black CL40', 'CMK16GX5M1B5600C40', '16112', 428000);
  add('gpu-a', 'RTX 4060 8GB', undefined, 'rtx-4060', 200000, 'venex');
  add('gpu-b', 'RTX 4070 12GB', undefined, 'rtx-4070', 400000, 'venex');
  const counts = { products: 6, product_prices: 6, catalog_price_summaries: 6, stores: 2 };
  // Certificación simulada por el controlplane de la fixture, nunca runtime.
  const snapshot = { counts, catalog: { version: 1, fingerprint, counts } };
  const manifest = { version: 1, complete: true, countsVerified: true, fingerprint, counts };
  const write = (key: string, value: unknown) => db.prepare('INSERT OR REPLACE INTO pilot_meta VALUES(?,?)').run(key, JSON.stringify(value));
  write('snapshot', snapshot); write('production_catalog', manifest);
  const create = (pageCache?: D1PageCacheStorage) => createD1CatalogReader(adapter, { expectedCatalogFingerprint: fingerprint, now: () => Date.now(), pageCache });
  const changeProduct = (id: string, changes: Partial<DbProductRow>) => {
    const raw = JSON.parse(String(db.prepare('SELECT row_json FROM products WHERE id=?').get(id)!.row_json));
    db.prepare('UPDATE products SET row_json=? WHERE id=?').run(JSON.stringify({ ...raw, ...changes }), id);
  };
  return { db, sql, adapter, create, write, snapshot, manifest, stamp, changeProduct };
}
const page = { page: 1, pageSize: 12, onlyCurrentOffers: true };
function memoryCache() {
  const entries = new Map<string, Response>();
  const match = vi.fn(async (request: Request) => entries.get(request.url)?.clone());
  const put = vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); });
  return { entries, match, put };
}
async function cacheFixture() {
  const f = fixture();
  const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
  rebuildProjection(f.db, { now, generation: 'production-test' });
  return f;
}

describe('lector D1 inyectado con certificación explícita de producción', () => {
  it('MISS/HIT devuelve dominio idéntico con Dates y HIT sólo consulta metadata primaria', async () => {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    const miss = await reader.readProductsPage({ ...page, query: 'ddr4', category: 'memoria-ram' });
    expect(storage.put).toHaveBeenCalledTimes(1);
    const before = f.sql.length;
    const hit = await reader.readProductsPage({ ...page, query: 'ddr4', category: 'memoria-ram' });
    expect(hit).toEqual(miss);
    expect(hit.products[0].createdAt).toBeInstanceOf(Date);
    expect(hit.products[0].prices[0].lastUpdated).toBeInstanceOf(Date);
    expect(f.sql.slice(before)).toHaveLength(2);
    expect(f.sql.slice(before).every(sql => sql.includes("key='production_catalog'"))).toBe(true);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it('TTL/errores/payload dañado degradan a MISS SQL validado sin vacío sintético', async () => {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    const first = await reader.readProductsPage(page);
    vi.setSystemTime(now + 60001);
    expect(await reader.readProductsPage(page)).toEqual(first);
    expect(storage.put).toHaveBeenCalledTimes(2);
    const [key, entry] = [...storage.entries][0];
    const raw = JSON.parse(await entry.text()); raw.page.products[0].prices[0].price = 1;
    storage.entries.set(key, new Response(JSON.stringify(raw), { headers: entry.headers }));
    expect(await reader.readProductsPage(page)).toEqual(first);
    expect(storage.put).toHaveBeenCalledTimes(3);
    storage.match.mockRejectedValueOnce(new Error('CACHE_DOWN'));
    storage.put.mockRejectedValueOnce(new Error('CACHE_FULL'));
    expect(await reader.readProductsPage(page)).toEqual(first);
  });
  it('HIT revalida marcador y reloj después de esperar caché/metadata', async () => {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    await reader.readProductsPage(page);
    const normal = storage.match.getMockImplementation()!;
    storage.match.mockImplementationOnce(async request => {
      const result = await normal(request);
      const raw = JSON.parse(String(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value));
      raw.cache.generation = 'changed'; f.write('snapshot', raw); return result;
    });
    await expect(reader.readProductsPage(page)).rejects.toThrow('CATALOG_PRODUCTION_GENERATION_CHANGED');
    // El nuevo corte no reutiliza el artefacto anterior.
    expect((await reader.readProductsPage(page)).total).toBe(5);
    storage.match.mockImplementationOnce(async request => { const result = await normal(request);
      vi.setSystemTime(now - 1); return result; });
    await expect(reader.readProductsPage(page)).rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
  });
  it('stores usa certificado global vigente; histórico y frame vencido conservan BYPASS', async () => {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    const query = { ...page, storeIds: new Set(['venex']) };
    const first = await reader.readProductsPage(query);
    const before = f.sql.length;
    expect(await reader.readProductsPage(query)).toEqual(first);
    expect(f.sql.slice(before)).toHaveLength(2);
    expect(storage.put).toHaveBeenCalledTimes(1);
    await reader.readProductsPage({ ...page, onlyCurrentOffers: false });
    expect(storage.put).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 4 * 3600000);
    await reader.readProductsPage(query);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it('clock horizon durante MISS aborta sin guardar página y no confunde corpus pendiente con clock', async () => {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    const original = f.adapter.all;
    f.adapter.all = async (query, values) => { const result = await original(query, values);
      if (query.includes('FROM totals LEFT JOIN')) vi.setSystemTime(now + 4 * 3600000); return result; };
    await expect(reader.readProductsPage(page)).rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('un guard demorado que falla lee con el reloj actual al entrar una oferta futura', async () => {
    const f = fixture(), stamp = new Date(now + 65000).toISOString();
    f.db.prepare("UPDATE product_prices SET row_json=json_set(row_json,'$.last_updated',?) WHERE id='offer-gpu-a'").run(stamp);
    f.db.prepare("UPDATE price_basis SET observed_at=? WHERE id='offer-gpu-a'").run(stamp);
    f.db.prepare("UPDATE summaries SET comparable_latest_observed_at=? WHERE product_id='gpu-a'").run(stamp);
    const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
    rebuildProjection(f.db, { now, generation: 'future-offer' });
    const storage = memoryCache(), reader = await f.create(storage), original = f.adapter.first;
    f.adapter.first = async (query, values) => {
      if (query.includes('SELECT COALESCE(MIN(time)')) {
        vi.setSystemTime(now + 5001); throw new Error('GUARD_UNAVAILABLE');
      }
      return original(query, values);
    };
    const result = await reader.readProductsPage({ ...page, query: 'RTX', category: 'tarjetas-graficas' });
    expect(result.total).toBe(2); expect(result.products.map(product => product.id)).toContain('gpu-a');
    expect(storage.put).not.toHaveBeenCalled();
    const uncached = await f.create();
    expect(await uncached.readProductsPage({ ...page, query: 'RTX', category: 'tarjetas-graficas' })).toEqual(result);
  });
  it.each([false, true])('el rango conserva el hijo vigente cuando el agrupado queda fuera; proyección=%s', async projected => {
    const f = fixture();
    f.db.exec(`INSERT INTO products SELECT 'agrupado-gpu',category,catalog_identity,catalog_name,catalog_document,
      catalog_component,1,last_scraped_at,updated_at,json_set(row_json,'$.id','agrupado-gpu','$.lowest_price',400000,'$.highest_price',400000,'$.average_price',400000)
      FROM products WHERE id='gpu-a';
      INSERT INTO summaries SELECT 'agrupado-gpu',400000,400000,400000,available,urls,portable_listing,store_ids_json,
        comparable_stats_json,comparable_valid_until,comparable_latest_observed_at,row_json FROM summaries WHERE product_id='gpu-a';
      INSERT INTO product_prices SELECT 'offer-grouped-gpu','agrupado-gpu',store_id,400000,url,
        json_set(row_json,'$.id','offer-grouped-gpu','$.product_id','agrupado-gpu','$.price',400000) FROM product_prices WHERE id='offer-gpu-a';
      INSERT INTO price_basis SELECT 'agrupado-gpu',kind,'offer-grouped-gpu',store_id,400000,stock,url,observed_at FROM price_basis WHERE id='offer-gpu-a';
      INSERT INTO product_substrings SELECT id,catalog_document FROM products WHERE id='agrupado-gpu';`);
    const counted = { ...f.snapshot.counts, products: 7, product_prices: 7, catalog_price_summaries: 7 };
    f.write('snapshot', { ...f.snapshot, counts: counted, catalog: { ...f.snapshot.catalog, counts: counted } });
    f.write('production_catalog', { ...f.manifest, counts: counted });
    if (projected) {
      const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
      rebuildProjection(f.db, { now, generation: 'range-test' });
    }
    const reader = await f.create();
    for (const query of ['', 'RTX']) for (const storeIds of [new Set<string>(), new Set(['venex'])]) {
      const result = await reader.readProductsPage({ ...page, category: 'tarjetas-graficas', query, storeIds, maxPrice: 300000 });
      expect(result.total).toBe(1); expect(result.products[0]).toMatchObject({ id: 'gpu-a', lowestPrice: 200000 });
    }
  });
  it.each([false, true])('una ficha agrupada vacía no oculta el hijo comprable; proyección=%s', async projected => {
    const f = fixture();
    f.db.exec(`INSERT INTO products SELECT 'agrupado-empty',category,catalog_identity,catalog_name,catalog_document,
      catalog_component,1,last_scraped_at,updated_at,json_set(row_json,'$.id','agrupado-empty','$.lowest_price',0,'$.highest_price',0,'$.average_price',0)
      FROM products WHERE id='gpu-a';
      INSERT INTO summaries VALUES('agrupado-empty',0,0,0,0,'',0,'[]',NULL,NULL,NULL,'{}');
      INSERT INTO product_substrings SELECT id,catalog_document FROM products WHERE id='agrupado-empty';`);
    const counted = { ...f.snapshot.counts, products: 7, catalog_price_summaries: 7 };
    f.write('snapshot', { ...f.snapshot, counts: counted, catalog: { ...f.snapshot.catalog, counts: counted } });
    f.write('production_catalog', { ...f.manifest, counts: counted });
    if (projected) {
      const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
      rebuildProjection(f.db, { now, generation: 'representative-test' });
    }
    const reader = await f.create();
    for (const query of ['', 'RTX']) for (const stores of [new Set<string>(), new Set(['venex'])]) {
      const result = await reader.readProductsPage({ ...page, category: 'tarjetas-graficas', query, storeIds: stores });
      expect(result.total).toBe(2); expect(result.products.map(product => product.id)).toContain('gpu-a');
      expect(result.products.find(product => product.id === 'gpu-a')!.lowestPrice).toBe(200000);
    }
    // La búsqueda histórica mantiene su elección canónica y no inventa oferta.
    const historical = await reader.readProductsPage({ ...page, category: 'tarjetas-graficas', onlyCurrentOffers: false });
    expect(historical.products.find(product => product.id === 'agrupado-empty')).toMatchObject({ lowestPrice: 0, prices: [] });
  });
  it.each([{ id: 'wrong-id' }, { category: 'procesadores' as const }])('rechaza identidad JSON distinta a columnas SQL %j', async changes => {
    const f = fixture(), reader = await f.create();
    f.changeProduct('gpu-a', changes);
    await expect(reader.readProductDetailById('gpu-a')).rejects.toThrow('CATALOG_PRODUCT_IDENTITY_MISMATCH');
    await expect(reader.readProductsPage(page)).rejects.toThrow('CATALOG_PRODUCT_IDENTITY_MISMATCH');
  });
  it.each(['snapshot', 'production_catalog'])('el piloto sin %s no habilita lecturas', async key => {
    const f = fixture(); f.db.prepare('DELETE FROM pilot_meta WHERE key=?').run(key);
    await expect(f.create()).rejects.toThrow('CATALOG_PRODUCTION_NOT_READY');
  });
  it.each([{ complete: false }, { countsVerified: false }, { version: 2 }, { fingerprint: 'b'.repeat(64) },
    { counts: { products: 5, product_prices: 6, catalog_price_summaries: 6, stores: 2 } }])('rechaza manifiesto parcial/incompatible %j', async change => {
    const f = fixture(); f.write('production_catalog', { ...f.manifest, ...change });
    await expect(f.create()).rejects.toThrow('CATALOG_PRODUCTION_MANIFEST_INVALID');
  });
  it('sin identidad certificada de catálogo, el snapshot privado común no basta', async () => {
    const f = fixture(); f.write('snapshot', { counts: f.snapshot.counts, hashes: {} });
    await expect(f.create()).rejects.toThrow('CATALOG_SNAPSHOT_INVALID');
    await expect(createD1CatalogReader(f.adapter, { expectedCatalogFingerprint: '' })).rejects.toThrow('CATALOG_EXPECTED_FINGERPRINT_REQUIRED');
  });
  it('mapea las cuatro ofertas/tres MPN, conserva fechas y deduplica una publicación en detalle', async () => {
    const f = fixture(), reader = await f.create();
    for (const id of ['agrupado-rgb', 'cg-15558', 'cg-15522', 'cg-16112']) {
      const product = (await reader.readProductDetailById(id))!;
      expect(product.id).toBe(id); expect(product.prices).toHaveLength(1);
      expect(product.specs.SKU).toMatch(/^CM[GK]/);
      expect(product.prices[0].lastUpdated.toISOString()).toBe(f.stamp);
      expect(product.prices[0].priceCondition).toBe('special');
      expect(computeCurrentStorePriceStats(product.prices, product, now).comparablePrices).toHaveLength(1);
    }
    const product = (await reader.readProductDetailById('cg-15558'))!;
    expect(await reader.readCanonicalProductIdByKey(product.canonicalProductKey!, product)).toBe('agrupado-rgb');
    expect((await reader.readProductsPage({ ...page, category: 'memoria-ram' })).total).toBe(3);
  });
  it('filtra tienda/rango antes del total, conserva página y vacío', async () => {
    const f = fixture(), reader = await f.create();
    const result = await reader.readProductsPage({ ...page, storeIds: new Set(['VENEX', ' venex ', '']), minPrice: 250000 });
    expect(result.total).toBe(1); expect(result.products[0].id).toBe('gpu-b');
    const paginated = await reader.readProductsPage({ ...page, category: 'tarjetas-graficas', page: 99, pageSize: 1, sortBy: 'price-asc' });
    expect(paginated).toMatchObject({ total: 2, totalPages: 2, page: 2, pageSize: 1 });
    expect(paginated.products[0].id).toBe('gpu-b');
    expect(await reader.readProductsPage({ ...page, query: 'producto inexistente' })).toMatchObject({ products: [], total: 0, totalPages: 0, page: 1 });
    expect(await reader.readProductDetailById('no-existe')).toBeNull();
    expect(f.sql.some(query => /COUNT\(\*\) FROM (?:products|product_prices|summaries|stores)\b/.test(query))).toBe(false);
  });
  it.each([{ specs: {} }, { specs: { SKU: 'otro' } }, { specs: { SKU: 'CMG16GX4M1E3200C16', kit: '2x8GB' } },
    { name: 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS White CL16' }])('rechaza página completa ante prueba invalidada %j', async change => {
    const f = fixture(); f.changeProduct('agrupado-rgb', change);
    const reader = await f.create();
    await expect(reader.readProductsPage({ ...page, category: 'memoria-ram' })).rejects.toThrow('CATALOG_PAGE_EVIDENCE_MISMATCH');
    const product = (await reader.readProductDetailById('agrupado-rgb'))!;
    expect(computeCurrentStorePriceStats(product.prices, product, now).comparablePrices).toEqual([]);
    expect(await reader.readCanonicalProductIdByKey(product.canonicalProductKey!, product)).toBeNull();
  });
  it('acepta actualización de precio/clock entre requests y rechaza cambio de corte durante una lectura', async () => {
    const f = fixture(), reader = await f.create();
    await reader.readProductsPage(page);
    f.write('snapshot', { ...f.snapshot, cache: { version: 1, generation: 'new-clock' } });
    const offer = JSON.parse(String(f.db.prepare("SELECT row_json FROM product_prices WHERE id='offer-gpu-a'").get()!.row_json));
    f.db.prepare("UPDATE product_prices SET price=?,row_json=? WHERE id='offer-gpu-a'").run(250000, JSON.stringify({ ...offer, price: 250000 }));
    f.db.prepare("UPDATE price_basis SET price=? WHERE id='offer-gpu-a'").run(250000);
    await expect(reader.readProductsPage(page)).resolves.toMatchObject({ total: 5 });
    expect((await reader.readProductDetailById('gpu-a'))!.lowestPrice).toBe(250000);
    const original = f.adapter.all;
    f.adapter.all = async (query, values) => {
      const result = await original(query, values);
      if (query.includes('FROM totals LEFT JOIN')) f.write('snapshot', { ...f.snapshot, cache: { version: 1, generation: 'raced' } });
      return result;
    };
    await expect(reader.readProductsPage(page)).rejects.toThrow('CATALOG_PRODUCTION_GENERATION_CHANGED');
  });
  it('rechaza proof dañado, pero no confunde una publicación pendiente adjunta con el mínimo vigente válido', async () => {
    const f = fixture();
    const original = JSON.parse(String(f.db.prepare("SELECT row_json FROM product_prices WHERE id='offer-agrupado-rgb'").get()!.row_json));
    const pending = { ...original, id: 'offer-pending', price: 1, url: 'https://compragamer.com/producto/RAM_99999',
      identity_review: { ...original.identity_review, status: 'needs-review' } };
    f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(pending.id, 'agrupado-rgb', 'compragamer', pending.price,
      pending.url, JSON.stringify(pending));
    const counted = { ...f.snapshot.counts, product_prices: 7 };
    f.write('snapshot', { ...f.snapshot, counts: counted, catalog: { ...f.snapshot.catalog, counts: counted } });
    f.write('production_catalog', { ...f.manifest, counts: counted });
    const reader = await f.create();
    const result = await reader.readProductsPage({ ...page, category: 'memoria-ram' });
    expect(result.total).toBe(3); expect(result.products.find(product => product.id === 'agrupado-rgb')!.lowestPrice).toBe(283600);
    original.identity_review.proof.attributes.kit = '2x8';
    f.db.prepare("UPDATE product_prices SET row_json=? WHERE id='offer-agrupado-rgb'").run(JSON.stringify(original));
    await expect(reader.readProductsPage({ ...page, category: 'memoria-ram' })).rejects.toThrow('CATALOG_PAGE_EVIDENCE_MISMATCH');
  });
  it('un membership nuevo requiere identidad de catálogo/manifiesto nuevos; DB error no se convierte en null', async () => {
    const f = fixture(), reader = await f.create();
    f.write('snapshot', { ...f.snapshot, catalog: { ...f.snapshot.catalog, fingerprint: 'b'.repeat(64) } });
    await expect(reader.readProductDetailById('no-existe')).rejects.toThrow('CATALOG_PRODUCTION_MANIFEST_INVALID');
    f.write('snapshot', f.snapshot);
    f.adapter.first = async () => { throw new Error('DB_DOWN'); };
    await expect(reader.readProductDetailById('no-existe')).rejects.toThrow('DB_DOWN');
  });
  it('el reloj no renueva ofertas: catálogo vigente queda vacío y la lectura histórica conserva fechas', async () => {
    const f = fixture(), reader = await f.create(); vi.setSystemTime(now + 86400001);
    const current = await reader.readProductsPage(page);
    expect(current).toMatchObject({ products: [], total: 0 });
    const historical = await reader.readProductsPage({ ...page, onlyCurrentOffers: false });
    expect(historical.total).toBe(5);
    expect(historical.products.every(product => product.prices.every(offer => offer.lastUpdated.toISOString() === f.stamp))).toBe(true);
  });
});

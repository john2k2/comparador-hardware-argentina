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
import { CATALOG_PREPARED_POLICY } from './prepared-policy.generated';
import { preparedProductPublicKeyId, preparedProductSignatureMessage } from './prepared-product';
import { stores } from '@/lib/scrapers/static-data';
import { prepareUnsignedProduct } from '../../../scripts/pilots/cloudflare-catalog/prepared-product-builder';

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
  const snapshot = { counts, catalog: { version: 1, fingerprint, counts },
    clock_observations: { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: counts.product_prices } };
  const manifest = { version: 1, complete: true, countsVerified: true, fingerprint, counts };
  const write = (key: string, value: unknown) => {
    if (key === 'snapshot' && value && typeof value === 'object' && 'clock_observations' in value && 'counts' in value) {
      const data = value as typeof snapshot; value = { ...data, clock_observations: { ...data.clock_observations, offers: data.counts.product_prices } };
    }
    return db.prepare('INSERT OR REPLACE INTO pilot_meta VALUES(?,?)').run(key, JSON.stringify(value));
  };
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
  it('resuelve canónico por ID con una fila/cohort y dos marcadores primarios, sin hidratar detalle repetido', async () => {
    const f = fixture(), primary = vi.fn(f.adapter.first);
    f.adapter.latestFirst = primary;
    const reader = await f.create();
    expect(await reader.readCanonicalProductIdForProductId('cg-15558')).toBe('agrupado-rgb');
    expect(f.sql).toHaveLength(4);
    expect(primary).toHaveBeenCalledTimes(2);
    expect(f.sql.filter(sql => sql.includes('WHERE p.id=?'))).toHaveLength(1);
    expect(f.sql.filter(sql => sql.includes('WHERE category=?'))).toHaveLength(1);
    expect(f.sql.some(sql => sql.includes('LIMIT 201'))).toBe(true);
    const before = f.sql.length;
    expect(await reader.readCanonicalProductIdForProductId('cg-15558')).toBe('agrupado-rgb');
    expect(f.sql.slice(before)).toHaveLength(4);
  });
  it('canónico por ID conserva variante exacta y rechaza proof pendiente del sujeto actual', async () => {
    for (const change of [{ name: 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS White CL16' },
      { specs: { SKU: 'CMG16GX4M1E3200C16', kit: '2x8GB' } }]) {
      const f = fixture(); f.changeProduct('agrupado-rgb', change);
      expect(await (await f.create()).readCanonicalProductIdForProductId('cg-15558')).toBeNull();
      expect(f.sql).toHaveLength(4);
    }
    const f = fixture();
    const offer = JSON.parse(String(f.db.prepare("SELECT row_json FROM product_prices WHERE id='offer-cg-15558'").get()!.row_json));
    offer.identity_review.status = 'needs-review';
    f.db.prepare("UPDATE product_prices SET row_json=? WHERE id='offer-cg-15558'").run(JSON.stringify(offer));
    expect(await (await f.create()).readCanonicalProductIdForProductId('cg-15558')).toBeNull();
    expect(f.sql).toHaveLength(4);
  });
  it('canónico por ID ausente/sin clave no lee cohort, pero confirma generación antes de devolver null', async () => {
    const f = fixture(), reader = await f.create();
    expect(await reader.readCanonicalProductIdForProductId('missing')).toBeNull();
    expect(f.sql).toHaveLength(3); expect(f.sql.some(sql => sql.includes('WHERE category=?'))).toBe(false);
    f.changeProduct('gpu-a', { canonical_product_key: null });
    // GPU deriva su clave exacta del título; una categoría sin derivación conserva null.
    f.db.prepare("UPDATE products SET category='perifericos',row_json=json_set(row_json,'$.category','perifericos') WHERE id='gpu-a'").run();
    const before = f.sql.length;
    expect(await reader.readCanonicalProductIdForProductId('gpu-a')).toBeNull();
    expect(f.sql.slice(before)).toHaveLength(3);
    expect(f.sql.slice(before).some(sql => sql.includes('WHERE category=?'))).toBe(false);
    await expect(reader.readCanonicalProductIdForProductId('')).rejects.toThrow('CATALOG_PRODUCT_ID_INVALID');
  });
  it('canónico por ID descarta carrera de generación primaria incluso al devolver null', async () => {
    for (const id of ['cg-15558', 'missing']) {
      const f = fixture(), reader = await f.create(), original = f.adapter.first;
      f.adapter.first = async (query, values) => {
        const result = await original(query, values);
        if (query.includes('WHERE p.id=?')) f.write('snapshot', { ...f.snapshot, cache: { generation: 'raced' } });
        return result;
      };
      await expect(reader.readCanonicalProductIdForProductId(id)).rejects.toThrow('CATALOG_PRODUCTION_GENERATION_CHANGED');
    }
  });
  it('canónico por ID rechaza cohort de201 antes de elegir una agrupación truncada', async () => {
    const f = fixture();
    f.db.exec(`WITH RECURSIVE n(i) AS(VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<199)
      INSERT INTO products SELECT 'extra-'||i,category,catalog_identity,catalog_name,catalog_document,catalog_component,
        grouped_identity,last_scraped_at,updated_at,json_set(row_json,'$.id','extra-'||i)
        FROM products,n WHERE id='cg-15558'`);
    const counted = { ...f.snapshot.counts, products: 205 };
    f.write('snapshot', { ...f.snapshot, counts: counted, catalog: { ...f.snapshot.catalog, counts: counted } });
    f.write('production_catalog', { ...f.manifest, counts: counted });
    await expect((await f.create()).readCanonicalProductIdForProductId('cg-15558')).rejects.toThrow('CATALOG_DETAIL_RELATED_LIMIT');
    expect(f.sql).toHaveLength(3); expect(f.sql.at(-1)).toContain('LIMIT 201');
  });
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


async function preparedFixture() {
  const f = fixture();
  const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const publicKey = btoa(String.fromCharCode(...rawKey));
  const keyId = await preparedProductPublicKeyId(rawKey);
  f.db.exec('CREATE TABLE catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT NOT NULL) WITHOUT ROWID');
  for (const stored of f.db.prepare('SELECT id,row_json FROM products ORDER BY id').all()) {
    const raw = JSON.parse(String(stored.row_json));
    raw.product_prices = f.db.prepare('SELECT row_json FROM product_prices WHERE product_id=? ORDER BY price,store_id,url')
      .all(String(stored.id)).map(row => JSON.parse(String(row.row_json)));
    const unsigned = await prepareUnsignedProduct(raw, CATALOG_PREPARED_POLICY);
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey,
      preparedProductSignatureMessage(unsigned)))));
    f.db.prepare('INSERT INTO catalog_prepared_products VALUES(?,?)').run(String(stored.id), JSON.stringify([unsigned.payload, signature]));
  }
  const snapshot = { ...f.snapshot, prepared_views: { version: 1, storageVersion: 2, ready: true, policy: CATALOG_PREPARED_POLICY, keyId, count: 6 } };
  f.write('snapshot', snapshot);
  const create = (cache?: D1PageCacheStorage) => createD1CatalogReader(f.adapter,
    { expectedCatalogFingerprint: fingerprint, now: () => Date.now(), pageCache: cache, prepared: { publicKey } });
  return { ...f, snapshot, create, publicKey };
}

describe('páginas D1 preparadas con firma y política compilada', () => {
  it('conserva página semántica y estadísticas, sin divulgar el transporte preparado', async () => {
    const f = await preparedFixture();
    for (const input of [page, { ...page, category: 'memoria-ram' as const }, { ...page, query: 'RTX' },
      { ...page, storeIds: ['compragamer'] }, { ...page, onlyCurrentOffers: false }]) {
      const legacy = await (await createD1CatalogReader(f.adapter, { expectedCatalogFingerprint: fingerprint })).readProductsPage(input);
      const prepared = await (await f.create()).readProductsPage(input);
      expect(JSON.parse(JSON.stringify(prepared))).toEqual(JSON.parse(JSON.stringify(legacy)));
      expect(prepared).not.toHaveProperty('preparedRecords');
    }
    expect(f.sql.some(sql => sql.includes('LEFT JOIN catalog_prepared_products'))).toBe(true);
  });
  it('desactivado no consulta la tabla preparada', async () => {
    const f = fixture();
    await (await f.create()).readProductsPage(page);
    expect(f.sql.some(sql => sql.includes('catalog_prepared_products'))).toBe(false);
  });
  it('rechaza manifiesto ausente, política cambiada, clave equivocada y conteo incompleto', async () => {
    for (const patch of [null, { policy: 'f'.repeat(64) }, { keyId: 'f'.repeat(64) }, { storageVersion: 1 }, { count: 5 }, { ready: false }]) {
      const f = await preparedFixture();
      f.write('snapshot', { ...f.snapshot, prepared_views: patch === null ? null : { ...f.snapshot.prepared_views, ...patch } });
      await expect(f.create()).rejects.toThrow('CATALOG_PREPARED_MANIFEST_INVALID');
    }
    const f = fixture();
    await expect(createD1CatalogReader(f.adapter, { expectedCatalogFingerprint: fingerprint, prepared: { publicKey: '' } }))
      .rejects.toThrow('CATALOG_PREPARED_CONFIGURATION_INVALID');
  });
  it('rechaza firma alterada, oferta modificada o registro faltante sin devolver una página parcial', async () => {
    for (const kind of ['signature', 'price', 'missing']) {
      const f = await preparedFixture();
      if (kind === 'signature') {
        for (const row of f.db.prepare('SELECT product_id,envelope_json FROM catalog_prepared_products').all()) {
          const envelope = JSON.parse(String(row.envelope_json));
          envelope[1] = (envelope[1][0] === 'A' ? 'B' : 'A') + envelope[1].slice(1);
          f.db.prepare('UPDATE catalog_prepared_products SET envelope_json=? WHERE product_id=?').run(JSON.stringify(envelope), String(row.product_id));
        }
      }
      if (kind === 'price') f.db.exec("UPDATE product_prices SET row_json=json_set(row_json,'$.price',1) WHERE product_id='gpu-a'");
      if (kind === 'missing') f.db.exec("DELETE FROM catalog_prepared_products WHERE product_id='gpu-a'");
      await expect((await f.create()).readProductsPage(page)).rejects.toThrow(kind === 'missing'
        ? 'CATALOG_PREPARED_RECORD_REQUIRED' : kind === 'price' ? 'PREPARED_PRODUCT_SOURCE' : 'PREPARED_PRODUCT_SIGNATURE');
    }
  });
  it('rechaza ofertas vencidas durante la hidratación y cambio de generación primaria', async () => {
    for (const kind of ['clock', 'generation']) {
      const f = await preparedFixture(), reader = await f.create(), original = f.adapter.all;
      f.adapter.all = async (query, values) => {
        const rows = await original(query, values);
        if (query.includes('prepared.envelope_json')) {
          if (kind === 'clock') vi.setSystemTime(now + 25 * 3600000);
          else f.write('snapshot', { ...f.snapshot, raced: true });
        }
        return rows;
      };
      await expect(reader.readProductsPage(page)).rejects.toThrow(kind === 'clock'
        ? 'CATALOG_CLOCK_INTERVAL_EXPIRED' : 'CATALOG_PRODUCTION_GENERATION_CHANGED');
    }
  });
});


describe('reloj final sin caché o con caché excluida por rango', () => {
  it.each([false, true])('rechaza vencimiento durante último marcador primario; preparado=%s', async signed => {
    for (const cached of [false, true]) {
      const f = signed ? await preparedFixture() : fixture();
      const reader = await f.create(cached ? memoryCache() : undefined), original = f.adapter.first;
      f.adapter.first = async (query, values) => {
        const result = await original(query, values);
        if (query.includes("key='production_catalog'")) vi.setSystemTime(Date.parse(f.stamp) + 24 * 3600000 + 1);
        return result;
      };
      await expect(reader.readProductsPage({ ...page, ...(cached ? { minPrice: 1 } : {}) }))
        .rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
      vi.setSystemTime(now);
    }
  });
  it('protege totales cuando vence una oferta fuera de la página hidratada', async () => {
    const f = fixture();
    const stamp = new Date(now - 24 * 3600000 + 5).toISOString();
    f.db.prepare("UPDATE price_basis SET observed_at=? WHERE id='offer-gpu-b'").run(stamp);
    f.db.prepare("UPDATE product_prices SET row_json=json_set(row_json,'$.last_updated',?) WHERE id='offer-gpu-b'").run(stamp);
    const reader = await f.create(), original = f.adapter.first;
    f.adapter.first = async (query, values) => {
      const result = await original(query, values);
      if (query.includes("key='production_catalog'")) vi.setSystemTime(now + 6);
      return result;
    };
    await expect(reader.readProductsPage({ ...page, category: 'tarjetas-graficas', pageSize: 1, sortBy: 'price-asc' }))
      .rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
  });
});


describe('política de tiendas durante la lectura y la caché', () => {
  it('no entrega un HIT guardado bajo otro host y rechaza cambios durante el último marcador', async () => {
    const f = await cacheFixture(), storage = memoryCache();
    const reader = await f.create(storage);
    await reader.readProductsPage({ ...page, category: 'tarjetas-graficas' });
    const venex = stores.find(store => store.id === 'venex')!, old = venex.url;
    const original = f.adapter.first;
    f.adapter.first = async (query, values) => {
      const result = await original(query, values);
      if (query.includes("key='production_catalog'")) venex.url = 'https://different.example';
      return result;
    };
    try {
      await expect(reader.readProductsPage({ ...page, category: 'tarjetas-graficas' }))
        .rejects.toThrow('CATALOG_STORE_POLICY_CHANGED');
    } finally { venex.url = old; }
  });
});


describe('transiciones fuera de página e históricas', () => {
  it('rechaza la entrada futura de un producto fuera de la página', async () => {
    const f = fixture(), stamp = new Date(now + 60001).toISOString();
    f.db.prepare("UPDATE price_basis SET observed_at=? WHERE id='offer-gpu-b'").run(stamp);
    f.db.prepare("UPDATE product_prices SET row_json=json_set(row_json,'$.last_updated',?) WHERE id='offer-gpu-b'").run(stamp);
    const reader = await f.create(), original = f.adapter.first;
    f.adapter.first = async (query, values) => { const result = await original(query, values);
      if (query.includes("key='production_catalog'")) vi.setSystemTime(now + 2); return result; };
    await expect(reader.readProductsPage({ ...page, category: 'tarjetas-graficas', pageSize: 1, sortBy: 'price-asc' }))
      .rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
  });
  it('rechaza cambio del representante histórico de una tienda sin basis current', async () => {
    const f = fixture(), observed = new Date(now - 24 * 3600000 + 10).toISOString();
    f.db.exec("DELETE FROM price_basis WHERE kind='current'");
    const offer = JSON.parse(String(f.db.prepare("SELECT row_json FROM product_prices WHERE product_id='gpu-a'").get()!.row_json));
    offer.stock = 'unknown'; offer.last_updated = observed;
    f.db.prepare("UPDATE product_prices SET row_json=? WHERE product_id='gpu-a'").run(JSON.stringify(offer));
    f.db.prepare("UPDATE price_basis SET stock='unknown',observed_at=? WHERE product_id='gpu-a'").run(observed);
    const older = { ...offer, id: 'older-gpu-a', price: 100000, last_updated: new Date(now - 25 * 3600000).toISOString() };
    f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(older.id, 'gpu-a', older.store_id, older.price, older.url, JSON.stringify(older));
    f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('gpu-a', 'historical', older.id, older.store_id, older.price, older.stock, older.url, older.last_updated);
    const counts = { ...f.snapshot.counts, product_prices: 7 };
    f.write('snapshot', { ...f.snapshot, counts, catalog: { ...f.snapshot.catalog, counts } });
    f.write('production_catalog', { ...f.manifest, counts });
    const reader = await f.create(), original = f.adapter.first;
    f.adapter.first = async (query, values) => { const result = await original(query, values);
      if (query.includes("key='production_catalog'")) vi.setSystemTime(now + 11); return result; };
    await expect(reader.readProductsPage({ ...page, query: 'RTX 4060', onlyCurrentOffers: false }))
      .rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
  });
});


it('cubre la oferta futura que todavía no gana ni integra el histórico certificado', async () => {
  const f = fixture();
  f.db.exec("DELETE FROM price_basis WHERE kind='current'");
  const old = JSON.parse(String(f.db.prepare("SELECT row_json FROM product_prices WHERE product_id='gpu-a'").get()!.row_json));
  old.stock = 'unknown'; old.price = 200000;
  f.db.prepare("UPDATE product_prices SET row_json=? WHERE product_id='gpu-a'").run(JSON.stringify(old));
  const future = { ...old, id: 'future-gpu-a', price: 100000, last_updated: new Date(now + 60001).toISOString() };
  f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(future.id, 'gpu-a', future.store_id, future.price, future.url, JSON.stringify(future));
  const counts = { ...f.snapshot.counts, product_prices: 7 };
  f.write('snapshot', { ...f.snapshot, counts, catalog: { ...f.snapshot.catalog, counts } });
  f.write('production_catalog', { ...f.manifest, counts });
  const reader = await f.create(), original = f.adapter.first;
  f.adapter.first = async (query, values) => { const result = await original(query, values);
    if (query.includes("key='production_catalog'")) vi.setSystemTime(now + 2); return result; };
  await expect(reader.readProductsPage({ ...page, query: 'RTX 4060', onlyCurrentOffers: false }))
    .rejects.toThrow('CATALOG_CLOCK_INTERVAL_EXPIRED');
});


it('no entrega caché preparada si el registro cambia nombre o descriptor después de guardarla', async () => {
  for (const kind of ['name','descriptor']) {
    const f = await cacheFixture(), storage = memoryCache(), reader = await f.create(storage);
    await reader.readProductsPage({ ...page, category: 'tarjetas-graficas' });
    const venex = stores.find(store => store.id === 'venex')!, old = Object.getOwnPropertyDescriptor(venex, 'name')!;
    let called=0;
    if(kind==='name')venex.name='Otra tienda';
    else Object.defineProperty(venex,'name',{get(){called++;return 'Otra tienda';},configurable:true,enumerable:true});
    try {
      await expect(reader.readProductsPage({ ...page, category: 'tarjetas-graficas' })).rejects.toThrow('PREPARED_PRODUCT_REGISTRY');
      expect(called).toBe(0);
    }finally {Object.defineProperty(venex,'name',old);}
  }
});


describe('listas y guías sobre el catálogo certificado', () => {
  it('lee la lista paginada con precios actuales y conserva el límite de consumidor', async () => {
    const f = fixture(), reader = await f.create();
    const products = await reader.readProducts({ category: 'memoria-ram', limit: 2, sortBy: 'newest' });
    expect(products).toHaveLength(2);
    expect(products.every(product => product.category === 'memoria-ram' && product.lowestPrice > 0)).toBe(true);
  });
  it('exige el modelo y descarta kits incompatibles antes del límite editorial', async () => {
    const f = fixture(), reader = await f.create();
    const products = await reader.readGuideCandidates('memoria-ram', 1, 'corsair vengeance',
      { name: 'Corsair DDR4 16GB 3200MHz 1 módulo CL16', exactModel: 'Vengeance RGB RS' });
    expect(products).toHaveLength(1);
    expect(products[0].name).toContain('Vengeance RGB RS');
    expect(products[0].name).not.toContain('DDR5');
    expect(await reader.readGuideCandidates('memoria-ram', 8, '%,()')).toEqual([]);
  });
  it('no sirve una guía con una generación cambiada durante la lectura', async () => {
    const f = fixture(), all = f.adapter.all;
    f.adapter.all = async (query, values) => {
      const result = await all(query, values);
      if (query.includes('JOIN summaries s')) f.write('production_catalog', { ...f.manifest, complete: false });
      return result;
    };
    const reader = await f.create();
    await expect(reader.readGuideCandidates('memoria-ram', 1, 'corsair')).rejects.toThrow('CATALOG_PRODUCTION_MANIFEST_INVALID');
  });
});

it('ofertas recientes leen observaciones reales y excluyen stock desconocido y ventana de tres horas vencida', async () => {
  const f = fixture(), reader = await f.create();
  const before = await reader.readRecentProducts('memoria-ram');
  expect(before.length).toBeGreaterThan(0);
  expect(before.every(product => product.prices.every(offer => offer.lastUpdated.getTime() >= now - 3 * 3600000))).toBe(true);
  for (const id of ['offer-cg-15558', 'offer-agrupado-rgb']) {
    const raw = JSON.parse(String(f.db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(id)!.row_json));
    f.db.prepare('UPDATE product_prices SET row_json=? WHERE id=?').run(JSON.stringify({ ...raw, stock: 'unknown' }), id);
  }
  expect((await reader.readRecentProducts('memoria-ram')).some(product => product.name.includes('RGB RS'))).toBe(false);
  vi.setSystemTime(now + 4 * 3600000);
  expect(await reader.readRecentProducts()).toEqual([]);
});

it('sitemap conserva dos tiendas, deduplica clave canónica y ordena fechas nulas como PostgreSQL', async () => {
  const f = fixture();
  const original = JSON.parse(String(f.db.prepare('SELECT row_json FROM products WHERE id=?').get('agrupado-rgb')!.row_json));
  const duplicate = { ...original, id: 'agrupado-rgb-new' };
  f.db.prepare(`INSERT INTO products SELECT ?,category,catalog_identity,catalog_name,catalog_document,catalog_component,
    grouped_identity,last_scraped_at,NULL,? FROM products WHERE id='agrupado-rgb'`).run(duplicate.id, JSON.stringify(duplicate));
  f.db.prepare(`INSERT INTO summaries SELECT ?,lowest,highest,average,available,urls,portable_listing,store_ids_json,
    comparable_stats_json,comparable_valid_until,comparable_latest_observed_at,row_json FROM summaries WHERE product_id='agrupado-rgb'`).run(duplicate.id);
  for (const [id, productId, storeId, stock] of [
    ['new-cg', duplicate.id, 'compragamer', 'in-stock'],
    ['new-venex', duplicate.id, 'venex', 'unknown'],
    ['old-venex', original.id, 'venex', 'unknown'],
  ]) {
    const offer = { id, product_id: productId, store_id: storeId, price: 200000, url: 'https://www.venex.com.ar/fixture', stock };
    f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id, productId, storeId, offer.price, offer.url, JSON.stringify(offer));
  }
  const counts = { ...f.snapshot.counts, products: 7, catalog_price_summaries: 7, product_prices: 9 };
  f.write('snapshot', { ...f.snapshot, counts, catalog: { ...f.snapshot.catalog, counts } });
  f.write('production_catalog', { ...f.manifest, counts });
  const reader = await f.create();
  expect(await reader.readIndexableCount()).toBe(1);
  expect(await reader.readIndexablePage(0, 1)).toEqual([{ id: duplicate.id, updated_at: null, canonical_product_key: original.canonical_product_key }]);
  expect(await reader.readIndexablePage(1, 1)).toEqual([]);
  await expect(reader.readIndexablePage(0, 1001)).rejects.toThrow('CATALOG_SITEMAP_PAGE_INVALID');
});

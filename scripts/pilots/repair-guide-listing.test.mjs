import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire, Module } from 'node:module';
import { buildSync } from 'esbuild';
import { sqliteAdapter } from './cloudflare-catalog/sqlite-adapter.mjs';

// Funciones reales compiladas en memoria; la prueba no escribe módulos ni llama la red.
const root = resolve(import.meta.dirname, '../..'), require = createRequire(import.meta.url);
const compiled = buildSync({ stdin: { contents: `
  export * from './scripts/pilots/cloudflare-catalog/repair-guide-listing';
  export { canRefreshLocalTarget } from './scripts/pilots/cloudflare-catalog/refresh-local';
  export { reviewLocalObservation } from './scripts/pilots/cloudflare-catalog/refresh-local';
  export { createD1CatalogReader } from './src/lib/catalog/d1-catalog-reader';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  tsconfig: join(root, 'tsconfig.json') }).outputFiles[0].text;
const memoryModule = new Module(join(root, 'scripts/pilots/guide-listing-test-memory.cjs'));
memoryModule.paths = Module._nodeModulePaths(root); memoryModule.require = require; memoryModule._compile(compiled, memoryModule.id);
const { repairGuideListing, guideListingFileSha256, guideListingOfferRowSha256, GUIDE_LISTING_REPAIR: c,
  canRefreshLocalTarget, reviewLocalObservation, createD1CatalogReader } = memoryModule.exports;
const now = Date.parse('2026-10-14T05:00:00Z'), old = '2026-10-11T05:12:32.844Z';
function fixture(t, { queueStatus = 'failed', leaseUntil = now - 1, trigger } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'guide-listing-repair-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.sqlite'), target = join(dir, 'stage.sqlite');
  const evidencePath = join(dir, 'evidence.json'), feedPath = join(dir, 'feed.json');
  writeFileSync(evidencePath, JSON.stringify({ rows: [{ slot: 'motherboard', id: c.productId, listingId: 17076,
    name: c.title, mpnOrPublishedSKU: c.sku, url: c.url, pageVerified: true, fetchedAt: '2026-10-14T03:55:13.629Z',
    checkedAtWindow: { from: '2026-10-14T03:55:11.320Z', to: '2026-10-14T04:04:09.887Z' },
    specialPriceARS: 188985, stockRaw: 10, vendible: 1 }] }));
  writeFileSync(feedPath, JSON.stringify({ motherboard: { id_producto: 17076, nombre: c.title,
    codigo_principal: ['SKU: ' + c.sku], precioEspecial: 188985, stock: 10, vendible: 1 } }));
  const db = new DatabaseSync(source);
  db.exec(readFileSync(join(root, 'scripts/pilots/cloudflare-catalog/schema.sql'), 'utf8'));
  db.exec(readFileSync(join(root, 'scripts/pilots/cloudflare-catalog/projection.sql'), 'utf8'));
  db.exec(`CREATE TABLE pilot_offer_observations(offer_id TEXT,observed_at TEXT,row_json TEXT,PRIMARY KEY(offer_id,observed_at));
    CREATE TABLE pilot_refresh_demand(offer_id TEXT PRIMARY KEY,product_id TEXT,store_id TEXT,url TEXT,status TEXT,
      attempts INTEGER,due_at INTEGER,last_error TEXT,lease_token TEXT,lease_until INTEGER);
    CREATE TABLE catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT);`);
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts: {}, catalog: {},
    cache: { validUntil: '2999-01-01T00:00:00Z' }, prepared_views: { ready: true }, clock_observations: { ready: true }, projectionVersion: 1 }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', '{"complete":true}');
  const grouped = { id: c.groupedProductId, category: c.category, name: c.groupedTitle, specs: {}, image: 'group-image', created_at: old, updated_at: old,
    lowest_price: 100, highest_price: 200, average_price: 150 };
  for (const raw of [grouped, { id: 'untouched', name: 'Ryzen 7600', category: 'procesadores', specs: {}, created_at: old, updated_at: old,
    lowest_price: 100, highest_price: 200, average_price: 150 }]) {
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(raw.id, raw.category, raw.name, raw.name, raw.name,
      1, Number(raw.id === c.groupedProductId), old, old, JSON.stringify(raw));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(raw.id, raw.name);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(raw.id, 100, 200, 150, 6, '', 0, '[]', '{}', old, old, '{}');
    db.prepare('INSERT INTO search_projection VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(raw.id, raw.category, raw.name, 1, 100, 200, 150, 6, 6, '', old, old);
    db.prepare('INSERT INTO catalog_prepared_products VALUES(?,?)').run(raw.id, 'signed-old');
  }
  for (let i = 0; i < 6; i++) {
    const id = i === 0 ? c.offerId : 'sibling-' + i, store = i === 0 ? 'compragamer' : 'store-' + i;
    const raw = { id, product_id: c.groupedProductId, store_id: store, price: 211400 + i, stock: 'in-stock',
      last_updated: old, updated_at: old, created_at: old, url: c.url + (i ? '-sibling-' + i : ''),
      identity_review: { status: 'consistent' }, state_signature: 'old-state',
      source_identity: i ? null : { title: c.title, storeSku: c.sku, listingRef: 'compragamer:id:17076' } };
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id, c.groupedProductId, store, raw.price, raw.url, JSON.stringify(raw));
    for (const kind of ['current', 'historical']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(c.groupedProductId, kind, id, store, raw.price, raw.stock, raw.url, old);
    db.prepare('INSERT INTO pilot_offer_observations VALUES(?,?,?)').run(id, old, JSON.stringify(raw));
    db.prepare('INSERT INTO pilot_refresh_demand VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, c.groupedProductId, store, raw.url,
      queueStatus, 4, now + 200000, 'http-429', 'lease-old', leaseUntil);
  }
  if (trigger) db.exec(trigger);
  const row = db.prepare('SELECT * FROM product_prices WHERE id=?').get(c.offerId);
  db.close();
  const options = { now, evidencePath, feedPath, expectedSourceSha256: guideListingFileSha256(source),
    expectedOfferRowSha256: guideListingOfferRowSha256(row), evidenceSha256: guideListingFileSha256(evidencePath), feedSha256: guideListingFileSha256(feedPath) };
  return { source, target, options, row, dir };
}
function reopen(t, path) { const db = new DatabaseSync(path, { readOnly: true }); t.after(() => db.close()); return db; }

test('copia aislada: crea específico, mueve sólo oferta, conserva cinco hermanos e historia, no inventa observación', t => {
  const f = fixture(t), result = repairGuideListing(f.source, f.target, f.options), db = reopen(t, f.target);
  assert.equal(guideListingFileSha256(f.source), f.options.expectedSourceSha256);
  assert.deepEqual(result.protectedBefore, result.protectedAfter);
  assert.deepEqual(result.membership, { groupedBefore: 6, groupedAfter: 5, specificBefore: 0, specificAfter: 1 });
  assert.deepEqual(result.afterCounts, { products: 3, product_prices: 6, price_basis: 10, summaries: 3 });
  const product = JSON.parse(db.prepare('SELECT row_json FROM products WHERE id=?').get(c.productId).row_json);
  assert.equal(product.name, c.title); assert.equal(product.specs.SKU, c.sku); assert.equal(product.image, undefined);
  assert.equal(product.last_scraped_at, undefined);
  assert.equal(product.created_at, new Date(now).toISOString()); assert.equal(product.updated_at, new Date(now).toISOString());
  const storedProduct = db.prepare('SELECT last_scraped_at,updated_at FROM products WHERE id=?').get(c.productId);
  assert.equal(storedProduct.last_scraped_at, null); assert.equal(storedProduct.updated_at, product.updated_at);
  const saved = JSON.parse(db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(c.offerId).row_json);
  assert.deepEqual(saved, { ...JSON.parse(f.row.row_json), product_id: c.productId, identity_review: null, state_signature: null });
  assert.equal(saved.price, 211400); assert.equal(saved.last_updated, old);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pilot_offer_observations').get().n, 6);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=?').get(c.offerId).n, 0);
  const queue = db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(c.offerId);
  assert.equal(queue.product_id, c.productId); assert.equal(queue.attempts, 4); assert.equal(queue.due_at, now + 200000); assert.equal(queue.last_error, 'http-429');
  assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(), undefined);
  const marker = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);
  for (const key of ['catalog', 'counts', 'prepared_views', 'clock_observations', 'cache', 'projectionVersion']) assert.equal(marker[key], undefined);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='catalog_prepared_products'").get(), undefined);
  assert.equal(canRefreshLocalTarget('compragamer', c.url, c.category, c.groupedTitle, {}), false);
  assert.equal(canRefreshLocalTarget('compragamer', c.url, c.category, product.name, product.specs), true);
  assert.equal(result.httpRequests, 0); assert.equal(result.remoteRowsWritten, 0); assert.equal(result.requiresRecertification, true);
});
test('contrato D1 real: ficha reparada resuelve detalle/candidatos con fechas de creación sin rejuvenecer oferta', async t => {
  const f = fixture(t); repairGuideListing(f.source, f.target, f.options);
  const db = new DatabaseSync(f.target); t.after(() => db.close());
  db.prepare('INSERT INTO stores VALUES(?,?)').run('compragamer', JSON.stringify({ id: 'compragamer', name: 'CompraGamer' }));
  // Sólo controlplane de fixture: habilitar lectura con manifiesto y resumen histórico.
  // No representa certificación de una candidata real ni elegibilidad de una oferta.
  const counts = { products: 3, product_prices: 6, catalog_price_summaries: 3, stores: 1 }, fingerprint = 'b'.repeat(64);
  const catalog = { version: 1, fingerprint, counts };
  db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({ counts, catalog }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ ...catalog, complete: true, countsVerified: true }));
  db.prepare('UPDATE summaries SET lowest=? WHERE product_id=?').run(211400, c.productId);
  const reader = await createD1CatalogReader(sqliteAdapter(db), { expectedCatalogFingerprint: fingerprint, now: () => now });
  const detail = await reader.readProductDetailById(c.productId);
  assert.equal(detail.id, c.productId);
  assert.equal(detail.createdAt.toISOString(), new Date(now).toISOString());
  assert.equal(detail.updatedAt.toISOString(), new Date(now).toISOString());
  assert.equal(detail.lastScrapedAt, undefined);
  assert.equal(detail.prices.length, 1); assert.equal(detail.prices[0].lastUpdated.toISOString(), old);
  assert.equal(detail.prices[0].price, 211400);
  const candidates = await reader.readGuideCandidates(c.category, 24, 'MSI B650M GAMING WIFI');
  const candidate = candidates.find(product => product.id === c.productId);
  assert.ok(candidate); assert.equal(candidate.createdAt.toISOString(), new Date(now).toISOString());
  assert.equal(candidate.prices[0].lastUpdated.toISOString(), old);
  // Reproduce el defecto anterior pasando por parseProduct real, sin exportar ni sustituir el parser.
  const validRow = db.prepare('SELECT row_json FROM products WHERE id=?').get(c.productId).row_json;
  for (const requiredDate of ['created_at', 'updated_at']) {
    const invalid = JSON.parse(validRow); delete invalid[requiredDate];
    db.prepare('UPDATE products SET row_json=? WHERE id=?').run(JSON.stringify(invalid), c.productId);
    await assert.rejects(reader.readProductDetailById(c.productId), /CATALOG_PRODUCT_INVALID/);
    await assert.rejects(reader.readGuideCandidates(c.category, 24, 'MSI B650M GAMING WIFI'), /CATALOG_PRODUCT_INVALID/);
  }
});
test('lector real admite sólo observación posterior exacta y rechaza SKU/variante distintos', t => {
  const f = fixture(t); repairGuideListing(f.source, f.target, f.options);
  const db = reopen(t, f.target), product = JSON.parse(db.prepare('SELECT row_json FROM products WHERE id=?').get(c.productId).row_json);
  const lease = { offerId: c.offerId, productId: c.productId, storeId: 'compragamer', url: c.url, leasedAt: now, observedAt: old };
  const source = { id: c.productId, name: c.title, category: c.category, specs: { SKU: c.sku }, prices: [{ storeId: 'compragamer', url: c.url, price: 188985, stock: 'in-stock', lastUpdated: new Date(now + 1) }] };
  assert.equal(reviewLocalObservation(product, lease, source, now + 2).price, 188985);
  assert.throws(() => reviewLocalObservation(product, lease, { ...source, name: c.title + ' II' }, now + 2), /IDENTITY/);
  assert.throws(() => reviewLocalObservation(product, lease, { ...source, specs: { SKU: c.sku + ' II' } }, now + 2), /IDENTITY/);
  assert.throws(() => reviewLocalObservation(product, lease, { ...source, prices: [{ ...source.prices[0], lastUpdated: new Date(old) }] }, now + 2), /NO_OBSERVATION/);
});
test('precondiciones: hash fuente/fila/evidencia, ventana futura y lease activo fallan antes de copiar', t => {
  for (const field of ['expectedSourceSha256', 'expectedOfferRowSha256', 'evidenceSha256', 'feedSha256']) {
    const f = fixture(t);
    assert.throws(() => repairGuideListing(f.source, f.target, { ...f.options, [field]: '0'.repeat(64) }), /HASH|PRECONDITION/);
    assert.equal(existsSync(f.target), false);
  }
  const active = fixture(t, { queueStatus: 'leased', leaseUntil: now + 1 });
  assert.throws(() => repairGuideListing(active.source, active.target, active.options), /LEASE_ACTIVE/);
  assert.equal(existsSync(active.target), false);
  const future = fixture(t);
  assert.throws(() => repairGuideListing(future.source, future.target, { ...future.options, now: now - 3600000 }), /EVIDENCE_IDENTITY/);
});
test('evidencia modificada aunque su nuevo hash esté fijado no reasocia otra variante', t => {
  const f = fixture(t), feed = JSON.parse(readFileSync(f.options.feedPath, 'utf8'));
  feed.motherboard.codigo_principal = ['SKU: B650M GAMING PLUS WIFI'];
  writeFileSync(f.options.feedPath, JSON.stringify(feed));
  assert.throws(() => repairGuideListing(f.source, f.target, { ...f.options, feedSha256: guideListingFileSha256(f.options.feedPath) }), /EVIDENCE_IDENTITY/);
  assert.equal(existsSync(f.target), false);
});
test('lease expirado concilia sólo identidad y conserva backoff', t => {
  const f = fixture(t, { queueStatus: 'leased' }); repairGuideListing(f.source, f.target, f.options);
  const db = reopen(t, f.target), queue = db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(c.offerId);
  assert.equal(queue.status, 'pending'); assert.equal(queue.lease_token, null); assert.equal(queue.lease_until, null);
  assert.equal(queue.attempts, 4); assert.equal(queue.due_at, now + 200000);
  assert.equal(db.prepare("SELECT status FROM pilot_refresh_demand WHERE offer_id='sibling-1'").get().status, 'leased');
});
test('atomicidad: fallo SQL después de insertar producto hace rollback y deja copia sin certificado', t => {
  const f = fixture(t, { trigger: `CREATE TRIGGER reject_move BEFORE UPDATE ON product_prices BEGIN SELECT RAISE(ABORT,'injected failure'); END;` });
  assert.throws(() => repairGuideListing(f.source, f.target, f.options), /injected failure/);
  const db = reopen(t, f.target);
  assert.equal(db.prepare('SELECT * FROM products WHERE id=?').get(c.productId), undefined);
  assert.deepEqual({ ...db.prepare('SELECT * FROM product_prices WHERE id=?').get(c.offerId) }, { ...f.row });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM price_basis').get().n, 12);
  assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(), undefined);
  assert.equal(guideListingFileSha256(f.source), f.options.expectedSourceSha256);
});
test('hashes detectan mutación indirecta de otras ofertas y revierten todo', t => {
  const f = fixture(t, { trigger: `CREATE TRIGGER change_sibling AFTER UPDATE ON product_prices WHEN new.id='${c.offerId}' BEGIN UPDATE product_prices SET price=1 WHERE id='sibling-1'; END;` });
  assert.throws(() => repairGuideListing(f.source, f.target, f.options), /UNTOUCHED_CHANGED/);
  const db = reopen(t, f.target);
  assert.equal(db.prepare("SELECT price FROM product_prices WHERE id='sibling-1'").get().price, 211401);
  assert.equal(db.prepare('SELECT * FROM products WHERE id=?').get(c.productId), undefined);
});
test('mutación indirecta de precio en la oferta seleccionada también revierte', t => {
  const f = fixture(t, { trigger: `CREATE TRIGGER change_target AFTER UPDATE OF product_id ON product_prices BEGIN UPDATE product_prices SET price=1 WHERE id=new.id; END;` });
  assert.throws(() => repairGuideListing(f.source, f.target, f.options), /RESULT_CHANGED/);
  const db = reopen(t, f.target);
  assert.deepEqual({ ...db.prepare('SELECT * FROM product_prices WHERE id=?').get(c.offerId) }, { ...f.row });
});
test('reinicio cerrado: destino existente y origen ya reparado se rechazan sin cambiarlo', t => {
  const f = fixture(t); repairGuideListing(f.source, f.target, f.options);
  const hash = guideListingFileSha256(f.target);
  assert.throws(() => repairGuideListing(f.source, f.target, f.options), /NEW_COPY_REQUIRED/);
  const next = join(f.dir, 'replay.sqlite');
  assert.throws(() => repairGuideListing(f.target, next, { ...f.options, expectedSourceSha256: hash }), /PRECONDITION_PRODUCT/);
  assert.equal(existsSync(next), false); assert.equal(guideListingFileSha256(f.target), hash);
});

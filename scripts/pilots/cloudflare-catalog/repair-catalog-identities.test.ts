import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repairCatalogIdentities, CATALOG_IDENTITY_REPAIR_ALLOWLIST } from './repair-catalog-identities';
import { catalogIdentityText, catalogSearchText } from './catalog-matchers.mjs';
const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const { searchCatalog } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/engine.mjs')).href);
const { sqliteAdapter } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs')).href);
const fixtureRows = JSON.parse(readFileSync('src/lib/catalog/catalog-audit-regression.fixture.json', 'utf8')).products;
const now = Date.parse('2026-10-14T02:00:00Z');
function fixture(t: TestContext) {
  const directory = mkdtempSync(tmpdir() + '/repair-catalog-identities-');
  const source = directory + '/source.sqlite', target = directory + '/staged.sqlite';
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(source);
  db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql', 'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts: {}, hashes: {},
    prepared_views: { ready: true }, clock_observations: { ready: true } }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ complete: true }));
  db.exec('CREATE TABLE catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT);');
  db.prepare('INSERT INTO catalog_prepared_products VALUES(?,?)').run('cg-22251', 'obsolete-envelope');
  for (const product of fixtureRows) {
    const raw = { id: product.id, name: product.name, category: product.category, brand: product.brand,
      model: product.model, normalized_title: product.normalizedTitle, canonical_product_key: product.canonicalProductKey,
      variant_key: product.variantKey, family_key: product.familyKey, last_scraped_at: product.lastScrapedAt,
      updated_at: product.updatedAt, specs: product.specs, lowest_price: product.lowestPrice,
      highest_price: product.highestPrice, average_price: product.averagePrice };
    const document = catalogSearchText([raw.name, raw.brand, raw.model, raw.normalized_title,
      raw.family_key, raw.variant_key, raw.canonical_product_key].join(' '));
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(raw.id, raw.category,
      catalogIdentityText(raw.name), catalogSearchText(raw.name), document, 1, 0,
      raw.last_scraped_at, raw.updated_at, JSON.stringify(raw));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(raw.id, document);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(raw.id, raw.lowest_price,
      raw.highest_price, raw.average_price, 1, product.prices.map((offer: { url: string }) => offer.url).join(' '),
      0, JSON.stringify(product.prices.map((offer: { storeId: string }) => offer.storeId)), null, null, null, '{}');
    for (const [index, offer] of product.prices.entries()) {
      const original = { id: `${raw.id}-offer-${index}`, product_id: raw.id, store_id: offer.storeId,
        price: offer.price, url: offer.url, stock: offer.stock, last_updated: offer.lastUpdated,
        price_condition: offer.priceCondition, source_identity: offer.sourceIdentity };
      db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(original.id, raw.id, original.store_id,
        original.price, original.url, JSON.stringify(original));
      db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(raw.id, 'historical', original.id,
        original.store_id, original.price, original.stock, original.url, original.last_updated);
    }
  }
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('untouched', 'procesadores', 'ryzen 7600',
    'ryzen 7600', 'ryzen 7600', 1, 0, null, null, JSON.stringify({ id: 'untouched', name: 'AMD Ryzen 5 7600', category: 'procesadores' }));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('untouched', 0, 0, 0, 0, '', 0, '[]', null, null, null, '{}');
  rebuildProjection(db, { now, generation: 'before' }); db.close();
  return { source, target, directory };
}
function table(db: DatabaseSync, name: string) {
  return db.prepare(`SELECT * FROM ${name}`).all().map(row => JSON.stringify({ ...row })).sort();
}
const options = { now, generation: 'identity-repair-test', rebuildProjection };

test('13 filas reales reparadas en copia nueva: recibo exacto, ofertas e índices conservados', async t => {
  const f = fixture(t), source = new DatabaseSync(f.source, { readOnly: true }); t.after(() => source.close());
  const immutable = ['product_prices', 'price_basis', 'summaries', 'stores'];
  const before = Object.fromEntries(immutable.map(name => [name, table(source, name)]));
  const beforeProducts = table(source, 'products');
  assert.equal((await searchCatalog(sqliteAdapter(source), { p_category: 'procesadores' }, { now })).total, 4);
  const receipt = repairCatalogIdentities(f.source, f.target, options);
  assert.equal(receipt.changedIds.length, 13); assert.equal(receipt.requiresRecertification, true);
  assert.deepEqual(receipt.beforeHashes, receipt.afterHashes);
  const db = new DatabaseSync(f.target, { readOnly: true }); t.after(() => db.close());
  assert.deepEqual(table(source, 'products'), beforeProducts);
  for (const name of immutable) assert.deepEqual(table(db, name), before[name]);
  for (const change of receipt.rows) {
    assert.deepEqual({ ...db.prepare('SELECT * FROM products WHERE id=?').get(change.id) }, change.after);
    const rawBefore = JSON.parse(change.before.row_json), rawAfter = JSON.parse(change.after.row_json);
    for (const field of Object.keys(rawBefore).filter(key => !['category', 'canonical_product_key', 'variant_key'].includes(key)))
      assert.deepEqual(rawAfter[field], rawBefore[field], `${change.id}:${field}`);
    assert.equal(change.after.catalog_identity, catalogIdentityText(rawAfter.name));
    assert.equal(change.after.grouped_identity, Number(change.id.startsWith('agrupado-')));
    assert.deepEqual(db.prepare('SELECT id,document FROM product_substrings WHERE id=?').all(change.id).map(row => ({ ...row })), change.ftsAfter);
  }
  assert.equal(db.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(), undefined);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='catalog_prepared_products'").get(), undefined);
  const snapshot = JSON.parse(String(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()?.value));
  assert.equal(snapshot.prepared_views, undefined); assert.equal(snapshot.clock_observations, undefined);
  assert.ok(receipt.projectionChanges.some(row => row.id === 'maxtecno-api-901942'));
  assert.equal((await searchCatalog(sqliteAdapter(db), { p_category: 'procesadores' }, { now })).total, 1);
  assert.equal((await searchCatalog(sqliteAdapter(db), { p_category: 'memoria-ram' }, { now })).total, 0);
  assert.equal((await searchCatalog(sqliteAdapter(db), { p_category: 'motherboards' }, { now })).products[0].id, 'maxtecno-api-901942');
  for (const [category, first, second] of [
    ['almacenamiento', 'dinobyte-api-2805048', 'dinobyte-api-2903292'],
    ['gabinetes', 'cg-21831', 'cg-21832'], ['refrigeracion', 'cg-22251', 'cg-22252'],
    ['tarjetas-graficas', 'cg-21882', 'cg-20207'],
  ]) {
    const result = await searchCatalog(sqliteAdapter(db), { p_category: category }, { now });
    const pair = result.products.filter((row: { id: string }) => [first, second].includes(row.id));
    assert.equal(pair.length, 2); assert.notEqual(pair[0].variant_key, pair[1].variant_key);
    assert.notEqual(pair[0].canonical_product_key, pair[1].canonical_product_key);
    for (const row of pair) assert.deepEqual(row.product_prices,
      source.prepare('SELECT row_json FROM product_prices WHERE product_id=? ORDER BY price,store_id,url').all(row.id)
        .map(offer => JSON.parse(String(offer.row_json))));
  }
  assert.equal((await searchCatalog(sqliteAdapter(db), { p_query: 'DTXS', p_category: 'almacenamiento' }, { now })).products[0].id, 'dinobyte-api-2903292');
  // Fechas vencidas permanecen vencidas: reparación no convierte el corte en ofertas actuales.
  assert.equal((await searchCatalog(sqliteAdapter(db), { p_min_price: 0 }, { now })).total, 0);
});

test('rechaza destino existente, misma copia, IDs fuera del encargo y nombre distinto', t => {
  const f = fixture(t);
  assert.throws(() => repairCatalogIdentities(f.source, f.source, options), /NEW_COPY_REQUIRED/);
  assert.throws(() => repairCatalogIdentities(f.source, f.target, { ...options, productIds: ['untouched'] }), /ALLOWLIST/);
  assert.equal(existsSync(f.target), false);
  const existing = f.directory + '/existing.sqlite'; writeFileSync(existing, 'preservar');
  assert.throws(() => repairCatalogIdentities(f.source, existing, options), /NEW_COPY_REQUIRED/);
  assert.equal(readFileSync(existing, 'utf8'), 'preservar');
  const db = new DatabaseSync(f.source);
  const row = db.prepare('SELECT row_json FROM products WHERE id=?').get(CATALOG_IDENTITY_REPAIR_ALLOWLIST[0].id)!;
  const raw = JSON.parse(String(row.row_json)); raw.name = 'otro producto';
  db.prepare('UPDATE products SET row_json=? WHERE id=?').run(JSON.stringify(raw), raw.id); db.close();
  assert.throws(() => repairCatalogIdentities(f.source, f.target, options), /SOURCE_MISMATCH/);
  assert.equal(existsSync(f.target), false);
});

test('subset explícito sólo repara su fila y ausencia de una fila obligatoria rechaza antes de copiar', t => {
  const f = fixture(t), id = 'maxtecno-api-901942';
  const receipt = repairCatalogIdentities(f.source, f.target, { ...options, productIds: [id] });
  assert.deepEqual(receipt.changedIds, [id]);
  const db = new DatabaseSync(f.target, { readOnly: true }); t.after(() => db.close());
  const unassigned = JSON.parse(String(db.prepare("SELECT row_json FROM products WHERE id='maxtecno-api-879981'").get()?.row_json));
  assert.equal(unassigned.category, 'memoria-ram');
  const source = new DatabaseSync(f.source); source.prepare('DELETE FROM product_substrings WHERE id=?').run(id);
  source.prepare('DELETE FROM search_projection WHERE product_id=?').run(id);
  source.prepare('DELETE FROM price_basis WHERE product_id=?').run(id); source.prepare('DELETE FROM product_prices WHERE product_id=?').run(id);
  source.prepare('DELETE FROM summaries WHERE product_id=?').run(id); source.prepare('DELETE FROM products WHERE id=?').run(id); source.close();
  const target = f.directory + '/missing.sqlite';
  assert.throws(() => repairCatalogIdentities(f.source, target, options), /MISSING/);
  assert.equal(existsSync(target), false);
});

test('repite sobre nueva staging sin rejuvenecer o cambiar productos ya reparados', t => {
  const f = fixture(t); repairCatalogIdentities(f.source, f.target, options);
  const receipt = repairCatalogIdentities(f.target, f.directory + '/second.sqlite', options);
  assert.deepEqual(receipt.changedIds, []); assert.deepEqual(receipt.beforeHashes, receipt.afterHashes);
  assert.equal(receipt.requiresRecertification, true);
});

test('fallo o mutación de dependencia revierte la reparación y deja staging sin activar', t => {
  for (const mutate of ['offer', 'unrelated-product', 'throw']) {
    const f = fixture(t), original = new DatabaseSync(f.source, { readOnly: true }); t.after(() => original.close());
    assert.throws(() => repairCatalogIdentities(f.source, f.target, { ...options, rebuildProjection(db) {
      if (mutate === 'throw') throw new Error('projection-failed');
      if (mutate === 'offer') db.exec('UPDATE product_prices SET price=999');
      else db.exec("UPDATE products SET category='refrigeracion' WHERE id='untouched'");
    } }), /IMMUTABLE_TABLE_CHANGED|projection-failed/);
    const staged = new DatabaseSync(f.target, { readOnly: true }); t.after(() => staged.close());
    assert.deepEqual(table(staged, 'products'), table(original, 'products'));
    assert.deepEqual(table(staged, 'product_prices'), table(original, 'product_prices'));
    assert.equal(staged.prepare("SELECT value FROM pilot_meta WHERE key='production_catalog'").get(), undefined);
  }
});

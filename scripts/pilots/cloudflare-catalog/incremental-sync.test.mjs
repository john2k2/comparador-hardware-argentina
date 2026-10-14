import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importSnapshot } from './import-local.mjs';
import { applyIncremental, canonicalJson, loadIncrementalSnapshot, rowHash, estimateIndexMaintenance } from './incremental-sync.mjs';
import { rebuildProjection } from './projection.mjs';
import { searchCatalog } from './engine.mjs';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { chargeDailyBudget } from './daily-budget.mjs';
const now = Date.parse('2026-10-11T05:10:00Z');
const stamp = new Date(now - 3600000).toISOString();
const tables = ['stores', 'products', 'product_prices', 'catalog_price_summaries'];
function catalog(size = 1) {
  const data = { stores: [{ id: 'mexx', name: 'Mexx', url: 'https://mexx.example/' }], products: [], product_prices: [], catalog_price_summaries: [] };
  for (let i = 0; i < size; i++) {
    const id = 'gpu-' + i, price = 100000 + i;
    data.products.push({ id, name: 'RTX 5070 ' + i, category: 'tarjetas-graficas', catalog_identity: id, catalog_name: 'rtx 5070 ' + i, catalog_document: 'rtx 5070 ' + i, catalog_component: true, updated_at: stamp, last_scraped_at: stamp });
    const offer = { id: 'offer-' + i, product_id: id, store_id: 'mexx', price, stock: 'in-stock', url: 'https://mexx.example/' + id, last_updated: stamp };
    data.product_prices.push(offer);
    data.catalog_price_summaries.push(summary(offer));
  }
  return data;
}
function summary(offer) {
  const { product_id, ...basis } = offer;
  const historical = { ...basis }; delete historical.last_updated;
  return { product_id, lowest: offer.price, highest: offer.price, average: offer.price, available: offer.stock === 'in-stock' ? 1 : 0, urls: offer.url, store_ids: [offer.store_id], portable_listing: false,
    best_offers: [historical], comparable_offers: offer.stock === 'in-stock' ? [basis] : [], comparable_stats: null, comparable_valid_until: null, comparable_latest_observed_at: offer.last_updated };
}
function writeSnapshot(directory, data) {
  const entries = tables.map(table => {
    const content = data[table].map(row => JSON.stringify(row)).join('\n') + (data[table].length ? '\n' : '');
    writeFileSync(join(directory, table + '.jsonl'), content);
    return { table, count: data[table].length, sha256: createHash('sha256').update(content).digest('hex'), terminatedOnEmptyPage: true };
  });
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ tables: entries, endedAt: new Date(now).toISOString(), referenceNow: new Date(now).toISOString() }));
}
async function fixture(t, data = catalog()) {
  const directory = mkdtempSync(join(tmpdir(), 'comparador-incremental-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const before = mkdtempSync(join(directory, 'before-')), after = mkdtempSync(join(directory, 'after-')), sqlite = join(directory, 'catalog.sqlite');
  writeSnapshot(before, data); await importSnapshot({ source: before, sqlite });
  const source = await loadIncrementalSnapshot(before), db = new DatabaseSync(sqlite);
  db.exec('BEGIN'); rebuildProjection(db, { now, generation: source.generation }); db.exec('COMMIT'); db.close();
  return { before, after, sqlite, data, expectedGeneration: source.generation, projection: rebuildProjection, now };
}
function inspect(sqlite) {
  const db = new DatabaseSync(sqlite);
  const rows = Object.fromEntries(['products', 'stores', 'product_prices', 'summaries', 'price_basis', 'search_projection', 'pilot_meta', 'product_substrings'].map(table => [table, db.prepare('SELECT * FROM ' + table).all()]));
  db.close(); return rows;
}
async function search(sqlite, options = {}) {
  const db = new DatabaseSync(sqlite);
  try { return await searchCatalog(sqliteAdapter(db), { p_query: 'rtx 5070', p_min_price: 0, p_sort: 'price-asc', ...options }, { now }); }
  finally { db.close(); }
}
test('snapshot idéntico no escribe ni renueva observaciones o generación', async t => {
  const f = await fixture(t); writeSnapshot(f.after, f.data);
  const before = inspect(f.sqlite), result = await applyIncremental(f);
  assert.equal(result.status, 'noop'); assert.equal(result.baseRowsWritten, 0); assert.equal(result.estimatedRowsWritten, 0); assert.deepEqual(inspect(f.sqlite), before);
});
test('precio real cambia comparación, proyección y checkpoint atómicamente; repetición cero writes', async t => {
  const f = await fixture(t), next = structuredClone(f.data), old = await search(f.sqlite);
  next.product_prices[0].price = 75000;
  next.product_prices[0].last_updated = new Date(now - 1800000).toISOString();
  next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  const result = await applyIncremental(f), current = await search(f.sqlite);
  assert.equal(old.products[0].lowest_price, 100000); assert.equal(current.products[0].lowest_price, 75000);
  assert.equal(current.products[0].product_prices[0].last_updated, next.product_prices[0].last_updated);
  assert.equal(result.projection.changedProjectionRows, 1); assert.ok(result.estimatedRowsWritten > result.baseRowsWritten);
  const actual = inspect(f.sqlite); assert.equal(actual.search_projection[0].lowest, 75000);
  const marker = JSON.parse(actual.pilot_meta.find(row => row.key === 'snapshot').value);
  assert.ok(marker.cache.generation.startsWith(result.targetGeneration));
  const repeat = await applyIncremental(f); assert.equal(repeat.baseRowsWritten, 0); assert.deepEqual(inspect(f.sqlite), actual);
});
test('delta sin callback de proyección se rechaza antes de escrituras en una generación con caché', async t => {
  const f = await fixture(t), next = structuredClone(f.data), actual = inspect(f.sqlite);
  next.product_prices[0].price = 75000; next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  await assert.rejects(applyIncremental({ ...f, projection: undefined }), /PROJECTION_CALLBACK_REQUIRED/);
  assert.deepEqual(inspect(f.sqlite), actual);
  // Un snapshot idéntico sigue siendo una verificación sin escribir.
  writeSnapshot(f.after, f.data);
  const noop = await applyIncremental({ ...f, projection: undefined });
  assert.equal(noop.baseRowsWritten, 0); assert.deepEqual(inspect(f.sqlite), actual);
});
test('cambio a sin stock elimina elegibilidad y conserva precio histórico y fecha real', async t => {
  const f = await fixture(t), next = structuredClone(f.data);
  next.product_prices[0].stock = 'out-of-stock'; next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  await applyIncremental(f); assert.equal((await search(f.sqlite)).total, 0);
  const history = await search(f.sqlite, { p_min_price: null }); assert.equal(history.total, 1);
  assert.equal(history.products[0].product_prices[0].last_updated, stamp);
});
test('observación fallida no renueva oferta aunque cambie metadata del producto', async t => {
  const f = await fixture(t), next = structuredClone(f.data);
  next.products[0].updated_at = new Date(now).toISOString(); next.products[0].refresh_priority = 'hot'; writeSnapshot(f.after, next);
  const result = await applyIncremental(f), actual = inspect(f.sqlite);
  assert.equal(JSON.parse(actual.product_prices[0].row_json).last_updated, stamp);
  assert.equal(actual.price_basis.find(row => row.kind === 'current').observed_at, stamp);
  assert.equal(result.changes.product_prices.length, 0); assert.equal(result.changes.catalog_price_summaries.length, 0);
});
test('estimación UPDATE cuenta columnas SET y predicados parciales, sin cobrar índices intactos', async t => {
  const f = await fixture(t), next = structuredClone(f.data);
  next.product_prices[0].last_updated = new Date(now - 1800000).toISOString(); next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  const result = await applyIncremental(f), db = new DatabaseSync(f.sqlite);
  try {
    const price = result.operations.find(op => op.table === 'product_prices');
    assert.deepEqual(price.changedColumns, ['row_json']);
    assert.equal(estimateIndexMaintenance(db, [price]), 0);
    const clock = { sql: 'UPDATE search_projection SET next_transition=? WHERE product_id=?', kind: 'update', changedColumns: ['next_transition'] };
    assert.equal(estimateIndexMaintenance(db, [clock]), 2); // sólo projection_clock_idx
    const partial = { sql: 'UPDATE search_projection SET comparable_available=? WHERE product_id=?', kind: 'update', changedColumns: ['comparable_available'] };
    assert.equal(estimateIndexMaintenance(db, [partial]), 4); // condiciones de índices de precio e identidad activa
    assert.equal(estimateIndexMaintenance(db, [{ sql: 'UPDATE search_projection SET observed_at=? WHERE product_id=?' }]), 0);
    assert.equal(estimateIndexMaintenance(db, [{ sql: 'INSERT INTO search_projection(product_id) VALUES(?)' }]), 10); // cuatro secundarios + primario
  } finally { db.close(); }
});
test('snapshot no permite retroceder una observación ni promocionar unknown/backorder como comprable', async t => {
  const f = await fixture(t), actual = inspect(f.sqlite), next = structuredClone(f.data);
  next.product_prices[0].last_updated = new Date(now - 7200000).toISOString(); next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  await assert.rejects(applyIncremental(f), /OBSERVATION_REGRESSION/); assert.deepEqual(inspect(f.sqlite), actual);
  for (const stock of ['unknown', 'available-on-backorder']) {
    next.product_prices[0].last_updated = stamp; next.product_prices[0].stock = stock;
    next.catalog_price_summaries[0] = summary(next.product_prices[0]);
    next.catalog_price_summaries[0].comparable_offers = [{ ...next.product_prices[0] }]; writeSnapshot(f.after, next);
    await assert.rejects(applyIncremental(f), /INVALID_CURRENT_BASIS/); assert.deepEqual(inspect(f.sqlite), actual);
  }
});
test('alta de producto/tienda/oferta y baja exacta preservan relaciones y FTS', async t => {
  const f = await fixture(t), next = catalog(2);
  next.stores.push({ id: 'venex', name: 'Venex' }); next.product_prices[1].store_id = 'venex'; next.catalog_price_summaries[1] = summary(next.product_prices[1]);
  // La primera ficha y sus relaciones desaparecen en el snapshot completo.
  next.products.shift(); next.product_prices.shift(); next.catalog_price_summaries.shift(); next.stores.shift();
  writeSnapshot(f.after, next); await applyIncremental(f);
  const actual = inspect(f.sqlite); assert.deepEqual(actual.products.map(row => row.id), ['gpu-1']);
  assert.deepEqual(actual.product_substrings.map(row => row.id), ['gpu-1']); assert.deepEqual(actual.search_projection.map(row => row.product_id), ['gpu-1']);
  const result = await search(f.sqlite); assert.equal(result.total, 1); assert.equal(result.products[0].product_prices[0].store_id, 'venex');
});
test('dato inválido, hashes corruptos y base desactualizada se rechazan sin cambios', async t => {
  const f = await fixture(t), beforeRows = inspect(f.sqlite), broken = structuredClone(f.data);
  broken.product_prices[0].price = 1; writeSnapshot(f.after, broken);
  await assert.rejects(applyIncremental(f), /BASIS_PRICE_MISMATCH/); assert.deepEqual(inspect(f.sqlite), beforeRows);
  writeSnapshot(f.after, f.data); writeFileSync(join(f.after, 'stores.jsonl'), '{}\n');
  await assert.rejects(applyIncremental(f), /SNAPSHOT_INTEGRITY_MISMATCH/); assert.deepEqual(inspect(f.sqlite), beforeRows);
  writeSnapshot(f.after, f.data); await assert.rejects(applyIncremental({ ...f, expectedGeneration: 'stale' }), /EXPECTED_GENERATION_CONFLICT/);
});
test('conflicto de checkpoint no acepta una base de otra generación', async t => {
  const f = await fixture(t), next = structuredClone(f.data); next.stores[0].name = 'Mexx actualizado'; writeSnapshot(f.after, next);
  await applyIncremental(f);
  const third = mkdtempSync(join(f.after, 'third-')), thirdData = structuredClone(next); thirdData.stores[0].name = 'Otra edición'; writeSnapshot(third, thirdData);
  const actual = inspect(f.sqlite); await assert.rejects(applyIncremental({ ...f, after: third }), /STALE_BASE_GENERATION/); assert.deepEqual(inspect(f.sqlite), actual);
});
test('corrupción SQLite se detecta también en no-op', async t => {
  const f = await fixture(t); writeSnapshot(f.after, f.data);
  const db = new DatabaseSync(f.sqlite); db.prepare('UPDATE product_prices SET price=123').run(); db.close();
  const actual = inspect(f.sqlite); await assert.rejects(applyIncremental(f), /DATABASE_ROW_CONFLICT/); assert.deepEqual(inspect(f.sqlite), actual);
});
test('fallo de proyección y presupuesto revierten precio, generación, índices y checkpoint', async t => {
  const f = await fixture(t), next = structuredClone(f.data), actual = inspect(f.sqlite);
  next.product_prices[0].price = 50000; next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  await assert.rejects(applyIncremental({ ...f, projection: (db, options) => { rebuildProjection(db, options); throw new Error('PROJECTION_FAILURE'); } }), /PROJECTION_FAILURE/);
  assert.deepEqual(inspect(f.sqlite), actual);
  await assert.rejects(applyIncremental({ ...f, maxEstimatedRowsWritten: 1 }), /ESTIMATED_WRITE_BUDGET_EXCEEDED/); assert.deepEqual(inspect(f.sqlite), actual);
});
test('presupuesto diario ya consumido revierte delta y conserva el ledger; noop no carga', async t => {
  const f = await fixture(t), db = new DatabaseSync(f.sqlite);
  db.exec('BEGIN'); const initial = chargeDailyBudget(db, { now, estimatedRowsWritten: 79990 }); db.exec('COMMIT'); db.close();
  const actual = inspect(f.sqlite), next = structuredClone(f.data);
  next.product_prices[0].price = 50000; next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  await assert.rejects(applyIncremental(f), /DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED/); assert.deepEqual(inspect(f.sqlite), actual);
  writeSnapshot(f.after, f.data); const noop = await applyIncremental(f);
  assert.equal(noop.dailyBudget.used, initial.used); assert.equal(noop.dailyBudget.charge, 0);
  const verified = new DatabaseSync(f.sqlite); assert.equal(verified.prepare('SELECT used FROM pilot_daily_write_budget').get().used, initial.used); verified.close();
});
test('plan y statements confirmados usan bindings seguros y lotes inferiores a límites D1', async t => {
  const f = await fixture(t, catalog(60)), next = structuredClone(f.data);
  for (const store of next.stores) store.name = "'); DROP TABLE products; --";
  for (let i = 0; i < next.products.length; i++) { next.products[i].description = "' $() DROP TABLE;"; next.product_prices[i].price += 1; next.catalog_price_summaries[i] = summary(next.product_prices[i]); }
  writeSnapshot(f.after, next);
  const result = await applyIncremental(f);
  assert.ok(result.batches.length > 1); assert.equal(inspect(f.sqlite).products.length, 60);
  for (const batch of result.batches) { assert.ok(batch.statements.length < 50); for (const statement of batch.statements) { assert.ok(statement.bindings.length < 100); assert.ok(!statement.sql.includes('DROP TABLE')); } }
  assert.equal(result.d1RowsWritten, null); assert.equal(result.remoteVerified, false);
});
test('hash de fila es estable por orden de propiedades; fechas diferentes cambian hash', () => {
  assert.equal(rowHash({ id: 'a', nested: { x: 1, y: 2 } }), rowHash({ nested: { y: 2, x: 1 }, id: 'a' }));
  assert.notEqual(rowHash({ last_updated: stamp }), rowHash({ last_updated: new Date(now).toISOString() }));
  assert.equal(canonicalJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
});
test('D1 local confirma costo con índices/FTS y atomicidad del delta pequeño', async t => {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("fixture local");}}', d1Databases: ['DB'] }));
  t.after(() => runtime.dispose());
  const d1 = await runtime.getD1Database('DB'), f = await fixture(t), baseline = inspect(f.sqlite);
  for (const file of ['schema.sql', 'projection.sql']) for (const sql of readFileSync(new URL('./' + file, import.meta.url), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await d1.prepare(sql).run();
  for (const table of ['products', 'stores', 'product_prices', 'summaries', 'price_basis', 'product_substrings', 'search_projection', 'pilot_meta']) for (const row of baseline[table]) {
    const columns = Object.keys(row); await d1.prepare('INSERT INTO ' + table + '(' + columns.join(',') + ') VALUES(' + columns.map(() => '?').join(',') + ')').bind(...columns.map(c => row[c])).run();
  }
  const next = structuredClone(f.data); next.products[0].catalog_document += ' actualizado';
  next.product_prices[0].price = 75000; next.catalog_price_summaries[0] = summary(next.product_prices[0]); writeSnapshot(f.after, next);
  const result = await applyIncremental(f);
  assert.ok(result.committedStatements.length < 50);
  const responses = await d1.batch(result.committedStatements.map(op => d1.prepare(op.sql).bind(...op.bindings)));
  const rowsWritten = responses.reduce((sum, r) => sum + r.meta.rows_written, 0), rowsRead = responses.reduce((sum, r) => sum + r.meta.rows_read, 0);
  assert.ok(rowsWritten > result.baseRowsWritten); assert.ok(result.estimatedRowsWritten >= rowsWritten);
  assert.equal((await d1.prepare('SELECT lowest FROM search_projection WHERE product_id=?').bind('gpu-0').first()).lowest, 75000);
  // Un fallo al final de un batch no expone el precio parcial anterior.
  await assert.rejects(d1.batch([d1.prepare('UPDATE product_prices SET price=? WHERE id=?').bind(42, 'offer-0'), d1.prepare('INSERT INTO products(id) VALUES(?)').bind('invalid')]));
  assert.equal((await d1.prepare('SELECT price FROM product_prices WHERE id=?').bind('offer-0').first()).price, 75000);
  console.log(JSON.stringify({ evidence: 'incremental D1 local fixture only', baseRowsWritten: result.baseRowsWritten, sqlitePhysicalRowsChanged: result.sqlitePhysicalRowsChanged,
    estimatedRowsWritten: result.estimatedRowsWritten, d1LocalRowsWritten: rowsWritten, d1LocalRowsRead: rowsRead, statementCount: result.committedStatements.length, remoteVerified: false }));
});

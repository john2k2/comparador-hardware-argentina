import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire, Module } from 'node:module';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { applyAssociationPlan, associationRowHash, planAssociation } from './association-local.mjs';

// Compilar las funciones reales TS en memoria; sin fixtures de reglas debilitadas.
const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, '../../..');
const compiled = buildSync({ stdin: { contents: `
 export { exactOfferAttributes, proveOfferAttributes } from './src/lib/quality/offer-attribute-proof';
 export { hasExplicitIdentityConflict } from './src/lib/quality/offer-identity';
 export { listingReference } from './src/lib/scrapers/listing-reference';`, resolveDir: root, loader: 'ts' },
 bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', tsconfig: resolve(root, 'tsconfig.json') }).outputFiles[0].text;
const identityModule = new Module(resolve(root, 'scripts/pilots/cloudflare-catalog/association-test-memory.cjs'));
identityModule.paths = Module._nodeModulePaths(root); identityModule.require = require;
identityModule._compile(compiled, identityModule.id);
const identity = identityModule.exports;
const now = Date.parse('2026-10-11T18:00:00Z'), stamp = '2026-10-10T23:00:00Z';
const url = 'https://www.fullh4rd.com.ar/prod/29711/placa-de-video-geforce-rtx-5080-16gb-gigabyte-gaming-oc';
const gpu = 'Gigabyte GeForce RTX 5080 Gaming OC 16GB';

function fixture(t, { targetName = gpu, sourceTitle = gpu, category = 'tarjetas-graficas' } = {}) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE products(id TEXT PRIMARY KEY,category TEXT,row_json TEXT);
   CREATE TABLE product_prices(id TEXT PRIMARY KEY,product_id TEXT,store_id TEXT,price REAL,url TEXT,row_json TEXT);
   CREATE TABLE price_basis(product_id TEXT,kind TEXT,id TEXT,store_id TEXT,price REAL,stock TEXT,url TEXT,observed_at TEXT);
   CREATE TABLE summaries(product_id TEXT PRIMARY KEY,row_json TEXT);
   CREATE TABLE search_projection(product_id TEXT PRIMARY KEY,value INTEGER);
   CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT);
   CREATE TABLE pilot_refresh_demand(offer_id TEXT PRIMARY KEY,product_id TEXT,store_id TEXT,url TEXT,status TEXT,
     attempts INTEGER,due_at INTEGER,lease_token TEXT,lease_until INTEGER,last_observed_at TEXT);`);
  for (const [id, name] of [['old', 'Gigabyte Radeon RX 9070 Gaming OC 16GB'], ['target', targetName]]) {
    db.prepare('INSERT INTO products VALUES(?,?,?)').run(id, category, JSON.stringify({ id, name, category, updated_at: stamp, last_scraped_at: stamp }));
    db.prepare('INSERT INTO summaries VALUES(?,?)').run(id, JSON.stringify({ available: 3 }));
    db.prepare('INSERT INTO search_projection VALUES(?,3)').run(id);
    db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id, 'current', `sibling-${id}`, 'fullh4rd', 200, 'in-stock', url + '-sibling', stamp);
  }
  const raw = { id: 'offer', product_id: 'old', store_id: 'fullh4rd', price: 100, url, stock: 'in-stock',
    last_updated: stamp, updated_at: stamp, created_at: stamp, identity_review: { status: 'consistent' },
    state_signature: 'old-signature', source_identity: { title: sourceTitle, listingRef: identity.listingReference('fullh4rd', url) } };
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('offer', 'old', 'fullh4rd', 100, url, JSON.stringify(raw));
  for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)')
    .run('old', kind, 'offer', 'fullh4rd', 100, 'in-stock', url, stamp);
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts: { products: 2, product_prices: 1 },
    cache: { version: 1, generation: 'before', validFrom: stamp, validUntil: '2030-01-01T00:00:00Z' } }));
  const calls = [];
  const deps = { ...identity, verifyEvidence: () => true,
    rebuildSummaries(database, context) {
      calls.push({ kind: 'summaries', ids: [...context.affectedProductIds] });
      for (const id of context.affectedProductIds) {
        assert.equal(database.prepare('SELECT * FROM summaries WHERE product_id=?').get(id), undefined);
        const count = database.prepare('SELECT COUNT(*) n FROM price_basis WHERE product_id=?').get(id).n;
        database.prepare('INSERT INTO summaries VALUES(?,?)').run(id, JSON.stringify({ available: count }));
      }
      return { rebuilt: 2 };
    },
    rebuildProjection(database, context) {
      calls.push({ kind: 'projection', ids: [...context.affectedProductIds] });
      for (const id of context.affectedProductIds) {
        assert.equal(database.prepare('SELECT * FROM search_projection WHERE product_id=?').get(id), undefined);
        const count = JSON.parse(database.prepare('SELECT row_json FROM summaries WHERE product_id=?').get(id).row_json).available;
        database.prepare('INSERT INTO search_projection VALUES(?,?)').run(id, count);
      }
      return { rebuilt: 2 };
    },
    createCacheSnapshot(_database, context) {
      calls.push({ kind: 'cache', ids: [...context.affectedProductIds] });
      return { version: 1, generation: context.planId, validFrom: new Date(context.now).toISOString(), validUntil: '2030-01-01T00:00:00Z' };
    } };
  const row = () => db.prepare('SELECT * FROM product_prices WHERE id=?').get('offer');
  const input = { offerId: 'offer', expectedProductId: 'old', expectedRowHash: associationRowHash(row()), targetProductId: 'target', sourceTitle,
    evidence: { kind: 'public-detail', url, capturedAt: stamp, contentSha256: 'a'.repeat(64) } };
  return { db, input, deps, calls, row };
}
function snapshot(db) {
  return JSON.stringify(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
    .map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
}

test('plan explícito es sólo lectura; corrige fuente5080 mal asociada a9070 sin trasladar frescura', t => {
  const f = fixture(t), before = snapshot(f.db), plan = planAssociation(f.db, f.input, f.deps, { now });
  assert.equal(snapshot(f.db), before); assert.equal(plan.changesMembership, true);
  const result = applyAssociationPlan(f.db, plan, f.deps, { now });
  const row = f.row(), raw = JSON.parse(row.row_json);
  assert.equal(row.product_id, 'target'); assert.equal(raw.product_id, 'target');
  assert.equal(raw.identity_review, null); assert.equal(raw.state_signature, null);
  for (const key of ['price', 'stock', 'last_updated', 'updated_at', 'created_at', 'source_identity'])
    assert.deepEqual(raw[key], JSON.parse(JSON.parse(before).find(([name]) => name === 'product_prices')[1][0].row_json)[key]);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM price_basis WHERE id='offer'").get().n, 0);
  assert.equal(result.removedBasis, 2); assert.equal(result.remotePublishSafe, false);
  assert.deepEqual(f.calls, ['summaries', 'projection', 'cache'].map(kind => ({ kind, ids: ['old', 'target'] })));
  assert.deepEqual(f.db.prepare('SELECT value FROM search_projection ORDER BY product_id').all().map(r => r.value), [1, 1]);
  const audit = f.db.prepare('SELECT * FROM pilot_association_audit').get();
  assert.equal(audit.before_hash, f.input.expectedRowHash); assert.equal(audit.after_hash, associationRowHash(row));
  assert.equal(JSON.parse(audit.before_json).product_id, 'old'); assert.equal(JSON.parse(audit.after_json).product_id, 'target');
  assert.equal(JSON.parse(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value).cache.generation, result.planId);
});

for (const [label, category, targetName, sourceTitle] of [
  ['RX9070 no se convierte en RTX5080', 'tarjetas-graficas', gpu, 'Gigabyte Radeon RX 9070 Gaming OC 16GB'],
  ['TUF no se convierte en PRIME', 'tarjetas-graficas', 'ASUS RTX 5080 PRIME OC 16GB', 'ASUS RTX 5080 TUF GAMING OC 16GB'],
  ['CAS RAM', 'memoria-ram', 'Memoria UDIMM Corsair Vengeance LPX Black 16GB (1x16GB) DDR4 3200MHz CL16',
    'Memoria UDIMM Corsair Vengeance LPX Black 16GB (1x16GB) DDR4 3200MHz CL18'],
  ['kit RAM', 'memoria-ram', 'Memoria UDIMM Corsair Vengeance LPX Black 16GB (1x16GB) DDR4 3200MHz CL16',
    'Memoria UDIMM Corsair Vengeance LPX Black 16GB (2x8GB) DDR4 3200MHz CL16'],
  ['packaging CPU', 'procesadores', 'AMD Ryzen 5 5600 BOX', 'AMD Ryzen 5 5600 TRAY'],
  ['cooler CPU', 'procesadores', 'AMD Ryzen 5 5600 con cooler', 'AMD Ryzen 5 5600 sin cooler'],
  ['atributos incompletos', 'tarjetas-graficas', 'RTX 5080 16GB', 'RTX 5080 16GB'],
]) test(label + ' conserva filas y denominadores', t => {
  const f = fixture(t, { category, targetName, sourceTitle }), before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, f.deps, { now }), /ASSOCIATION_IDENTITY/);
  assert.equal(snapshot(f.db), before); assert.equal(f.db.isTransaction, false); assert.equal(f.calls.length, 0);
});

test('fila cambió entre plan y aplicación; ni precio ni fecha se sobrescriben', t => {
  const f = fixture(t), plan = planAssociation(f.db, f.input, f.deps, { now });
  const raw = JSON.parse(f.row().row_json); raw.price = 123;
  f.db.prepare("UPDATE product_prices SET price=123,row_json=? WHERE id='offer'").run(JSON.stringify(raw));
  const before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, plan, f.deps, { now }), /ASSOCIATION_ROW_CHANGED/);
  assert.equal(snapshot(f.db), before);
});
test('destino debe existir; no crea productos ni elige otro destino', t => {
  const f = fixture(t), before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, { ...f.input, targetProductId: 'new-product' }, f.deps, { now }), /MISSING_ROW/);
  assert.equal(snapshot(f.db), before);
});
test('evidencia no verificada, otra URL y fecha futura fallan cerrado', t => {
  const f = fixture(t), before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, verifyEvidence: () => false }, { now }), /UNVERIFIED_EVIDENCE/);
  assert.throws(() => applyAssociationPlan(f.db, { ...f.input, evidence: { ...f.input.evidence, url: url + '-different' } }, f.deps, { now }), /EVIDENCE_URL/);
  assert.throws(() => applyAssociationPlan(f.db, { ...f.input, evidence: { ...f.input.evidence, capturedAt: new Date(now + 1).toISOString() } }, f.deps, { now }), /INVALID_CLOCK/);
  assert.equal(snapshot(f.db), before);
});
test('fallo del callback revierte oferta, basis, resúmenes, caché, cola y creación de auditoría', t => {
  const f = fixture(t);
  f.db.prepare('INSERT INTO pilot_refresh_demand VALUES(?,?,?,?,?,?,?,?,?,?)').run('offer', 'old', 'fullh4rd', url, 'backoff', 4, now + 60000, null, null, stamp);
  const before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, rebuildProjection() { throw Error('projection-test'); } }, { now }), /projection-test/);
  assert.equal(snapshot(f.db), before); assert.equal(f.db.isTransaction, false);
});
test('repetición exacta es idempotente; fila alterada después no lo es', t => {
  const f = fixture(t); applyAssociationPlan(f.db, f.input, f.deps, { now });
  const before = snapshot(f.db), calls = f.calls.length;
  const repeated = applyAssociationPlan(f.db, f.input, f.deps, { now: now + 1 });
  assert.equal(repeated.status, 'already-applied'); assert.equal(repeated.writes, 0);
  assert.equal(snapshot(f.db), before); assert.equal(f.calls.length, calls);
  f.db.prepare("UPDATE product_prices SET row_json=row_json||' ' WHERE id='offer'").run();
  const changed = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, f.deps, { now: now + 2 }), /ROW_CHANGED/);
  assert.equal(snapshot(f.db), changed);
});
test('lease activo bloquea; corregir cola conserva backoff, intentos y fecha real', t => {
  const f = fixture(t);
  f.db.prepare('INSERT INTO pilot_refresh_demand VALUES(?,?,?,?,?,?,?,?,?,?)').run('offer', 'old', 'fullh4rd', url, 'leased', 4, now + 3600000, 'owner', now + 60000, stamp);
  const before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, f.deps, { now }), /LEASE_ACTIVE/); assert.equal(snapshot(f.db), before);
  f.db.prepare("UPDATE pilot_refresh_demand SET status='backoff',lease_token=NULL,lease_until=NULL WHERE offer_id='offer'").run();
  const queue = f.db.prepare('SELECT * FROM pilot_refresh_demand').get();
  applyAssociationPlan(f.db, f.input, f.deps, { now });
  assert.deepEqual({ ...f.db.prepare('SELECT * FROM pilot_refresh_demand').get() }, { ...queue, product_id: 'target' });
});
test('callback no puede rejuvenecer producto/oferta ni reincluir basis de la oferta movida', t => {
  const f = fixture(t), before = snapshot(f.db);
  const bad = [
    () => f.db.prepare("UPDATE product_prices SET row_json='{}' WHERE id='offer'").run(),
    () => f.db.prepare("UPDATE products SET row_json='{}' WHERE id='target'").run(),
    () => f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('target', 'current', 'offer', 'fullh4rd', 100, 'in-stock', url, new Date(now).toISOString()),
  ];
  for (const mutate of bad) {
    assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, rebuildProjection(db, ctx) {
      const result = f.deps.rebuildProjection(db, ctx); mutate(); return result;
    } }, { now }), /CALLBACK_CHANGED/);
    assert.equal(snapshot(f.db), before);
  }
});
test('cache anterior, promesas y transacción anidada se rechazan sin cambios', t => {
  const f = fixture(t), before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, createCacheSnapshot: () => ({ version: 1, generation: 'before', validFrom: new Date(now).toISOString(), validUntil: '2030-01-01T00:00:00Z' }) }, { now }), /CACHE_SNAPSHOT/);
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, rebuildProjection: () => Promise.resolve(null) }, { now }), /ASYNC_CALLBACK/);
  assert.equal(snapshot(f.db), before);
  f.db.exec('BEGIN'); assert.throws(() => applyAssociationPlan(f.db, f.input, f.deps, { now }), /NESTED_TRANSACTION/);
  assert.equal(f.db.isTransaction, true); f.db.exec('ROLLBACK'); assert.equal(snapshot(f.db), before);
});
test('callback async se rechaza antes de invocarlo; metadata reconstruida se conserva', t => {
  const f = fixture(t), before = snapshot(f.db); let invoked = false;
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, async rebuildSummaries() { invoked = true; } }, { now }), /ASYNC_CALLBACK/);
  assert.equal(invoked, false); assert.equal(snapshot(f.db), before);
  applyAssociationPlan(f.db, f.input, { ...f.deps, rebuildProjection(db, context) {
    const report = f.deps.rebuildProjection(db, context);
    const marker = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({ ...marker, projectionVersion: 1 }));
    return report;
  } }, { now });
  assert.equal(JSON.parse(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value).projectionVersion, 1);
});
test('marcador eliminado por callback revierte toda la aplicación', t => {
  const f = fixture(t), before = snapshot(f.db);
  assert.throws(() => applyAssociationPlan(f.db, f.input, { ...f.deps, createCacheSnapshot(db, context) {
    db.prepare("DELETE FROM pilot_meta WHERE key='snapshot'").run();
    return f.deps.createCacheSnapshot(db, context);
  } }, { now }), /SNAPSHOT_MISSING/);
  assert.equal(snapshot(f.db), before);
});

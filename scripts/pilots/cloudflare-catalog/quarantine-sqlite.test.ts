import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { associationSqliteDependencies } from './association-sqlite';
import { applyQuarantinePlan, quarantineRowHash } from './quarantine-sqlite';
import { initializeRefreshDemand, enqueueKnownProducts } from './refresh-demand.mjs';
import { needsIdentityReview, readIdentityReview } from '@/lib/quality/offer-identity';

const now = Date.parse('2026-10-11T18:00:00Z');
const old = new Date(now - 48 * 3600000).toISOString();
const name = 'Procesador AMD Ryzen 7 8700G 5.1 Ghz - AM5';
const title = 'PROCESADOR AMD RYZEN 7 8700G AM5 CON VIDEO CON COOLER';
const url = 'https://goldentechstore.com.ar/producto/procesador-amd-ryzen-7-8700g-am5-con-video-con-cooler/';
async function fixture(t: TestContext, gpu = false) {
  const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
  const db = new DatabaseSync(':memory:'), dir = mkdtempSync(tmpdir() + '/quarantine-');
  t.after(() => { db.close(); rmSync(dir, { recursive: true }); });
  db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql', 'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', '{}');
  const category = gpu ? 'tarjetas-graficas' : 'procesadores';
  const currentName = gpu ? 'PLACA DE VIDEO ASUS PRIME RTX 5080 O 16GB D7' : name;
  const sourceTitle = gpu ? 'Video Geforce Asus Tuf Gaming RTX 5080 16GB D7 OC' : title;
  const store = gpu ? 'dinobyte' : 'goldentechstore';
  const sourceUrl = gpu ? 'https://dinobyte.ar/producto/video-geforce-asus-tuf-gaming-rtx-5080-16gb-d7-oc/' : url;
  for (const id of ['p', 'untouched']) {
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, category,
      currentName.toLowerCase(), currentName.toLowerCase(), currentName.toLowerCase(), 1, 0, old, old,
      JSON.stringify({ id, name: currentName, category, last_updated: old }));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, 100, 100, 100, 1, sourceUrl, 0, JSON.stringify([store]), null, null, old, '{}');
  }
  const raw = { id: 'o', product_id: 'p', store_id: store, url: sourceUrl, price: 454586,
    stock: 'unknown', last_updated: old, price_condition: 'special', state_signature: 'old-proof' };
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o', 'p', store, raw.price, sourceUrl, JSON.stringify(raw));
  for (const kind of ['historical', 'current']) {
    db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p', kind, 'o', store, raw.price, raw.stock, sourceUrl, old);
  }
  rebuildProjection(db, { now, generation: 'before' });
  initializeRefreshDemand(db);
  enqueueKnownProducts(db, { productIds: ['p'], now });
  db.prepare("UPDATE pilot_refresh_demand SET status='backoff',attempts=4,due_at=?,last_error='http-429' WHERE offer_id='o'").run(now + 3600000);
  const file = dir + '/source.html';
  const html = `<link rel="canonical" href="${sourceUrl}"><h1>${sourceTitle}</h1>`;
  writeFileSync(file, html);
  const input = { offerId: 'o', expectedRowHash: quarantineRowHash(db.prepare('SELECT * FROM product_prices').get()), sourceTitle,
    evidence: { kind: 'public-detail' as const, url: sourceUrl, capturedAt: new Date(now - 1000).toISOString(),
      contentSha256: createHash('sha256').update(html).digest('hex') } };
  const deps = associationSqliteDependencies({ artifacts: new Map([['o', file]]), projection: rebuildProjection });
  const snapshot = () => Object.fromEntries(['products', 'product_prices', 'price_basis', 'summaries', 'search_projection', 'pilot_meta', 'pilot_refresh_demand']
    .map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  return { db, file, raw, input, deps, snapshot, currentName, category };
}
for (const gpu of [false, true]) test(`cuarentena ${gpu ? 'TUF/PRIME' : 'cooler omitido'} conserva datos y retira comparación`, async t => {
  const f = await fixture(t, gpu), before = f.snapshot();
  const result = applyQuarantinePlan(f.db, f.input, f.deps, { now });
  assert.equal(result.status, 'applied');
  assert.equal(result.reason, gpu ? 'explicit-conflict' : 'insufficient-evidence');
  const after = JSON.parse(String(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json));
  for (const [key, value] of Object.entries(f.raw)) if (key !== 'state_signature') assert.equal(after[key], value);
  assert.equal(after.state_signature, null);
  assert.equal(readIdentityReview(after.identity_review)?.status, 'needs-review');
  assert.equal(needsIdentityReview({ url: after.url, identityReview: after.identity_review, sourceIdentity: after.source_identity },
    { name: f.currentName, category: f.category }), true);
  assert.equal(after.source_identity.title, f.input.sourceTitle);
  assert.deepEqual(f.snapshot().products, before.products);
  assert.deepEqual(f.snapshot().pilot_refresh_demand, before.pilot_refresh_demand);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM price_basis').get()?.n, 0);
  const summary = f.db.prepare("SELECT * FROM summaries WHERE product_id='p'").get()!;
  assert.equal(summary.lowest, 0);
  assert.deepEqual(JSON.parse(String(summary.store_ids_json)), [f.raw.store_id]);
  assert.deepEqual(f.db.prepare("SELECT * FROM summaries WHERE product_id='untouched'").get(), before.summaries[1]);
  const metadata = JSON.parse(String(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value));
  assert.notEqual(metadata.cache.generation, 'before');
  assert.equal(Date.parse(metadata.cache.validFrom), now);
  const audit = f.db.prepare('SELECT * FROM pilot_quarantine_audit').get()!;
  assert.equal(audit.before_hash, f.input.expectedRowHash);
  assert.equal(audit.after_hash, quarantineRowHash(f.db.prepare('SELECT * FROM product_prices').get()));
  const stable = f.snapshot();
  assert.equal(applyQuarantinePlan(f.db, f.input, f.deps, { now: now + 1000 }).status, 'already-applied');
  assert.deepEqual(f.snapshot(), stable);
});
for (const mode of ['changed-file', 'foreign-url', 'foreign-canonical', 'equivalent', 'no-attributes', 'lease', 'changed-row', 'future']) {
  test(`rechaza ${mode} antes de alterar datos`, async t => {
    const f = await fixture(t);
    let expected = /UNVERIFIED_EVIDENCE/;
    if (mode === 'changed-file') writeFileSync(f.file, '<h1>Otro título</h1>');
    if (mode === 'foreign-url') { f.input.evidence.url = 'https://evil.test/8700g'; expected = /EVIDENCE_URL/; }
    if (mode === 'equivalent' || mode === 'no-attributes' || mode === 'foreign-canonical') {
      if (mode === 'equivalent') { f.input.sourceTitle = name; expected = /EQUIVALENT_SOURCE/; }
      if (mode === 'no-attributes') { f.input.sourceTitle = 'Procesador AMD'; expected = /SOURCE_ATTRIBUTES/; }
      const html = `<link rel="canonical" href="${mode === 'foreign-canonical' ? 'https://evil.test/8700g' : url}"><h1>${f.input.sourceTitle}</h1>`;
      writeFileSync(f.file, html); f.input.evidence.contentSha256 = createHash('sha256').update(html).digest('hex');
    }
    if (mode === 'lease') {
      f.db.prepare("UPDATE pilot_refresh_demand SET status='leased',lease_token='active',lease_until=?").run(now + 5000);
      expected = /LEASE_ACTIVE/;
    }
    if (mode === 'changed-row') { f.db.exec("UPDATE product_prices SET price=1"); expected = /ROW_INCONSISTENT|ROW_CHANGED/; }
    if (mode === 'future') { f.input.evidence.capturedAt = new Date(now + 1).toISOString(); expected = /INVALID_CLOCK/; }
    const before = f.snapshot();
    assert.throws(() => applyQuarantinePlan(f.db, f.input, f.deps, { now }), expected);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });
}
for (const phase of ['rebuildSummaries', 'rebuildProjection', 'createCacheSnapshot'] as const) {
  test(`fallo de ${phase} revierte oferta, bases, proyección y auditoría`, async t => {
    const f = await fixture(t), before = f.snapshot();
    const broken = { ...f.deps, [phase]: () => { throw new Error('injected-failure'); } };
    assert.throws(() => applyQuarantinePlan(f.db, f.input, broken, { now }), /injected-failure/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_quarantine_audit'").get(), undefined);
  });
}
test('callback que modifica una fecha provoca rollback y repetición no acepta fila cambiada', async t => {
  const f = await fixture(t), before = f.snapshot();
  const broken = { ...f.deps, rebuildSummaries(db: DatabaseSync, context: Parameters<typeof f.deps.rebuildSummaries>[1]) {
    const result = f.deps.rebuildSummaries(db, context);
    const raw = JSON.parse(String(db.prepare('SELECT row_json FROM product_prices').get()!.row_json));
    db.prepare('UPDATE product_prices SET row_json=?').run(JSON.stringify({ ...raw, last_updated: new Date(now).toISOString() }));
    return result;
  } };
  assert.throws(() => applyQuarantinePlan(f.db, f.input, broken, { now }), /CALLBACK_CHANGED_OFFER/);
  assert.deepEqual(f.snapshot(), before);
  applyQuarantinePlan(f.db, f.input, f.deps, { now });
  f.db.exec("UPDATE product_prices SET price=1");
  assert.throws(() => applyQuarantinePlan(f.db, f.input, f.deps, { now }), /ROW_INCONSISTENT|ROW_CHANGED/);
});
test('hash consistente pero distinto, caché inválida y async callback fallan cerrado', async t => {
  const f = await fixture(t), before = f.snapshot();
  assert.throws(() => applyQuarantinePlan(f.db, { ...f.input, expectedRowHash: '0'.repeat(64) }, f.deps, { now }), /ROW_CHANGED/);
  const initialCache = JSON.parse(String(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value)).cache;
  const invalidCache = { ...f.deps, createCacheSnapshot: () => initialCache };
  assert.throws(() => applyQuarantinePlan(f.db, f.input, invalidCache, { now }), /CACHE_SNAPSHOT/);
  const asyncCallback = { ...f.deps, rebuildSummaries: async () => ({ rebuilt: 1, excludedOfferIds: ['o'] }) };
  assert.throws(() => applyQuarantinePlan(f.db, f.input, asyncCallback as unknown as typeof f.deps, { now }), /ASYNC_CALLBACK/);
  assert.deepEqual(f.snapshot(), before);
});
test('no acepta categoría ajena, y lease vencido no altera fechas ni cola', async t => {
  const f = await fixture(t);
  const product = f.db.prepare("SELECT * FROM products WHERE id='p'").get()!;
  const data = JSON.parse(String(product.row_json));
  f.db.prepare("UPDATE products SET category='almacenamiento',row_json=? WHERE id='p'")
    .run(JSON.stringify({ ...data, category: 'almacenamiento' }));
  assert.throws(() => applyQuarantinePlan(f.db, f.input, f.deps, { now }), /CATEGORY/);
  f.db.prepare("UPDATE products SET category=?,row_json=? WHERE id='p'").run(product.category, product.row_json);
  f.db.prepare("UPDATE pilot_refresh_demand SET status='leased',lease_token='expired',leased_at=?,lease_until=?").run(now - 5000, now - 1);
  const queue = f.snapshot().pilot_refresh_demand;
  applyQuarantinePlan(f.db, f.input, f.deps, { now });
  assert.deepEqual(f.snapshot().pilot_refresh_demand, queue);
});
test('idempotencia no oculta bases reinsertadas y vuelve a verificar el artefacto', async t => {
  const f = await fixture(t);
  applyQuarantinePlan(f.db, f.input, f.deps, { now });
  writeFileSync(f.file, '<h1>Fuente cambiada</h1>');
  assert.throws(() => applyQuarantinePlan(f.db, f.input, f.deps, { now }), /UNVERIFIED_EVIDENCE/);
  writeFileSync(f.file, `<link rel="canonical" href="${url}"><h1>${title}</h1>`);
  f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p', 'current', 'o', f.raw.store_id, f.raw.price, f.raw.stock, url, old);
  assert.throws(() => applyQuarantinePlan(f.db, f.input, f.deps, { now }), /ROW_CHANGED/);
});
test('auditoría y cuarentena sobreviven al cierre y reapertura de una copia de prueba', async t => {
  const f = await fixture(t);
  const result = applyQuarantinePlan(f.db, f.input, f.deps, { now });
  const path = f.file + '.sqlite';
  f.db.prepare('VACUUM INTO ?').run(path);
  const reopened = new DatabaseSync(path);
  try {
    const audit = reopened.prepare('SELECT * FROM pilot_quarantine_audit').get()!;
    assert.equal(audit.plan_id, result.planId);
    assert.equal(audit.before_hash, f.input.expectedRowHash);
    assert.equal(applyQuarantinePlan(reopened, f.input, f.deps, { now: now + 1000 }).status, 'already-applied');
    assert.equal(reopened.prepare('SELECT COUNT(*) n FROM pilot_quarantine_audit').get()?.n, 1);
    assert.equal(JSON.parse(String(reopened.prepare('SELECT row_json FROM product_prices').get()!.row_json)).last_updated, old);
  } finally { reopened.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { catalogIdentity, validateCatalog, hashFile, loadMacRefreshConsumer, runMacCatalogRefresh, parseMacRefreshArgs, initializeMacBudget } from './mac-catalog-refresh.mjs';
import { prepareProductionLoad } from './cloudflare-catalog/production-load.mjs';
import { rebuildProjection } from './cloudflare-catalog/projection.mjs';
import { initializeRefreshDemand, enqueueKnownProducts } from './cloudflare-catalog/refresh-demand.mjs';
const consumer = await loadMacRefreshConsumer();
const name = 'Placa de video MSI GeForce RTX 5070 Ventus 2X 12GB';
function fixture({ prepared = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mac-catalog-refresh-')), source = join(directory, 'source.sqlite');
  const db = new DatabaseSync(source), old = new Date(Date.now() - 2 * 86400000).toISOString();
  db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/schema.sql'), 'utf8'));
  db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/projection.sql'), 'utf8'));
  const prices = [];
  for (const [index, store] of ['maxtecno', 'liontech'].entries()) {
    const id = 'p' + index, offerId = 'o' + index, url = `https://${store}.com.ar/producto/msi-rtx-5070-ventus-2x-12gb/`;
    const product = { id, name, category: 'tarjetas-graficas', specs: {} };
    const raw = { id: offerId, product_id: id, store_id: store, url, price: 100000, stock: 'in-stock', last_updated: old };
    db.prepare('INSERT INTO stores VALUES(?,?)').run(store, JSON.stringify({ id: store, name: store }));
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, product.category, id, name.toLowerCase(), name.toLowerCase(), 1, 0, old, old, JSON.stringify(product));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id, name.toLowerCase());
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offerId, id, store, raw.price, url, JSON.stringify(raw));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 100000, 100000, 100000, 1, url, 0, JSON.stringify([store]), null, null, old, '{}');
    for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id, kind, offerId, store, raw.price, raw.stock, url, old);
    prices.push(raw);
  }
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts: catalogIdentity(db).counts }));
  rebuildProjection(db, { now: Date.now(), generation: 'fixture' });
  const identity = catalogIdentity(db), catalog = { version: identity.version, fingerprint: identity.fingerprint, counts: identity.counts };
  const snapshot = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);
  db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({ ...snapshot, catalog, ...(prepared ? { prepared_views: { ready: true } } : {}) }));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ ...catalog, complete: true, countsVerified: true }));
  if (prepared) db.exec('CREATE TABLE catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT NOT NULL)');
  db.close();
  return { directory, source, prices, close: () => rmSync(directory, { recursive: true, force: true }) };
}
function reader({ failedStore, stock = 'in-stock', stale = false } = {}) {
  return async (storeId, url, category) => {
    if (storeId === failedStore) return null;
    return { id: 'source', name, category, specs: {}, prices: [{ storeId, url, price: 120000, stock,
      lastUpdated: new Date(Date.now() - (stale ? 86400000 : 0)) }] };
  };
}
test('fingerprint reproduce exactamente production-load y detecta cambios de identidad fuente', () => {
  const f = fixture();
  try {
    const plan = prepareProductionLoad({ sqlite: f.source, directory: join(f.directory, 'load') });
    const db = new DatabaseSync(f.source);
    assert.equal(catalogIdentity(db).fingerprint, plan.catalog.fingerprint);
    const row = f.prices[0];
    db.prepare('UPDATE product_prices SET row_json=? WHERE id=?').run(JSON.stringify({ ...row, source_identity: { title: 'changed' } }), row.id);
    assert.throws(() => validateCatalog(db), /MANIFEST/);
    db.close();
  } finally { f.close(); }
});
test('dry-run no lee comercios, no escribe ni crea staging; conserva IDs exactos', async () => {
  const f = fixture();
  try {
    const before = await hashFile(f.source), directory = join(f.directory, 'stage');
    const result = await runMacCatalogRefresh({ source: f.source, directory, dryRun: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: () => { throw Error('must not call'); } });
    assert.equal(result.httpRequests, 0); assert.equal(result.writes, 0); assert.equal(existsSync(directory), false);
    assert.deepEqual(result.selected.map(t => t.offerId).sort(), ['o0', 'o1']); assert.equal(await hashFile(f.source), before);
  } finally { f.close(); }
});
test('observación y fallo preservan fechas reales, reconstruyen histórico y generan promoción readonly sin activar', async () => {
  const f = fixture();
  try {
    const before = await hashFile(f.source);
    const result = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'stage'), initializeMacBudget: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: reader({ failedStore: 'liontech' }) });
    assert.equal(result.observation.attempted, 2); assert.equal(result.observation.observed, 1);
    assert.equal(result.productionActivated, false); assert.equal(result.remoteRowsWritten, 0); assert.equal(result.promotionReady, true);
    assert.equal(await hashFile(f.source), before);
    const db = new DatabaseSync(result.candidate.path, { readOnly: true });
    assert.equal(JSON.parse(db.prepare("SELECT row_json FROM product_prices WHERE id='o1'").get().row_json).last_updated, f.prices[1].last_updated);
    const saved = JSON.parse(db.prepare("SELECT row_json FROM product_prices WHERE id='o0'").get().row_json);
    assert.equal(saved.price, 120000); assert.equal(saved.stock, 'in-stock'); assert.equal(typeof saved.identity_review.proof, 'object');
    assert.equal(db.prepare("SELECT price FROM price_basis WHERE id='o0' AND kind='historical'").get().price, 120000);
    assert.equal(db.prepare("SELECT price FROM price_basis WHERE id='o0' AND kind='current'").get().price, 120000);
    assert.equal(db.prepare("SELECT lowest FROM summaries WHERE product_id='p0'").get().lowest, 120000);
    assert.equal(result.candidate.certificate.offers, 2); validateCatalog(db); db.close();
    assert.throws(() => parseMacRefreshArgs(['--execute', f.source, '--unknown', 'x']), /USAGE/);
  } finally { f.close(); }
});
test('stock agotado observado no es comprable y replay fresco no vuelve a leer ni rejuvenecer', async () => {
  const f = fixture();
  try {
    const first = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'first'), initializeMacBudget: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: reader({ stock: 'out-of-stock' }) });
    const db = new DatabaseSync(first.candidate.path, { readOnly: true });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM price_basis WHERE kind='current'").get().n, 0);
    const dates = db.prepare('SELECT id,row_json FROM product_prices ORDER BY id').all(); db.close();
    const second = await runMacCatalogRefresh({ source: first.candidate.path, directory: join(f.directory, 'second'), offerIds: ['o0', 'o1'] },
      { consumer, reader: () => { throw Error('fresh replay must not read'); } });
    assert.equal(second.observation.attempted, 0);
    const replay = new DatabaseSync(second.candidate.path, { readOnly: true });
    assert.deepEqual(replay.prepare('SELECT id,row_json FROM product_prices ORDER BY id').all(), dates); replay.close();
  } finally { f.close(); }
});
test('fechas antiguas y preparado sin permiso jamás habilitan promociones', async () => {
  const f = fixture({ prepared: true });
  try {
    await assert.rejects(runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'blocked'), offerIds: ['o0', 'o1'] },
      { consumer, reader: reader() }), /PREPARED_COPY_REQUIRES_OPT_IN/);
    const result = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'stripped'), initializeMacBudget: true, discardPrepared: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: reader({ stale: true }) });
    assert.equal(result.observation.observed, 0);
    const db = new DatabaseSync(result.candidate.path, { readOnly: true });
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='catalog_prepared_products'").get(), undefined);
    for (const row of f.prices) assert.equal(JSON.parse(db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(row.id).row_json).last_updated, row.last_updated);
    db.close();
  } finally { f.close(); }
});
test('límites rechazan FullH4rd, más de3 tiendas y targets fuera de2..20 antes del primer reader', async () => {
  const f = fixture();
  try {
    for (const config of [{ maxTargets: 1 }, { maxTargets: 21 }, { storeIds: ['fullh4rd'] }, { storeIds: ['maxtecno', 'liontech', 'katech', 'mexx'] }, { freshMinutes: 60 }, { freshMinutes: 1441 }])
      await assert.rejects(runMacCatalogRefresh({ source: f.source, dryRun: true, ...config }, { consumer }), /MAC_REFRESH_(LIMIT|STORES|WINDOWS)/);
  } finally { f.close(); }
});
test('fecha con parser JS/SQL diferente se rechaza antes de leer comercios', async () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.source), raw = { ...f.prices[0], last_updated: 'October 10, 2026 12:00:00 GMT' };
    db.prepare('UPDATE product_prices SET row_json=? WHERE id=?').run(JSON.stringify(raw), raw.id); db.close();
    let reads = 0;
    await assert.rejects(runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'invalid'), offerIds: ['o0', 'o1'] },
      { consumer, reader: async () => { reads++; return null; } }), /OBSERVATION_CLOCK_DATE_MISMATCH/);
    assert.equal(reads, 0); assert.equal(existsSync(join(f.directory, 'invalid', 'promotion.json')), false);
  } finally { f.close(); }
});
test('cambio concurrente del origen invalida la promoción aun después de observar un lote', async () => {
  const f = fixture();
  try {
    let changed = false;
    await assert.rejects(runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'raced'), initializeMacBudget: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: async (...args) => {
        if (!changed) { const db = new DatabaseSync(f.source); db.prepare("UPDATE product_prices SET price=123,row_json=json_set(row_json,'$.price',123) WHERE id='o0'").run(); db.close(); changed = true; }
        return reader()(...args);
      } }), /SOURCE_OR_CERTIFICATE_CHANGED/);
    assert.equal(existsSync(join(f.directory, 'raced', 'promotion.json')), false);
  } finally { f.close(); }
});
test('corte de ledger exige autorización local explícita y preserva íntegramente la evidencia heredada', async () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.source), day = new Date().toISOString().slice(0, 10);
    db.exec('CREATE TABLE pilot_daily_write_budget(day TEXT PRIMARY KEY,used INTEGER,ceiling INTEGER)');
    db.prepare('INSERT INTO pilot_daily_write_budget VALUES(?,?,?)').run(day, 79990, 80000);
    const inherited = db.prepare('SELECT * FROM pilot_daily_write_budget').all(); db.close();
    let calls = 0;
    await assert.rejects(runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'missing-permission'), offerIds: ['o0', 'o1'] },
      { consumer, reader: async () => { calls++; return null; } }), /BUDGET_INITIALIZATION_REQUIRED/);
    assert.equal(calls, 0);
    const result = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'cut'), initializeMacBudget: true, offerIds: ['o0', 'o1'] },
      { consumer, reader: reader() });
    assert.equal(result.observation.observed, 2); assert.equal(result.localBudget.kind, 'mac-local-estimate');
    assert.equal(result.denominator.offers, 2); assert.equal(result.denominator.compatibleOffers, 2);
    const next = new DatabaseSync(result.candidate.path);
    assert.deepEqual(next.prepare('SELECT * FROM mac_inherited_d1_daily_write_budget').all(), inherited);
    const used = next.prepare('SELECT used FROM pilot_daily_write_budget WHERE day=?').get(day).used;
    assert.ok(used > 0 && used < 79990);
    initializeMacBudget(next);
    assert.equal(next.prepare('SELECT used FROM pilot_daily_write_budget WHERE day=?').get(day).used, used);
    assert.throws(() => initializeMacBudget(next, { allowFirstCut: true, sourceSha256: '0'.repeat(64) }), /ALREADY_LOCAL/);
    next.close();
    const original = new DatabaseSync(f.source, { readOnly: true });
    assert.deepEqual(original.prepare('SELECT * FROM pilot_daily_write_budget').all(), inherited); original.close();
  } finally { f.close(); }
});
test('sweep explícito acepta hasta500 targetsCG; otros modos y tiendas no autorizan ese límite', async () => {
  const f = fixture();
  try {
    const parsed = parseMacRefreshArgs(['--execute', f.source, '--sweep', '--max-targets', '500', '--initialize-mac-budget']);
    assert.equal(parsed.sweep, true); assert.equal(parsed.maxTargets, 500); assert.equal(parsed.initializeMacBudget, true);
    await assert.rejects(runMacCatalogRefresh({ source: f.source, dryRun: true, maxTargets: 500 }, { consumer }), /LIMIT/);
    await assert.rejects(runMacCatalogRefresh({ source: f.source, dryRun: true, sweep: true, maxTargets: 501 }, { consumer }), /LIMIT/);
    await assert.rejects(runMacCatalogRefresh({ source: f.source, dryRun: true, sweep: true, maxTargets: 500, storeIds: ['liontech'] }, { consumer }), /SWEEP_STORE/);
    const db = new DatabaseSync(f.source);
    db.exec('CREATE TABLE pilot_listing_observations(reference TEXT PRIMARY KEY,store_id TEXT,observed_at TEXT,source_hash TEXT,row_json TEXT)');
    for (let index = 0; index < 2; index++) {
      const id = 'p' + index, url = `https://compragamer.com/producto/Placa_MSI_GeForce_RTX_5070_Ventus_2X_12GB_${1000 + index}`;
      const raw = { ...f.prices[index], store_id: 'compragamer', url };
      db.prepare('UPDATE product_prices SET store_id=?,url=?,row_json=? WHERE id=?').run(raw.store_id, url, JSON.stringify(raw), raw.id);
      for (const kind of ['historical', 'current']) db.prepare('UPDATE price_basis SET store_id=?,url=? WHERE id=? AND kind=?').run(raw.store_id, url, raw.id, kind);
      db.prepare('UPDATE summaries SET store_ids_json=?,urls=? WHERE product_id=?').run('["compragamer"]', url, id);
      const captured = JSON.stringify({ id: 'cg-' + (1000 + index), name, category: 'tarjetas-graficas', specs: {} });
      db.prepare('INSERT INTO pilot_listing_observations VALUES(?,?,?,?,?)').run('compragamer:id:' + (1000 + index), 'compragamer', new Date().toISOString(), createHash('sha256').update(captured).digest('hex'), captured);
    }
    const identity = catalogIdentity(db), catalog = { version: 1, fingerprint: identity.fingerprint, counts: identity.counts };
    const snapshot = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify({ ...snapshot, catalog }));
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='production_catalog'").run(JSON.stringify({ ...catalog, complete: true, countsVerified: true }));
    initializeRefreshDemand(db); enqueueKnownProducts(db, { productIds: ['p0', 'p1'], storeIds: ['compragamer'], now: Date.now() - 120000 });
    db.prepare("UPDATE pilot_refresh_demand SET status='observed'").run(); db.close();
    const auto = await runMacCatalogRefresh({ source: f.source, dryRun: true, sweep: true, maxTargets: 500, storeIds: ['compragamer'] }, { consumer });
    assert.equal(auto.selected.length, 2); // Una observación vieja vuelve a ser seleccionable sin saltar backoff.
    const result = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'sweep'), sweep: true, maxTargets: 500,
      storeIds: ['compragamer', 'liontech'], initializeMacBudget: true, offerIds: ['o0', 'o1'] }, { consumer, reader: reader() });
    assert.equal(result.observation.attempted, 2); assert.equal(result.observation.observed, 2);
    assert.equal(result.limits.maxTargets, 500); assert.equal(result.limits.maxHttp, 10); assert.equal(result.limits.readerDeadlineMs, 300000);
    assert.equal(result.remoteRowsWritten, 0); assert.equal(result.denominator.compatibleReferences, 2);
    // Target compatible consigo mismo no autoriza feed ausente, captura inválida
    // ni otra variante. Ninguna de estas selecciones abre el lector.
    for (const variation of ['missing', 'bad-hash', 'expired', 'different-variant']) {
      const original = new DatabaseSync(f.source);
      const capture = JSON.stringify({ id: 'cg-1001', name: variation === 'different-variant' ? name.replace('12GB', '16GB') : name,
        category: 'tarjetas-graficas', specs: {} });
      original.prepare('DELETE FROM pilot_listing_observations WHERE reference=?').run('compragamer:id:1001');
      if (variation !== 'missing') original.prepare('INSERT INTO pilot_listing_observations VALUES(?,?,?,?,?)')
        .run('compragamer:id:1001', 'compragamer', new Date(Date.now() - (variation === 'expired' ? 2 * 86400000 : 0)).toISOString(),
          variation === 'bad-hash' ? '0'.repeat(64) : createHash('sha256').update(capture).digest('hex'), capture);
      original.close();
      await assert.rejects(runMacCatalogRefresh({ source: f.source, dryRun: true, sweep: true, maxTargets: 500,
        storeIds: ['compragamer'], offerIds: ['o0', 'o1'] }, { consumer, reader: () => { throw Error('must not read'); } }), /CAPTURE_OR_PROOF_REQUIRED/);
    }
  } finally { f.close(); }
});

test('puente más certificación conserva microsegundos sin consultar tiendas ni activar producción', async () => {
  const f = fixture();
  try {
    const publicEnv = join(f.directory, 'public.env');
    writeFileSync(publicEnv, 'NEXT_PUBLIC_SUPABASE_URL=https://testproject.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture\n');
    const now = Math.floor(Date.now() / 1000) * 1000;
    // Ambas observaciones preceden el corte, aun cuando el test empieza al inicio de un segundo.
    const second = new Date(now - 1000).toISOString().slice(0, 19);
    const dates = [second + '.123789Z', second + '.999789Z'];
    const rows = f.prices.map((price, index) => ({ ...price, price: 110000, last_updated: dates[index],
      source_identity: { title: name, listingRef: consumer.listingReference(price.store_id, price.url) },
      products: { id: price.product_id, name, category: 'tarjetas-graficas', specs: {} } }));
    const before = await hashFile(f.source);
    const result = await runMacCatalogRefresh({ source: f.source, directory: join(f.directory, 'upstream'),
      upstreamOnly: true, upstreamEnvFile: publicEnv, initializeMacBudget: true },
    { consumer, upstreamFetch: async () => Response.json(rows), reader: () => { throw Error('No merchant request authorized'); } });
    assert.equal(result.upstream.accepted, 2); assert.equal(result.remoteRowsRead, 2);
    assert.equal(result.productionActivated, false); assert.equal(result.remoteRowsWritten, 0); assert.equal(result.promotionReady, true);
    assert.equal(await hashFile(f.source), before);
    const db = new DatabaseSync(result.candidate.path, { readOnly: true });
    try {
      validateCatalog(db);
      const saved = db.prepare('SELECT row_json FROM product_prices ORDER BY id').all().map(r => JSON.parse(r.row_json));
      assert.deepEqual(saved.map(r => r.last_updated), dates);
      assert.deepEqual(saved.map(r => r.price), [110000, 110000]);
      assert.equal(result.candidate.certificate.offers, 2);
    } finally { db.close(); }
  } finally { f.close(); }
});

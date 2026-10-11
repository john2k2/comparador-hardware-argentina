import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { initializeRefreshDemand, enqueueKnownProducts, claimRefreshBatch, acknowledgeRefresh } from './refresh-demand.mjs';
import { runLocalRefresh } from './refresh-local';
import { SourceHttpError } from '@/lib/scrapers/source-http';
import type { Product } from '@/lib/types';

const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const HOUR = 3600000, now = Date.parse('2026-10-11T16:00:00Z');
const name = 'Placa de video MSI GeForce RTX 5070 Ventus 2X 12GB';
// Cualquier acceso accidental de un lector real falla sin salir a la red.
globalThis.fetch = async () => { throw new Error('TEST_HTTP_FORBIDDEN'); };

function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/schema.sql'), 'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify({ counts: {}, hashes: {} }));
  const old = new Date(now - 48 * HOUR).toISOString();
  for (const [id, storeId] of [['a', 'fullh4rd'], ['b', 'fullh4rd'], ['c', 'maxtecno']]) {
    const productId = 'p-' + id;
    const url = storeId === 'fullh4rd' ? `https://www.fullh4rd.com.ar/prod/${id === 'a' ? 12345 : 12346}/msi-rtx-5070-ventus-2x-12gb`
      : 'https://maxtecno.com.ar/producto/msi-rtx-5070-ventus-2x-12gb/';
    const raw = { id, product_id: productId, store_id: storeId, url, price: 100000, stock: 'in-stock', last_updated: old };
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(productId, 'tarjetas-graficas', 'identity', name.toLowerCase(), name.toLowerCase(), 1, 0, old, old,
      JSON.stringify({ id: productId, name, category: 'tarjetas-graficas' }));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(productId, name.toLowerCase());
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id, productId, storeId, 100000, url, JSON.stringify(raw));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(productId, 100000, 100000, 100000, 1, url, 0, JSON.stringify([storeId]), null, null, old, '{}');
    for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(productId, kind, id, storeId, 100000, 'in-stock', url, old);
  }
  rebuildProjection(db, { now, generation: 'before' });
  initializeRefreshDemand(db);
  enqueueKnownProducts(db, { productIds: ['p-a', 'p-b', 'p-c'], now });
  const queue = () => db.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all();
  const raw = () => db.prepare('SELECT * FROM product_prices ORDER BY id').all();
  const dependencies = { clock: () => now, projection: rebuildProjection, estimateIndexes: () => 0 };
  return { db, queue, raw, dependencies };
}

if (process.argv[2] === '--pause-child') {
  // Proceso nuevo: no comparte Map de source-http, reloj ni conexión con el padre.
  const db = new DatabaseSync(process.argv[3]);
  let readerCalls = 0;
  try {
    const before = db.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all();
    const result = await runLocalRefresh(db, { limit: 3, storeIds: ['fullh4rd'], clock: () => Number(process.argv[4]),
      projection: rebuildProjection, estimateIndexes: () => 0, reader: async () => { readerCalls++; return null; } });
    const after = db.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all();
    console.log(JSON.stringify({ readerCalls, attempted: result.attempted, observed: result.observed, queueUnchanged: JSON.stringify(before) === JSON.stringify(after), sourceHttp: result.sourceHttp }));
  } finally { db.close(); }
} else {
  for (const status of [403, 429]) test(`${status}: otra oferta de la tienda bloqueada no consume intento y la otra tienda se observa`, async () => {
    const f = fixture(), calls: string[] = [], beforeB = f.queue().find(row => row.offer_id === 'b');
    let time = now;
    try {
      const result = await runLocalRefresh(f.db, { ...f.dependencies, clock: () => time, limit: 3, reader: async (storeId, url) => {
        calls.push(storeId);
        if (storeId === 'fullh4rd') throw new SourceHttpError(status === 403 ? 'blocked' : 'rate-limited', status);
        const observed = new Date(time + 1); time += 5;
        return { id: 'source', name, category: 'tarjetas-graficas', specs: {},
          prices: [{ storeId, url, price: 120000, stock: 'in-stock', lastUpdated: observed, installment: null }] } as Product;
      } });
      assert.deepEqual(calls, ['fullh4rd', 'maxtecno']);
      assert.equal(result.attempted, 2); assert.equal(result.observed, 1);
      assert.equal(result.results[0].outcome, `http-${status}`);
      assert.equal(result.results[0].acknowledged, true);
      assert.deepEqual(f.queue().find(row => row.offer_id === 'b'), beforeB);
      assert.equal(f.db.prepare("SELECT until_at FROM pilot_cycle_store_pause WHERE store_id='fullh4rd'").get()!.until_at, now + 6 * HOUR);
      const blockedRaw = JSON.parse(f.db.prepare("SELECT row_json FROM product_prices WHERE id='a'").get()!.row_json as string);
      assert.equal(blockedRaw.last_updated, new Date(now - 48 * HOUR).toISOString());
    } finally { f.db.close(); }
  });

  test('proceso nuevo sobre archivo SQLite conserva pausa, cero lecturas y todos los intentos intactos', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'catalog-store-pause-')), path = join(directory, 'sample.sqlite');
    const f = fixture(path);
    try {
      await runLocalRefresh(f.db, { ...f.dependencies, limit: 1, storeIds: ['fullh4rd'], reader: async () => { throw new SourceHttpError('blocked', 403); } });
      const before = f.queue(); f.db.close();
      const child = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--pause-child', path, String(now + HOUR)], { encoding: 'utf8', timeout: 30000 }));
      assert.deepEqual(child, { readerCalls: 0, attempted: 0, observed: 0, queueUnchanged: true, sourceHttp: {} });
      const check = new DatabaseSync(path, { readOnly: true });
      try { assert.deepEqual(check.prepare('SELECT * FROM pilot_refresh_demand ORDER BY offer_id').all(), before); }
      finally { check.close(); }
    } finally { if (f.db.isOpen) f.db.close(); rmSync(directory, { recursive: true }); }
  });

  test('la pausa bloquea hasta el límite exacto; al vencer conserva pendiente y permite reclamar la otra oferta', () => {
    const f = fixture();
    try {
      const lease = claimRefreshBatch(f.db, { now, limit: 1, offerIds: ['a'] })[0];
      acknowledgeRefresh(f.db, { ...lease, now, outcome: 'http-403' });
      const pending = f.queue().find(row => row.offer_id === 'b');
      assert.deepEqual(claimRefreshBatch(f.db, { now: now + 6 * HOUR - 1, limit: 1, storeIds: ['fullh4rd'] }), []);
      assert.deepEqual(f.queue().find(row => row.offer_id === 'b'), pending);
      const resumed = claimRefreshBatch(f.db, { now: now + 6 * HOUR, limit: 1, storeIds: ['fullh4rd'] });
      assert.equal(resumed[0].offerId, 'b'); assert.equal(resumed[0].attempt, 1);
    } finally { f.db.close(); }
  });

  test('Retry-After de24h bloquea toda la tienda y un ACK más corto no reduce pausa previa', () => {
    for (const existing of [false, true]) {
      const f = fixture();
      try {
        const lease = claimRefreshBatch(f.db, { now, limit: 1, offerIds: ['a'] })[0];
        if (existing) f.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('fullh4rd', now + 24 * HOUR, 'http-429');
        const receipt = acknowledgeRefresh(f.db, { ...lease, now, outcome: 'http-429', retryAfterMs: existing ? HOUR : 24 * HOUR });
        assert.equal(receipt.dueAt, now + (existing ? 6 : 24) * HOUR);
        assert.equal(f.db.prepare("SELECT until_at FROM pilot_cycle_store_pause WHERE store_id='fullh4rd'").get()!.until_at, now + 24 * HOUR);
        assert.deepEqual(claimRefreshBatch(f.db, { now: now + 24 * HOUR - 1, limit: 1, storeIds: ['fullh4rd'] }), []);
        assert.equal(claimRefreshBatch(f.db, { now: now + 24 * HOUR, limit: 1, storeIds: ['fullh4rd'] })[0].offerId, 'b');
      } finally { f.db.close(); }
    }
  });

  test('fallo después de escribir ACK revierte conjuntamente cola y pausa de tienda sin alterar precios', () => {
    const f = fixture();
    try {
      const lease = claimRefreshBatch(f.db, { now, limit: 1, offerIds: ['a'] })[0], beforeQueue = f.queue(), beforeRaw = f.raw();
      f.db.exec("CREATE TRIGGER reject_ack AFTER UPDATE ON pilot_refresh_demand WHEN NEW.status='backoff' BEGIN SELECT RAISE(ABORT,'TEST_ACK_FAILURE'); END;");
      assert.throws(() => acknowledgeRefresh(f.db, { ...lease, now, outcome: 'http-403' }), /TEST_ACK_FAILURE/);
      assert.deepEqual(f.queue(), beforeQueue); assert.deepEqual(f.raw(), beforeRaw);
      assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_cycle_store_pause').get()!.n, 0);
      assert.equal(f.db.isTransaction, false);
    } finally { f.db.close(); }
  });
}

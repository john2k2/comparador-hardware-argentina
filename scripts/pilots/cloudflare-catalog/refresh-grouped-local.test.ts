import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Product } from '@/lib/types';
import { SourceHttpError } from '@/lib/scrapers/source-http';
import { initializeRefreshDemand, enqueueKnownProducts } from './refresh-demand.mjs';
import { runGroupedLocalRefresh } from './refresh-grouped-local';
const { rebuildProjection } = await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const now = Date.parse('2026-10-11T19:00:00Z'), name = 'MSI GeForce RTX 5070 Ventus 2X 12GB';
function fixture({ differentUrls = false, store = 'maxtecno' } = {}) {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/schema.sql'), 'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', '{}');
  const old = new Date(now - 2 * 86400000).toISOString(), ids = ['a', 'b'];
  for (const id of ids) {
    const url = store === 'fullh4rd' ? 'https://www.fullh4rd.com.ar/prod/12345/msi-rtx-5070' : `https://maxtecno.com.ar/producto/${differentUrls ? id : 'shared'}/`;
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, 'tarjetas-graficas', 'identity', name.toLowerCase(), name.toLowerCase(), 1, 0, old, old, JSON.stringify({ id, name, category: 'tarjetas-graficas' }));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id, name.toLowerCase());
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id, id, store, 100, url, JSON.stringify({ id, product_id: id, store_id: store, price: 100, url, stock: 'in-stock', last_updated: old }));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 100, 100, 100, 1, url, 0, JSON.stringify([store]), null, null, old, '{}');
    for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id, kind, id, store, 100, 'in-stock', url, old);
  }
  rebuildProjection(db, { now, generation: 'before' }); initializeRefreshDemand(db);
  enqueueKnownProducts(db, { productIds: ids, offerIds: ids, storeIds: [store], now });
  let time = now, calls = 0;
  const source = (url: string, stock = 'in-stock', at = time) => ({ id: 'source', name, category: 'tarjetas-graficas', specs: {}, prices: [{ storeId: store, url, price: 120, stock, lastUpdated: new Date(at) }] } as Product);
  const deps = { offerIds: ids, projection: rebuildProjection, estimateIndexes: () => 0, clock: () => time,
    reader: async (_store: string, url: string) => { calls++; time += 5; return source(url); } };
  const prices = () => db.prepare('SELECT row_json FROM product_prices ORDER BY id').all();
  return { db, deps, calls: () => calls, source, prices, advance: (ms: number) => { time += ms; } };
}
test('dos destinos reclaman antes de una lectura compartida y guardan la misma observación', async () => {
  const f = fixture(); let calls = 0;
  const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async (_store, url, _category, _signal, context) => {
    calls++; assert.equal(f.db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='leased'").get()!.n, 2);
    assert.equal(context?.observedAfter,now);
    f.advance(5); return f.source(url);
  } });
  assert.equal(calls, 1); assert.equal(r.observed, 2); assert.equal(r.publications, 1);
  const dates = f.prices().map(row => JSON.parse(String(row.row_json)).last_updated); assert.equal(dates[0], dates[1]); f.db.close();
});
test('dos fichas RAM manufacturer reciben proof por publicación con una lectura y conservan productos',async()=>{
  const f=fixture({store:'compragamer'}),title='Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
  const sku='CMG16GX4M1E3200C16',url='https://compragamer.com/producto/RAM_15558';
  for(const id of ['a','b']){
    f.db.prepare('UPDATE products SET category=?,row_json=? WHERE id=?').run('memoria-ram',JSON.stringify({id,name:title,category:'memoria-ram',specs:{SKU:sku}}),id);
    const raw=JSON.parse(String(f.db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(id)!.row_json));
    f.db.prepare('UPDATE product_prices SET url=?,row_json=? WHERE id=?').run(url,JSON.stringify({...raw,url}),id);
    f.db.prepare('UPDATE price_basis SET url=? WHERE id=?').run(url,id);
  }
  enqueueKnownProducts(f.db,{productIds:['a','b'],offerIds:['a','b'],storeIds:['compragamer'],now});
  const products=f.db.prepare('SELECT * FROM products ORDER BY id').all();let calls=0;
  const r=await runGroupedLocalRefresh(f.db,{...f.deps,reader:async()=>{
    calls++;f.advance(5);return {name:title,category:'memoria-ram',specs:{SKU:sku},prices:[{storeId:'compragamer',url,price:200,stock:'in-stock',lastUpdated:new Date(now+5)}]} as Product;
  }});
  assert.equal(calls,1);assert.equal(r.observed,2);assert.equal(r.publications,1);
  assert.deepEqual(f.db.prepare('SELECT * FROM products ORDER BY id').all(),products);
  for(const row of f.prices()){
    const raw=JSON.parse(String(row.row_json));assert.equal(raw.identity_review.proof.method,'manufacturer-ram');
    assert.equal(raw.source_identity.title,title);assert.equal(raw.identity_review.proof.binding.listingRef,'compragamer:id:15558');
  }
  f.db.close();
});
test('una fuente previa al lease y una variante distinta no renuevan ninguna fila', async () => {
  for (const stale of [true, false]) {
    const f = fixture(), before = f.prices();
    const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async (_store, url) => {
      f.advance(5); const p = f.source(url, 'in-stock', stale ? now - 1 : now + 5);
      if (!stale) p.name = 'MSI GeForce RTX 5070 Ti Ventus 2X 16GB'; return p;
    } });
    assert.equal(r.observed, 0); assert.deepEqual(f.prices(), before); f.db.close();
  }
});
test('403 pausa durablemente la tienda y evita leer otra publicación ya reclamada', async () => {
  const f = fixture({ differentUrls: true }), before = f.prices(); let calls = 0;
  const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async () => { calls++; throw new SourceHttpError('blocked', 403); } });
  assert.equal(calls, 1); assert.equal(r.observed, 0); assert.equal(r.results.filter(x => x.status === 'failed' && x.skipped).length, 1);
  assert.deepEqual(f.prices(), before); assert.ok(Number(f.db.prepare('SELECT until_at FROM pilot_cycle_store_pause').get()!.until_at) >= now + 6 * 3600000);
  assert.equal((await runGroupedLocalRefresh(f.db, f.deps)).attempted, 0); f.db.close();
});
test('stock desconocido se observa una vez para ambos destinos sin base comprable', async () => {
  const f = fixture(); const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async (_store, url) => { f.advance(5); return f.source(url, 'unknown'); } });
  assert.equal(r.observed, 2); assert.equal(f.db.prepare("SELECT COUNT(*) n FROM price_basis WHERE kind='current'").get()!.n, 0); f.db.close();
});
test('una pausa del catálogo vecino evita HTTP y un bloqueo nuevo se propaga', async () => {
  for (const preexisting of [true, false]) {
    const f = fixture(), peer = fixture(); let calls = 0;
    if (preexisting) peer.db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?)').run('maxtecno', now + 6 * 3600000, 'http-403');
    const r = await runGroupedLocalRefresh(f.db, { ...f.deps, pausePeers: [peer.db], reader: async () => {
      calls++; throw new SourceHttpError('blocked', 403);
    } });
    assert.equal(calls, preexisting ? 0 : 1); assert.equal(r.observed, 0);
    assert.equal(peer.db.prepare('SELECT until_at FROM pilot_cycle_store_pause').get()!.until_at,
      f.db.prepare('SELECT until_at FROM pilot_cycle_store_pause').get()!.until_at);
    f.db.close(); peer.db.close();
  }
});
test('deadline corta las publicaciones restantes y no saltea FullH4rd diferido', async () => {
  const f = fixture({ differentUrls: true }); let calls = 0;
  const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async (_store, url) => { calls++; f.advance(181000); return f.source(url); } });
  assert.equal(calls, 1); assert.equal(r.observed, 1); f.db.close();
  const full = fixture({ store: 'fullh4rd' }); assert.equal((await runGroupedLocalRefresh(full.db, full.deps)).attempted, 0); assert.equal(full.calls(), 0); full.db.close();
});
test('presupuesto agotado y lease reemplazado conservan precio/fecha aun con fuente válida', async () => {
  for (const replace of [true, false]) {
    const f = fixture(), before = f.prices();
    if (!replace) f.db.exec("CREATE TABLE pilot_daily_write_budget(day TEXT PRIMARY KEY,used INTEGER,ceiling INTEGER);INSERT INTO pilot_daily_write_budget VALUES('2026-10-11',80000,80000)");
    const r = await runGroupedLocalRefresh(f.db, { ...f.deps, reader: async (_store, url) => {
      if (replace) f.db.exec("UPDATE pilot_refresh_demand SET lease_token='other'"); f.advance(5); return f.source(url);
    } });
    assert.equal(r.observed, 0); assert.deepEqual(f.prices(), before); f.db.close();
  }
});
test('el alcance no acepta más de25 ofertas ni IDs duplicados', async () => {
  const f = fixture(); await assert.rejects(runGroupedLocalRefresh(f.db, { ...f.deps, offerIds: ['a', 'a'] }), /SCOPE/);
  await assert.rejects(runGroupedLocalRefresh(f.db, { ...f.deps, offerIds: Array.from({ length: 26 }, (_, n) => String(n)) }), /SCOPE/); f.db.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { loadMacRefreshConsumer } from './mac-catalog-refresh.mjs';
const { admitUpstreamObservations, syncUpstreamObservations } = await loadMacRefreshConsumer();
const now = Date.parse('2026-10-14T03:00:00Z'), old = '2026-10-12T03:00:00Z', recent = '2026-10-14T02:00:00Z';
const name = 'Memoria Corsair DDR4 16GB 3200MHz Vengeance RGB RS Black CL16';
const url = 'https://compragamer.com/producto/Memoria_Corsair_DDR4_16GB_3200MHz_Vengeance_RGB_RS_Black_CL16_15558';
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql', 'utf8'));
  const product = { id: 'ram', name, category: 'memoria-ram', specs: { SKU: 'CMG16GX4M1E3200C16' }, created_at: old, updated_at: old };
  const before = { id: 'offer', product_id: 'ram', store_id: 'compragamer', url, price: 200000, stock: 'in-stock', last_updated: old,
    source_identity: { title: name, storeSku: 'CMG16GX4M1E3200C16', listingRef: 'compragamer:id:15558' } };
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('ram', product.category, 'ram', name, name, 1, 0, old, old, JSON.stringify(product));
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('offer', 'ram', 'compragamer', before.price, url, JSON.stringify(before));
  const row = { ...before, last_updated: recent, price: 180000, products: product };
  const read = () => JSON.parse(db.prepare('SELECT row_json FROM product_prices').get().row_json);
  return { db, before, row, read };
}
test('transporta precio/stock/fecha observados sin renovar metadata ni asociaciones', t => {
  const f = fixture(t), beforeProduct = f.db.prepare('SELECT row_json FROM products').get().row_json;
  const result = admitUpstreamObservations(f.db, [{ ...f.row, stock: 'out-of-stock' }], now);
  assert.equal(result.accepted, 1); assert.equal(result.remoteRowsWritten, 0);
  assert.equal(f.read().last_updated, recent); assert.equal(f.read().price, 180000); assert.equal(f.read().stock, 'out-of-stock');
  assert.equal(f.db.prepare('SELECT row_json FROM products').get().row_json, beforeProduct);
  assert.equal(f.db.prepare('SELECT row_json FROM pilot_offer_observations').get().row_json, JSON.stringify(f.read()));
});
test('repetir, perder frescura o recibir fuente más vieja nunca rejuvenece ni retrocede', t => {
  const f = fixture(t); admitUpstreamObservations(f.db, [f.row], now);
  for (const last_updated of [recent, old]) {
    const result = admitUpstreamObservations(f.db, [{ ...f.row, price: 1, last_updated }], now);
    assert.equal(result.reasons['not-newer'], 1); assert.equal(f.read().price, 180000); assert.equal(f.read().last_updated, recent);
  }
});
test('CPU idéntica con claves heredadas usa el mismo contrato de nombre en ambos lados', t => {
  const f = fixture(t);
  const product = { ...f.row.products, name: 'AMD Ryzen 7 5700X', category: 'procesadores',
    canonical_product_key: 'legacy-cpu', normalized_title: '5700X AMD RYZEN 7', specs: {} };
  const cpuUrl = 'https://compragamer.com/producto/Procesador_AMD_Ryzen_7_5700X_13712';
  const before = { ...f.before, url: cpuUrl };
  f.db.prepare('UPDATE products SET category=?,row_json=?').run(product.category, JSON.stringify(product));
  f.db.prepare('UPDATE product_prices SET url=?,row_json=?').run(cpuUrl, JSON.stringify(before));
  const result = admitUpstreamObservations(f.db, [{ ...f.row, url: cpuUrl, products: product,
    source_identity: { title: product.name, listingRef: 'compragamer:id:13712' } }], now);
  assert.equal(result.accepted, 1); assert.equal(f.read().last_updated, recent);
});
test('rechaza producto, URL, SKU, variante, fuente contradictoria y fecha futura', t => {
  for (const patch of [
    { product_id: 'another' }, { url: url + '?different=1' }, { last_updated: '2099-01-01T00:00:00Z' },
    { products: { id: 'ram', name: name.replace('16GB', '32GB'), category: 'memoria-ram', specs: {} } },
    { source_identity: { title: name, storeSku: 'OTHER', listingRef: 'compragamer:id:15558' } },
    { source_identity: { title: name, listingRef: 'compragamer:id:99999' } },
    { source_identity: { title: name.replace('16GB', '32GB'), listingRef: 'compragamer:id:15558' } },
  ]) {
    const f = fixture(t), result = admitUpstreamObservations(f.db, [{ ...f.row, ...patch }], now);
    assert.equal(result.accepted, 0, JSON.stringify(patch)); assert.deepEqual(f.read(), f.before);
  }
});
test('copia marcada productiva, duplicados o historia contradictoria impiden mutación', t => {
  const f = fixture(t);
  f.db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', '{}');
  assert.throws(() => admitUpstreamObservations(f.db, [f.row], now), /STAGING_REQUIRED/);
  f.db.exec("DELETE FROM pilot_meta WHERE key='production_catalog'");
  assert.throws(() => admitUpstreamObservations(f.db, [f.row, f.row], now), /DUPLICATE/);
  f.db.exec('CREATE TABLE pilot_offer_observations(offer_id TEXT,observed_at TEXT,row_json TEXT,PRIMARY KEY(offer_id,observed_at))');
  f.db.prepare('INSERT INTO pilot_offer_observations VALUES(?,?,?)').run('offer', recent, '{}');
  assert.throws(() => admitUpstreamObservations(f.db, [f.row], now), /HISTORY_CONFLICT/);
  assert.deepEqual(f.read(), f.before);
});
const options = { url: 'https://testproject.supabase.co', publicKey: 'sb_publishable_fixture', now };
test('lector hace sólo GET sin bearer privilegiado y guarda cursor verificable', async t => {
  const f = fixture(t);
  const report = await syncUpstreamObservations(f.db, { ...options, fetch: async (url, init) => {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, undefined);
    assert.equal(url.searchParams.get('select'), '*,products(*)');
    return Response.json([f.row]);
  } });
  assert.equal(report.accepted, 1); assert.equal(report.requests, 1); assert.equal(report.capped, false);
  assert.equal(report.cursor.complete, true); assert.equal(f.read().last_updated, recent);
});
test('oferta prioritaria se sincroniza antes del backfill, se deduplica y cuenta cada fila leída', async t => {
  const f = fixture(t); let calls = 0;
  const result = await syncUpstreamObservations(f.db, { ...options, priorityOfferIds: ['offer'], fetch: async url => {
    if (calls++ === 0) assert.equal(url.searchParams.get('id'), 'in.(offer)');
    else assert.equal(url.searchParams.get('order'), 'last_updated.asc,id.asc');
    return Response.json([f.row]);
  } });
  assert.equal(result.receivedRows, 2); assert.equal(result.priorityRows, 1); assert.equal(result.read, 1);
  assert.equal(result.accepted, 1); assert.equal(result.requests, 2); assert.equal(f.read().last_updated, recent);
});
test('límite de 1000 filas conserva continuación, reanuda sin omitir frontera y solapa 3h', async t => {
  const f = fixture(t); let calls = 0;
  const result = await syncUpstreamObservations(f.db, { ...options, fetch: async () => {
    const offset = calls++ * 250;
    return Response.json(Array.from({ length: 250 }, (_, i) => ({ ...f.row, id: 'outside_' + String(offset + i).padStart(4, '0') })));
  } });
  assert.equal(calls, 4); assert.equal(result.read, 1000); assert.equal(result.capped, true); assert.equal(result.accepted, 0);
  const next = await syncUpstreamObservations(f.db, { ...options, now: now + 900000, fetch: async url => {
    assert.match(url.searchParams.get('or'), /outside_0999/); return Response.json([]);
  } });
  assert.equal(next.cursor.complete, true);
  await syncUpstreamObservations(f.db, { ...options, now: now + 1800000, fetch: async url => {
    assert.equal(url.searchParams.get('last_updated'), 'gte.2026-10-14T00:00:00.000Z');
    return Response.json([]);
  } });
});
test('fallo HTTP o página excesiva no adelanta cursor ni cambia ofertas', async t => {
  const f = fixture(t);
  for (const response of [() => new Response('no', { status: 503 }), () => new Response(' '.repeat(4 * 1024 * 1024 + 1))]) {
    await assert.rejects(syncUpstreamObservations(f.db, { ...options, fetch: async () => response() }), /UPSTREAM_/);
    assert.equal(f.db.prepare("SELECT value FROM pilot_meta WHERE key='upstream_observation_cursor_v1'").get(), undefined);
    assert.deepEqual(f.read(), f.before);
  }
});
test('rechaza secreto privilegiado o destino externo antes de HTTP', async t => {
  const f = fixture(t);
  for (const patch of [{ publicKey: 'sb_secret_example' }, { url: 'https://evil.example/' }, { url: 'http://127.0.0.1:5432/' }])
    await assert.rejects(syncUpstreamObservations(f.db, { ...options, ...patch, fetch: () => { throw Error('must not call'); } }), /UPSTREAM_PUBLIC_/);
});

test('admite diferencias de microsegundos y conserva la fecha original exacta', t => {
  const f = fixture(t);
  for (const [last_updated, price] of [['2026-10-14T02:00:00.123100Z', 180000], ['2026-10-14T02:00:00.123900Z', 190000]]) {
    assert.equal(admitUpstreamObservations(f.db, [{ ...f.row, last_updated, price }], now).accepted, 1);
    assert.equal(f.read().last_updated, last_updated); assert.equal(f.read().price, price);
  }
  assert.equal(admitUpstreamObservations(f.db, [{ ...f.row, last_updated: '2026-10-13T23:00:00.123800-03:00' }], now).reasons['not-newer'], 1);
});
test('duplicado de prioridad y página elige la observación posterior dentro del milisegundo', async t => {
  const f = fixture(t); let calls = 0;
  const result = await syncUpstreamObservations(f.db, { ...options, priorityOfferIds: ['offer'], fetch: async () =>
    Response.json([{ ...f.row, last_updated: '2026-10-14T02:00:00.' + (calls++ ? '123900Z' : '123100Z'), price: calls === 1 ? 180000 : 190000 }]) });
  assert.equal(result.accepted, 1); assert.equal(result.receivedRows, 2);
  assert.equal(f.read().price, 190000); assert.equal(f.read().last_updated, '2026-10-14T02:00:00.123900Z');
});

test('las cinco categorías reparadas siguen recibiendo observaciones aunque el productor conserve la categoría antigua', t => {
  const products = JSON.parse(readFileSync('src/lib/catalog/catalog-audit-regression.fixture.json', 'utf8')).products.slice(0, 5);
  const categories = ['almacenamiento', 'motherboards', 'perifericos', 'perifericos', 'almacenamiento'];
  for (const [index, product] of products.entries()) {
    const f = fixture(t), price = product.prices[0];
    const raw = { id: product.id, name: product.name, category: categories[index], specs: product.specs,
      brand: product.brand, model: product.model, created_at: old, updated_at: old };
    const original = { id: 'offer', product_id: raw.id, store_id: price.storeId, url: price.url, price: price.price,
      stock: price.stock, last_updated: old, source_identity: price.sourceIdentity };
    f.db.prepare("INSERT INTO products SELECT ?,?,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,? FROM products WHERE id='ram'").run(raw.id, raw.category, JSON.stringify(raw));
    f.db.prepare('UPDATE product_prices SET product_id=?,store_id=?,url=?,price=?,row_json=?').run(raw.id, price.storeId, price.url, price.price, JSON.stringify(original));
    const changed = { ...original, price: price.price + 100, last_updated: recent, products: { ...raw, category: product.category } };
    const result = admitUpstreamObservations(f.db, [changed], now);
    assert.equal(result.accepted, 1, product.id + ' ' + JSON.stringify(result.reasons));
    assert.equal(f.read().last_updated, recent); assert.equal(f.read().stock, price.stock);
    assert.equal(f.read().product_id, raw.id); assert.equal(f.read().store_id, price.storeId); assert.equal(f.read().url, price.url);
    const wrong = { ...changed, last_updated: '2026-10-14T02:30:00Z', products: { ...changed.products, name: 'Procesador Intel Core i5 12400F' } };
    assert.equal(admitUpstreamObservations(f.db, [wrong], now).accepted, 0);
  }
});

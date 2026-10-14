import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { loadMacRefreshConsumer } from './mac-catalog-refresh.mjs';
const { admitUpstreamObservations, syncUpstreamObservations, guidePriorityOfferIds } = await loadMacRefreshConsumer();
// Productor actual: revisión determinista real. Proveedores/caché están prohibidos
// y las claves de entorno se reemplazan al compilar, sin leer credenciales.
const producerModule = new Module(import.meta.filename + '.producer.cjs');
producerModule.require = createRequire(import.meta.url);
producerModule._compile((await build({ stdin: { contents: `
  export {reviewProductOffers} from './src/lib/ai/review-product-offers';
  export {mapDbGuideProduct} from './src/lib/persistence/product-read-mapper';
`, resolveDir: resolve('.') }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  define: { 'process.env.TYPESAFE_API_KEY': 'undefined', 'process.env.ENABLE_JEV_OFFER_REVIEW': '"0"' },
  plugins: [{ name: 'offline-producer', setup(build) {
    build.onResolve({ filter: /^(server-only|@\/lib\/(ai\/jev-client|server\/shared-cache|logger))$/ }, args => ({ path: args.path, namespace: 'offline' }));
    build.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'server-only' ? ''
      : args.path.endsWith('/logger') ? 'export const logger={info(){},warn(){}};'
        : `export const JEV_BATCH_SIZE=1,JEV_MODEL='offline',JEV_PROMPT_VERSION='offline';
          export function evaluateOfferIdentity(){throw Error('OFFLINE_PROVIDER_FORBIDDEN');}
          export function parseJevEvaluation(){throw Error('OFFLINE_PROVIDER_FORBIDDEN');}
          export function getSharedCache(){throw Error('OFFLINE_CACHE_FORBIDDEN');}
          export function setSharedCache(){throw Error('OFFLINE_CACHE_FORBIDDEN');}` }));
  } }] })).outputFiles[0].text, producerModule.id);
const { reviewProductOffers, mapDbGuideProduct } = producerModule.exports;
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
  assert.deepEqual(result.byStore, { compragamer: { read: 1, accepted: 1, rejected: 0, reasons: { accepted: 1 } } });
});

function repairedMotherFixture(t) {
  const f = fixture(t);
  const product = { id: 'cg-17076', name: 'Mother MSI B650M GAMING WIFI AM5 DDR5', category: 'motherboards',
    specs: { SKU: 'B650M GAMING WIFI', SourceListingId: '17076' } };
  const before = { id: '0c619633-bfba-4a8e-ae8c-0332444fc34f', product_id: product.id, store_id: 'compragamer',
    url: 'https://compragamer.com/producto/Mother_MSI_B650M_GAMING_WIFI_AM5_DDR5_17076',
    price: 188985, stock: 'in-stock', last_updated: old, identity_review: null };
  f.db.exec('DELETE FROM product_prices');
  f.db.prepare('UPDATE products SET id=?,category=?,row_json=?').run(product.id, product.category, JSON.stringify(product));
  f.db.prepare('INSERT INTO product_prices(id,product_id,price,url,row_json,store_id) VALUES(?,?,?,?,?,\'compragamer\')')
    .run(before.id, before.product_id, before.price, before.url, JSON.stringify(before));
  const upstreamId = 'agrupado-motherboards-msi-gaming-am5-b650m-12gj446';
  const row = { ...before, product_id: upstreamId, last_updated: recent, price: 190000, stock: 'unknown',
    source_identity: { title: product.name, storeSku: product.specs.SKU, listingRef: 'compragamer:id:17076' },
    products: { id: upstreamId, name: 'Motherboard MSI B650M GAMING WIFI AM5', category: product.category, specs: {} } };
  return { ...f, product, before, row };
}
test('Mother17076 conserva la asociación reparada al recibir la misma publicación remota nueva', t => {
  const f = repairedMotherFixture(t), products = f.db.prepare('SELECT * FROM products').all();
  const original = structuredClone(f.row), report = admitUpstreamObservations(f.db, [f.row], now);
  assert.equal(report.accepted, 1);
  const { products: _remoteProduct, ...offer } = f.row;
  assert.deepEqual(f.read(), { ...offer, product_id: f.product.id });
  assert.deepEqual(f.db.prepare('SELECT * FROM products').all(), products);
  assert.deepEqual(f.row, original);
  assert.equal(f.read().stock, 'unknown'); assert.equal(f.read().last_updated, recent);
  assert.equal(f.read().identity_review, null);
  assert.equal(admitUpstreamObservations(f.db, [f.row], now).reasons['not-newer'], 1);
});
test('Mother17076 no extiende el alias a otra oferta, grupo, variante, SKU, fuente o dictamen', t => {
  const patches = [
    r => ({ ...r, id: 'other' }), r => ({ ...r, product_id: 'other' }),
    r => ({ ...r, store_id: 'maximus' }), r => ({ ...r, url: r.url + '?other=1' }),
    r => ({ ...r, products: { ...r.products, id: 'other' } }),
    r => ({ ...r, products: { ...r.products, name: r.products.name.replace('B650M', 'B650') } }),
    r => ({ ...r, products: { ...r.products, category: 'memoria-ram' } }),
    r => ({ ...r, products: { ...r.products, specs: { revision: 'other' } } }),
    r => ({ ...r, source_identity: { ...r.source_identity, title: r.source_identity.title.replace('WIFI', 'WIFI II') } }),
    r => ({ ...r, source_identity: { ...r.source_identity, storeSku: 'OTHER' } }),
    r => ({ ...r, source_identity: { ...r.source_identity, listingRef: 'compragamer:id:17077' } }),
    r => ({ ...r, source_identity: { ...r.source_identity, sourceId: '17077' } }),
    r => ({ ...r, source_identity: { ...r.source_identity, purchaseRestriction: 'bundle-only' } }),
    r => ({ ...r, identity_review: { status: 'needs-review' } }),
    r => ({ ...r, last_updated: '2099-01-01T00:00:00Z' }),
  ];
  for (const patch of patches) {
    const f = repairedMotherFixture(t);
    assert.equal(admitUpstreamObservations(f.db, [patch(f.row)], now).accepted, 0);
    assert.deepEqual(f.read(), f.before);
  }
  for (const changes of [{ name: 'Mother MSI B650M GAMING WIFI II AM5 DDR5' }, { specs: { SKU: 'OTHER', SourceListingId: '17076' } }]) {
    const f = repairedMotherFixture(t);
    f.db.prepare('UPDATE products SET row_json=?').run(JSON.stringify({ ...f.product, ...changes }));
    assert.equal(admitUpstreamObservations(f.db, [f.row], now).accepted, 0);
    assert.deepEqual(f.read(), f.before);
  }
});
test('las referencias editoriales CPU y SSD preceden a candidatos baratos sin ampliar el límite', t => {
  const f = fixture(t);
  for (const [id, category, title] of [
    ['cg-14309', 'procesadores', 'ryzen 5 7600'], ['cg-16872', 'almacenamiento', 'kingston nv3 1tb nvme'],
  ]) for (let index = 0; index < 5; index++) {
    const productId = index === 4 ? id : id + '-candidate-' + index;
    const offerId = 'offer-' + productId;
    f.db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(productId, category, title, title, title, 1, 0, old, old, JSON.stringify({ id: productId, name: title, category }));
    f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)')
      .run(offerId, productId, 'compragamer', index + 1, url, JSON.stringify({ id: offerId, product_id: productId }));
  }
  const before = f.db.prepare('SELECT * FROM product_prices').all(), ids = guidePriorityOfferIds(f.db);
  assert(ids.includes('offer-cg-14309')); assert(ids.includes('offer-cg-16872'));
  assert(ids.indexOf('offer-cg-14309') < ids.indexOf('offer-cg-14309-candidate-0'));
  assert(ids.length <= 64); assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(), before);
});

test('Golden188718: prueba abreviada real se rechaza; productor actual genera once atributos sin cambiar observación', async t => {
  const f = fixture(t), title = 'Memoria Ram UDIMM CORSAIR VENGEANCE 32GB DDR5 6000MHz CL30 1.40V (2 x 16GB) Negro RGB';
  const goldenUrl = 'https://goldentechstore.com.ar/producto/memoria-ram-udimm-corsair-vengeance-32gb-ddr5-6000mhz-cl30-1-40v-2-x-16gb-negro-rgb/';
  const source = { title, storeSku: 'EL_CORM5VR2X1660', sourceId: '188718', listingRef: 'goldentechstore:url:' + goldenUrl.slice(0, -1) };
  const product = { id: 'goldentechstore-api-188718', name: title, category: 'memoria-ram', specs: { SKU: source.storeSku } };
  const before = { id: '71fa08c2-b4a8-4487-8c4e-3bf111130e26', product_id: product.id, store_id: 'goldentechstore',
    url: goldenUrl, price: 1202122, stock: 'unknown', last_updated: '2026-10-11T18:49:20.003Z' };
  const row = { ...before, price: 1202121.97, stock: 'in-stock', price_condition: 'special',
    last_updated: '2026-10-14T10:16:18.351+00:00', source_identity: source, products: product,
    identity_review: { version: 1, status: 'consistent', reason: 'exact-attributes', reviewedAt: '2026-10-14T10:16:18.984Z',
      model: null, confidence: null, subject: { name: title.toLowerCase(), category: product.category, url: goldenUrl }, sourceIdentity: source,
      proof: { version: 1, method: 'exact-attributes', attributes: { model: 'ram:corsair:vengeance:32gb:ddr5:6000:dimm:rgb:2x16:30:black' } } } };
  f.db.exec('DELETE FROM product_prices');
  f.db.prepare('UPDATE products SET id=?,category=?,row_json=?').run(product.id, product.category, JSON.stringify(product));
  f.db.prepare('INSERT INTO product_prices(id,product_id,store_id,url,price,row_json) VALUES(?,?,?,?,?,?)')
    .run(row.id, product.id, row.store_id, goldenUrl, before.price, JSON.stringify(before));
  const cut = Date.parse('2026-10-14T13:05:17.793Z'), originalProduct = f.db.prepare('SELECT * FROM products').all();
  assert.equal(admitUpstreamObservations(f.db, [row], cut).decisions[0].reason, 'source-identity-unproven');
  assert.deepEqual(f.read(), before);
  const reviewed = (await reviewProductOffers([mapDbGuideProduct({ ...product, product_prices: [row] })], { authorizedRefresh: true }))[0].prices[0];
  assert.equal(reviewed.identityReview.status, 'consistent');
  assert.equal(Object.keys(reviewed.identityReview.proof.attributes).length, 11);
  assert.equal(reviewed.lastUpdated.toISOString(), new Date(row.last_updated).toISOString());
  const current = { ...row, identity_review: reviewed.identityReview };
  for (const patch of [
    { identity_review: row.identity_review },
    { source_identity: { ...source, title: title.replace('32GB', '16GB') } },
    { source_identity: { ...source, listingRef: source.listingRef + '-other' } },
    { identity_review: { ...reviewed.identityReview, proof: { ...reviewed.identityReview.proof,
      attributes: { ...reviewed.identityReview.proof.attributes, kit: '1x32' } } } },
  ]) {
    assert.equal(admitUpstreamObservations(f.db, [{ ...current, ...patch }], cut).accepted, 0);
    assert.deepEqual(f.read(), before);
  }
  const report = admitUpstreamObservations(f.db, [current], cut);
  assert.deepEqual(report.byStore.goldentechstore, { read: 1, accepted: 1, rejected: 0, reasons: { accepted: 1 } });
  assert.equal(f.read().last_updated, row.last_updated); assert.equal(f.read().price, row.price); assert.equal(f.read().stock, row.stock);
  assert.deepEqual(f.db.prepare('SELECT * FROM products').all(), originalProduct);
});

test('diagnóstico conserva cada decisión por tienda registrada/other sin copiar IDs desconocidos ni secretos', t => {
  const f = fixture(t), secret = 'private-fixture-token';
  const result = admitUpstreamObservations(f.db, [f.row, { ...f.row, id: 'outside', store_id: secret },
    { ...f.row, id: 'outside-golden', store_id: 'goldentechstore' }], now);
  assert.equal(result.read, 3); assert.equal(result.accepted, 1); assert.equal(result.rejected, 2);
  assert.deepEqual(result.byStore, { compragamer: { read: 1, accepted: 1, rejected: 0, reasons: { accepted: 1 } },
    other: { read: 1, accepted: 0, rejected: 1, reasons: { 'offer-outside-snapshot': 1 } },
    goldentechstore: { read: 1, accepted: 0, rejected: 1, reasons: { 'offer-outside-snapshot': 1 } } });
  assert.equal(JSON.stringify({ reasons: result.reasons, byStore: result.byStore }).includes(secret), false);
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

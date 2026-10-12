import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildPreparedView } from './prepared-view-build';
import { consumePreparedProduct, decodePreparedProductTransport, importPreparedProductPublicKey, preparedProductPublicKeyId } from '../../../src/lib/catalog/prepared-product';
import { mapDbGuideProduct } from '../../../src/lib/persistence/product-read-mapper';
import type { DbProductRow } from '../../../src/lib/persistence/product-read-types';

const now = Date.parse('2026-10-12T12:00:00Z'), stamp = new Date(now).toISOString(), policy = 'a'.repeat(64);
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
const publicKeyRaw32 = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const keyId = await preparedProductPublicKeyId(publicKeyRaw32);
const options = { privateKey: pair.privateKey, publicKeyRaw32, keyId, policy };
const fileHash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function fixture(t: TestContext) {
  t.mock.method(Date, 'now', () => now);
  const dir = mkdtempSync(tmpdir() + '/prepared-build-'), source = dir + '/source.sqlite', target = dir + '/target.sqlite';
  const original = new DatabaseSync(source), destination = new DatabaseSync(target);
  t.after(() => { original.close(); destination.close(); rmSync(dir, { recursive: true }); });
  original.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql', 'utf8'));
  const oldSnapshot = JSON.stringify({ projectionVersion: 1, counts: { products: 2 }, cache: { version: 1, generation: 'price-generation', validFrom: stamp, validUntil: '2026-10-12T13:00:00Z' } });
  original.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', oldSnapshot);
  destination.exec('CREATE TABLE pilot_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
  destination.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', oldSnapshot);
  const raws: DbProductRow[] = [];
  for (const id of ['a', 'b']) {
    const raw: DbProductRow = { id, name: 'NVIDIA RTX 4060 8GB', category: 'tarjetas-graficas', brand: 'NVIDIA', model: 'RTX 4060',
      description: null, image: null, normalized_title: null, canonical_product_key: null, family_key: null, variant_key: null, refresh_priority: null,
      last_scraped_at: stamp, last_normalized_at: null, specs: {}, lowest_price: 100000, highest_price: 100000, average_price: 100000, created_at: stamp, updated_at: stamp };
    original.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, raw.category, id, raw.name, raw.name, 1, 0, stamp, stamp, JSON.stringify(raw));
    const offer = { id: 'offer-' + id, product_id: id, store_id: 'venex', url: 'https://www.venex.com.ar/rtx-4060-8gb', price: 100000, original_price: null,
      stock: 'in-stock', last_updated: stamp, installment_count: null, installment_amount: null };
    original.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id, id, offer.store_id, offer.price, offer.url, JSON.stringify(offer));
    raws.push({ ...raw, product_prices: [offer] });
  }
  return { dir, source, original, destination, target, raws, oldSnapshot };
}
test('tabla completa firmada, integridad SOURCE readonly y manifest opt-in preserva generation', async t => {
  const f = fixture(t), before = fileHash(f.source);
  const result = await buildPreparedView(f.source, f.destination, { ...options, expectedSourceSha256: before });
  assert.deepEqual(result.manifest, { version: 1, storageVersion: 2, ready: true, policy, keyId, count: 2 }); assert.equal(result.inserted, 2); assert.equal(result.offers, 2);
  assert(result.transportBytes < result.envelopeBytes); assert(result.maxTransportBytes < result.maxEnvelopeBytes);
  assert.equal(result.source.sha256Before, before); assert.equal(result.source.sha256After, before); assert.equal(fileHash(f.source), before);
  assert.equal(f.destination.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value, f.oldSnapshot);
  assert.match(String(f.destination.prepare("SELECT sql FROM sqlite_master WHERE name='catalog_prepared_products'").get()!.sql), /WITHOUT ROWID/);
  const key = await importPreparedProductPublicKey(publicKeyRaw32, keyId);
  for (const raw of f.raws) {
    const saved = f.destination.prepare('SELECT envelope_json FROM catalog_prepared_products WHERE product_id=?').get(raw.id)!;
    assert.equal(JSON.parse(String(saved.envelope_json)).length, 2);
    const envelope = await decodePreparedProductTransport(raw.id, policy, String(saved.envelope_json));
    const consumed = await consumePreparedProduct(raw, envelope, { publicKey: key, policy, now });
    assert.deepEqual(JSON.parse(JSON.stringify(consumed.product)), JSON.parse(JSON.stringify(mapDbGuideProduct(raw)))); assert.equal(consumed.current.count, 1);
  }
  const patched = await buildPreparedView(f.source, f.destination, { ...options, patchSnapshot: true });
  const metadata = JSON.parse(String(f.destination.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value));
  assert.deepEqual(metadata, { ...JSON.parse(f.oldSnapshot), prepared_views: patched.manifest }); assert.equal(patched.snapshotPatched, true);
  assert.equal(f.original.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value, f.oldSnapshot);
});
test('misma key reintenta sin reescribir; una observación cambia sólo una fila', async t => {
  const f = fixture(t); await buildPreparedView(f.source, f.destination, options);
  const old = f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all();
  const retry = await buildPreparedView(f.source, f.destination, options); assert.equal(retry.unchanged, 2); assert.equal(retry.updated, 0); assert.equal(retry.inserted, 0);
  assert.deepEqual(f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all(), old);
  const raw = JSON.parse(String(f.original.prepare("SELECT row_json FROM product_prices WHERE id='offer-a'").get()!.row_json)); raw.price = 120000;
  f.original.prepare("UPDATE product_prices SET price=?,row_json=? WHERE id='offer-a'").run(raw.price, JSON.stringify(raw));
  const changed = await buildPreparedView(f.source, f.destination, options); assert.equal(changed.updated, 1); assert.equal(changed.unchanged, 1);
});
test('envelope completo legado se reemplaza por transporte2 sin cambiar payload ni firma', async t => {
  const f = fixture(t); await buildPreparedView(f.source, f.destination, options);
  const encoded = String(f.destination.prepare("SELECT envelope_json FROM catalog_prepared_products WHERE product_id='a'").get()!.envelope_json);
  const full = await decodePreparedProductTransport('a', policy, encoded);
  f.destination.prepare("UPDATE catalog_prepared_products SET envelope_json=? WHERE product_id='a'").run(JSON.stringify(full));
  await assert.rejects(decodePreparedProductTransport('a', policy, JSON.stringify(full)), /TRANSPORT/);
  const replaced = await buildPreparedView(f.source, f.destination, { ...options, patchSnapshot: true });
  assert.equal(replaced.updated, 1); assert.equal(replaced.unchanged, 1); assert.equal(replaced.manifest.storageVersion, 2);
  assert.equal(f.destination.prepare("SELECT envelope_json FROM catalog_prepared_products WHERE product_id='a'").get()!.envelope_json, encoded);
  const retry = await buildPreparedView(f.source, f.destination, options); assert.equal(retry.updated, 0); assert.equal(retry.unchanged, 2);
});
test('elimina membresía extra y reporta counters sin ocultar cobertura', async t => {
  const f = fixture(t); await buildPreparedView(f.source, f.destination, options);
  f.destination.exec("INSERT INTO catalog_prepared_products VALUES('extra','not-a-valid-envelope')");
  const result = await buildPreparedView(f.source, f.destination, options); assert.equal(result.deleted, 1); assert.equal(result.manifest.count, 2);
});
test('error de QC posterior revierte tabla previa y no expone manifest parcial', async t => {
  const f = fixture(t); await buildPreparedView(f.source, f.destination, options);
  const before = f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all();
  const raw = JSON.parse(String(f.original.prepare("SELECT row_json FROM products WHERE id='b'").get()!.row_json)); raw.created_at = 'invalid';
  f.original.prepare("UPDATE products SET row_json=? WHERE id='b'").run(JSON.stringify(raw));
  await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, policy: 'b'.repeat(64), patchSnapshot: true }), /DATE/);
  assert.deepEqual(f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all(), before);
  assert.equal(f.destination.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value, f.oldSnapshot);
  assert.equal(f.destination.isTransaction, false);
});
test('fallo inicial revierte también CREATE y markers', async t => {
  const f = fixture(t); const raw = JSON.parse(String(f.original.prepare("SELECT row_json FROM products WHERE id='b'").get()!.row_json)); raw.category = 'other';
  f.original.prepare("UPDATE products SET row_json=? WHERE id='b'").run(JSON.stringify(raw));
  await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, patchSnapshot: true }), /PRODUCT_COLUMNS/);
  assert.equal(f.destination.prepare("SELECT 1 FROM sqlite_master WHERE name='catalog_prepared_products'").get(), undefined);
  assert.equal(f.destination.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value, f.oldSnapshot);
});
test('hash externo y key/ID incorrectos fallan antes de publicación', async t => {
  const f = fixture(t); await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, expectedSourceSha256: 'f'.repeat(64) }), /SOURCE_HASH/);
  await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, keyId: 'f'.repeat(64) }), /KEY_ID/);
  const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, privateKey: other.privateKey }), /KEY_MISMATCH/);
  assert.equal(f.destination.prepare("SELECT 1 FROM sqlite_master WHERE name='catalog_prepared_products'").get(), undefined);
});
test('source/dest iguales o hardlink se rechazan; nested transaction sigue intacta', async t => {
  const f = fixture(t); await assert.rejects(buildPreparedView(f.source, f.original, options), /SOURCE_DESTINATION_SAME/);
  const link = f.dir + '/source-link.sqlite'; linkSync(f.source, link); const shared = new DatabaseSync(link); t.after(() => shared.close());
  await assert.rejects(buildPreparedView(f.source, shared, options), /SOURCE_DESTINATION_SAME/);
  f.destination.exec('BEGIN'); await assert.rejects(buildPreparedView(f.source, f.destination, options), /DESTINATION_TRANSACTION/);
  assert.equal(f.destination.isTransaction, true); f.destination.exec('ROLLBACK');
});
test('schema ROWID incompatible y tampering por trigger fallan atómicamente', async t => {
  const f = fixture(t); f.destination.exec('CREATE TABLE catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT);');
  await assert.rejects(buildPreparedView(f.source, f.destination, options), /DESTINATION_SCHEMA/); f.destination.exec('DROP TABLE catalog_prepared_products');
  await buildPreparedView(f.source, f.destination, options); const before = f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all();
  f.destination.exec("CREATE TRIGGER corrupt AFTER UPDATE ON catalog_prepared_products BEGIN UPDATE catalog_prepared_products SET envelope_json='bad' WHERE product_id='a';END;");
  await assert.rejects(buildPreparedView(f.source, f.destination, { ...options, policy: 'b'.repeat(64) }), /DESTINATION_INTEGRITY/);
  assert.deepEqual(f.destination.prepare('SELECT * FROM catalog_prepared_products ORDER BY product_id').all(), before);
});

// Controlplane local: source readOnly, clave inyectada y publicación atómica.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { prepareUnsignedProduct } from './prepared-product-builder';
import { importPreparedProductPublicKey, preparedProductInput, preparedProductSignatureMessage, PREPARED_PRODUCT_STORAGE_VERSION,
  type PreparedProductEnvelope } from '../../../src/lib/catalog/prepared-product';
import type { DbProductPriceRow, DbProductRow } from '../../../src/lib/persistence/product-read-types';

export type PreparedViewManifest = { version: 1; storageVersion: 2; ready: true; policy: string; keyId: string; count: number };
export type PreparedViewBuildOptions = {
  policy: string; keyId: string; publicKeyRaw32: Uint8Array<ArrayBuffer>; privateKey: CryptoKey;
  expectedSourceSha256?: string; patchSnapshot?: boolean;
};
export type PreparedViewBuildReceipt = {
  manifest: PreparedViewManifest; inserted: number; updated: number; deleted: number; unchanged: number;
  offers: number; envelopeBytes: number; payloadBytes: number; maxEnvelopeBytes: number; transportBytes: number; maxTransportBytes: number; snapshotPatched: boolean;
  source: { path: string; sha256Before: string; sha256After: string; productsHash: string; offersHash: string; snapshot: string | null; readTransaction: true };
};
const hashPattern = /^[a-f0-9]{64}$/;
function fail(code: string): never { throw new Error(`PREPARED_VIEW_${code}`); }
async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');
}
function sourceRow(stored: Record<string, unknown>): DbProductRow {
  const raw = JSON.parse(String(stored.row_json)) as DbProductRow;
  if (raw.id !== stored.id || raw.category !== stored.category) fail('PRODUCT_COLUMNS'); return raw;
}
function sourceOffer(stored: Record<string, unknown>): DbProductPriceRow {
  const raw = JSON.parse(String(stored.row_json)) as DbProductPriceRow & { id?: string; product_id?: string };
  if (raw.id !== stored.id || raw.product_id !== stored.product_id || raw.store_id !== stored.store_id
    || Number(raw.price) !== stored.price || raw.url !== stored.url) fail('OFFER_COLUMNS'); return raw;
}
function contentHashes(source: DatabaseSync): { productsHash: string; offersHash: string } {
  const products = createHash('sha256'), offers = createHash('sha256');
  for (const stored of source.prepare('SELECT id,category,row_json FROM products ORDER BY id').all()) {
    products.update(JSON.stringify(preparedProductInput(sourceRow(stored)))); products.update('\n');
  }
  for (const stored of source.prepare('SELECT * FROM product_prices ORDER BY id').all()) {
    offers.update(JSON.stringify(sourceOffer(stored))); offers.update('\n');
  }
  return { productsHash: products.digest('hex'), offersHash: offers.digest('hex') };
}
function snapshot(source: DatabaseSync): string | null {
  const exists = source.prepare("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name='pilot_meta'").get();
  if (!exists) return null; const row = source.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
  return typeof row?.value === 'string' ? row.value : null;
}
function sameFile(sourcePath: string, destination: DatabaseSync): boolean {
  const source = statSync(sourcePath);
  return destination.prepare('PRAGMA database_list').all().some(database => {
    if (typeof database.file !== 'string' || !database.file) return false;
    const file = statSync(database.file); return file.dev === source.dev && file.ino === source.ino;
  });
}

/** No genera ni exporta claves. El manifiesto sólo se expone después del COMMIT. */
export async function buildPreparedView(sourcePath: string, destination: DatabaseSync,
  input: PreparedViewBuildOptions): Promise<PreparedViewBuildReceipt> {
  const path = realpathSync(sourcePath), policy = input.policy, keyId = input.keyId, privateKey = input.privateKey;
  const publicRaw = new Uint8Array(input.publicKeyRaw32), expectedHash = input.expectedSourceSha256, patchSnapshot = input.patchSnapshot === true;
  if (!hashPattern.test(policy) || !hashPattern.test(keyId) || expectedHash !== undefined && !hashPattern.test(expectedHash)) fail('POLICY');
  if (destination.isTransaction) fail('DESTINATION_TRANSACTION');
  if (sameFile(path, destination)) fail('SOURCE_DESTINATION_SAME');
  if (!privateKey || privateKey.type !== 'private' || privateKey.algorithm.name !== 'Ed25519' || privateKey.usages.length !== 1 || privateKey.usages[0] !== 'sign') fail('PRIVATE_KEY');
  const publicKey = await importPreparedProductPublicKey(publicRaw, keyId);
  const challenge = preparedProductSignatureMessage({ productId: '__prepared_view_key_check__', policy, inputHash: '0'.repeat(64), transportSeal: '0'.repeat(64) });
  if (!await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, challenge), challenge)) fail('KEY_MISMATCH');
  const original = new DatabaseSync(path, { readOnly: true }); let destinationStarted = false;
  try {
    original.exec('BEGIN'); // Un único corte incluso si existe un writer externo/WAL.
    const products = original.prepare('SELECT id,category,row_json FROM products ORDER BY id').all();
    const offerCount = Number(original.prepare('SELECT COUNT(*) AS n FROM product_prices').get()!.n);
    if (!products.length) fail('EMPTY_SOURCE');
    const orphan = original.prepare('SELECT 1 AS n FROM product_prices o LEFT JOIN products p ON p.id=o.product_id WHERE p.id IS NULL LIMIT 1').get();
    if (orphan) fail('ORPHAN_OFFER');
    const sourceSnapshot = snapshot(original), before = await fileHash(path);
    if (expectedHash !== undefined && before !== expectedHash) fail('SOURCE_HASH');
    const hashes = contentHashes(original);
    destination.exec('BEGIN IMMEDIATE'); destinationStarted = true;
    destination.exec('CREATE TABLE IF NOT EXISTS catalog_prepared_products(product_id TEXT PRIMARY KEY,envelope_json TEXT NOT NULL) WITHOUT ROWID;');
    const schema = destination.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='catalog_prepared_products'").get();
    if (!/WITHOUT\s+ROWID/i.test(String(schema?.sql))) fail('DESTINATION_SCHEMA');
    const saved = destination.prepare('SELECT envelope_json FROM catalog_prepared_products WHERE product_id=?');
    const insert = destination.prepare('INSERT INTO catalog_prepared_products VALUES(?,?)');
    const update = destination.prepare('UPDATE catalog_prepared_products SET envelope_json=? WHERE product_id=?');
    const offers = original.prepare('SELECT * FROM product_prices WHERE product_id=? ORDER BY price,store_id,url,id');
    let inserted = 0, updated = 0, unchanged = 0, retainedOffers = 0, envelopeBytes = 0, payloadBytes = 0, maxEnvelopeBytes = 0, transportBytes = 0, maxTransportBytes = 0;
    const ids = new Set<string>(), expectedEnvelopes = createHash('sha256');
    for (const stored of products) {
      const raw = sourceRow(stored), rows = offers.all(raw.id).map(sourceOffer); retainedOffers += rows.length;
      const unsigned = await prepareUnsignedProduct({ ...raw, product_prices: rows.length ? rows : null }, policy);
      const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, preparedProductSignatureMessage(unsigned)));
      const envelope: PreparedProductEnvelope = { ...unsigned, signature: btoa(String.fromCharCode(...signature)) };
      const encoded = JSON.stringify([envelope.payload, envelope.signature]), prior = saved.get(raw.id);
      if (!prior) { insert.run(raw.id, encoded); inserted++; }
      else if (prior.envelope_json !== encoded) { update.run(encoded, raw.id); updated++; }
      else unchanged++;
      expectedEnvelopes.update(JSON.stringify([raw.id, encoded])); expectedEnvelopes.update('\n');
      ids.add(raw.id); const size = Buffer.byteLength(JSON.stringify(envelope)), storedSize = Buffer.byteLength(encoded);
      envelopeBytes += size; payloadBytes += Buffer.byteLength(unsigned.payload); maxEnvelopeBytes = Math.max(maxEnvelopeBytes, size);
      transportBytes += storedSize; maxTransportBytes = Math.max(maxTransportBytes, storedSize);
    }
    let deleted = 0;
    for (const row of destination.prepare('SELECT product_id FROM catalog_prepared_products').all()) if (!ids.has(String(row.product_id))) {
      destination.prepare('DELETE FROM catalog_prepared_products WHERE product_id=?').run(row.product_id); deleted++;
    }
    if (retainedOffers !== offerCount || Number(destination.prepare('SELECT COUNT(*) AS n FROM catalog_prepared_products').get()!.n) !== products.length) fail('COUNTS');
    const actualEnvelopes = createHash('sha256');
    for (const row of destination.prepare('SELECT product_id,envelope_json FROM catalog_prepared_products ORDER BY product_id').all()) {
      actualEnvelopes.update(JSON.stringify([row.product_id, row.envelope_json])); actualEnvelopes.update('\n');
    }
    if (actualEnvelopes.digest('hex') !== expectedEnvelopes.digest('hex')) fail('DESTINATION_INTEGRITY');
    const finalHashes = contentHashes(original), after = await fileHash(path);
    if (before !== after || hashes.productsHash !== finalHashes.productsHash || hashes.offersHash !== finalHashes.offersHash || snapshot(original) !== sourceSnapshot) fail('SOURCE_CHANGED');
    const manifest: PreparedViewManifest = { version: 1, storageVersion: PREPARED_PRODUCT_STORAGE_VERSION, ready: true, policy, keyId, count: products.length };
    let snapshotPatched = false;
    if (patchSnapshot) {
      const old = snapshot(destination); if (!old || Buffer.byteLength(old) > 16384) fail('DESTINATION_SNAPSHOT');
      const value: unknown = JSON.parse(old);
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DESTINATION_SNAPSHOT');
      const next = JSON.stringify({ ...value, prepared_views: manifest });
      if (next !== old) {
        if (Number(destination.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot' AND value=?").run(next, old).changes) !== 1 || snapshot(destination) !== next) fail('DESTINATION_SNAPSHOT');
        snapshotPatched = true;
      }
    }
    const receipt: PreparedViewBuildReceipt = { manifest, inserted, updated, deleted, unchanged, offers: retainedOffers, envelopeBytes, payloadBytes, maxEnvelopeBytes, transportBytes, maxTransportBytes,
      snapshotPatched, source: { path, sha256Before: before, sha256After: after, ...hashes, snapshot: sourceSnapshot, readTransaction: true } };
    original.exec('COMMIT'); destination.exec('COMMIT'); destinationStarted = false; return receipt;
  } catch (error) {
    if (destinationStarted && destination.isTransaction) destination.exec('ROLLBACK'); throw error;
  } finally { original.close(); }
}

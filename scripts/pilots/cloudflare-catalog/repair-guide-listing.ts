// Reparación explícita de una publicación en staging. No observa ofertas ni sirve el resultado.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { proveExactListing } from '@/lib/quality/exact-listing-proof';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { buildProductIdentityKey, buildProductVariantKey } from '@/lib/product-identity';
import { computeComparablePriceStats } from '@/lib/price-utils';
import { catalogIdentityText, catalogSearchText } from './catalog-matchers.mjs';

export const GUIDE_LISTING_REPAIR = Object.freeze({
  offerId: '0c619633-bfba-4a8e-ae8c-0332444fc34f',
  groupedProductId: 'agrupado-motherboards-msi-gaming-am5-b650m-12gj446',
  productId: 'cg-17076', listingId: '17076', category: 'motherboards',
  title: 'Mother MSI B650M GAMING WIFI AM5 DDR5', sku: 'B650M GAMING WIFI',
  groupedTitle: 'Motherboard MSI B650M GAMING WIFI AM5',
  url: 'https://compragamer.com/producto/Mother_MSI_B650M_GAMING_WIFI_AM5_DDR5_17076',
});
type Row = Record<string, unknown>;
export type GuideListingRepairOptions = {
  now: number; expectedSourceSha256: string; expectedOfferRowSha256: string;
  evidencePath: string; evidenceSha256: string; feedPath: string; feedSha256: string;
};
function fail(code: string): never { throw new Error('GUIDE_LISTING_REPAIR_' + code); }
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const plain = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = (value: unknown): Row => {
  try { const row = JSON.parse(String(value)); if (plain(row)) return row; } catch { /* Rechazar filas malformadas. */ }
  return fail('JSON');
};
/** Hash de la fila SQLite completa, incluido el JSON literal. */
export const guideListingOfferRowSha256 = (row: Row) => hash(JSON.stringify({ ...row }));
export function guideListingFileSha256(path: string): string {
  const digest = createHash('sha256'), fd = openSync(path, 'r'), buffer = Buffer.alloc(1024 * 1024);
  try { for (let size; (size = readSync(fd, buffer, 0, buffer.length, null)) > 0;) digest.update(buffer.subarray(0, size)); }
  finally { closeSync(fd); }
  return digest.digest('hex');
}
function artifact(path: string, expected: string): Row {
  if (!lstatSync(path).isFile() || lstatSync(path).size > 8_000_000) fail('ARTIFACT');
  const bytes = readFileSync(path);
  if (hash(bytes) !== expected) fail('EVIDENCE_HASH');
  return parse(bytes.toString('utf8'));
}
function evidence(options: GuideListingRepairOptions) {
  const c = GUIDE_LISTING_REPAIR;
  const report = artifact(options.evidencePath, options.evidenceSha256), feed = artifact(options.feedPath, options.feedSha256);
  const rows = Array.isArray(report.rows) ? report.rows.filter(row => plain(row) && row.slot === 'motherboard') : [];
  if (rows.length !== 1 || !plain(feed.motherboard)) fail('EVIDENCE_LISTING');
  const row = rows[0] as Row, source = feed.motherboard;
  const window = row.checkedAtWindow;
  if (row.id !== c.productId || row.listingId !== Number(c.listingId) || row.name !== c.title
    || row.mpnOrPublishedSKU !== c.sku || row.url !== c.url || row.pageVerified !== true
    || !plain(window) || !Number.isFinite(Date.parse(String(window.from))) || !Number.isFinite(Date.parse(String(window.to)))
    || Date.parse(String(window.from)) > Date.parse(String(window.to)) || Date.parse(String(window.to)) > options.now
    || !Number.isFinite(Date.parse(String(row.fetchedAt))) || Date.parse(String(row.fetchedAt)) < Date.parse(String(window.from))
    || Date.parse(String(row.fetchedAt)) > Date.parse(String(window.to))
    || source.id_producto !== Number(c.listingId) || source.nombre !== c.title
    || !isDeepStrictEqual(source.codigo_principal, ['SKU: ' + c.sku])
    || source.precioEspecial !== row.specialPriceARS || source.stock !== row.stockRaw || source.vendible !== row.vendible)
    fail('EVIDENCE_IDENTITY');
  const subject = { title: c.title, category: c.category, sku: c.sku };
  const proof = proveExactListing(subject, { title: String(source.nombre), category: c.category, sku: c.sku },
    { storeId: 'compragamer', url: c.url, listingRef: 'compragamer:id:' + c.listingId, sourceId: c.listingId });
  if (!proof) fail('EXACT_LISTING');
  return { proof, capturedAtWindow: window, fetchedAt: row.fetchedAt };
}
const tableExists = (db: DatabaseSync, name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name));
function selected(db: DatabaseSync, options: GuideListingRepairOptions) {
  const c = GUIDE_LISTING_REPAIR;
  const offer = db.prepare('SELECT * FROM product_prices WHERE id=?').get(c.offerId);
  const grouped = db.prepare('SELECT * FROM products WHERE id=?').get(c.groupedProductId);
  if (!offer || !grouped || db.prepare('SELECT 1 FROM products WHERE id=?').get(c.productId)) fail('PRECONDITION_PRODUCT');
  const raw = parse(offer.row_json), group = parse(grouped.row_json), source = raw.source_identity;
  if (guideListingOfferRowSha256(offer) !== options.expectedOfferRowSha256 || offer.product_id !== c.groupedProductId
    || offer.store_id !== 'compragamer' || offer.url !== c.url || raw.id !== c.offerId || raw.product_id !== c.groupedProductId
    || raw.store_id !== offer.store_id || raw.url !== offer.url || raw.price !== offer.price
    || group.id !== c.groupedProductId || group.name !== c.groupedTitle || group.category !== c.category
    || grouped.category !== c.category || grouped.grouped_identity !== 1 || !plain(group.specs) || Object.keys(group.specs).length !== 0
    || !plain(source) || source.title !== c.title || source.storeSku !== c.sku
    || source.listingRef !== listingReference('compragamer', c.url)
    || source.sourceId !== undefined && source.sourceId !== c.listingId || source.purchaseRestriction !== undefined)
    fail('PRECONDITION_OFFER');
  if (db.prepare('SELECT COUNT(*) n FROM product_prices WHERE product_id=?').get(c.groupedProductId)?.n !== 6
    || db.prepare('SELECT id,url FROM product_prices WHERE store_id=? AND id<>?').all('compragamer', c.offerId)
      .some(row => listingReference('compragamer', String(row.url)) === 'compragamer:id:' + c.listingId)
    || db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=? AND product_id<>?').get(c.offerId, c.groupedProductId)?.n !== 0)
    fail('PRECONDITION_MEMBERSHIP');
  const queue = tableExists(db, 'pilot_refresh_demand') ? db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(c.offerId) : undefined;
  if (queue && (queue.product_id !== c.groupedProductId || queue.store_id !== offer.store_id || queue.url !== offer.url)) fail('QUEUE_CHANGED');
  if (queue?.status === 'leased' && Number(queue.lease_until) > options.now) fail('LEASE_ACTIVE');
  return { offer: { ...offer }, raw, grouped: { ...grouped }, queue: queue ? { ...queue } : undefined };
}
function digestRows(db: DatabaseSync, sql: string, values: string[] = []) {
  const digest = createHash('sha256');
  // Orden estable por representación completa; no depende del planificador SQL.
  for (const row of db.prepare(sql).all(...values).map(row => JSON.stringify({ ...row })).sort()) digest.update(row + '\n');
  return digest.digest('hex');
}
/** Todas las tablas ajenas y todas las filas ajenas de tablas afectadas quedan cubiertas. */
function untouchedHashes(db: DatabaseSync) {
  const c = GUIDE_LISTING_REPAIR, filters: Record<string, [string, string[]]> = {
    products: ['id<>?', [c.productId]], product_substrings: ['id<>?', [c.productId]],
    product_prices: ['id<>?', [c.offerId]], price_basis: ['id<>?', [c.offerId]],
    summaries: ['product_id NOT IN(?,?)', [c.groupedProductId, c.productId]],
    search_projection: ['product_id NOT IN(?,?)', [c.groupedProductId, c.productId]],
    pilot_refresh_demand: ['offer_id<>?', [c.offerId]],
  };
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const result: Record<string, string> = {};
  for (const row of tables) {
    const name = String(row.name);
    if (name === 'pilot_meta' || name === 'catalog_prepared_products' || name.startsWith('product_substrings_')) continue;
    const [filter, values] = filters[name] ?? ['1', []];
    result[name] = digestRows(db, 'SELECT * FROM "' + name.replaceAll('"', '""') + '" WHERE ' + filter, values);
  }
  return result;
}
function invalidate(db: DatabaseSync) {
  db.prepare("DELETE FROM pilot_meta WHERE key='production_catalog'").run();
  const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
  if (!marker) fail('SNAPSHOT');
  const snapshot = parse(marker.value);
  for (const key of ['catalog', 'prepared_views', 'clock_observations', 'cache', 'projectionVersion', 'counts', 'hashes']) delete snapshot[key];
  snapshot.guideListingRepair = { status: 'uncertified', requiresNewObservation: true };
  db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify(snapshot));
  db.exec('DROP TABLE IF EXISTS catalog_prepared_products');
}
function rebuildAffectedSummaries(db: DatabaseSync) {
  for (const id of [GUIDE_LISTING_REPAIR.groupedProductId, GUIDE_LISTING_REPAIR.productId]) {
    // Misma selección histórica que association-sqlite; sin convertirla en observación actual.
    const rows = db.prepare("SELECT * FROM price_basis WHERE product_id=? AND kind='historical' AND price>0 ORDER BY price,observed_at DESC,id").all(id);
    const perStore = new Map<string, Row>();
    for (const row of rows) {
      const prior = perStore.get(String(row.store_id));
      if (!prior || prior.stock === 'out-of-stock' && row.stock !== 'out-of-stock') perStore.set(String(row.store_id), row);
    }
    const best = [...perStore.values()], available = best.filter(row => row.stock !== 'out-of-stock');
    const stats = computeComparablePriceStats((available.length ? available : best).map(row => ({ price: Number(row.price) })));
    const latest = db.prepare("SELECT MAX(observed_at) latest FROM price_basis WHERE product_id=? AND kind='current'").get(id)?.latest ?? null;
    const stores = db.prepare('SELECT DISTINCT store_id FROM product_prices WHERE product_id=? ORDER BY store_id').all(id).map(row => row.store_id);
    db.prepare('DELETE FROM summaries WHERE product_id=?').run(id);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, stats.lowest, stats.highest, stats.average,
      available.length, best.map(row => row.url).join(' '), 0, JSON.stringify(stores), null, null, latest, '{}');
  }
}
/** Sólo copia nueva, allowlist única y dos artefactos concordantes con hash fijado.
 * Conserva el ID, precio, stock, fechas y registros de historia de la oferta.
 * Anula su revisión y bases derivadas: exige una observación nueva del lector real.
 * El coordinador debe reconstruir QC, reloj, proyección, fingerprint y vistas antes de servir.
 */
export function repairGuideListing(source: string, target: string, options: GuideListingRepairOptions) {
  source = realpathSync(resolve(source)); target = resolve(target);
  if (source === target || existsSync(target)) fail('NEW_COPY_REQUIRED');
  if (!Number.isSafeInteger(options.now) || options.now < 0 || !Number.isFinite(new Date(options.now).valueOf())
    || !['expectedSourceSha256', 'expectedOfferRowSha256', 'evidenceSha256', 'feedSha256']
    .every(key => /^[a-f0-9]{64}$/.test(String(options[key as keyof GuideListingRepairOptions])))) fail('OPTIONS');
  for (const suffix of ['-wal', '-journal']) if (existsSync(source + suffix) && lstatSync(source + suffix).size > 0) fail('SOURCE_NOT_SEALED');
  const sourceSha256Before = guideListingFileSha256(source);
  if (sourceSha256Before !== options.expectedSourceSha256) fail('SOURCE_HASH');
  const verified = evidence(options), original = new DatabaseSync(source, { readOnly: true });
  let protectedBefore: Record<string, string>;
  let before: ReturnType<typeof selected>;
  let beforeCounts: Row;
  try {
    original.exec('BEGIN');
    before = selected(original, options); protectedBefore = untouchedHashes(original);
    beforeCounts = Object.fromEntries(['products', 'product_prices', 'price_basis', 'summaries'].map(table =>
      [table, original.prepare('SELECT COUNT(*) n FROM ' + table).get()!.n]));
    original.exec('COMMIT');
    closeSync(openSync(target, 'wx', 0o600));
    original.prepare('VACUUM INTO ?').run(target);
  } finally { original.close(); }
  const db = new DatabaseSync(target);
  try {
    // Se invalida fuera de la transacción: un rollback nunca vuelve a certificar la copia.
    invalidate(db);
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    try {
      const c = GUIDE_LISTING_REPAIR, copied = selected(db, options), repairedAt = new Date(options.now).toISOString();
      if (!isDeepStrictEqual(copied, before!) || !isDeepStrictEqual(untouchedHashes(db), protectedBefore!)) fail('COPY_CHANGED');
      const raw = { id: c.productId, name: c.title, category: c.category, brand: 'MSI', model: c.title,
        specs: { SKU: c.sku, SourceListingId: c.listingId },
        canonical_product_key: buildProductIdentityKey(c.category, c.title), variant_key: buildProductVariantKey(c.category, c.title),
        lowest_price: 0, highest_price: 0, average_price: 0,
        // Nace esta ficha local; estas fechas no acreditan observación de la oferta.
        created_at: repairedAt, updated_at: repairedAt };
      const document = catalogSearchText([raw.name, raw.brand, raw.model, raw.variant_key, raw.canonical_product_key].join(' '));
      db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(c.productId, c.category, catalogIdentityText(c.title),
        catalogSearchText(c.title), document, 1, 0, null, repairedAt, JSON.stringify(raw));
      db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').run(c.productId, document);
      const next = { ...copied.raw, product_id: c.productId, identity_review: null, state_signature: null };
      db.prepare('UPDATE product_prices SET product_id=?,row_json=? WHERE id=?').run(c.productId, JSON.stringify(next), c.offerId);
      const removedBasis = Number(db.prepare('DELETE FROM price_basis WHERE id=?').run(c.offerId).changes);
      if (copied.queue) db.prepare('UPDATE pilot_refresh_demand SET product_id=?,lease_token=NULL,lease_until=NULL,status=? WHERE offer_id=?')
        .run(c.productId, copied.queue.status === 'leased' ? 'pending' : String(copied.queue.status), c.offerId);
      rebuildAffectedSummaries(db);
      if (tableExists(db, 'search_projection')) db.prepare('DELETE FROM search_projection WHERE product_id IN(?,?)').run(c.groupedProductId, c.productId);
      const protectedAfter = untouchedHashes(db);
      if (!isDeepStrictEqual(protectedBefore!, protectedAfter)) fail('UNTOUCHED_CHANGED');
      const afterOffer = { ...copied.offer, product_id: c.productId, row_json: JSON.stringify(next) };
      if (!isDeepStrictEqual({ ...db.prepare('SELECT * FROM product_prices WHERE id=?').get(c.offerId) }, afterOffer)
        || db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=?').get(c.offerId)?.n !== 0
        || !isDeepStrictEqual(parse(db.prepare('SELECT row_json FROM products WHERE id=?').get(c.productId)?.row_json), raw)) fail('RESULT_CHANGED');
      if (copied.queue && !isDeepStrictEqual({ ...db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(c.offerId) },
        { ...copied.queue, product_id: c.productId, lease_token: null, lease_until: null,
          status: copied.queue.status === 'leased' ? 'pending' : String(copied.queue.status) })) fail('QUEUE_CHANGED');
      if (guideListingFileSha256(source) !== sourceSha256Before) fail('SOURCE_CHANGED');
      if (db.prepare('PRAGMA foreign_key_check').all().length || db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') fail('INTEGRITY');
      const afterCounts = Object.fromEntries(['products', 'product_prices', 'price_basis', 'summaries'].map(table =>
        [table, db.prepare('SELECT COUNT(*) n FROM ' + table).get()!.n]));
      if (Number(afterCounts.products) !== Number(beforeCounts!.products) + 1 || afterCounts.product_prices !== beforeCounts!.product_prices
        || Number(afterCounts.price_basis) !== Number(beforeCounts!.price_basis) - removedBasis
        || Number(afterCounts.summaries) !== Number(beforeCounts!.summaries) + 1) fail('COUNTS');
      db.exec('COMMIT');
      return { version: 1, status: 'local-repair-applied', source, target, stagedAt: new Date(options.now).toISOString(),
        offerId: c.offerId, affectedProductIds: [c.groupedProductId, c.productId], beforeCounts: beforeCounts!, afterCounts, removedBasis,
        membership: { groupedBefore: 6, groupedAfter: 5, specificBefore: 0, specificAfter: 1 },
        sourceSha256Before, sourceSha256After: guideListingFileSha256(source),
        protectedBefore: protectedBefore!, protectedAfter,
        evidence: { ...verified, evidenceSha256: options.evidenceSha256, feedSha256: options.feedSha256 },
        beforeOffer: copied.offer, afterOffer,
        localOnly: true, productionActivated: false, httpRequests: 0, remoteRowsWritten: 0,
        requiresNewObservation: true, requiresRecertification: true, requiresProjectionRebuild: true, requiresPreparedViewRebuild: true };
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}

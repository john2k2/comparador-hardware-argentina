// Puente de lectura: transporta observaciones existentes a staging, nunca las rejuvenece.
import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import { shareExactProductVariant } from '@/lib/persistence/product-detail-offers';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { listingReference, sourceIdentityMatchesListing } from '@/lib/scrapers/listing-reference';
import { buildProductIdentityKey } from '@/lib/product-identity';
import type { HardwareCategory } from '@/lib/types';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { BUDGET_GUIDES } from '@/lib/seo/budget-guides-data';
import { catalogSearchText } from './catalog-matchers.mjs';
import type { DbProductPriceRow, DbProductRow } from '@/lib/persistence/product-read-types';

export type UpstreamObservation = DbProductPriceRow & {
  id: string; product_id: string; products: DbProductRow;
};
type Cursor = { start: string; end: string; after: { at: string; id: string } | null; complete: boolean };
type Decision = { offerId: string; productId: string; storeId: string; reason: string;
  beforeObservedAt: string | null; observedAt: string | null };
const stateKey = 'upstream_observation_cursor_v1';
const MAX_ROWS = 1000, PAGE_SIZE = 250, MAX_BYTES = 4 * 1024 * 1024;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const stamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
// PostgreSQL conserva microsegundos: ordenar sin redondearlos ni modificar la evidencia.
const micros = (value: string) => BigInt(Date.parse(value)) * BigInt(1000)
  + BigInt((value.match(/\.(\d{1,6})(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? '').padEnd(6, '0').slice(3));
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
function subject(raw: DbProductRow, name = raw.name) {
  // Aplicar el mismo contrato a ambos lados, sin confiar en claves antiguas ni
  // confundir una clave ausente del mapper con una variante distinta.
  return mapDbGuideProduct({ ...raw, name, normalized_title: name,
    canonical_product_key: buildProductIdentityKey(raw.category as HardwareCategory, name), product_prices: [] });
}

/** Adelantar destinos conocidos de guías evita esperar a terminar el backfill.
 * La coincidencia textual sólo selecciona candidatos: no acredita identidad.
 */
export function guidePriorityOfferIds(db: DatabaseSync): string[] {
  const ids = new Set<string>();
  for (const guide of BUDGET_GUIDES) for (const slot of Object.values(guide.components)) {
    const terms = String(catalogSearchText(slot.searchTerms[0] ?? slot.exactModel)).split(' ').filter(Boolean);
    if (!terms.length) continue;
    const predicates = terms.map(() => 'p.catalog_name LIKE ?').join(' AND ');
    const rows = db.prepare(`SELECT pp.id FROM products p JOIN product_prices pp ON pp.product_id=p.id
      WHERE p.category=? AND ${predicates} ORDER BY pp.price,pp.id LIMIT 3`).all(slot.category, ...terms.map(term => '%' + term + '%'));
    for (const row of rows) ids.add(String(row.id));
  }
  return [...ids].slice(0, 64);
}

/** No alcanza una clave canónica heredada: cotejar publicación, producto y fuente. */
export function admitUpstreamObservations(db: DatabaseSync, rows: UpstreamObservation[], now: number) {
  if (!Number.isSafeInteger(now) || !Array.isArray(rows) || rows.length > MAX_ROWS || db.isTransaction)
    throw Error('UPSTREAM_INPUT_INVALID');
  if (db.prepare("SELECT 1 FROM pilot_meta WHERE key='production_catalog'").get()) throw Error('UPSTREAM_STAGING_REQUIRED');
  const decisions: Decision[] = [], seen = new Set<string>();
  const changes: { id: string; before: string; after: string; price: number; observedAt: string }[] = [];
  for (const row of rows) {
    if (!row || !identifier(row.id) || seen.has(row.id)) throw Error('UPSTREAM_ROW_DUPLICATE_OR_INVALID');
    seen.add(row.id);
    const stored = db.prepare('SELECT * FROM product_prices WHERE id=?').get(row.id);
    const old = stored ? JSON.parse(String(stored.row_json)) : null;
    const decision: Decision = { offerId: row.id, productId: row.product_id, storeId: row.store_id, reason: 'accepted',
      beforeObservedAt: old?.last_updated ?? null, observedAt: row.last_updated };
    decisions.push(decision);
    const reject = (reason: string) => { decision.reason = reason; };
    if (!stored || !old) { reject('offer-outside-snapshot'); continue; }
    if (old.id !== stored.id || old.product_id !== stored.product_id || old.store_id !== stored.store_id
      || old.url !== stored.url || Number(old.price) !== stored.price) throw Error('UPSTREAM_LOCAL_COLUMNS_INVALID');
    if (row.product_id !== stored.product_id || row.store_id !== stored.store_id || row.url !== stored.url
      || !listingReference(row.store_id, row.url)) { reject('destination-conflict'); continue; }
    if (!stamp(row.last_updated) || Date.parse(row.last_updated) > now + 60000
      || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0
      || !['in-stock', 'low-stock', 'out-of-stock', 'backorder', 'unknown'].includes(row.stock ?? '')) {
      reject('observation-invalid'); continue;
    }
    if (old.last_updated != null && !stamp(old.last_updated)) { reject('local-date-invalid'); continue; }
    if (old.last_updated && micros(row.last_updated) <= micros(old.last_updated)) {
      reject('not-newer'); continue;
    }
    const local = db.prepare('SELECT row_json FROM products WHERE id=?').get(row.product_id);
    const raw = local ? JSON.parse(String(local.row_json)) as DbProductRow : null;
    if (!raw || row.products?.id !== raw.id) { reject('product-missing'); continue; }
    const target = subject(raw);
    // La categoría heredada del productor puede ser la que acabamos de reparar.
    // Sólo corregirla en la comparación si el nombre demuestra la categoría local.
    const remoteCategory = inferHardwareCategoryFromName(row.products.name);
    const remote = subject({ ...row.products,
      category: remoteCategory === raw.category ? raw.category : row.products.category });
    const { products: _product, ...offer } = row;
    void _product;
    const candidate = mapDbGuideProduct({ ...raw, product_prices: [offer] }).prices[0];
    if (!shareExactProductVariant(target, remote) || !shareExactProductVariant(remote, target)) {
      reject('product-variant-unproven'); continue;
    }
    if (!candidate?.sourceIdentity || !sourceIdentityMatchesListing(row.store_id, row.url, candidate.sourceIdentity)
      || needsIdentityReview(candidate, target)) { reject('source-identity-unproven'); continue; }
    const source = subject(raw, candidate.sourceIdentity.title);
    if (!shareExactProductVariant(target, source) || !shareExactProductVariant(source, target)) {
      reject('source-variant-unproven'); continue;
    }
    const sku = Object.entries(target.specs).find(([key]) => key.toLowerCase().trim() === 'sku')?.[1];
    if (sku && candidate.sourceIdentity.storeSku && sku.trim().toUpperCase() !== candidate.sourceIdentity.storeSku.trim().toUpperCase()) {
      reject('source-sku-conflict'); continue;
    }
    // Sólo campos de oferta; metadatos de producto y asociaciones permanecen iguales.
    const after = JSON.stringify({ ...old, ...offer, price: Number(offer.price) });
    changes.push({ id: row.id, before: String(stored.row_json), after, price: Number(row.price), observedAt: row.last_updated });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS pilot_offer_observations(offer_id TEXT NOT NULL,observed_at TEXT NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(offer_id,observed_at))');
    const update = db.prepare('UPDATE product_prices SET price=?,row_json=? WHERE id=? AND row_json=?');
    const observe = db.prepare('INSERT OR IGNORE INTO pilot_offer_observations(offer_id,observed_at,row_json) VALUES(?,?,?)');
    for (const change of changes) {
      if (update.run(change.price, change.after, change.id, change.before).changes !== 1) throw Error('UPSTREAM_WRITE_CONFLICT');
      observe.run(change.id, change.observedAt, change.after);
      if (db.prepare('SELECT row_json FROM pilot_offer_observations WHERE offer_id=? AND observed_at=?').get(change.id, change.observedAt)?.row_json !== change.after)
        throw Error('UPSTREAM_HISTORY_CONFLICT');
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const reasons: Record<string, number> = {};
  for (const decision of decisions) reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
  return { read: rows.length, accepted: changes.length, rejected: rows.length - changes.length, reasons, decisions,
    changes: changes.map(change => ({ offerId: change.id, beforeSha256: hash(change.before), afterSha256: hash(change.after), observedAt: change.observedAt })),
    remoteRowsWritten: 0, productionActivated: false, requiresCertification: true };
}

function nextCursor(db: DatabaseSync, now: number): Cursor {
  const saved = db.prepare('SELECT value FROM pilot_meta WHERE key=?').get(stateKey);
  if (!saved) return { start: new Date(now - 86400000).toISOString(), end: new Date(now).toISOString(), after: null, complete: false };
  const value = JSON.parse(String(saved.value)) as Cursor;
  if (!stamp(value.start) || !stamp(value.end) || Date.parse(value.start) > Date.parse(value.end)
    || Date.parse(value.end) > now + 60000 || typeof value.complete !== 'boolean'
    || value.after && (!stamp(value.after.at) || !identifier(value.after.id))) throw Error('UPSTREAM_CURSOR_INVALID');
  return value.complete ? { start: new Date(Date.parse(value.end) - 10800000).toISOString(), end: new Date(now).toISOString(), after: null, complete: false } : value;
}

/** Máximo cinco GET, 1000 filas y 4 MiB por página. Cursor duradero y solapamiento
 * de 3h para observaciones guardadas con retraso; ningún barrido ilimitado.
 */
export async function syncUpstreamObservations(db: DatabaseSync, options: {
  url: string; publicKey: string; now: number; fetch?: typeof fetch; priorityOfferIds?: string[];
}) {
  const base = new URL(options.url);
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || base.port
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !options.publicKey)
    throw Error('UPSTREAM_PUBLIC_CONFIG_INVALID');
  // Un puente público no necesita y no debe recibir service_role o sb_secret.
  if (!options.publicKey.startsWith('sb_publishable_')) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(options.publicKey.split('.')[1], 'base64url').toString()).role; } catch { /* rechazar */ }
    if (role !== 'anon') throw Error('UPSTREAM_PUBLIC_KEY_REQUIRED');
  }
  const cursor = nextCursor(db, options.now), rows: UpstreamObservation[] = [];
  const request = options.fetch ?? fetch;
  let requests = 0, bytes = 0;
  async function readPage(url: URL, limit: number) {
    url.searchParams.set('select', '*,products(*)'); url.searchParams.set('limit', String(limit));
    requests++;
    const response = await request(url, { method: 'GET', headers: { apikey: options.publicKey },
      redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw Error('UPSTREAM_READ_FAILED'); }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let pageBytes = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        pageBytes += part.value.byteLength;
        if (pageBytes > MAX_BYTES) throw Error('UPSTREAM_RESPONSE_TOO_LARGE');
        chunks.push(part.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    bytes += pageBytes;
    const page = JSON.parse(Buffer.concat(chunks).toString('utf8')) as UpstreamObservation[];
    if (!Array.isArray(page) || page.length > limit || page.some(row => !identifier(row?.id)
      || !stamp(row.last_updated) || Date.parse(row.last_updated) > options.now + 60000)) throw Error('UPSTREAM_PAGE_INVALID');
    return page;
  }
  const priority = options.priorityOfferIds ?? [];
  if (!Array.isArray(priority) || priority.length > 64 || new Set(priority).size !== priority.length
    || priority.some(id => !identifier(id) || !db.prepare('SELECT 1 FROM product_prices WHERE id=?').get(id)))
    throw Error('UPSTREAM_PRIORITY_INVALID');
  if (priority.length) {
    const url = new URL('/rest/v1/product_prices', base);
    url.searchParams.set('id', 'in.(' + priority.join(',') + ')');
    const page = await readPage(url, priority.length);
    if (page.some(row => !priority.includes(row.id))) throw Error('UPSTREAM_PRIORITY_RESPONSE');
    rows.push(...page);
  }
  const priorityRows = rows.length, pageSize = priority.length ? Math.floor((MAX_ROWS - priority.length) / 4) : PAGE_SIZE;
  for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
    const url = new URL('/rest/v1/product_prices', base);
    url.searchParams.set('order', 'last_updated.asc,id.asc');
    url.searchParams.append('last_updated', 'gte.' + cursor.start);
    url.searchParams.append('last_updated', 'lte.' + cursor.end);
    if (cursor.after) url.searchParams.set('or', `(last_updated.gt.${cursor.after.at},and(last_updated.eq.${cursor.after.at},id.gt.${cursor.after.id}))`);
    const page = await readPage(url, pageSize);
    if (page.some(row => Date.parse(row.last_updated!) < Date.parse(cursor.start)
      || Date.parse(row.last_updated!) > Date.parse(cursor.end))) throw Error('UPSTREAM_PAGE_INVALID');
    rows.push(...page);
    if (page.length) {
      const last = page.at(-1)!;
      if (last.id === cursor.after?.id && last.last_updated === cursor.after.at) throw Error('UPSTREAM_CURSOR_STALLED');
      cursor.after = { at: last.last_updated!, id: last.id };
    }
    if (page.length < pageSize) { cursor.complete = true; break; }
  }
  const unique = new Map<string, UpstreamObservation>();
  for (const row of rows) {
    const prior = unique.get(row.id);
    // El solapamiento con la página prioritaria se contabiliza, sin escribir dos veces.
    if (!prior || micros(row.last_updated!) > micros(prior.last_updated!)) unique.set(row.id, row);
    else if (row.last_updated === prior.last_updated && JSON.stringify(row) !== JSON.stringify(prior)) throw Error('UPSTREAM_DUPLICATE_CONFLICT');
  }
  const admission = admitUpstreamObservations(db, [...unique.values()], options.now);
  db.prepare('INSERT INTO pilot_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(stateKey, JSON.stringify(cursor));
  return { ...admission, receivedRows: rows.length, priorityRows, requests, bytes, cursor, capped: !cursor.complete, overlapHours: 3, initialLookbackHours: 24 };
}

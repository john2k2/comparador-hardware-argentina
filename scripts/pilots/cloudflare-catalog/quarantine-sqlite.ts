// Cuarentena explícita local: conservar la oferta, retirar sus bases comparables.
import type { DatabaseSync } from 'node:sqlite';
import { normalizeIdentityText } from '@/lib/product-identity';
import type { HardwareCategory } from '@/lib/types';
import type { OfferIdentityReview } from '@/lib/quality/offer-identity';
import type { associationSqliteDependencies } from './association-sqlite';
import { associationRowHash } from './association-local.mjs';

type Dependencies = ReturnType<typeof associationSqliteDependencies>;
export type QuarantineInput = {
  offerId: string;
  expectedRowHash: string;
  sourceTitle: string;
  evidence: { kind: 'public-detail'; url: string; capturedAt: string; contentSha256: string };
};
const auditSchema = `CREATE TABLE IF NOT EXISTS pilot_quarantine_audit(
 plan_id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, product_id TEXT NOT NULL,
 source_title TEXT NOT NULL, evidence_json TEXT NOT NULL, before_hash TEXT NOT NULL,
 after_hash TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, applied_at TEXT NOT NULL);`;
const categories = new Set(['procesadores', 'tarjetas-graficas', 'memoria-ram']);
function fail(code: string): never { throw new Error(`QUARANTINE_${code}`); }
const exists = (db: DatabaseSync, table: string) => Boolean(db.prepare(
  'SELECT name FROM sqlite_schema WHERE type=? AND name=?').get('table', table));
const text = (value: unknown, max = 400): value is string => typeof value === 'string'
  && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value);
function readJson(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Rechazar filas dañadas. */ }
  return fail('INVALID_ROW');
}
function synchronous<T>(value: T): T {
  const pending = value as { then?: unknown; catch?: (handler: () => void) => unknown } | null;
  if (pending && typeof pending.then === 'function') {
    pending.catch?.(() => {});
    fail('ASYNC_CALLBACK');
  }
  return value;
}
export const quarantineRowHash = associationRowHash;

/** Las dependencias concretas verifican el archivo y reconstruyen en esta transacción.
 * La fecha de revisión no sustituye la observación original de precio/stock.
 */
export function applyQuarantinePlan(db: DatabaseSync, input: QuarantineInput,
  dependencies: Dependencies, { now = Date.now() } = {}) {
  const evidence = input?.evidence;
  if (!text(input?.offerId) || !text(input?.sourceTitle)
    || !/^[a-f0-9]{64}$/.test(input?.expectedRowHash ?? '')) fail('INVALID_PLAN');
  if (!evidence || evidence.kind !== 'public-detail' || !text(evidence.url, 2000)
    || !text(evidence.capturedAt) || !Number.isFinite(Date.parse(evidence.capturedAt))
    || !/^[a-f0-9]{64}$/.test(evidence.contentSha256)) fail('INVALID_EVIDENCE');
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).valueOf())
    || Date.parse(evidence.capturedAt) > now) fail('INVALID_CLOCK');
  for (const callback of Object.values(dependencies ?? {})) {
    if (typeof callback !== 'function') fail('MISSING_DEPENDENCY');
    if (Object.prototype.toString.call(callback) === '[object AsyncFunction]') fail('ASYNC_CALLBACK');
  }
  for (const key of ['listingReference', 'verifyEvidence', 'exactOfferAttributes', 'proveOfferAttributes',
    'hasExplicitIdentityConflict', 'rebuildSummaries', 'rebuildProjection', 'createCacheSnapshot'] as const) {
    if (typeof dependencies?.[key] !== 'function') fail('MISSING_DEPENDENCY');
  }
  if (db.isTransaction) fail('NESTED_TRANSACTION');
  const plan = { offerId: input.offerId, expectedRowHash: input.expectedRowHash,
    sourceTitle: input.sourceTitle, evidence: { ...evidence } };
  const planId = quarantineRowHash(plan);
  db.exec('BEGIN IMMEDIATE');
  try {
    const offer = db.prepare('SELECT * FROM product_prices WHERE id=?').get(plan.offerId);
    if (!offer) fail('MISSING_ROW');
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(offer.product_id);
    if (!product) fail('MISSING_ROW');
    const raw = readJson(offer.row_json), original = readJson(product.row_json);
    if (raw.id !== offer.id || raw.product_id !== offer.product_id || raw.store_id !== offer.store_id
      || raw.price !== offer.price || raw.url !== offer.url || original.id !== product.id
      || !text(original.name) || original.category !== product.category) fail('ROW_INCONSISTENT');
    const category = String(product.category);
    if (!categories.has(category)) fail('CATEGORY');
    const reference = dependencies.listingReference(String(offer.store_id), String(offer.url));
    if (!reference || reference !== dependencies.listingReference(String(offer.store_id), evidence.url)) fail('EVIDENCE_URL');
    if (synchronous(dependencies.verifyEvidence(evidence, { offerId: plan.offerId, sourceTitle: plan.sourceTitle,
      storeId: String(offer.store_id), targetCategory: category })) !== true) fail('UNVERIFIED_EVIDENCE');
    if (!dependencies.exactOfferAttributes(plan.sourceTitle, category)) fail('SOURCE_ATTRIBUTES');
    if (dependencies.proveOfferAttributes(original.name, category, plan.sourceTitle)) fail('EQUIVALENT_SOURCE');
    const reason = dependencies.hasExplicitIdentityConflict({ name: original.name,
      category: category as HardwareCategory, offerText: plan.sourceTitle }) ? 'explicit-conflict' : 'insufficient-evidence';
    const prior = exists(db, 'pilot_quarantine_audit')
      ? db.prepare('SELECT * FROM pilot_quarantine_audit WHERE plan_id=?').get(planId) : null;
    if (prior) {
      if (quarantineRowHash(offer) !== prior.after_hash
        || db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=?').get(plan.offerId)?.n !== 0) fail('ROW_CHANGED');
      db.exec('COMMIT');
      return { status: 'already-applied', planId, writes: 0, localOnly: true, changesMembership: false, remotePublishSafe: false };
    }
    if (quarantineRowHash(offer) !== plan.expectedRowHash) fail('ROW_CHANGED');
    const queue = exists(db, 'pilot_refresh_demand')
      ? db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(plan.offerId) : null;
    if (queue?.status === 'leased' && Number(queue.lease_until) > now) fail('LEASE_ACTIVE');
    if (queue && (queue.product_id !== offer.product_id || queue.store_id !== offer.store_id || queue.url !== offer.url)) fail('QUEUE_CHANGED');
    const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (!marker) fail('SNAPSHOT_MISSING');
    const metadata = readJson(marker.value), oldCache = metadata.cache as { generation?: string } | undefined;
    const sourceIdentity = { listingRef: reference, title: plan.sourceTitle };
    const review: OfferIdentityReview = { version: 1, status: 'needs-review', reason,
      reviewedAt: new Date(now).toISOString(), model: null, confidence: null, sourceIdentity,
      subject: { name: normalizeIdentityText(original.name), category, url: String(offer.url) } };
    const nextJson = JSON.stringify({ ...raw, source_identity: sourceIdentity, identity_review: review, state_signature: null });
    const context = { now, generation: planId, affectedProductIds: [String(product.id)], excludedOfferIds: [plan.offerId] };
    db.exec(auditSchema);
    if (db.prepare('UPDATE product_prices SET row_json=? WHERE id=? AND row_json=?')
      .run(nextJson, plan.offerId, offer.row_json).changes !== 1) fail('ROW_CHANGED');
    const removedBasis = db.prepare('DELETE FROM price_basis WHERE id=?').run(plan.offerId).changes;
    db.prepare('DELETE FROM summaries WHERE product_id=?').run(product.id);
    if (exists(db, 'search_projection')) db.prepare('DELETE FROM search_projection WHERE product_id=?').run(product.id);
    const summaries = synchronous(dependencies.rebuildSummaries(db, context));
    const projection = synchronous(dependencies.rebuildProjection(db, context));
    const cache = synchronous(dependencies.createCacheSnapshot());
    if (!cache || cache.version !== 1 || !text(cache.generation, 128) || cache.generation === oldCache?.generation
      || Date.parse(cache.validFrom) !== now || !Number.isFinite(Date.parse(cache.validUntil))
      || Date.parse(cache.validUntil) <= now) fail('CACHE_SNAPSHOT');
    const after = db.prepare('SELECT * FROM product_prices WHERE id=?').get(plan.offerId);
    if (!after || quarantineRowHash(after) !== quarantineRowHash({ ...offer, row_json: nextJson })
      || db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=?').get(plan.offerId)?.n !== 0) fail('CALLBACK_CHANGED_OFFER');
    if (quarantineRowHash(db.prepare('SELECT * FROM products WHERE id=?').get(product.id)) !== quarantineRowHash(product)
      || quarantineRowHash(exists(db, 'pilot_refresh_demand')
        ? db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(plan.offerId) ?? {} : {}) !== quarantineRowHash(queue ?? {})) fail('CALLBACK_CHANGED_ROW');
    const rebuilt = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (!rebuilt) fail('SNAPSHOT_MISSING');
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'")
      .run(JSON.stringify({ ...readJson(rebuilt.value), quarantineRevision: planId, cache }));
    db.prepare('INSERT INTO pilot_quarantine_audit VALUES(?,?,?,?,?,?,?,?,?,?)').run(planId, plan.offerId, product.id,
      plan.sourceTitle, JSON.stringify(evidence), plan.expectedRowHash, quarantineRowHash(after),
      JSON.stringify({ ...offer }), JSON.stringify({ ...after }), new Date(now).toISOString());
    db.exec('COMMIT');
    return { status: 'applied', planId, reason, affectedProductIds: context.affectedProductIds,
      excludedOfferIds: context.excludedOfferIds, removedBasis, summaries, projection, cache,
      localOnly: true, changesMembership: false, remotePublishSafe: false };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

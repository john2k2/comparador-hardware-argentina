// Reparación explícita de membresía local. No es un delta de precios ni un refresh.
import { rowHash } from './incremental-sync.mjs';

const auditSchema = `CREATE TABLE IF NOT EXISTS pilot_association_audit(
 plan_id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, old_product_id TEXT NOT NULL,
 target_product_id TEXT NOT NULL, source_title TEXT NOT NULL, evidence_json TEXT NOT NULL,
 before_hash TEXT NOT NULL, after_hash TEXT NOT NULL, before_json TEXT NOT NULL,
 after_json TEXT NOT NULL, applied_at TEXT NOT NULL);`;
const fail = code => { throw new Error('ASSOCIATION_' + code); };
const exists = (db, table) => Boolean(db.prepare('SELECT name FROM sqlite_schema WHERE type=? AND name=?').get('table', table));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, max = 400) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value);
}
function synchronous(value) {
  if (value && typeof value.then === 'function') {
    value.catch?.(() => {});
    fail('ASYNC_CALLBACK');
  }
  return value;
}
function readJson(raw) {
  try { const value = JSON.parse(raw); if (record(value)) return value; } catch { /* Fallar cerrado. */ }
  fail('INVALID_ROW');
}

/** Hash de TODA la fila SQLite, incluido row_json. Un cambio concurrente invalida el plan. */
export const associationRowHash = row => rowHash({ ...row });

function normalizePlan(input) {
  if (!record(input) || !['offerId', 'expectedProductId', 'targetProductId', 'sourceTitle'].every(key => text(input[key]))
    || !/^[a-f0-9]{64}$/.test(input.expectedRowHash ?? '') || input.expectedProductId === input.targetProductId) fail('INVALID_PLAN');
  const e = input.evidence;
  if (!record(e) || e.kind !== 'public-detail' || !text(e.url, 2000)
    || !Number.isFinite(Date.parse(e.capturedAt)) || !/^[a-f0-9]{64}$/.test(e.contentSha256 ?? '')) fail('INVALID_EVIDENCE');
  return { offerId: input.offerId, expectedProductId: input.expectedProductId, expectedRowHash: input.expectedRowHash,
    targetProductId: input.targetProductId, sourceTitle: input.sourceTitle,
    evidence: { kind: e.kind, url: e.url, capturedAt: e.capturedAt, contentSha256: e.contentSha256 } };
}
function identityDependencies(dependencies) {
  for (const key of ['exactOfferAttributes', 'proveOfferAttributes', 'hasExplicitIdentityConflict', 'listingReference', 'verifyEvidence'])
    if (typeof dependencies?.[key] !== 'function') fail('MISSING_DEPENDENCY');
  if (Object.prototype.toString.call(dependencies.verifyEvidence) === '[object AsyncFunction]') fail('ASYNC_CALLBACK');
}
function selectedRows(db, plan) {
  const offer = db.prepare('SELECT * FROM product_prices WHERE id=?').get(plan.offerId);
  const oldProduct = db.prepare('SELECT * FROM products WHERE id=?').get(plan.expectedProductId);
  const targetProduct = db.prepare('SELECT * FROM products WHERE id=?').get(plan.targetProductId);
  if (!offer || !oldProduct || !targetProduct) fail('MISSING_ROW');
  const before = readJson(offer.row_json), old = readJson(oldProduct.row_json), target = readJson(targetProduct.row_json);
  if (before.id !== offer.id || before.product_id !== offer.product_id || before.store_id !== offer.store_id
    || before.url !== offer.url || Number(before.price) !== offer.price
    || old.id !== oldProduct.id || target.id !== targetProduct.id || !text(target.name)
    || (target.category !== undefined && target.category !== targetProduct.category)) fail('ROW_INCONSISTENT');
  return { offer, before, oldProduct, targetProduct, target };
}
function validateIdentity(rows, plan, dependencies, now) {
  if (!Number.isSafeInteger(now) || now < 0 || Date.parse(plan.evidence.capturedAt) > now) fail('INVALID_CLOCK');
  const { offer, targetProduct, target } = rows;
  const reference = dependencies.listingReference(offer.store_id, offer.url);
  if (!reference || reference !== dependencies.listingReference(offer.store_id, plan.evidence.url)) fail('EVIDENCE_URL');
  // El coordinador verifica el artefacto local/hash y extrae título/URL mediante el lector real.
  const verified = synchronous(dependencies.verifyEvidence(plan.evidence, { sourceTitle: plan.sourceTitle,
    storeId: offer.store_id, url: offer.url, offerId: offer.id }));
  if (verified !== true) fail('UNVERIFIED_EVIDENCE');
  if (!dependencies.exactOfferAttributes(target.name, targetProduct.category)
    || !dependencies.exactOfferAttributes(plan.sourceTitle, targetProduct.category)
    || dependencies.hasExplicitIdentityConflict({ name: target.name, category: targetProduct.category, offerText: plan.sourceTitle })) fail('IDENTITY');
  const proof = dependencies.proveOfferAttributes(target.name, targetProduct.category, plan.sourceTitle);
  if (!proof) fail('IDENTITY');
  return proof;
}

/** Sólo lectura. El destino y el título se suministran; no selecciona ni crea productos. */
export function planAssociation(db, input, dependencies, { now = Date.now() } = {}) {
  identityDependencies(dependencies);
  const plan = normalizePlan(input), rows = selectedRows(db, plan);
  if (rows.offer.product_id !== plan.expectedProductId || associationRowHash(rows.offer) !== plan.expectedRowHash) fail('ROW_CHANGED');
  const proof = validateIdentity(rows, plan, dependencies, now);
  return { ...plan, planId: rowHash(plan), proof, localOnly: true, changesMembership: true, remotePublishSafe: false };
}

function previousApplication(db, plan) {
  if (!exists(db, 'pilot_association_audit')) return null;
  return db.prepare('SELECT * FROM pilot_association_audit WHERE plan_id=?').get(rowHash(plan));
}
function cacheSnapshot(value, before, now) {
  if (!record(value) || value.version !== 1 || !text(value.generation, 128)
    || value.generation === before.cache?.generation || Date.parse(value.validFrom) !== now
    || !Number.isFinite(Date.parse(value.validUntil)) || Date.parse(value.validUntil) <= now) fail('CACHE_SNAPSHOT');
  return { version: 1, generation: value.generation, validFrom: value.validFrom, validUntil: value.validUntil };
}

/** Callbacks síncronos operan en esta misma transacción; no deben hacer I/O externo.
 * rebuildSummaries y rebuildProjection reciben ambos affectedProductIds y excludedOfferIds.
 * createCacheSnapshot devuelve metadata de caché nueva, sin renovar fechas de ofertas.
 * Las funciones de identidad deben ser las reales de src/lib/quality, inyectadas por el bundle.
 */
export function applyAssociationPlan(db, input, dependencies, { now = Date.now() } = {}) {
  identityDependencies(dependencies);
  for (const key of ['rebuildSummaries', 'rebuildProjection', 'createCacheSnapshot'])
    if (typeof dependencies[key] !== 'function') fail('MISSING_DEPENDENCY');
    else if (Object.prototype.toString.call(dependencies[key]) === '[object AsyncFunction]') fail('ASYNC_CALLBACK');
  if (db.isTransaction) fail('NESTED_TRANSACTION');
  const plan = normalizePlan(input), planId = rowHash(plan);
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = selectedRows(db, plan), prior = previousApplication(db, plan);
    const proof = validateIdentity(rows, plan, dependencies, now);
    if (prior) {
      if (rows.offer.product_id !== plan.targetProductId || associationRowHash(rows.offer) !== prior.after_hash) fail('ROW_CHANGED');
      db.exec('COMMIT');
      return { status: 'already-applied', planId, localOnly: true, changesMembership: true, remotePublishSafe: false, writes: 0 };
    }
    if (rows.offer.product_id !== plan.expectedProductId || associationRowHash(rows.offer) !== plan.expectedRowHash) fail('ROW_CHANGED');
    const queue = exists(db, 'pilot_refresh_demand') ? db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(plan.offerId) : null;
    if (queue?.status === 'leased' && queue.lease_until > now) fail('LEASE_ACTIVE');
    if (queue && (queue.product_id !== plan.expectedProductId || queue.store_id !== rows.offer.store_id || queue.url !== rows.offer.url)) fail('QUEUE_CHANGED');
    const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (!marker) fail('SNAPSHOT_MISSING');
    const metadata = readJson(marker.value);
    const nextJson = JSON.stringify({ ...rows.before, product_id: plan.targetProductId, identity_review: null, state_signature: null });
    const nextRow = { ...rows.offer, product_id: plan.targetProductId, row_json: nextJson };
    const affectedProductIds = [plan.expectedProductId, plan.targetProductId];
    const context = Object.freeze({ now, planId, generation: planId, affectedProductIds: Object.freeze(affectedProductIds),
      excludedOfferIds: Object.freeze([plan.offerId]), reason: 'association-change', sourceProof: proof });
    db.exec(auditSchema);
    const changed = db.prepare('UPDATE product_prices SET product_id=?,row_json=? WHERE id=? AND product_id=? AND row_json=?')
      .run(plan.targetProductId, nextJson, plan.offerId, plan.expectedProductId, rows.offer.row_json);
    if (changed.changes !== 1) fail('ROW_CHANGED');
    // Ni histórico ni current se trasladan: el precio deberá ser observado otra vez.
    const removedBasis = db.prepare('DELETE FROM price_basis WHERE id=?').run(plan.offerId).changes;
    for (const id of affectedProductIds) {
      db.prepare('DELETE FROM summaries WHERE product_id=?').run(id);
      if (exists(db, 'search_projection')) db.prepare('DELETE FROM search_projection WHERE product_id=?').run(id);
    }
    if (queue) {
      // Conservar attempts/due_at/backoff. Corregir identidad no saltea un 403/429.
      db.prepare('UPDATE pilot_refresh_demand SET product_id=? WHERE offer_id=?').run(plan.targetProductId, plan.offerId);
    }
    const summaries = synchronous(dependencies.rebuildSummaries(db, context));
    const projection = synchronous(dependencies.rebuildProjection(db, context));
    const cache = cacheSnapshot(synchronous(dependencies.createCacheSnapshot(db, context)), metadata, now);
    const actual = db.prepare('SELECT * FROM product_prices WHERE id=?').get(plan.offerId);
    if (!actual || associationRowHash(actual) !== associationRowHash(nextRow)
      || db.prepare('SELECT COUNT(*) count FROM price_basis WHERE id=?').get(plan.offerId).count !== 0) fail('CALLBACK_CHANGED_OFFER');
    for (const before of [rows.oldProduct, rows.targetProduct]) {
      const after = db.prepare('SELECT * FROM products WHERE id=?').get(before.id);
      if (!after || associationRowHash(after) !== associationRowHash(before)) fail('CALLBACK_CHANGED_PRODUCT');
    }
    const rebuiltMarker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    if (!rebuiltMarker) fail('SNAPSHOT_MISSING');
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'")
      .run(JSON.stringify({ ...readJson(rebuiltMarker.value), associationRevision: planId, cache }));
    db.prepare('INSERT INTO pilot_association_audit VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(planId, plan.offerId,
      plan.expectedProductId, plan.targetProductId, plan.sourceTitle, JSON.stringify(plan.evidence),
      plan.expectedRowHash, associationRowHash(actual), JSON.stringify({ ...rows.offer }), JSON.stringify({ ...actual }), new Date(now).toISOString());
    db.exec('COMMIT');
    return { status: 'applied', planId, affectedProductIds, excludedOfferIds: [plan.offerId], removedBasis,
      summaries, projection, cache, localOnly: true, changesMembership: true, remotePublishSafe: false,
      note: 'Membresía corregida; fechas/precio/stock intactos, revisión invalidada. Requiere nueva observación.' };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

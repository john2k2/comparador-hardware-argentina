import { randomUUID } from 'node:crypto';

const HOUR = 3600000;
const SCHEMA = `CREATE TABLE IF NOT EXISTS pilot_refresh_demand(
 offer_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, store_id TEXT NOT NULL, url TEXT NOT NULL,
 observed_before TEXT, requested_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 due_at INTEGER NOT NULL, priority INTEGER NOT NULL, status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, leased_at INTEGER, lease_until INTEGER,
 last_error TEXT, last_observed_at TEXT
);
CREATE INDEX IF NOT EXISTS pilot_refresh_due ON pilot_refresh_demand(status,due_at,priority DESC);`;
const failures = new Set(['http-403','http-429','http-error','network-error','no-observation','identity-mismatch','persistence-error']);

function clock(now) {
  if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).valueOf())) throw new Error('REFRESH_INVALID_CLOCK');
}
function allowedStores(storeIds) {
  if (storeIds === undefined) return null;
  if (!Array.isArray(storeIds) || storeIds.length > 34 || storeIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id))) throw new Error('REFRESH_INVALID_STORES');
  return [...new Set(storeIds)];
}
function allowedProducts(productIds) {
  if (productIds === undefined) return null;
  if (!Array.isArray(productIds) || productIds.length > 20 || productIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('REFRESH_INVALID_PRODUCTS');
  return [...new Set(productIds)];
}
function allowedOffers(offerIds) {
  if (offerIds === undefined) return null;
  if (!Array.isArray(offerIds) || offerIds.length > 100 || offerIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('REFRESH_INVALID_OFFERS');
  return [...new Set(offerIds)];
}
function transaction(db, operation) {
  if (db.isTransaction) throw new Error('REFRESH_OWN_TRANSACTION_REQUIRED');
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function offerFromRow(row) {
  if (!row) return null;
  let raw;
  try { raw = JSON.parse(row.row_json); } catch { return null; }
  // No aceptar IDs ni destinos reconstruidos por similitud.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id !== row.id || raw.product_id !== row.product_id || raw.store_id !== row.store_id || raw.url !== row.url || raw.price !== row.price) return null;
  try { const url = new URL(row.url); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null; }
  catch { return null; }
  const time = Date.parse(raw.last_updated);
  return { offerId: row.id, productId: row.product_id, storeId: row.store_id, url: row.url,
    observedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
    price: raw.price, stock: raw.stock };
}
export function initializeRefreshDemand(db) { db.exec(SCHEMA); }

/** Sólo demanda sobre productos ya guardados. La cola jamás renueva precio/stock/fecha. */
export function enqueueKnownProducts(db, { productIds, now = Date.now(), freshMs = 24 * HOUR,
  refreshAheadMs = 90 * 60000, demandTtlMs = 48 * HOUR, storeIds, offerIds, withinTransaction = false } = {}) {
  clock(now);
  const stores = allowedStores(storeIds);
  const offers = allowedOffers(offerIds);
  if (!Array.isArray(productIds) || productIds.length > 20 || productIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('REFRESH_INVALID_PRODUCTS');
  if (!Number.isSafeInteger(freshMs) || freshMs <= 0 || freshMs > 24 * HOUR ||
    !Number.isSafeInteger(refreshAheadMs) || refreshAheadMs < 0 || refreshAheadMs >= freshMs ||
    !Number.isSafeInteger(demandTtlMs) || demandTtlMs < freshMs || demandTtlMs > 7 * 24 * HOUR) throw new Error('REFRESH_INVALID_WINDOWS');
  const operation = () => {
    const report = { inserted: 0, updated: 0, coalesced: 0, rejected: 0, truncated: false, offers: [] };
    const ids = [...new Set(productIds)];
    if (!ids.length || stores?.length === 0 || offers?.length === 0) return report;
    const rows = db.prepare(`SELECT pp.* FROM product_prices pp JOIN products p ON p.id=pp.product_id
      WHERE pp.product_id IN (${ids.map(() => '?').join(',')}) ${stores ? 'AND pp.store_id IN('+stores.map(()=>'?').join(',')+')' : ''}
      ${offers ? 'AND pp.id IN('+offers.map(()=>'?').join(',')+')' : ''}
      ORDER BY pp.product_id,pp.id LIMIT 101`).all(...ids,...(stores??[]),...(offers??[]));
    report.truncated = rows.length > 100;
    for (const row of rows.slice(0, 100)) {
      const offer = offerFromRow(row);
      if (!offer) { report.rejected++; continue; }
      const existing = db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(row.id);
      const observed = offer.observedAt ? Date.parse(offer.observedAt) : null;
      const due = observed === null || observed > now + 60000 ? now : Math.max(now, observed + freshMs - refreshAheadMs);
      if (existing && existing.requested_at > now) throw new Error('REFRESH_CLOCK_REGRESSION');
      if (existing && existing.product_id === offer.productId && existing.store_id === offer.storeId && existing.url === offer.url &&
          now - existing.requested_at < 60000 && existing.expires_at > now &&
          (existing.status !== 'pending' || due >= existing.due_at)) { report.coalesced++; continue; }
      if (existing?.status === 'leased' && existing.lease_until > now &&
        (existing.product_id !== offer.productId || existing.store_id !== offer.storeId || existing.url !== offer.url)) { report.rejected++; continue; }
      const liveLease = existing?.status === 'leased' && existing.lease_until > now;
      const backedOff = existing?.status === 'backoff' && existing.due_at > now;
      // Ni una búsqueda repetida ni una prioridad nueva saltean un 429/lease activo.
      db.prepare(`INSERT INTO pilot_refresh_demand(offer_id,product_id,store_id,url,observed_before,requested_at,expires_at,due_at,priority,status)
        VALUES(?,?,?,?,?,?,?,?,100,'pending') ON CONFLICT(offer_id) DO UPDATE SET
        product_id=excluded.product_id,store_id=excluded.store_id,url=excluded.url,
        observed_before=CASE WHEN ? THEN pilot_refresh_demand.observed_before ELSE excluded.observed_before END,
        requested_at=excluded.requested_at,expires_at=excluded.expires_at,priority=100,
        due_at=CASE WHEN ? THEN pilot_refresh_demand.due_at
          WHEN pilot_refresh_demand.status='pending' AND pilot_refresh_demand.expires_at>? THEN MIN(pilot_refresh_demand.due_at,excluded.due_at)
          ELSE excluded.due_at END,
        status=CASE WHEN ? THEN pilot_refresh_demand.status ELSE 'pending' END,
        lease_token=CASE WHEN ? THEN pilot_refresh_demand.lease_token ELSE NULL END,
        leased_at=CASE WHEN ? THEN pilot_refresh_demand.leased_at ELSE NULL END,
        lease_until=CASE WHEN ? THEN pilot_refresh_demand.lease_until ELSE NULL END`).run(
        offer.offerId,offer.productId,offer.storeId,offer.url,offer.observedAt,now,now+demandTtlMs,due,
        Number(Boolean(liveLease)),Number(Boolean(liveLease||backedOff)),now,Number(Boolean(liveLease||backedOff)),Number(Boolean(liveLease)),Number(Boolean(liveLease)),Number(Boolean(liveLease)));
      existing ? report.updated++ : report.inserted++; report.offers.push(offer.offerId);
    }
    return report;
  };
  if (withinTransaction) {
    if (!db.isTransaction) throw new Error('REFRESH_TRANSACTION_REQUIRED');
    return operation();
  }
  return transaction(db, operation);
}

export function claimRefreshBatch(db, { now = Date.now(), limit = 10, leaseMs = 5 * 60000, storeIds, productIds } = {}) {
  clock(now);
  const stores = allowedStores(storeIds);
  const products = allowedProducts(productIds);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 10 * 60000) throw new Error('REFRESH_INVALID_BATCH');
  return transaction(db, () => {
    if (stores?.length === 0 || products?.length === 0) return [];
    const rows = db.prepare(`SELECT * FROM pilot_refresh_demand WHERE expires_at>? AND due_at<=?
      AND (status IN ('pending','backoff') OR (status='leased' AND lease_until<=?))
      ${stores ? 'AND store_id IN('+stores.map(()=>'?').join(',')+')' : ''}
      ${products ? 'AND product_id IN('+products.map(()=>'?').join(',')+')' : ''}
      ORDER BY priority DESC,due_at,requested_at,offer_id LIMIT ?`).all(now,now,now,...(stores??[]),...(products??[]),limit);
    const leases = [];
    for (const queued of rows) {
      const offer = offerFromRow(db.prepare('SELECT * FROM product_prices WHERE id=?').get(queued.offer_id));
      if (!offer || offer.productId !== queued.product_id || offer.storeId !== queued.store_id || offer.url !== queued.url) {
        db.prepare("UPDATE pilot_refresh_demand SET status='expired',lease_token=NULL,lease_until=NULL,last_error='destination-changed' WHERE offer_id=?").run(queued.offer_id);
        continue;
      }
      const leaseToken = randomUUID();
      db.prepare("UPDATE pilot_refresh_demand SET status='leased',lease_token=?,leased_at=?,lease_until=?,attempts=attempts+1,observed_before=? WHERE offer_id=?")
        .run(leaseToken,now,now+leaseMs,offer.observedAt,offer.offerId);
      leases.push({ ...offer, leaseToken, leasedAt: now, leaseUntil: now + leaseMs, attempt: queued.attempts + 1 });
    }
    return leases;
  });
}

/** Un ACK exitoso acredita una observación ya persistida por otro writer; no la crea. */
export function acknowledgeRefresh(db, { offerId, leaseToken, now = Date.now(), outcome, receipt, retryAfterMs = 0, withinTransaction = false } = {}) {
  clock(now);
  if (outcome !== 'observed' && !failures.has(outcome)) throw new Error('REFRESH_INVALID_OUTCOME');
  if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 || retryAfterMs > 24 * HOUR) throw new Error('REFRESH_INVALID_RETRY_AFTER');
  const operation = () => {
    const row = db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(offerId);
    if (!row || row.status !== 'leased' || row.lease_token !== leaseToken || row.lease_until <= now || row.leased_at > now) throw new Error('REFRESH_LEASE_CONFLICT');
    if (outcome === 'observed') {
      const offer = offerFromRow(db.prepare('SELECT * FROM product_prices WHERE id=?').get(offerId));
      const observed = Date.parse(receipt?.observedAt);
      if (!offer || !receipt || receipt.offerId !== offerId || receipt.url !== row.url || offer.url !== row.url ||
        offer.productId !== row.product_id || offer.storeId !== row.store_id || !['structured-source','public-page'].includes(receipt.source) ||
        receipt.persisted !== true || receipt.identityVerified !== true || receipt.priceVerified !== true || receipt.stockVerified !== true ||
        !Number.isFinite(observed) || observed < row.leased_at || observed > now || offer.observedAt !== new Date(observed).toISOString() ||
        (row.observed_before && observed <= Date.parse(row.observed_before))) throw new Error('REFRESH_OBSERVATION_NOT_PERSISTED');
      db.prepare("UPDATE pilot_refresh_demand SET status='observed',last_observed_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL,attempts=0 WHERE offer_id=?")
        .run(offer.observedAt,offerId);
      return { status: 'observed', observedAt: offer.observedAt,
        comparable: receipt.comparableVerified === true && Number.isFinite(offer.price) && offer.price > 0 && ['in-stock','low-stock'].includes(offer.stock) };
    }
    const backoff = Math.max(retryAfterMs, Math.min(6 * HOUR, 30000 * 2 ** Math.min(row.attempts - 1, 12)));
    db.prepare("UPDATE pilot_refresh_demand SET status='backoff',due_at=?,last_error=?,lease_token=NULL,lease_until=NULL WHERE offer_id=?")
      .run(now + backoff,outcome,offerId);
    return { status: 'backoff', dueAt: now + backoff, observedAt: row.observed_before };
  };
  if (withinTransaction) {
    if (!db.isTransaction) throw new Error('REFRESH_TRANSACTION_REQUIRED');
    return operation();
  }
  return transaction(db, operation);
}

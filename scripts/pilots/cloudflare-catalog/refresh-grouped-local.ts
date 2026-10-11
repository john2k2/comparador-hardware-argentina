// Una publicación puede tener varias ofertas guardadas: reclamar todas antes de leerla una vez.
import type { DatabaseSync } from 'node:sqlite';
import { SourceHttpError, sourceHttpMetrics, sourceBlockedUntil } from '@/lib/scrapers/source-http';
import { listingReference } from '@/lib/scrapers/listing-reference';
import type { Product, HardwareCategory } from '@/lib/types';
import { claimRefreshBatch, acknowledgeRefresh, shareRefreshPauses } from './refresh-demand.mjs';
import { canRefreshLocalTarget, createLocalOfferReader, persistLocalObservation, reviewLocalObservation, localStoreIds } from './refresh-local';

type Lease = Parameters<typeof persistLocalObservation>[1];
type Dependencies = Parameters<typeof persistLocalObservation>[3];
type Reader = ReturnType<typeof createLocalOfferReader>;
type Group = { leases: Lease[]; category: HardwareCategory; reference: string };
type Failed = { offerId: string; storeId: string; status: 'failed'; outcome: string; acknowledged: boolean; skipped: boolean };
type Observed = { offerId: string; storeId: string; status: 'observed'; price: number; stock: string; sourceTitle: string; receipt: ReturnType<typeof persistLocalObservation> };

export async function runGroupedLocalRefresh(db: DatabaseSync, options: Dependencies & {
  offerIds: string[]; reader?: Reader; clock?: () => number; failureRetryAfterMs?: number; pausePeers?: DatabaseSync[];
}) {
  const { offerIds, reader = createLocalOfferReader(), clock = Date.now, failureRetryAfterMs = 6 * 3600000 } = options;
  if (!Array.isArray(offerIds) || !offerIds.length || offerIds.length > 25 || new Set(offerIds).size !== offerIds.length
    || offerIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw new Error('GROUPED_LOCAL_SCOPE');
  if (!Number.isSafeInteger(failureRetryAfterMs) || failureRetryAfterMs < 0 || failureRetryAfterMs > 86400000) throw new Error('GROUPED_LOCAL_RETRY');
  const before = sourceHttpMetrics(), startedAt = clock(), deadline = startedAt + 3 * 60000;
  const sharePauses = () => {
    if (options.pausePeers?.length) shareRefreshPauses([db, ...options.pausePeers], { now: clock() });
  };
  // Catálogos locales distintos comparten salud de tienda, sin compartir sus ofertas.
  sharePauses();
  // Se conserva el backoff durable y FullH4rd diferido, incluso con IDs suministrados.
  const leases = claimRefreshBatch(db, { now: startedAt, limit: 25, offerIds,
    storeIds: localStoreIds.filter(id => id !== 'fullh4rd'), leaseMs: 5 * 60000 }) as Lease[];
  const results: Array<Failed | Observed> = [], groups = new Map<string, Group>();
  const failed = (lease: Lease, error: unknown, skipped = false) => {
    const outcome = error instanceof SourceHttpError ? error.reason === 'blocked' ? 'http-403'
      : error.reason === 'rate-limited' ? 'http-429' : 'http-error'
      : error instanceof Error && error.message === 'REFRESH_LOCAL_IDENTITY' ? 'identity-mismatch'
      : error instanceof Error && error.message === 'REFRESH_LOCAL_NO_OBSERVATION' ? 'no-observation' : 'persistence-error';
    let acknowledged = false;
    try {
      acknowledgeRefresh(db, { ...lease, now: clock(), outcome,
        retryAfterMs: Math.min(86400000, Math.max(failureRetryAfterMs, sourceBlockedUntil(lease.storeId) - clock(), 0)) });
      acknowledged = true;
    } catch { /* Un lease vencido conserva el bloqueo y se recupera por la cola. */ }
    results.push({ offerId: lease.offerId, storeId: lease.storeId, status: 'failed', outcome, acknowledged, skipped });
  };
  for (const lease of leases) {
    const row = db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId);
    const product = row ? JSON.parse(String(row.row_json)) : null;
    const reference = listingReference(lease.storeId, lease.url);
    if (!row || !reference || !canRefreshLocalTarget(lease.storeId, lease.url, String(row.category), product?.name ?? '')) {
      failed(lease, new Error('REFRESH_LOCAL_IDENTITY'), true); continue;
    }
    const key = JSON.stringify([lease.storeId, reference, row.category]);
    const group = groups.get(key) ?? { leases: [], category: String(row.category) as HardwareCategory, reference };
    group.leases.push(lease); groups.set(key, group);
  }
  for (const group of groups.values()) {
    sharePauses();
    const first = group.leases[0];
    const pause = db.prepare('SELECT until_at,reason FROM pilot_cycle_store_pause WHERE store_id=?').get(first.storeId);
    if (pause && Number(pause.until_at) > clock()) {
      for (const lease of group.leases) failed(lease, new SourceHttpError(pause.reason === 'http-429' ? 'rate-limited' : 'blocked'), true);
      continue;
    }
    if (clock() >= deadline) {
      for (const lease of group.leases) failed(lease, new Error('REFRESH_LOCAL_NO_OBSERVATION'), true);
      continue;
    }
    let source: Product | null;
    try {
      source = await reader(first.storeId, first.url, group.category,
        AbortSignal.timeout(Math.min(25000, Math.max(1, deadline - clock()))));
      if (!source) throw new Error('REFRESH_LOCAL_NO_OBSERVATION');
    } catch (error) { for (const lease of group.leases) failed(lease, error); sharePauses(); continue; }
    for (const lease of group.leases) {
      try {
        const row = db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId)!;
        const target = { ...JSON.parse(String(row.row_json)), category: String(row.category) as HardwareCategory };
        const price = reviewLocalObservation(target, lease, source, clock());
        const receipt = persistLocalObservation(db, lease, price, options, clock());
        results.push({ offerId: lease.offerId, storeId: lease.storeId, status: 'observed', price: price.price,
          stock: price.stock, sourceTitle: source.name, receipt });
      } catch (error) { failed(lease, error); }
    }
  }
  return { localOnly: true, attempted: leases.length, publications: groups.size,
    observed: results.filter(row => row.status === 'observed').length, results,
    sourceHttp: Object.fromEntries(Object.entries(sourceHttpMetrics()).map(([store, metric]) => [store, {
      requests: metric.requests - (before[store]?.requests ?? 0), bytes: metric.bytes - (before[store]?.bytes ?? 0),
    }])) };
}

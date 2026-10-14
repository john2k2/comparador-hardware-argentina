import { snapshotInterval, queryCacheProbe } from '../../../scripts/pilots/cloudflare-catalog/response-cache.mjs';
import type { CatalogSqlReader } from '../../../scripts/pilots/cloudflare-catalog/engine.mjs';
import { hasObservationClockCertificate, legacyObservationTimeSql, observationTimeSql } from '../../../scripts/pilots/cloudflare-catalog/observation-time.mjs';

/** Superset global indexado: también protege totales y filas fuera de la página. */
export async function catalogReadDeadline(db: CatalogSqlReader, snapshot: string, clock: number, includeHistorical = false): Promise<number> {
  const interval = queryCacheProbe(snapshot, clock) ? snapshotInterval(snapshot, clock) : null;
  if (interval && !includeHistorical) return interval.validUntil;
  const metadata = JSON.parse(snapshot);
  const observations = metadata?.clock_observations;
  if (!hasObservationClockCertificate(observations, metadata.counts?.product_prices)) throw new Error('CATALOG_CLOCK_OBSERVATIONS_NOT_READY');
  const stamp = (offset: number) => new Date(clock + offset).toISOString();
  // Cada rama busca el próximo evento desde el índice; no recorre el catálogo.
  // El certificado v1 sólo admitía fechas con equivalencia JS/SQLite exacta.
  // Conservar su expresión indexada permite leer copias anteriores sin mutarlas.
  const observed = observations.version === 2 ? observationTimeSql() : legacyObservationTimeSql();
  const row = await db.first(`SELECT MIN(time) AS next_transition FROM (
    SELECT strftime('%Y-%m-%dT%H:%M:%fZ',MIN(${observed}),'-60 seconds') AS time
      FROM product_prices INDEXED BY prices_observed_idx WHERE price>0 AND ${observed}>?
    UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%fZ',MIN(${observed}),'+4 hours','+0.001 seconds')
      FROM product_prices INDEXED BY prices_observed_idx WHERE price>0 AND ${observed}>?
    UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%fZ',MIN(${observed}),'+24 hours','+0.001 seconds')
      FROM product_prices INDEXED BY prices_observed_idx WHERE price>0 AND ${observed}>?
    UNION ALL SELECT MIN(comparable_valid_until) FROM summaries INDEXED BY summaries_valid_idx
      WHERE comparable_stats_json IS NOT NULL AND comparable_valid_until>?)`,
    [stamp(60000), stamp(-4 * 3600000 - 1), stamp(-24 * 3600000 - 1), stamp(0)]);
  if (row?.next_transition === null) return Infinity;
  const deadline = typeof row?.next_transition === 'string' ? Date.parse(row.next_transition) : NaN;
  if (!Number.isFinite(deadline) || deadline <= clock) throw new Error('CATALOG_CLOCK_DEADLINE_INVALID');
  return deadline;
}
export function checkCatalogReadClock(now: number, clock: number, deadline: number) {
  if (!Number.isFinite(now) || now < clock || now >= deadline) throw new Error('CATALOG_CLOCK_INTERVAL_EXPIRED');
}

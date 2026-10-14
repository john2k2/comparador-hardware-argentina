// Controlplane: no certificado de reloj sin equivalencia entre JS y SQLite.
import type { DatabaseSync } from 'node:sqlite';
import { observationTimeSql } from './observation-time.mjs';
export const observationClockIndexSql = `CREATE INDEX prices_observed_idx ON product_prices(${observationTimeSql()}) WHERE price>0`;
export function installObservationClockIndex(db: DatabaseSync) {
  if (db.isTransaction) throw new Error('OBSERVATION_CLOCK_TRANSACTION_ACTIVE');
  db.exec('BEGIN IMMEDIATE');
  try {
    let offers = 0;
    for (const row of db.prepare(`SELECT json_type(row_json,'$.last_updated') AS raw_type,json_extract(row_json,'$.last_updated') AS raw,${observationTimeSql()} normalized FROM product_prices`).all()) {
      if (row.raw_type !== null && row.raw_type !== 'null' && row.raw_type !== 'text') throw new Error('OBSERVATION_CLOCK_DATE_TYPE');
      const raw = row.raw;
      if (raw !== null && raw !== undefined && typeof raw !== 'string') throw new Error('OBSERVATION_CLOCK_DATE_TYPE');
      const timestamp = typeof raw === 'string' ? Date.parse(raw) : NaN;
      const expected = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
      if (row.normalized !== expected) throw new Error('OBSERVATION_CLOCK_DATE_MISMATCH');
      offers++;
    }
    // IF NOT EXISTS conservaría el DDL v1 y su redondeo. Cambiar el índice sólo
    // dentro de esta transacción y sólo si difiere; un rechazo revierte todo.
    const index = db.prepare("SELECT sql FROM sqlite_schema WHERE name='prices_observed_idx'").get();
    if (index?.sql !== observationClockIndexSql) {
      db.exec('DROP INDEX IF EXISTS prices_observed_idx');
      db.exec(observationClockIndexSql);
    }
    const marker = db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get();
    const snapshot = JSON.parse(String(marker?.value));
    if (snapshot?.counts?.product_prices !== offers) throw new Error('OBSERVATION_CLOCK_COUNTS');
    const certificate = { version: 2, validated: true, timestampPolicy: 'js-sql-ms-v2', offers };
    db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot' AND value=?")
      .run(JSON.stringify({ ...snapshot, clock_observations: certificate }), String(marker!.value));
    db.exec('COMMIT');
    return certificate;
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}

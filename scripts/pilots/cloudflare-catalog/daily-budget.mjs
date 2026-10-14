// Presupuesto estimado local compartido por delta y mantenimiento del reloj.
// No representa facturación Cloudflare ni la cuota compartida de una cuenta.
export const DAILY_WRITE_LIMIT = 80000;
export const DAILY_BUDGET_SCHEMA = `CREATE TABLE IF NOT EXISTS pilot_daily_write_budget(
 day TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK(used>=0),
 ceiling INTEGER NOT NULL CHECK(ceiling>0 AND ceiling<=80000 AND used<=ceiling)
);`;
const ledgerSql = `INSERT INTO pilot_daily_write_budget(day,used,ceiling) VALUES(?,?,?)
 ON CONFLICT(day) DO UPDATE SET used=excluded.used,ceiling=excluded.ceiling`;
export function chargeDailyBudget(db, { now, estimatedRowsWritten, limit = DAILY_WRITE_LIMIT }) {
  if (!db.isTransaction) throw new Error('DAILY_BUDGET_TRANSACTION_REQUIRED');
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).valueOf())) throw new Error('DAILY_BUDGET_INVALID_CLOCK');
  if (!Number.isSafeInteger(estimatedRowsWritten) || estimatedRowsWritten < 0) throw new Error('DAILY_BUDGET_INVALID_ESTIMATE');
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > DAILY_WRITE_LIMIT) throw new Error('DAILY_BUDGET_INVALID_LIMIT');
  const day = new Date(now).toISOString().slice(0, 10);
  const exists = Boolean(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='pilot_daily_write_budget'").get());
  const latest = exists ? db.prepare('SELECT MAX(day) day FROM pilot_daily_write_budget').get().day : null;
  if (latest && day < latest) throw new Error('DAILY_BUDGET_CLOCK_REGRESSION');
  const previous = exists ? db.prepare('SELECT used,ceiling FROM pilot_daily_write_budget WHERE day=?').get(day) : null;
  if (previous && limit > previous.ceiling) throw new Error('DAILY_BUDGET_LIMIT_INCREASE');
  const usedBefore = previous?.used ?? 0;
  if (usedBefore > limit) throw new Error('DAILY_BUDGET_LIMIT_BELOW_USAGE');
  if (estimatedRowsWritten === 0) return { day, used: usedBefore, charge: 0, limit: previous?.ceiling ?? limit, statement: null, schemaStatement: null, schemaSql: null, ledgerBaseRowsWritten: 0, remoteVerified: false };
  // 1 fila ledger + 2 filas de mantenimiento PK conservador + 1 reserva del
  // marcador del futuro import local. La reserva no modifica ese marcador.
  const overhead = 4, charge = estimatedRowsWritten + overhead, used = usedBefore + charge;
  if (!Number.isSafeInteger(used) || used > limit) throw new Error('DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED:' + used + '/' + limit);
  const schemaStatement = exists ? null : { sql: DAILY_BUDGET_SCHEMA, bindings: [], values: [] };
  if (!exists) db.exec(DAILY_BUDGET_SCHEMA);
  const values = [day, used, limit]; db.prepare(ledgerSql).run(...values);
  return { day, used, usedBefore, charge, overhead, limit, ledgerBaseRowsWritten: 1, schemaStatement, schemaSql: DAILY_BUDGET_SCHEMA,
    statement: { table: 'pilot_daily_write_budget', kind: 'insert', sql: ledgerSql, values, bindings: values, expectedRows: 1 },
    remoteVerified: false, note: 'Estimación SQLite local. Incluye reserva; no garantiza consumo ni cuota remota.' };
}

// Presupuesto estimado local compartido por delta y mantenimiento del reloj.
// No representa facturación Cloudflare ni la cuota compartida de una cuenta.
export const DAILY_WRITE_LIMIT = 80000;
export const MAC_DAILY_WRITE_LIMIT = 1000000;
export const DAILY_BUDGET_SCHEMA = `CREATE TABLE IF NOT EXISTS pilot_daily_write_budget(
 day TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK(used>=0),
 ceiling INTEGER NOT NULL CHECK(ceiling>0 AND ceiling<=80000 AND used<=ceiling)
);`;
const ledgerSql = `INSERT INTO pilot_daily_write_budget(day,used,ceiling) VALUES(?,?,?)
 ON CONFLICT(day) DO UPDATE SET used=excluded.used,ceiling=excluded.ceiling`;
export function chargeDailyBudget(db, { now, estimatedRowsWritten, limit = DAILY_WRITE_LIMIT }) {
  return chargeBudget(db, { now, estimatedRowsWritten, limit }, {
    table: 'pilot_daily_write_budget', schema: DAILY_BUDGET_SCHEMA, ledgerSql, maximum: DAILY_WRITE_LIMIT,
  });
}
export const MAC_DAILY_BUDGET_SCHEMA = `CREATE TABLE mac_daily_write_budget(
 day TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK(used>=0),
 ceiling INTEGER NOT NULL CHECK(ceiling>0 AND ceiling<=1000000 AND used<=ceiling)
);`;
/** Sólo una política explícita migrada en staging habilita este ledger. D1 no cambia. */
export function chargeMacDailyBudget(db, { now, estimatedRowsWritten }) {
  let policy;
  try { policy = JSON.parse(db.prepare("SELECT value FROM pilot_meta WHERE key='mac_budget_local'").get()?.value); }
  catch { throw new Error('MAC_DAILY_BUDGET_POLICY_REQUIRED'); }
  if (policy?.version !== 2 || policy.kind !== 'mac-local-estimate' || policy.ledger !== 'mac_daily_write_budget'
    || policy.scope !== 'offer-observation-persistence' || !Number.isSafeInteger(policy.ceiling)
    || policy.ceiling <= DAILY_WRITE_LIMIT || policy.ceiling > MAC_DAILY_WRITE_LIMIT
    || !/^[a-f0-9]{64}$/.test(policy.migrationSourceSha256 ?? '')
    || !db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='mac_daily_write_budget'").get())
    throw new Error('MAC_DAILY_BUDGET_POLICY_REQUIRED');
  return chargeBudget(db, { now, estimatedRowsWritten, limit: policy.ceiling }, {
    table: 'mac_daily_write_budget', schema: MAC_DAILY_BUDGET_SCHEMA, maximum: MAC_DAILY_WRITE_LIMIT,
    ledgerSql: `INSERT INTO mac_daily_write_budget(day,used,ceiling) VALUES(?,?,?)
      ON CONFLICT(day) DO UPDATE SET used=excluded.used,ceiling=excluded.ceiling`,
  });
}
function chargeBudget(db, { now, estimatedRowsWritten, limit }, { table, schema, ledgerSql, maximum }) {
  if (!db.isTransaction) throw new Error('DAILY_BUDGET_TRANSACTION_REQUIRED');
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).valueOf())) throw new Error('DAILY_BUDGET_INVALID_CLOCK');
  if (!Number.isSafeInteger(estimatedRowsWritten) || estimatedRowsWritten < 0) throw new Error('DAILY_BUDGET_INVALID_ESTIMATE');
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) throw new Error('DAILY_BUDGET_INVALID_LIMIT');
  const day = new Date(now).toISOString().slice(0, 10);
  const exists = Boolean(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table));
  const latest = exists ? db.prepare(`SELECT MAX(day) day FROM ${table}`).get().day : null;
  if (latest && day < latest) throw new Error('DAILY_BUDGET_CLOCK_REGRESSION');
  const previous = exists ? db.prepare(`SELECT used,ceiling FROM ${table} WHERE day=?`).get(day) : null;
  if (previous && limit > previous.ceiling) throw new Error('DAILY_BUDGET_LIMIT_INCREASE');
  const usedBefore = previous?.used ?? 0;
  if (usedBefore > limit) throw new Error('DAILY_BUDGET_LIMIT_BELOW_USAGE');
  if (estimatedRowsWritten === 0) return { day, used: usedBefore, charge: 0, limit: previous?.ceiling ?? limit, statement: null, schemaStatement: null, schemaSql: null, ledgerBaseRowsWritten: 0, remoteVerified: false };
  // 1 fila ledger + 2 filas de mantenimiento PK conservador + 1 reserva del
  // marcador del futuro import local. La reserva no modifica ese marcador.
  const overhead = 4, charge = estimatedRowsWritten + overhead, used = usedBefore + charge;
  if (!Number.isSafeInteger(used) || used > limit) throw new Error('DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED:' + used + '/' + limit);
  const schemaStatement = exists ? null : { sql: schema, bindings: [], values: [] };
  if (!exists) db.exec(schema);
  const values = [day, used, limit]; db.prepare(ledgerSql).run(...values);
  return { day, used, usedBefore, charge, overhead, limit, ledgerBaseRowsWritten: 1, schemaStatement, schemaSql: schema,
    statement: { table, kind: 'insert', sql: ledgerSql, values, bindings: values, expectedRows: 1 },
    remoteVerified: false, note: 'Estimación SQLite local. Incluye reserva; no garantiza consumo ni cuota remota.' };
}

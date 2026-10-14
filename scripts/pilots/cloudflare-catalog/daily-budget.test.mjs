import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { chargeDailyBudget } from './daily-budget.mjs';
const now = Date.parse('2026-10-11T23:59:59.999Z');
function fixture(t) { const db = new DatabaseSync(':memory:'); t.after(() => db.close()); return db; }
function apply(db, options, { fail = false } = {}) {
  db.exec('BEGIN');
  try { const result = chargeDailyBudget(db, options); if (fail) throw new Error('CALLER_FAILURE'); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
test('delta y reloj comparten acumulado; overhead incluye ledger y reserva de marcador', t => {
  const db = fixture(t), a = apply(db, { now, estimatedRowsWritten: 30000 }), b = apply(db, { now, estimatedRowsWritten: 40000 });
  assert.equal(a.charge, 30004); assert.equal(b.usedBefore, 30004); assert.equal(b.used, 70008);
  assert.throws(() => apply(db, { now, estimatedRowsWritten: 10000 }), /DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED/);
  assert.equal(db.prepare('SELECT used FROM pilot_daily_write_budget').get().used, 70008);
});
test('reinicio diario sucede exactamente a medianoche UTC; un reloj hacia atrás se rechaza', t => {
  const db = fixture(t), a = apply(db, { now, estimatedRowsWritten: 79996 }), b = apply(db, { now: now + 1, estimatedRowsWritten: 1 });
  assert.equal(a.day, '2026-10-11'); assert.equal(a.used, 80000); assert.equal(b.day, '2026-10-12'); assert.equal(b.used, 5);
  assert.throws(() => apply(db, { now, estimatedRowsWritten: 1 }), /DAILY_BUDGET_CLOCK_REGRESSION/);
});
test('caller controla transacción y rollback elimina incluso creación inicial de ledger', t => {
  const db = fixture(t);
  assert.throws(() => chargeDailyBudget(db, { now, estimatedRowsWritten: 1 }), /TRANSACTION_REQUIRED/);
  assert.throws(() => apply(db, { now, estimatedRowsWritten: 10 }, { fail: true }), /CALLER_FAILURE/);
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_daily_write_budget'").get(), undefined);
  apply(db, { now, estimatedRowsWritten: 10 });
  assert.throws(() => apply(db, { now, estimatedRowsWritten: 20 }, { fail: true }), /CALLER_FAILURE/);
  assert.equal(db.prepare('SELECT used FROM pilot_daily_write_budget').get().used, 14);
});
test('noop no crea ledger ni escribe en un ledger existente', t => {
  const db = fixture(t), a = apply(db, { now, estimatedRowsWritten: 0 });
  assert.equal(a.charge, 0); assert.equal(a.statement, null); assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_daily_write_budget'").get(), undefined);
  apply(db, { now, estimatedRowsWritten: 10 });
  const previous = db.prepare('SELECT total_changes() n').get().n, b = apply(db, { now, estimatedRowsWritten: 0 });
  assert.equal(b.charge, 0); assert.equal(b.used, 14); assert.equal(db.prepare('SELECT total_changes() n').get().n, previous);
});
test('límite registrado no aumenta; bootstrap y estimaciones/relojes inválidos se rechazan', t => {
  const db = fixture(t); apply(db, { now, estimatedRowsWritten: 1, limit: 100 });
  assert.throws(() => apply(db, { now, estimatedRowsWritten: 1, limit: 80000 }), /LIMIT_INCREASE/);
  for (const options of [{ now: NaN, estimatedRowsWritten: 1 }, { now: 1e30, estimatedRowsWritten: 1 }, { now, estimatedRowsWritten: -1 }, { now, estimatedRowsWritten: 0.5 }, { now, estimatedRowsWritten: 1, limit: 100001 }]) assert.throws(() => apply(db, options), /INVALID_/);
  const other = fixture(t); assert.throws(() => apply(other, { now, estimatedRowsWritten: 80000 }), /DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED/);
});

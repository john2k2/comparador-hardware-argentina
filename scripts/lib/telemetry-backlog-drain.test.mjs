import assert from 'node:assert/strict';
import test from 'node:test';
import { processTelemetryBacklog, validatePlan, TELEMETRY_BACKLOG_LIMITS } from './telemetry-backlog-drain.mjs';
import { buildTelemetryMaintenanceArchive } from './telemetry-maintenance.mjs';

const plan = { projectId: 'zyiyziubpcpgoqlkcrie', cutoff: '2026-10-08T19:00:00.000000Z', now: '2026-10-08T20:00:00.000000Z',
  approvalId: 'fixture-local-only', codeVersion: 'e'.repeat(40), maxSelectedRows: 3000, maxStoredBytes: 1024 ** 2,
  deadlineMs: 600000, maxWindows: 3 };
const event = { cache_key: 'fixture:0', scope: 'operational-endpoint-event', payload_text: '{"large":9007199254740993}',
  expires_at: '2026-10-01T00:00:00.000001Z', created_at: '2026-09-28T00:00:00.000001Z', updated_at: '2026-09-29T00:00:00.000001Z' };
const events = count => Array.from({ length: count }, (_, index) => ({ ...event, cache_key: `fixture:${index}` }));
const metadata = ({ cache_key, scope, expires_at, updated_at }) => ({ cache_key, scope, expires_at, updated_at });
function harness(count = 1001, { failureStage = null, lostAck = false, changed = false, repeated = false, preflight = true } = {}) {
  const state = new Map(events(count).map(row => [row.cache_key, row]));
  const calls = [], checkpoints = [], reservations = [];
  let time = 0, selectionCalls = 0;
  const callbacks = {
    preflightWindow: async (config, totals) => {
      calls.push('preflight'); reservations.push(totals.reservation);
      assert.ok(Object.isFrozen(config)); return preflight;
    },
    writeCheckpoint: async record => {
      calls.push(record.stage);
      if (record.stage === failureStage) throw new Error('private filesystem error');
      checkpoints.push(structuredClone(record));
    },
    selectSnapshot: async (cutoff, limit) => {
      calls.push('select'); selectionCalls++;
      assert.equal(cutoff, plan.cutoff); assert.ok(limit <= 250);
      if (repeated && selectionCalls === 5) return [{ ...event }];
      return [...state.values()].slice(0, limit).map(row => ({ ...row }));
    },
    storeArchive: async archive => {
      calls.push('archive');
      return { manifest: structuredClone(archive.backup.manifest), gzipBytes: Buffer.from(archive.backup.gzipBytes),
        selectionBytes: Buffer.from(archive.selectionBytes) };
    },
    retireSnapshot: async (cutoff, snapshot) => {
      calls.push('retire');
      assert.equal(checkpoints.at(-1).stage, 'pending-mutation');
      assert.deepEqual(checkpoints.at(-1).snapshot, snapshot);
      assert.equal(snapshot[0].payload_text, event.payload_text);
      const removed = snapshot.filter((row, index) => state.has(row.cache_key) && !(changed && index === 0));
      removed.forEach(row => state.delete(row.cache_key));
      if (lostAck) throw new Error('private response error');
      return { selected: snapshot.length, removed: removed.length, changed_or_missing: snapshot.length - removed.length,
        removed_keys: removed.map(row => row.cache_key) };
    },
    reconcileMetadata: async keys => { calls.push('reconcile'); return keys.filter(key => state.has(key)).map(key => metadata(state.get(key))); },
  };
  return { callbacks, calls, checkpoints, reservations, state, clock: () => time, setTime: value => { time = value; } };
}

test('plan exacto congela corte/revisión y rechaza límites ampliados antes de callbacks', async () => {
  const validated = validatePlan(plan);
  assert.ok(Object.isFrozen(validated)); assert.deepEqual(validated, plan);
  for (const [field, max] of Object.entries(TELEMETRY_BACKLOG_LIMITS)) {
    assert.throws(() => validatePlan({ ...plan, [field]: max + 1 }), /LIMIT/);
    assert.throws(() => validatePlan({ ...plan, [field]: 0 }), /LIMIT/);
  }
  for (const invalid of [{ ...plan, extra: true }, { ...plan, codeVersion: 'short' }, { ...plan, approvalId: '' },
    { ...plan, projectId: 'other' }, { ...plan, cutoff: plan.now }]) assert.throws(() => validatePlan(invalid));
  const h = harness();
  await assert.rejects(processTelemetryBacklog(h.callbacks, { ...plan, maxWindows: 344 }), /LIMIT/);
  assert.equal(h.calls.length, 0);
});

test('ventanas conservan4×250 y producen sólo cierre pendiente de conteo independiente', async () => {
  const h = harness();
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.success, true); assert.equal(result.awaitingIndependentFinalCheck, true);
  assert.equal(result.selected, 1001); assert.equal(result.removed, 1001); assert.equal(result.archived, 1001);
  assert.equal(result.windows.length, 2); assert.equal(result.windows[0].batches.length, 4);
  assert.equal(result.globallyComplete, false); assert.equal(result.physicalSavingProven, false);
  assert.equal(h.state.size, 0);
  assert.deepEqual(h.reservations.map(value => value.maxSelectedRows), [1000, 1000]);
  assert.ok(h.reservations.every(value => value.maxStoredBytes <= 5 * 1024 ** 2 && value.deadlineMs <= 120000));
  assert.ok(h.checkpoints.every((record, index) => record.sequence === index + 1));
  assert.doesNotMatch(JSON.stringify(result), /fixture:|payload_text|removed_keys|fixture-local-only/);
});

test('IO en cada barrera previa impide la capacidad correspondiente, incluido retiro', async () => {
  for (const [stage, forbidden] of [['before-select', 'select'], ['before-archive', 'archive'], ['pending-mutation', 'retire']]) {
    const h = harness(250, { failureStage: stage });
    const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
    assert.equal(result.success, false); assert.equal(result.checkpointFailed, true);
    assert.equal(result.reason, 'TELEMETRY_BACKLOG_CHECKPOINT_FAILED');
    assert.equal(result.retireAttemptedRows, 0);
    assert.equal(h.calls.includes(forbidden), false); assert.equal(h.calls.filter(call => call === 'preflight').length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private filesystem/);
  }
});

test('fallo durable después de ACK conserva pending previo y detiene sin siguiente selección', async () => {
  const h = harness(1001, { failureStage: 'ack-observed' });
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.success, false); assert.equal(result.unknown, 250); assert.equal(result.removed, 0);
  assert.equal(h.calls.filter(call => call === 'retire').length, 1);
  assert.equal(h.calls.filter(call => call === 'select').length, 1);
  assert.ok(h.checkpoints.some(record => record.stage === 'pending-mutation' && record.snapshot.length === 250));
});

test('ACK perdido no se reintenta y ausencia posterior no se atribuye a retiro propio', async () => {
  const h = harness(1001, { lostAck: true });
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.success, false); assert.equal(result.unknown, 250); assert.equal(result.absentAfterUnknown, 250);
  assert.equal(result.removed, 0); assert.equal(h.calls.filter(call => call === 'retire').length, 1);
  assert.equal(result.retireAttemptedRows, 250);
  assert.equal(h.calls.filter(call => call === 'select').length, 1);
  assert.equal(result.reason, 'TELEMETRY_MAINTENANCE_MUTATION_UNKNOWN');
});

test('cambio o ausencia cuenta selección completa y detiene después de conciliar primer lote', async () => {
  const h = harness(1001, { changed: true });
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.selected, 250); assert.equal(result.removed, 249); assert.equal(result.changedOrMissing, 1);
  assert.equal(result.reason, 'TELEMETRY_BACKLOG_CHANGED_OR_MISSING');
  assert.equal(h.calls.filter(call => call === 'retire').length, 1);
  assert.equal(h.calls.filter(call => call === 'select').length, 1);
  assert.ok(h.calls.includes('reconcile'));
});

test('repetición entre ventanas se rechaza antes de otra custodia/retiro y conserva hashes en journal', async () => {
  const h = harness(1001, { repeated: true });
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.reason, 'TELEMETRY_BACKLOG_REPEATED_SELECTION');
  assert.equal(result.selected, 1001); assert.equal(result.removed, 1000);
  assert.equal(h.calls.filter(call => call === 'archive').length, 4);
  assert.equal(h.calls.filter(call => call === 'retire').length, 4);
  const hashes = h.checkpoints.filter(record => record.stage === 'selected').flatMap(record => record.seenKeyHashes);
  assert.equal(hashes.length, 1000); assert.equal(new Set(hashes).size, 1000);
});

test('presupuesto acumulado de bytes conserva reserva completa al fallar segunda ventana', async () => {
  const rows = events(1001);
  let used = 0;
  for (let index = 0; index < 1000; index += 250) used += buildTelemetryMaintenanceArchive(rows.slice(index, index + 250), { ...plan, batchSize: 250 }).storedBytes;
  const h = harness();
  const result = await processTelemetryBacklog(h.callbacks, { ...plan, maxStoredBytes: used + 1 }, h.clock);
  assert.equal(result.success, false); assert.equal(result.selected, 1001); assert.equal(result.removed, 1000);
  assert.equal(result.storedBytes, used); assert.equal(result.windows.length, 2);
  assert.equal(h.calls.filter(call => call === 'archive').length, 4);
  assert.equal(h.reservations[1].maxStoredBytes, 1);
});

test('reserva bytes antes de upload y no devuelve presupuesto tras falla parcial', async () => {
  const h = harness(250);
  h.callbacks.storeArchive = async () => { h.calls.push('archive'); throw new Error('partial remote upload'); };
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.success, false); assert.ok(result.storedBytes > 0); assert.equal(result.archived, 0);
  assert.equal(h.calls.includes('retire'), false); assert.equal(h.calls.filter(call => call === 'archive').length, 1);
  assert.doesNotMatch(JSON.stringify(result), /partial remote/);
});

test('presupuesto de filas ajusta última ventana sin superar250 ni reiniciar presupuesto', async () => {
  const h = harness(2000);
  const limits = [];
  const original = h.callbacks.selectSnapshot;
  h.callbacks.selectSnapshot = async (cutoff, limit) => { limits.push(limit); return original(cutoff, limit); };
  const result = await processTelemetryBacklog(h.callbacks, { ...plan, maxSelectedRows: 1001 }, h.clock);
  assert.deepEqual(limits, [250, 250, 250, 250, 1]);
  assert.equal(result.selected, 1001); assert.equal(result.removed, 1001);
  assert.equal(result.reason, 'TELEMETRY_BACKLOG_SELECTED_BUDGET');
  assert.equal(result.awaitingIndependentFinalCheck, false);
});

test('lote corto sólo habilita chequeo externo y límite de ventanas detiene sin expandirse', async () => {
  const short = harness(999);
  const result = await processTelemetryBacklog(short.callbacks, plan, short.clock);
  assert.equal(result.selected, 999); assert.equal(result.windows.length, 1);
  assert.equal(result.awaitingIndependentFinalCheck, true); assert.equal(result.globallyComplete, false);
  const bounded = harness(1100);
  const stopped = await processTelemetryBacklog(bounded.callbacks, { ...plan, maxWindows: 1 }, bounded.clock);
  assert.equal(stopped.reason, 'TELEMETRY_BACKLOG_WINDOW_BUDGET'); assert.equal(stopped.selected, 1000);
});

test('gate externo fallido y tiempo global agotado detienen antes de seleccionar/mutar', async () => {
  const denied = harness(1001, { preflight: false });
  const result = await processTelemetryBacklog(denied.callbacks, plan, denied.clock);
  assert.equal(result.reason, 'TELEMETRY_BACKLOG_PREFLIGHT'); assert.equal(denied.calls.includes('select'), false);
  const expired = harness(1001);
  const gate = expired.callbacks.preflightWindow;
  expired.callbacks.preflightWindow = async (...args) => { await gate(...args); expired.setTime(plan.deadlineMs - 30000); return true; };
  const stopped = await processTelemetryBacklog(expired.callbacks, plan, expired.clock);
  assert.equal(stopped.reason, 'TELEMETRY_BACKLOG_DEADLINE'); assert.equal(expired.calls.includes('select'), false);
});

test('checkpoint lento consume plazo de ventana y no alcanza retiro aunque quede tiempo global', async () => {
  const h = harness(250);
  const persist = h.callbacks.writeCheckpoint;
  h.callbacks.writeCheckpoint = async record => {
    await persist(record);
    if (record.stage === 'pending-mutation') h.setTime(90000);
  };
  const result = await processTelemetryBacklog(h.callbacks, plan, h.clock);
  assert.equal(result.success, false); assert.equal(result.reason, 'TELEMETRY_BACKLOG_WINDOW_DEADLINE');
  assert.equal(result.retireAttemptedRows, 0); assert.equal(h.calls.includes('retire'), false);
  assert.ok(h.checkpoints.some(record => record.stage === 'pending-mutation'));
});

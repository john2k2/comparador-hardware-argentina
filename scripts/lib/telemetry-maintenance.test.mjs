import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { telemetryObjectPlan } from './telemetry-backup-storage.mjs';
import { processTelemetryMaintenance, buildTelemetryMaintenanceArchive, validateTelemetryMaintenanceOptions } from './telemetry-maintenance.mjs';

const options = { projectId: 'fixture-project', cutoff: '2026-10-07T20:00:00.000000Z', now: '2026-10-07T20:10:00.000000Z' };
const apply = { ...options, mode: 'archive-retire', approvalId: 'local-fixture-only' };
const row = (id = 1, overrides = {}) => ({ cache_key: `fixture:${id}`, scope: 'operational-endpoint-event',
  payload_text: '{"large":9007199254740993,"decimal":0.1234567890123456789}',
  expires_at: '2026-10-01T00:00:00.000001Z', created_at: '2026-09-28T00:00:00.000001Z', updated_at: '2026-09-29T00:00:00.000001Z', ...overrides });
const metadata = ({ cache_key, scope, expires_at, updated_at }) => ({ cache_key, scope, expires_at, updated_at });
function fixture(initial = [row()], hooks = {}) {
  const state = new Map(initial.map(value => [value.cache_key, structuredClone(value)]));
  const calls = [];
  const callbacks = {
    async inspectMetadata(_cutoff, limit) { calls.push('inspect'); return [...state.values()].slice(0, limit).map(metadata); },
    async selectSnapshot(_cutoff, limit) { calls.push('select'); return structuredClone([...state.values()].slice(0, limit)); },
    async storeArchive(archive) {
      calls.push('store');
      hooks.store?.(archive);
      return { manifest: archive.backup.manifest, gzipBytes: archive.backup.gzipBytes, selectionBytes: archive.selectionBytes };
    },
    async retireSnapshot(_cutoff, snapshot) {
      calls.push('retire');
      hooks.beforeRetire?.(state, snapshot);
      const removed = snapshot.filter(value => JSON.stringify(state.get(value.cache_key)) === JSON.stringify(value));
      for (const value of removed) state.delete(value.cache_key);
      if (hooks.lost) throw new Error('secret payload transport detail');
      const ack = { selected: snapshot.length, removed: removed.length, changed_or_missing: snapshot.length - removed.length,
        removed_keys: removed.map(value => value.cache_key) };
      return hooks.ack ? hooks.ack(ack) : ack;
    },
    async reconcileMetadata(keys) {
      calls.push('reconcile');
      if (hooks.reconcileFail) throw new Error('private transport detail');
      return keys.filter(key => state.has(key)).map(key => metadata(state.get(key)));
    },
  };
  return { callbacks, calls, state };
}

test('inspect default lee sólo metadata y su resumen no expone filas', async () => {
  const f = fixture();
  const result = await processTelemetryMaintenance(f.callbacks, options);
  assert.deepEqual(f.calls, ['inspect']);
  assert.equal(result.success, true); assert.equal(result.selected, 1); assert.equal(result.removed, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture:|payload|rows|900719925/);
});

test('modos, aprobación, límites y corte inválidos se rechazan antes de callbacks', async () => {
  for (const override of [{ mode: 'apply' }, { mode: 'archive-retire' }, { batchSize: 251 }, { maxBatches: 5 },
    { maxStoredBytes: 5242881 }, { deadlineMs: 120001 }, { cutoff: '2026-10-07T20:06:00Z' },
    { cutoff: '2026-02-30T00:00:00Z' }, { cutoff: '0000-01-01T00:00:00Z' }, { extra: true }]) {
    const f = fixture();
    await assert.rejects(processTelemetryMaintenance(f.callbacks, { ...options, ...override }));
    assert.deepEqual(f.calls, []);
  }
});

test('retiro conserva payload textual y verifica selección privada hash antes RPC', async () => {
  let snapshot;
  const f = fixture([row()], { store(archive) {
    const selection = JSON.parse(archive.selectionBytes);
    assert.deepEqual(Object.keys(selection), ['projectId', 'cutoff', 'rows']);
    assert.deepEqual(selection.rows, [metadata(row())]);
    assert.equal(createHash('sha256').update(archive.selectionBytes).digest('hex'), archive.backup.manifest.selectionSha256);
    assert.match(archive.selectionKey, /^telemetry\/v1\/[a-f0-9]{64}\/selection\.json\.gz$/);
  }, beforeRetire(_state, values) { snapshot = values; } });
  const result = await processTelemetryMaintenance(f.callbacks, apply);
  assert.equal(snapshot[0].payload_text, row().payload_text); assert.deepEqual(snapshot[0], row());
  assert.deepEqual(f.calls, ['select', 'store', 'retire', 'reconcile']);
  assert.equal(result.success, true); assert.equal(result.removed, 1); assert.equal(result.archived, 1);
  assert.equal(result.batches[0].manifestSha256.length, 64);
  assert.doesNotMatch(JSON.stringify(result), /fixture:|payload_text|900719925|approval/);
});

test('corrupción de cualquiera de tres objetos detiene antes RPC', async () => {
  for (const store of [archive => { archive.selectionBytes[0] = 0; }, archive => { archive.backup.gzipBytes[0] = 0; },
    archive => { archive.backup.manifest.rawSha256 = '0'.repeat(64); }]) {
    const f = fixture([row()], { store });
    const result = await processTelemetryMaintenance(f.callbacks, apply);
    assert.equal(result.stopped, true); assert.equal(result.removed, 0); assert.equal(f.calls.includes('retire'), false);
  }
});

test('snapshot inválido completo, scope ajeno, activo o campos extras nunca llegan a Storage', async () => {
  for (const rows of [[row(), row()], [row(1, { scope: 'products' })], [row(1, { expires_at: options.cutoff })],
    [row(1, { payload_text: { large: 1 } })], [row(1, { other: true })], Array.from({ length: 251 }, (_, i) => row(i))]) {
    const f = fixture(rows); f.callbacks.selectSnapshot = async () => rows;
    const result = await processTelemetryMaintenance(f.callbacks, apply);
    assert.equal(result.stopped, true); assert.equal(f.calls.includes('store'), false);
  }
});

test('cambio sólo de payload o created_at entre snapshot y retiro se conserva', async () => {
  for (const field of ['payload_text', 'created_at']) {
    const f = fixture([row()], { beforeRetire(state) {
      state.get('fixture:1')[field] = field === 'payload_text' ? '{"changed":true}' : '2026-09-28T00:00:00.000002Z';
    } });
    const result = await processTelemetryMaintenance(f.callbacks, apply);
    assert.equal(result.success, true); assert.equal(result.removed, 0); assert.equal(result.changedOrMissing, 1);
    assert.equal(f.state.size, 1);
  }
});

test('fila ausente antes RPC queda changedOrMissing sin atribuir retiro propio ni unknown', async () => {
  const f = fixture([row()], { beforeRetire(state) { state.delete('fixture:1'); } });
  const result = await processTelemetryMaintenance(f.callbacks, apply);
  assert.equal(result.success, true); assert.equal(result.selected, 1); assert.equal(result.removed, 0);
  assert.equal(result.changedOrMissing, 1); assert.equal(result.unknown, 0);
  assert.deepEqual(f.calls, ['select', 'store', 'retire', 'reconcile']);
});

test('lote mixto confirma sólo clave ACK ausente y separa la ya faltante sin perder retiro válido', async () => {
  const f = fixture([row(1), row(2)], { beforeRetire(state) { state.delete('fixture:2'); } });
  const result = await processTelemetryMaintenance(f.callbacks, apply);
  assert.equal(result.success, true); assert.equal(result.selected, 2); assert.equal(result.removed, 1);
  assert.equal(result.changedOrMissing, 1); assert.equal(result.unknown, 0); assert.equal(f.state.size, 0);
  assert.equal(result.batches[0].removed, 1); assert.equal(result.batches[0].changedOrMissing, 1);
});

test('respuesta perdida después del commit mantiene unknown y no reintenta ni inicia otro lote', async () => {
  const f = fixture([row()], { lost: true });
  const result = await processTelemetryMaintenance(f.callbacks, { ...apply, batchSize: 1, maxBatches: 4 });
  assert.equal(result.success, false); assert.equal(result.unknown, 1); assert.equal(result.absentAfterUnknown, 1);
  assert.equal(result.removed, 0); assert.equal(f.calls.filter(value => value === 'retire').length, 1);
  assert.deepEqual(f.calls, ['select', 'store', 'retire', 'reconcile']);
  assert.doesNotMatch(JSON.stringify(result), /secret|private/);
});

test('ACK claves extra/duplicadas, conteos y esquema inválido detienen con GET solamente', async () => {
  for (const ack of [value => ({ ...value, removed_keys: ['foreign'] }), value => ({ ...value, selected: 2 }),
    value => ({ ...value, removed_keys: ['fixture:1', 'fixture:1'], removed: 2 }), value => ({ ...value, extra: true }),
    value => ({ ...value, removed: null }), () => null]) {
    const f = fixture([row()], { ack });
    const result = await processTelemetryMaintenance(f.callbacks, { ...apply, maxBatches: 4 });
    assert.equal(result.unknown, 1); assert.equal(result.removed, 0); assert.equal(result.stopped, true);
    assert.equal(f.calls.filter(value => value === 'retire').length, 1); assert.equal(f.calls.at(-1), 'reconcile');
  }
});

test('GET contradictorio o fallido no convierte un ACK en retiro verificado', async () => {
  const f = fixture([row()], { reconcileFail: true });
  const failed = await processTelemetryMaintenance(f.callbacks, apply);
  assert.equal(failed.unknown, 1); assert.equal(failed.removed, 0);
  const g = fixture([row()]);
  g.callbacks.reconcileMetadata = async () => [metadata(row())];
  const contradictory = await processTelemetryMaintenance(g.callbacks, apply);
  assert.equal(contradictory.unknown, 1); assert.equal(contradictory.success, false);
});

test('selección repetida por fila cambiada detiene sin segunda mutación', async () => {
  const f = fixture([row()], { beforeRetire(state) { state.get('fixture:1').payload_text = '{"changed":true}'; } });
  const result = await processTelemetryMaintenance(f.callbacks, { ...apply, batchSize: 1, maxBatches: 4 });
  assert.equal(result.reason, 'TELEMETRY_MAINTENANCE_REPEATED_SELECTION');
  assert.equal(f.calls.filter(value => value === 'retire').length, 1);
});

test('presupuesto de tres objetos se exige antes de subir y guarda de30s antes de mutar', async () => {
  const f = fixture();
  const bounded = await processTelemetryMaintenance(f.callbacks, { ...apply, maxStoredBytes: 1 });
  assert.equal(bounded.reason, 'TELEMETRY_MAINTENANCE_STORAGE_BUDGET'); assert.deepEqual(f.calls, ['select']);
  let time = 0;
  const g = fixture([row()], { store() { time = 91000; } });
  const timed = await processTelemetryMaintenance(g.callbacks, apply, () => time);
  assert.equal(timed.reason, 'TELEMETRY_MAINTENANCE_DEADLINE'); assert.equal(timed.archived, 1);
  assert.equal(g.calls.includes('retire'), false);
});

test('cuatro lotes máximos concluyen1000 sin afirmar integridad global ni ahorro físico', async () => {
  const f = fixture(Array.from({ length: 1001 }, (_, i) => row(i)));
  const result = await processTelemetryMaintenance(f.callbacks, { ...apply, maxBatches: 4 });
  assert.equal(result.success, true); assert.equal(result.removed, 1000); assert.equal(result.batches.length, 4);
  assert.equal(f.state.size, 1); assert.equal(result.globallyComplete, false); assert.equal(result.physicalSavingProven, false);
});

test('no confía en mutación de callback de selección entregada a custodia', async () => {
  const f = fixture([row()], { store(archive) { archive.snapshot[0].payload_text = '{"changed":true}'; } });
  const result = await processTelemetryMaintenance(f.callbacks, apply);
  assert.equal(result.removed, 1); assert.equal(result.success, true);
});

test('plan limita bytes JSON del snapshot y conserva esquema público de selección privada', () => {
  const config = validateTelemetryMaintenanceOptions(apply);
  const archive = buildTelemetryMaintenanceArchive([row()], config);
  assert.equal(archive.storedBytes, telemetryObjectPlan(archive.backup).storedBytes + archive.selectionGzipBytes.length);
  assert.ok(gunzipSync(archive.selectionGzipBytes).equals(archive.selectionBytes));
  assert.equal(archive.snapshot[0].updated_at, row().updated_at);
});

test('presupuesto usa los tres objetos comprimidos exactos y rechaza un byte menos antes de Storage', async () => {
  const rows = Array.from({ length: 250 }, (_, id) => row(id));
  const archive = buildTelemetryMaintenanceArchive(rows, validateTelemetryMaintenanceOptions(apply));
  assert.ok(archive.selectionGzipBytes.length < archive.selectionBytes.length);
  const storedBytes = telemetryObjectPlan(archive.backup).storedBytes + archive.selectionGzipBytes.length;
  const accepted = fixture(rows);
  const result = await processTelemetryMaintenance(accepted.callbacks, { ...apply, maxStoredBytes: storedBytes });
  assert.equal(result.success, true); assert.equal(result.removed, 250);
  assert.equal(result.storedBytes, storedBytes); assert.equal(result.batches[0].storedBytes, storedBytes);
  const rejected = fixture(rows);
  const bounded = await processTelemetryMaintenance(rejected.callbacks, { ...apply, maxStoredBytes: storedBytes - 1 });
  assert.equal(bounded.reason, 'TELEMETRY_MAINTENANCE_STORAGE_BUDGET');
  assert.deepEqual(rejected.calls, ['select']);
});

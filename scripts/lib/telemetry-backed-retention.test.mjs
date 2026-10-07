import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelemetryBackup } from './telemetry-backup.mjs';
import { prepareBackedTelemetryRetention } from './telemetry-backed-retention.mjs';

const row = { cache_key: "fixture:quote'", scope: 'operational-endpoint-event', payload: '{"sql":"quote\' and \\n","large":9007199254740993}',
  expires_at: '2026-10-01T00:00:00.123456Z', created_at: '2026-09-29T00:00:00.123456Z', updated_at: '2026-09-29T00:00:00.123456Z' };
const expected = { projectId: 'fixture-project', cutoff: '2026-10-07T20:10:00.000000Z', selectionSha256: 'a'.repeat(64),
  selection: [{ cache_key: row.cache_key, scope: row.scope, expires_at: row.expires_at, updated_at: row.updated_at }] };

test('preparación no ejecuta: SQL queda limitado a las seis coincidencias del respaldo', () => {
  const plan = prepareBackedTelemetryRetention(buildTelemetryBackup([row], expected), expected);
  assert.equal(plan.executionIncluded, false); assert.equal(plan.originalRowsRemoved, 0);
  assert.equal(plan.selected, 1); assert.equal(plan.fieldsCompared, 6);
  assert.match(plan.preview, /^BEGIN READ ONLY;/); assert.doesNotMatch(plan.preview, /DELETE|COMMIT/);
  assert.match(plan.apply, /DELETE FROM public\.api_cache_entries c USING snapshot s/);
  assert.match(plan.apply, /c\.payload=s\.payload/); assert.match(plan.apply, /c\.created_at=s\.created_at/);
  assert.match(plan.apply, /fixture:quote'/); assert.match(plan.apply, /\$telemetry_[a-f0-9]{64}\$/);
  assert.match(plan.apply, /9007199254740993/);
  assert.match(plan.apply, /removed_keys/); assert.match(plan.apply, /COMMIT;/);
  assert.match(plan.restore, /ON CONFLICT\(cache_key\) DO NOTHING/);
  assert.match(plan.restore, /restored_keys/); assert.doesNotMatch(plan.restore, /UPDATE|DELETE/);
});

test('respaldo alterado o selección ajena nunca producen plan de retiro', () => {
  const backup = buildTelemetryBackup([row], expected);
  assert.throws(() => prepareBackedTelemetryRetention({ ...backup, gzipBytes: Buffer.from('corrupt') }, expected), /INTEGRITY/);
  assert.throws(() => prepareBackedTelemetryRetention(backup, { ...expected, selectionSha256: 'b'.repeat(64) }), /ANCHOR/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelemetryBackup } from './telemetry-backup.mjs';
import { createTelemetryStorageFetch, downloadTelemetryBackup, telemetryObjectPlan, uploadTelemetryBackup } from './telemetry-backup-storage.mjs';

const row = { cache_key: 'event:fixture', scope: 'operational-store-event', payload: '{"large":9007199254740993}',
  expires_at: '2026-10-01T00:00:00.000001Z', created_at: '2026-09-29T00:00:00.000001Z', updated_at: '2026-09-29T00:00:00.000001Z' };
const expected = { projectId: 'fixture-project', cutoff: '2026-10-07T20:10:00.000000Z', selectionSha256: 'a'.repeat(64),
  selection: [{ cache_key: row.cache_key, scope: row.scope, expires_at: row.expires_at, updated_at: row.updated_at }] };
const backup = () => buildTelemetryBackup([row], expected);
function memoryStorage({ privateBucket = true, ambiguous = false, corrupt = false } = {}) {
  const objects = new Map(), writes = [];
  const files = {
    async upload(key, bytes, options) {
      writes.push(options); assert.equal(options.upsert, false);
      if (objects.has(key)) return { error: true };
      objects.set(key, Buffer.from(bytes));
      if (ambiguous) throw new Error('lost response after commit');
      return { error: null };
    },
    async download(key) {
      if (!objects.has(key)) return { error: true };
      const bytes = objects.get(key);
      return { data: new Blob([corrupt ? Buffer.alloc(bytes.length) : bytes]), error: null };
    },
  };
  return { objects, writes, from: () => files,
    getBucket: async () => ({ data: { id: 'catalog-history-archive', public: !privateBucket, file_size_limit: 1048576,
      allowed_mime_types: ['application/json', 'application/gzip'] }, error: null }) };
}

test('copia inmutable y repetición concilian dos objetos sin reemplazos', async () => {
  const storage = memoryStorage(), archive = backup();
  const first = await uploadTelemetryBackup(storage, archive, expected);
  const second = await uploadTelemetryBackup(storage, archive, expected);
  assert.equal(first.uploadedObjects, 2); assert.equal(second.reusedObjects, 2);
  assert.equal(storage.objects.size, 2); assert.equal(first.originalRowsRemoved, 0);
  const trustedManifest = structuredClone(archive.manifest);
  archive.gzipBytes = null;
  assert.deepEqual((await downloadTelemetryBackup(storage, trustedManifest, expected)).rows, [row]);
  assert.ok([...storage.objects.keys()].at(-1).endsWith('/manifest.json'));
});

test('respuesta perdida después del commit se resuelve por bytes, corrupción se detiene', async () => {
  const recovered = await uploadTelemetryBackup(memoryStorage({ ambiguous: true }), backup(), expected);
  assert.equal(recovered.reusedObjects, 2); assert.equal(recovered.verifiedRows, 1);
  const corrupt = memoryStorage({ corrupt: true });
  await assert.rejects(uploadTelemetryBackup(corrupt, backup(), expected), /READBACK_MISMATCH/);
  assert.equal(corrupt.writes.length, 1);
});

test('bucket público o archivo fuera de presupuesto se rechazan antes de subir', async () => {
  const storage = memoryStorage({ privateBucket: false });
  await assert.rejects(uploadTelemetryBackup(storage, backup(), expected), /BUCKET_CONTRACT/);
  assert.equal(storage.writes.length, 0);
  assert.throws(() => telemetryObjectPlan({ manifest: { gzipBytes: 1048577 }, gzipBytes: Buffer.alloc(1048577) }), /MANIFEST_BUDGET/);
});

test('guard sólo permite GET y POST inmutable de los dos objetos, sin redirects', async () => {
  const plan = telemetryObjectPlan(backup()), origin = 'https://fixture.example', calls = [];
  const guarded = createTelemetryStorageFetch(origin, plan.objects.map(item => item.key), { allowUpload: true,
    transport: async (_url, init) => { calls.push(init); return new Response('{}'); } });
  const url = `${origin}/storage/v1/object/catalog-history-archive/${plan.objects[0].key}`;
  await guarded(url, { method: 'POST', headers: { 'x-upsert': 'false' }, body: Buffer.from('fixture'), redirect: 'follow' });
  await guarded(`${origin}/storage/v1/bucket/catalog-history-archive`);
  for (const method of ['PUT', 'DELETE', 'PATCH']) assert.throws(() => guarded(url, { method }), /NETWORK_FORBIDDEN/);
  assert.throws(() => guarded(url, { method: 'POST', headers: { 'x-upsert': 'true' }, body: Buffer.from('fixture') }), /NETWORK_FORBIDDEN/);
  for (const other of [`${origin}/storage/v1/bucket`, `${origin}/rest/v1/api_cache_entries`, url + '?other=1',
    url.replace('fixture.example', 'other.example'), url.replace('/telemetry.json.gz', '/other.gz')]) {
    assert.throws(() => guarded(other), /NETWORK_FORBIDDEN/);
  }
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.redirect === 'error' && call.signal instanceof AbortSignal));
  const readOnly = createTelemetryStorageFetch(origin, plan.objects.map(item => item.key));
  assert.throws(() => readOnly(url, { method: 'POST', headers: { 'x-upsert': 'false' }, body: Buffer.from('fixture') }), /NETWORK_FORBIDDEN/);
});

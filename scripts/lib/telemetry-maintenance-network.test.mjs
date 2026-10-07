import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelemetryMaintenanceArchive, validateTelemetryMaintenanceOptions } from './telemetry-maintenance.mjs';
import { createTelemetryMaintenanceDataFetch, createTelemetryMaintenanceStorageFetch, storeTelemetryMaintenanceArchive,
  telemetryMaintenanceObjectKeys, downloadTelemetryMaintenanceArchive, readTelemetryJson } from './telemetry-maintenance-network.mjs';

const origin = 'https://fixture.example';
const snapshot = [{ cache_key: 'fixture:1', scope: 'operational-store-event', payload_text: '{"large":9007199254740993}',
  expires_at: '2026-10-01T00:00:00.000001Z', created_at: '2026-09-28T00:00:00.000001Z', updated_at: '2026-09-29T00:00:00.000001Z' }];
const config = validateTelemetryMaintenanceOptions({ projectId: 'fixture-project', cutoff: '2026-10-07T20:00:00.000000Z',
  now: '2026-10-07T20:10:00Z', mode: 'archive-retire', approvalId: 'local-only' });
const archiveFor = () => buildTelemetryMaintenanceArchive(snapshot, config);
const metadataUrl = () => {
  const url = new URL('/rest/v1/api_cache_entries', origin);
  url.searchParams.set('select', 'cache_key,scope,expires_at,updated_at');
  url.searchParams.set('scope', 'in.(operational-endpoint-event,operational-store-event)');
  url.searchParams.set('expires_at', `lt.${config.cutoff}`); url.searchParams.set('updated_at', `lte.${config.cutoff}`);
  url.searchParams.set('limit', '250');
  return url;
};

test('inspect red permite metadata GET exclusivamente; scopes/select/origen/rutas extra se rechazan', async () => {
  const calls = [];
  const guard = createTelemetryMaintenanceDataFetch(origin, { transport: async (_target, init) => { calls.push(init); return new Response('[]'); } });
  await guard(metadataUrl(), { redirect: 'follow' });
  assert.equal(calls[0].redirect, 'error'); assert.ok(calls[0].signal instanceof AbortSignal);
  for (const method of ['POST', 'DELETE', 'PUT', 'PATCH']) assert.throws(() => guard(metadataUrl(), { method }));
  for (const [key, value] of [['select', '*'], ['limit', '251'], ['scope', 'in.(products)'], ['extra', 'true']]) {
    const url = metadataUrl(); url.searchParams.set(key, value); assert.throws(() => guard(url));
  }
  for (const target of [String(metadataUrl()).replace('fixture.example', 'other.example'), `${origin}/rest/v1/price_history`,
    `${origin}/rest/v1/rpc/retire_backed_telemetry`, String(metadataUrl()) + '#fragment']) assert.throws(() => guard(target));
  assert.equal(calls.length, 1);
});

test('retire RPC sólo permite snapshot6 y un POST por cuerpo, incluso con respuesta perdida', async () => {
  let attempts = 0;
  const guard = createTelemetryMaintenanceDataFetch(origin, { allowRetire: true, transport: async () => { attempts++; throw new Error('lost'); } });
  const url = `${origin}/rest/v1/rpc/retire_backed_telemetry`;
  const init = { method: 'POST', body: JSON.stringify({ p_cutoff: config.cutoff, p_snapshot: snapshot }) };
  await assert.rejects(guard(url, init), /lost/);
  assert.throws(() => guard(url, init), /POST_ALREADY_ATTEMPTED/); assert.equal(attempts, 1);
  for (const body of [{ p_cutoff: config.cutoff, p_snapshot: [] }, { p_cutoff: config.cutoff, p_snapshot: [{ ...snapshot[0], payload_text: {} }] },
    { p_cutoff: config.cutoff, p_snapshot: [{ ...snapshot[0], scope: 'products' }] }, { p_cutoff: config.cutoff, p_snapshot: snapshot, extra: true }]) {
    assert.throws(() => guard(url, { method: 'POST', body: JSON.stringify(body) }));
  }
  assert.throws(() => guard(url + '?other=1', init)); assert.throws(() => guard(`${origin}/rest/v1/rpc/cleanup_history`, init));
});

test('select RPC read-only limita parámetros y nunca admite otro método', async () => {
  let attempts = 0;
  const guard = createTelemetryMaintenanceDataFetch(origin, { allowRetire: true, transport: async () => { attempts++; return new Response('[]'); } });
  const url = `${origin}/rest/v1/rpc/select_backed_telemetry_candidates`;
  await guard(url, { method: 'POST', body: JSON.stringify({ p_cutoff: config.cutoff, p_limit: 250 }) });
  await guard(url, { method: 'POST', body: JSON.stringify({ p_cutoff: config.cutoff, p_limit: 250 }) });
  assert.equal(attempts, 2);
  for (const p_limit of [0, 251, '250', null]) assert.throws(() => guard(url, { method: 'POST', body: JSON.stringify({ p_cutoff: config.cutoff, p_limit }) }));
  assert.throws(() => guard(url, { method: 'GET' }));
});

test('guard nueva sólo extiende selección.json del mismo prefijo sin ampliar guard legado', async () => {
  const archive = archiveFor(), calls = [];
  const guard = createTelemetryMaintenanceStorageFetch(origin, telemetryMaintenanceObjectKeys(archive),
    { allowUpload: true, transport: async (_url, init) => { calls.push(init); return new Response('{}'); } });
  const url = `${origin}/storage/v1/object/catalog-history-archive/${archive.selectionKey}`;
  await guard(url, { method: 'POST', headers: { 'x-upsert': 'false' }, body: archive.selectionBytes });
  await guard(url);
  assert.throws(() => guard(url, { method: 'POST', headers: { 'x-upsert': 'false' }, body: archive.selectionBytes }), /POST_ALREADY_ATTEMPTED/);
  for (const method of ['PUT', 'DELETE', 'PATCH']) assert.throws(() => guard(url, { method }));
  assert.throws(() => guard(url, { method: 'POST', headers: { 'x-upsert': 'true' }, body: archive.selectionBytes }));
  assert.throws(() => guard(url + '?extra=1')); assert.throws(() => guard(url.replace('fixture.example', 'other.example')));
  assert.throws(() => guard(url.replace('selection.json', 'other.json')));
  assert.throws(() => guard(url, { method: 'POST', headers: { 'x-upsert': 'false' }, body: Buffer.alloc(1048577) }));
  assert.throws(() => createTelemetryMaintenanceStorageFetch(origin, ['invalid', 'invalid', archive.selectionKey]));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(value => value.redirect === 'error'));
});

test('deadline global abortada no alcanza transporte aun para GET', () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const guard = createTelemetryMaintenanceDataFetch(origin, { signal: controller.signal, transport: () => { calls++; } });
  assert.throws(() => guard(metadataUrl())); assert.equal(calls, 0);
});

function memoryStorage({ lost = false, corruptSelection = false, privateBucket = true } = {}) {
  const objects = new Map(), writes = [];
  return { objects, writes,
    getBucket: async () => ({ data: { id: 'catalog-history-archive', public: !privateBucket, file_size_limit: 1048576,
      allowed_mime_types: ['application/gzip', 'application/json'] }, error: null }),
    from: () => ({
      async upload(key, bytes, settings) {
        writes.push({ key, settings }); assert.equal(settings.upsert, false);
        if (objects.has(key)) return { error: true };
        objects.set(key, Buffer.from(bytes));
        if (lost) throw new Error('lost after upload');
        return { error: null };
      },
      async download(key) {
        const bytes = objects.get(key);
        if (!bytes) return { error: true };
        return { data: new Blob([corruptSelection && key.endsWith('selection.json') ? Buffer.alloc(bytes.length) : bytes]), error: null };
      },
    }),
  };
}

test('custodia3objetos recupera desde hash público solamente sin selección efímera', async () => {
  const storage = memoryStorage(), archive = archiveFor();
  const downloaded = await storeTelemetryMaintenanceArchive(storage, archive);
  assert.equal(storage.objects.size, 3); assert.ok(downloaded.selectionBytes.equals(archive.selectionBytes));
  const trustedHash = archive.manifestSha256;
  const restored = await downloadTelemetryMaintenanceArchive(storage, trustedHash, 'fixture-project');
  assert.equal(restored.rows[0].payload, snapshot[0].payload_text);
  assert.equal(restored.expected.selectionSha256, archive.expected.selectionSha256);
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, trustedHash, 'other-project'), /RECOVERY_SELECTION/);
  await storeTelemetryMaintenanceArchive(storage, archive);
  assert.equal(storage.objects.size, 3); assert.ok(storage.writes.every(value => value.settings.upsert === false));
});

test('respuesta de subida perdida concilia bytes; corrupción o bucket público bloquean custodia', async () => {
  const archive = archiveFor();
  await storeTelemetryMaintenanceArchive(memoryStorage({ lost: true }), archive);
  await assert.rejects(storeTelemetryMaintenanceArchive(memoryStorage({ corruptSelection: true }), archive), /SELECTION_READBACK/);
  const publicStorage = memoryStorage({ privateBucket: false });
  await assert.rejects(storeTelemetryMaintenanceArchive(publicStorage, archive), /BUCKET_CONTRACT/);
  assert.equal(publicStorage.writes.length, 0);
});

test('recuperación rechaza manifiesto/selección adulterados y conserva copias existentes', async () => {
  const storage = memoryStorage(), archive = archiveFor();
  await storeTelemetryMaintenanceArchive(storage, archive);
  storage.objects.set(archive.selectionKey, Buffer.from('{"rows":[]}\n'));
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, 'fixture-project'), /RECOVERY_SELECTION_HASH/);
  const manifestKey = telemetryMaintenanceObjectKeys(archive)[1];
  storage.objects.set(manifestKey, Buffer.from('{}\n'));
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, 'fixture-project'), /RECOVERY_MANIFEST_HASH/);
});

test('respuesta HTTP fallida, JSON inválido y presupuesto de stream fallan sin imprimir contenido', async () => {
  assert.deepEqual(await readTelemetryJson(new Response('[{"payload_text":"9007199254740993"}]')), [{ payload_text: '9007199254740993' }]);
  await assert.rejects(readTelemetryJson(new Response('private', { status: 503 })), /NETWORK_HTTP/);
  await assert.rejects(readTelemetryJson(new Response('123456789'), 3), /RESPONSE_BYTES/);
  await assert.rejects(readTelemetryJson(new Response('{invalid')));
});

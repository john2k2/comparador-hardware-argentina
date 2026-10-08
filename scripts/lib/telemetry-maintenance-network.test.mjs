import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { processTelemetryMaintenance } from './telemetry-maintenance.mjs';
import { buildTelemetryMaintenanceArchive, validateTelemetryMaintenanceOptions } from './telemetry-maintenance.mjs';
import { createTelemetryMaintenanceDataFetch, createTelemetryMaintenanceStorageFetch, storeTelemetryMaintenanceArchive,
  telemetryMaintenanceObjectKeys, telemetryMaintenanceRecoveryObjectKeys, downloadTelemetryMaintenanceArchive, readTelemetryJson } from './telemetry-maintenance-network.mjs';

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

test('guard nueva sólo extiende selección.json.gz del mismo prefijo sin ampliar guard legado', async () => {
  const archive = archiveFor(), calls = [];
  const guard = createTelemetryMaintenanceStorageFetch(origin, telemetryMaintenanceObjectKeys(archive),
    { allowUpload: true, transport: async (_url, init) => { calls.push(init); return new Response('{}'); } });
  const url = `${origin}/storage/v1/object/catalog-history-archive/${archive.selectionKey}`;
  await guard(url, { method: 'POST', headers: { 'x-upsert': 'false', 'content-type': 'application/gzip' }, body: archive.selectionGzipBytes });
  await guard(url);
  assert.throws(() => guard(url, { method: 'POST', headers: { 'x-upsert': 'false', 'content-type': 'application/gzip' }, body: archive.selectionGzipBytes }), /POST_ALREADY_ATTEMPTED/);
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
  const objects = new Map(), writes = [], reads = [];
  return { objects, writes, reads,
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
        reads.push(key);
        const bytes = objects.get(key);
        if (!bytes) return { data: null, error: { status: 404, statusCode: '404' } };
        return { data: new Blob([corruptSelection && key.endsWith('selection.json.gz') ? Buffer.alloc(bytes.length) : bytes]), error: null };
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
  storage.objects.set(archive.selectionKey, gzipSync(Buffer.from('{"rows":[]}\n')));
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

test('recupera formato JSON antiguo sólo tras404; writer agrega gzip bajo mismo manifiesto sin reemplazar legado', async () => {
  const storage = memoryStorage(), archive = archiveFor();
  await storeTelemetryMaintenanceArchive(storage, archive);
  const oldKey = archive.selectionKey.slice(0, -3);
  storage.objects.delete(archive.selectionKey);
  storage.objects.set(oldKey, Buffer.from(archive.selectionBytes));
  storage.reads.length = 0;
  const restored = await downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId);
  assert.ok(restored.selectionBytes.equals(archive.selectionBytes));
  assert.equal(restored.rows[0].payload, snapshot[0].payload_text);
  assert.ok(storage.reads.indexOf(oldKey) > storage.reads.indexOf(archive.selectionKey));
  const prior = new Map([...storage.objects].map(([key, bytes]) => [key, Buffer.from(bytes)]));
  await storeTelemetryMaintenanceArchive(storage, archive);
  assert.equal(storage.objects.size, 4);
  for (const [key, bytes] of prior) assert.ok(storage.objects.get(key).equals(bytes));
  storage.reads.length = 0;
  await downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId);
  assert.equal(storage.reads.includes(oldKey), false);
  assert.equal(archive.backup.manifest.version, 1);
});

test('recuperación no cae a JSON por corrupción, bomba, tamaño excesivo ni hash descomprimido distinto', async () => {
  for (const bad of [Buffer.from('broken gzip'), gzipSync(Buffer.alloc(1048577, 97)), Buffer.alloc(1048577),
    gzipSync(Buffer.from('{"projectId":"other","rows":[]}\n'))]) {
    const storage = memoryStorage(), archive = archiveFor();
    await storeTelemetryMaintenanceArchive(storage, archive);
    const oldKey = archive.selectionKey.slice(0, -3);
    storage.objects.set(oldKey, Buffer.from(archive.selectionBytes));
    storage.objects.set(archive.selectionKey, bad);
    storage.reads.length = 0;
    await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId), /TELEMETRY_MAINTENANCE_/);
    assert.equal(storage.reads.includes(oldKey), false);
  }
});

test('ausencia de ambas selecciones falla en recuperación sin modificar objetos', async () => {
  const storage = memoryStorage(), archive = archiveFor();
  await storeTelemetryMaintenanceArchive(storage, archive);
  storage.objects.delete(archive.selectionKey);
  const writes = storage.writes.length;
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId), /RECOVERY_DOWNLOAD/);
  assert.equal(storage.writes.length, writes); assert.equal(storage.objects.size, 2);
});

test('respuesta ambigua, statusCode aislado, permisos, timeout y respuesta404 con datos no habilitan JSON antiguo', async () => {
  const responses = [null, undefined, { data: null, error: true }, { data: null, error: { statusCode: '404' } },
    { data: null, error: { status: 400, statusCode: '404' } }, { data: null, error: { status: 403 } },
    { data: new Blob(['ambiguous']), error: { status: 404 } }, { data: null, error: new Error('timeout') },
    { data: null, error: { name: 'StorageUnknownError', originalError: { status: 404 } } }];
  for (const response of responses) {
    const storage = memoryStorage(), archive = archiveFor();
    await storeTelemetryMaintenanceArchive(storage, archive);
    const oldKey = archive.selectionKey.slice(0, -3);
    storage.objects.set(oldKey, Buffer.from(archive.selectionBytes));
    const files = storage.from();
    storage.from = () => ({ ...files, download: key => key === archive.selectionKey ? response : files.download(key) });
    storage.reads.length = 0;
    await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId), /RECOVERY_DOWNLOAD/);
    assert.equal(storage.reads.includes(oldKey), false);
  }
  const storage = memoryStorage(), archive = archiveFor();
  await storeTelemetryMaintenanceArchive(storage, archive);
  const files = storage.from();
  storage.from = () => ({ ...files, async download(key) { if (key === archive.selectionKey) throw new Error('timeout'); return files.download(key); } });
  storage.reads.length = 0;
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId), /timeout/);
  assert.equal(storage.reads.some(key => key.endsWith('/selection.json')), false);
});

test('recuperación exige bucket privado antes de cualquier objeto', async () => {
  const storage = memoryStorage({ privateBucket: false }), archive = archiveFor();
  await assert.rejects(downloadTelemetryMaintenanceArchive(storage, archive.manifestSha256, config.projectId), /RECOVERY_BUCKET/);
  assert.deepEqual(storage.reads, []);
});

test('readback gzip válido pero JSON distinto bloquea retiro antes de RPC', async () => {
  const storage = memoryStorage(), archive = archiveFor();
  const files = storage.from();
  storage.from = () => ({ ...files, async download(key) {
    if (key === archive.selectionKey) return { data: new Blob([gzipSync(Buffer.from('wrong JSON'))]), error: null };
    return files.download(key);
  } });
  let retired = false;
  const result = await processTelemetryMaintenance({ selectSnapshot: async () => snapshot,
    storeArchive: value => storeTelemetryMaintenanceArchive(storage, value),
    retireSnapshot: async () => { retired = true; } }, config);
  assert.equal(result.stopped, true); assert.equal(result.archived, 0); assert.equal(retired, false);
});

test('guard de recuperación admite sólo cuatro objetos exactos GET, nunca POST, prefijo ajeno ni legacy implícito', async () => {
  const archive = archiveFor(), calls = [];
  const keys = telemetryMaintenanceRecoveryObjectKeys(archive.manifestSha256);
  const guard = createTelemetryMaintenanceStorageFetch(origin, keys, { transport: async (target, init) => { calls.push({ target, init }); return new Response('{}'); } });
  for (const key of keys) {
    const url = `${origin}/storage/v1/object/catalog-history-archive/${key}`;
    await guard(url);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.throws(() => guard(url, { method, headers: { 'x-upsert': 'false', 'content-type': 'application/gzip' }, body: archive.selectionGzipBytes }));
    assert.throws(() => guard(url + '?extra=1')); assert.throws(() => guard(url.replace(archive.manifestSha256, '0'.repeat(64))));
  }
  assert.throws(() => createTelemetryMaintenanceStorageFetch(origin, keys, { allowUpload: true }));
  const writer = createTelemetryMaintenanceStorageFetch(origin, telemetryMaintenanceObjectKeys(archive), { allowUpload: true });
  assert.throws(() => writer(`${origin}/storage/v1/object/catalog-history-archive/${archive.selectionKey.slice(0, -3)}`));
  assert.equal(calls.length, 4); assert.ok(calls.every(value => value.init.redirect === 'error'));
});

test('SDK real local recupera JSON legado por Response404 envuelta sin abrir rutas ni hacer red', async () => {
  const archive = archiveFor(), memory = memoryStorage(), calls = [];
  await storeTelemetryMaintenanceArchive(memory, archive);
  memory.objects.delete(archive.selectionKey);
  memory.objects.set(archive.selectionKey.slice(0, -3), archive.selectionBytes);
  const guarded = createTelemetryMaintenanceStorageFetch(origin, telemetryMaintenanceRecoveryObjectKeys(archive.manifestSha256), {
    transport: async (target, init) => {
      const url = new URL(String(target)); calls.push(url.pathname); assert.equal(init.redirect, 'error');
      if (url.pathname === '/storage/v1/bucket/catalog-history-archive') return new Response(JSON.stringify((await memory.getBucket()).data));
      const key = url.pathname.slice('/storage/v1/object/catalog-history-archive/'.length);
      const bytes = memory.objects.get(key);
      return bytes ? new Response(bytes) : new Response('{"message":"Not found"}', { status: 404 });
    },
  });
  const client = createClient(origin, 'fixture-server-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: guarded } });
  const restored = await downloadTelemetryMaintenanceArchive(client.storage, archive.manifestSha256, config.projectId);
  assert.ok(restored.selectionBytes.equals(archive.selectionBytes));
  assert.equal(restored.rows[0].payload, snapshot[0].payload_text);
  assert.equal(calls.filter(key => key.endsWith('/selection.json.gz')).length, 1);
  assert.equal(calls.filter(key => key.endsWith('/selection.json')).length, 1);
});

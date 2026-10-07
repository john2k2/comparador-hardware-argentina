import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseTelemetryMaintenanceArguments, runTelemetryMaintenanceCli } from '../telemetry-maintenance.mjs';

const now = '2026-10-07T20:10:00.000000Z';
const origin = 'https://zyiyziubpcpgoqlkcrie.supabase.co';
const event = { cache_key: 'fixture:"slash\\key', scope: 'operational-endpoint-event', payload_text: '{"large":9007199254740993}',
  expires_at: '2026-10-01T00:00:00.000001Z', created_at: '2026-09-28T00:00:00.000001Z', updated_at: '2026-09-29T00:00:00.000001Z' };
const metadata = ({ cache_key, scope, expires_at, updated_at }) => ({ cache_key, scope, expires_at, updated_at });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function harness({ lostRetire = false, corruptSelection = false, initial = [event] } = {}) {
  const calls = [], objects = new Map(), outputs = [], summaries = [];
  const state = new Map(initial.map(row => [row.cache_key, structuredClone(row)]));
  const transport = async (target, init = {}) => {
    const url = new URL(String(target));
    calls.push({ url, init });
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    if (url.pathname === '/rest/v1/api_cache_entries') {
      assert.equal(init.method || 'GET', 'GET');
      assert.equal(url.searchParams.get('select'), 'cache_key,scope,expires_at,updated_at');
      const byKeys = url.searchParams.get('cache_key');
      const keys = byKeys ? JSON.parse('[' + byKeys.slice(4, -1) + ']') : [...state.keys()];
      return json(keys.filter(key => state.has(key)).slice(0, Number(url.searchParams.get('limit'))).map(key => metadata(state.get(key))));
    }
    if (url.pathname === '/rest/v1/rpc/select_backed_telemetry_candidates') return json([...state.values()].slice(0, JSON.parse(init.body).p_limit));
    if (url.pathname === '/rest/v1/rpc/retire_backed_telemetry') {
      const body = JSON.parse(init.body);
      assert.equal(body.p_snapshot[0].payload_text, event.payload_text);
      assert.ok(objects.size >= 3 && objects.size % 3 === 0);
      assert.ok(calls.some(value => value.url.pathname.endsWith('/selection.json') && (value.init.method || 'GET') === 'GET'));
      const removed = body.p_snapshot.filter(row => state.has(row.cache_key));
      for (const row of removed) state.delete(row.cache_key);
      if (lostRetire) throw new Error('private server detail');
      return json({ selected: body.p_snapshot.length, removed: removed.length,
        changed_or_missing: body.p_snapshot.length - removed.length, removed_keys: removed.map(row => row.cache_key) });
    }
    if (url.pathname === '/storage/v1/bucket/catalog-history-archive') return json({ id: 'catalog-history-archive', public: false,
      file_size_limit: 1048576, allowed_mime_types: ['application/gzip', 'application/json'] });
    if (url.pathname.startsWith('/storage/v1/object/catalog-history-archive/')) {
      if (init.method === 'POST') {
        assert.equal(new Headers(init.headers).get('x-upsert'), 'false'); assert.ok(Buffer.isBuffer(init.body));
        if (objects.has(url.pathname)) return new Response('{}', { status: 409 });
        objects.set(url.pathname, Buffer.from(init.body)); return json({ Key: url.pathname });
      }
      const bytes = objects.get(url.pathname);
      assert.ok(bytes);
      return new Response(corruptSelection && url.pathname.endsWith('/selection.json') ? Buffer.alloc(bytes.length) : bytes);
    }
    throw new Error('unexpected route');
  };
  const deps = { env: { SUPABASE_URL: origin, SUPABASE_SECRET_KEY: 'fixture-server-key' }, transport, now: () => now,
    output: value => outputs.push(value), writeSummary: async (file, value) => summaries.push({ file, value }) };
  return { calls, objects, outputs, summaries, deps, state };
}

test('CLI por defecto inspect usa GET y escribe sólo resumen; cutoff default resta5min', async () => {
  const h = harness();
  const result = await runTelemetryMaintenanceCli(['--out', '/fixture/summary.json'], h.deps);
  assert.equal(result.mode, 'inspect'); assert.equal(result.cutoff, '2026-10-07T20:05:00.000000Z');
  assert.equal(result.success, true); assert.equal(h.calls.length, 1); assert.equal(h.objects.size, 0);
  assert.equal(h.summaries[0].value.selected, 1);
  assert.doesNotMatch(h.outputs.join(''), /fixture-server-key|fixture:|payload|rows/);
});

test('CLI archive-retire custodia tres objetos privados y ACK+GET antes de éxito', async () => {
  const h = harness();
  const result = await runTelemetryMaintenanceCli(['archive-retire', '--approval-id', 'fixture-only', '--out', '/fixture/summary.json'], h.deps);
  assert.equal(result.success, true); assert.equal(result.removed, 1); assert.equal(result.archived, 1);
  assert.equal(h.objects.size, 3);
  const retireIndex = h.calls.findIndex(value => value.url.pathname.endsWith('/retire_backed_telemetry'));
  assert.ok(retireIndex > 0); assert.equal(h.calls.at(-1).url.pathname, '/rest/v1/api_cache_entries');
  assert.ok(h.calls.slice(0, retireIndex).filter(value => value.url.pathname.includes('/object/') && (value.init.method || 'GET') === 'GET').length >= 3);
  assert.doesNotMatch(h.outputs.join(''), /fixture-only|fixture-server-key|payload_text|900719925|removed_keys/);
});

test('CLI cuatro lotes completos repiten selector idéntico y concilian1000 filas sin reintentar retiros', async () => {
  const initial = Array.from({ length: 1000 }, (_, index) => ({ ...event, cache_key: `fixture:batch:${index}` }));
  const h = harness({ initial });
  const result = await runTelemetryMaintenanceCli(['archive-retire', '--approval-id', 'fixture-only', '--max-batches', '4',
    '--out', '/fixture/summary.json'], h.deps);
  assert.equal(result.success, true); assert.equal(result.removed, 1000); assert.equal(result.archived, 1000);
  assert.equal(result.batches.length, 4); assert.equal(result.unknown, 0); assert.equal(h.objects.size, 12); assert.equal(h.state.size, 0);
  const selects = h.calls.filter(value => value.url.pathname.endsWith('/select_backed_telemetry_candidates'));
  const retires = h.calls.filter(value => value.url.pathname.endsWith('/retire_backed_telemetry'));
  assert.equal(selects.length, 4); assert.equal(new Set(selects.map(value => value.init.body)).size, 1);
  assert.equal(retires.length, 4); assert.equal(new Set(retires.map(value => value.init.body)).size, 4);
  assert.equal(h.calls.filter(value => value.url.pathname === '/rest/v1/api_cache_entries').length, 20);
  assert.equal(result.globallyComplete, false); assert.equal(result.physicalSavingProven, false);
});

test('CLI pérdida del ACK sale con unknown y exactamente una mutación', async () => {
  const h = harness({ lostRetire: true });
  const result = await runTelemetryMaintenanceCli(['archive-retire', '--approval-id', 'fixture', '--max-batches', '4', '--out', '/fixture/out'], h.deps);
  assert.equal(result.success, false); assert.equal(result.unknown, 1); assert.equal(result.removed, 0);
  assert.equal(result.absentAfterUnknown, 1);
  assert.equal(h.calls.filter(value => value.url.pathname.endsWith('/retire_backed_telemetry')).length, 1);
  assert.doesNotMatch(h.outputs.join(''), /private server detail/);
});

test('CLI selección remota alterada bloquea RPC y conserva resumen seguro', async () => {
  const h = harness({ corruptSelection: true });
  const result = await runTelemetryMaintenanceCli(['archive-retire', '--approval-id', 'fixture', '--out', '/fixture/out'], h.deps);
  assert.equal(result.success, false); assert.equal(result.removed, 0);
  assert.equal(h.calls.some(value => value.url.pathname.endsWith('/retire_backed_telemetry')), false);
});

test('argumentos inválidos fallan antes de consultar configuración privada', async () => {
  const env = new Proxy({}, { get() { throw new Error('private config accessed'); } });
  for (const args of [['apply', '--out', 'fixture'], ['archive-retire', '--out', 'fixture'], ['--unknown'],
    ['--out', 'fixture', '--out', 'other'], ['--out', 'fixture', '--max-batches', '5'], ['--out', 'fixture', '--batch-size', '1e2'],
    ['--out', 'fixture', '--deadline-ms', '120001'], ['inspect']]) {
    await assert.rejects(runTelemetryMaintenanceCli(args, { env, now: () => now }), /TELEMETRY_MAINTENANCE_/);
  }
});

test('proyecto ajeno y ausencia de serverkey no llegan a red', async () => {
  let calls = 0;
  for (const env of [{ SUPABASE_URL: 'https://other.supabase.co', SUPABASE_SECRET_KEY: 'fixture' }, { SUPABASE_URL: origin }]) {
    await assert.rejects(runTelemetryMaintenanceCli(['--out', 'fixture'], { env, now: () => now,
      transport: async () => { calls++; } }), /TELEMETRY_MAINTENANCE_CLI_/);
  }
  assert.equal(calls, 0);
});

test('parse admite límites inferiores explícitos sin poder ampliar techo', () => {
  const parsed = parseTelemetryMaintenanceArguments(['archive-retire', '--approval-id', 'fixture', '--batch-size', '50', '--max-batches', '2',
    '--deadline-ms', '90000', '--max-stored-bytes', '4096', '--cutoff', '2026-10-07T19:00:00Z', '--out', 'fixture'], now);
  assert.equal(parsed.config.batchSize, 50); assert.equal(parsed.config.maxBatches, 2); assert.equal(parsed.config.maxStoredBytes, 4096);
});

test('entrypoint real rechaza modo mutante sin aprobación y no imprime secretos', () => {
  const result = spawnSync(process.execPath, ['scripts/telemetry-maintenance.mjs', 'archive-retire', '--out', 'fixture'],
    { encoding: 'utf8', timeout: 5000, env: {} });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).reason, 'TELEMETRY_MAINTENANCE_APPROVAL');
});

test('stdout mantiene resultado agregado si falla escritura de resumen después de mutar', async () => {
  const h = harness();
  await assert.rejects(runTelemetryMaintenanceCli(['archive-retire', '--approval-id', 'fixture', '--out', '/fixture/out'],
    { ...h.deps, writeSummary: async () => { throw new Error('disk failure'); } }), /disk failure/);
  assert.equal(JSON.parse(h.outputs[0]).removed, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDatabase, waitForHandoff } from './index.mjs';
const input = { backend: 'vps', cloudUrl: 'https://zyiyziubpcpgoqlkcrie.supabase.co', cloudPublishableKey: 'cloud-public', cloudSecretKey: 'cloud-private', vpsUrl: 'https://catalog-api.comparador-hardware.com.ar', vpsPublishableKey: 'vps-public', vpsSecretKey: 'vps-private' };
test('cada backend mantiene su pareja y Auth conserva la pareja Cloud', () => {
  const selected = selectDatabase(input);
  assert.equal(selected.env.SUPABASE_URL, input.vpsUrl); assert.equal(selected.env.SUPABASE_SECRET_KEY, 'vps-private');
  assert.equal(selected.env.SUPABASE_AUTH_URL, input.cloudUrl); assert.equal(selected.env.SUPABASE_AUTH_PUBLISHABLE_KEY, 'cloud-public');
  assert.equal(selectDatabase({ ...input, backend: '' }).env.SUPABASE_SECRET_KEY, 'cloud-private');
});
test('no usa Cloud como fallback de un VPS incompleto ni permite otros destinos o inyección de entorno', () => {
  for (const changes of [{ vpsSecretKey: '' }, { vpsPublishableKey: '' }, { vpsUrl: 'https://other.example' }, { backend: 'unknown' }, { vpsSecretKey: 'x\nOTHER=private' }]) assert.throws(() => selectDatabase({ ...input, ...changes }), /CATALOG_DATABASE_/);
});
test('la barrera espera sin ejecutar productores y conserva redirect manual y la credencial correcta', async () => {
  let now = 0, calls = 0;
  await waitForHandoff(selectDatabase(input), { clock: () => now, sleep: async ms => { now += ms; }, fetcher: async (url, options) => {
    assert.equal(url, input.vpsUrl + '/__ready'); assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Authorization, 'Bearer vps-private');
    assert.equal(options.headers['User-Agent'], 'comparador-catalog-runner/1.0');
    return new Response(null, { status: ++calls === 2 ? 200 : 503 });
  } });
  assert.equal(calls, 2);
});
test('un token rechazado o una redirección no mantiene un bucle ni revela errores del proveedor', async () => {
  for (const status of [401, 403, 302]) await assert.rejects(waitForHandoff(selectDatabase(input), { fetcher: async () => new Response(null, { status }) }), /CATALOG_DATABASE_/);
  let now = 0;
  await assert.rejects(waitForHandoff(selectDatabase(input), { clock: () => now, timeoutMs: 5000, sleep: async ms => { now += ms; }, fetcher: async () => new Response(null, { status: 503 }) }), /HANDOFF_TIMEOUT/);
});

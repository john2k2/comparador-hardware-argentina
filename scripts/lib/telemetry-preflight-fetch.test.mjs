import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelemetryPreflightFetch } from './telemetry-preflight-fetch.mjs';

const origin = 'https://project.example';
const valid = `${origin}/rest/v1/api_cache_entries?select=cache_key`;

test('lectura válida conserva headers y fuerza rechazo de redirects antes del transporte', async () => {
  const calls = [];
  const transport = async (url, init) => { calls.push({ url, init }); return new Response('[]'); };
  const guarded = createTelemetryPreflightFetch(origin, transport);
  const response = await guarded(valid, { method: 'GET', headers: { apikey: 'fixture-only' }, redirect: 'follow' });
  assert.equal(await response.text(), '[]');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(calls[0].init.headers, { apikey: 'fixture-only' });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('métodos mutantes, otra ruta/origen y credenciales URL jamás llaman al transporte', () => {
  let calls = 0;
  const guarded = createTelemetryPreflightFetch(origin, () => { calls++; });
  for (const method of ['POST', 'DELETE', 'PATCH', 'PUT', 'HEAD']) {
    assert.throws(() => guarded(valid, { method }), /NETWORK_WRITE_FORBIDDEN/);
  }
  for (const url of [`${origin}/rest/v1/products`, 'https://other.example/rest/v1/api_cache_entries',
    'https://fixture:fixture@project.example/rest/v1/api_cache_entries', `${origin}/rest/v1/api_cache_entries/`]) {
    assert.throws(() => guarded(url), /NETWORK_WRITE_FORBIDDEN/);
  }
  assert.equal(calls, 0);
});

test('la señal original abortada se conserva junto al plazo máximo', async () => {
  const controller = new AbortController();
  const reason = new Error('cancelled');
  controller.abort(reason);
  const guarded = createTelemetryPreflightFetch(origin, async (_url, init) => {
    assert.equal(init.signal.aborted, true);
    assert.equal(init.signal.reason, reason);
    init.signal.throwIfAborted();
  });
  await assert.rejects(guarded(valid, { signal: controller.signal }), /cancelled/);
});

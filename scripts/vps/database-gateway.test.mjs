import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseGateway } from './database-gateway.mjs';
const tokens = { anon: 'public-fixture-token', service_role: 'private-fixture-token' };
const request = (path, options = {}) => new Request('https://catalog-api.example' + path, { headers: { Authorization: 'Bearer ' + tokens.service_role }, ...options });
test('rechaza credenciales ausentes, alteradas y de otro proveedor sin llamar a la base', async () => {
  let calls = 0; const handle = createDatabaseGateway({ tokens, ready: () => true, fetcher: () => { calls++; } });
  for (const value of ['', 'Bearer other-project', 'Bearer ' + tokens.service_role + 'x']) {
    assert.equal((await handle(request('/rest/v1/products', { headers: { Authorization: value } }))).status, 401);
  }
  assert.equal(calls, 0);
});
test('conserva token y método del llamador y omite cookies y cabeceras arbitrarias', async () => {
  let captured; const handle = createDatabaseGateway({ tokens, ready: () => false, fetcher: async (url, init) => {
    captured = { url, init }; return Response.json({ accepted: true }, { headers: { 'set-cookie': 'must-not-return', 'x-private': 'hidden' } });
  } });
  const response = await handle(request('/rest/v1/rpc/request_offer_refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.service_role, Cookie: 'session=private', 'Content-Type': 'application/json', 'X-Forwarded-For': 'spoofed' }, body: '{"p_targets":[]}' }));
  assert.equal(response.status, 200); assert.equal(captured.url, 'http://api:8080/rest/v1/rpc/request_offer_refresh');
  assert.equal(captured.init.headers.get('authorization'), 'Bearer ' + tokens.service_role);
  assert.equal(captured.init.headers.has('cookie'), false); assert.equal(captured.init.headers.has('x-forwarded-for'), false);
  assert.equal(captured.init.redirect, 'manual'); assert.equal(captured.init.body.toString(), '{"p_targets":[]}');
  assert.equal(response.headers.has('set-cookie'), false); assert.equal(response.headers.has('x-private'), false);
});
test('la espera de los runners no pausa solicitudes nuevas ni cambia su token por service_role', async () => {
  let key; const handle = createDatabaseGateway({ tokens, ready: () => false, fetcher: async (_, init) => { key = init.headers.get('authorization'); return Response.json([]); } });
  assert.equal((await handle(request('/__ready'))).status, 503);
  assert.equal((await handle(request('/rest/v1/products', { headers: { Authorization: 'Bearer ' + tokens.anon } }))).status, 200);
  assert.equal(key, 'Bearer ' + tokens.anon);
});
test('bloquea Auth, otros esquemas, rutas arbitrarias, redirecciones y cuerpos excesivos', async () => {
  let calls = 0; const handle = createDatabaseGateway({ tokens, ready: () => true, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://other.example' } }); } });
  for (const path of ['/auth/v1/user', '/rest/v1/auth/users', '/rest/v1/rpc/a/b', '/rest/v1/products%2fprivate']) assert.equal((await handle(request(path))).status, 404);
  assert.equal((await handle(request('/rest/v1/products', { headers: { Authorization: 'Bearer ' + tokens.service_role, 'Accept-Profile': 'auth' } }))).status, 403);
  assert.equal((await handle(request('/rest/v1/products', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.service_role, 'Content-Length': String(4 * 1024 * 1024 + 1) } }))).status, 413);
  assert.equal(calls, 0);
  assert.equal((await handle(request('/rest/v1/products'))).status, 502); assert.equal(calls, 1);
});
test('limita también los cuerpos por streaming sin Content-Length', async () => {
  const handle = createDatabaseGateway({ tokens, ready: () => true, fetcher: () => { throw Error('unexpected'); } });
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); controller.close(); } });
  assert.equal((await handle(request('/rest/v1/products', { method: 'POST', body, duplex: 'half' }))).status, 413);
});

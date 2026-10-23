import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseGateway } from './database-gateway.mjs';
const tokens = { anon: 'public-fixture-token', service_role: 'private-fixture-token' };
const request = (path, options = {}) => new Request('https://catalog-api.example' + path, { headers: { Authorization: 'Bearer ' + tokens.service_role }, ...options });
const sourcePath = target => '/__sources/katech?target=' + encodeURIComponent(target);

test('Katech exige service_role y restringe host, rutas, parámetros, método y redirects', async () => {
  let calls = 0;
  const handle = createDatabaseGateway({ tokens, ready: () => true, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1' } }); } });
  const valid = 'https://katech.com.ar/producto/ram-ddr5/';
  assert.equal((await handle(request(sourcePath(valid), { headers: { Authorization: 'Bearer ' + tokens.anon } }))).status, 403);
  assert.equal((await handle(request(sourcePath(valid), { method: 'POST' }))).status, 405);
  for (const target of ['http://katech.com.ar/producto/ram/', 'https://127.0.0.1/producto/ram/', 'https://katech.com.ar.evil.example/producto/ram/', 'https://user@katech.com.ar/producto/ram/', 'https://katech.com.ar/wp-admin/', 'https://katech.com.ar/producto/ram/?redirect=http://127.0.0.1', 'https://katech.com.ar/wp-json/wc/store/v1/products?per_page=100&page=101&_fields=id,name,permalink']) {
    assert.equal((await handle(request(sourcePath(target)))).status, 400, target);
  }
  assert.equal(calls, 0);
  assert.equal((await handle(request(sourcePath(valid)))).status, 502);
  assert.equal(calls, 1);
});
test('Katech preserva totales sin filtrar credenciales y limita concurrencia, cuerpo y frecuencia', async () => {
  let captured;
  const handle = createDatabaseGateway({ tokens, ready: () => true, fetcher: async (url, init) => {
    captured = { url, init };
    return Response.json([{ id: 1 }], { headers: { 'x-wp-total': '4035', 'x-wp-totalpages': '41', 'set-cookie': 'private' } });
  } });
  const target = 'https://katech.com.ar/wp-json/wc/store/v1/products?per_page=100&page=1&_fields=id,name,permalink';
  const response = await handle(request(sourcePath(target)));
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-wp-total'), '4035');
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal(captured.url, target); assert.equal(captured.init.headers.Authorization, undefined);
  assert.equal(captured.init.headers.Cookie, undefined);
  assert.equal((await handle(request(sourcePath(target)))).status, 429);
  const oversized = createDatabaseGateway({ tokens, ready: () => true, fetcher: async () => new Response(new Uint8Array(8_000_001)) });
  assert.equal((await oversized(request(sourcePath(target)))).status, 502);
});
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

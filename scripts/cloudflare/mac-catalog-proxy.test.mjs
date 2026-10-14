import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoutes, matchRoutes } from 'miniflare';
import { readFileSync } from 'node:fs';
import { createMacCatalogProxy, MAC_ORIGIN, LEGACY_ORIGIN, routeKind } from './mac-catalog-proxy.mjs';

const secret = 'origin-'.repeat(8), pilotSecret = 'pilot-'.repeat(8), host = 'catalog-proof.example.workers.dev';
const assets = { fetch: async () => new Response('static-from-cloudflare', { headers: { 'Cache-Control': 'public,max-age=31536000,immutable' } }) };
const production = { MAC_CATALOG_MODE: 'production', MAC_CATALOG_ENABLED: '1', MAC_ORIGIN_TOKEN: secret, ASSETS: assets };
const pilot = { MAC_CATALOG_MODE: 'pilot', MAC_ORIGIN_TOKEN: secret, MAC_CATALOG_PILOT_TOKEN: pilotSecret,
  MAC_CATALOG_PILOT_HOST: host, MAC_CATALOG_PILOT_EXPIRES_AT: '2030-01-01T00:00:00Z', ASSETS: assets };
const request = (path = '/search?q=ram', init = {}) => new Request('https://www.comparador-hardware.com.ar' + path, init);

test('sitemaps de productos llegan al mismo catálogo sin desviar el editorial', async () => {
  const paths = ['/sitemap-index.xml', '/product-sitemap/0.xml', '/product-sitemap/2'];
  const sent = [];
  const xml = '<urlset><url><loc>https://www.comparador-hardware.com.ar/product/agrupado-cpu</loc><lastmod>2026-10-13T12:00:00.000Z</lastmod></url></urlset>';
  const proxy = createMacCatalogProxy({ fetch: async req => { sent.push(req.url); return new Response(xml, { headers: { 'Content-Type': 'application/xml' } }); } });
  for (const path of paths) {
    assert.equal(routeKind(path), 'catalog');
    const response = await proxy.fetch(request(path), production);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), xml);
  }
  assert.deepEqual(sent, paths.map(path => MAC_ORIGIN + path));
  for (const path of ['/sitemap.xml', '/sitemap-index.xml/admin', '/product-sitemap/foo.xml', '/product-sitemap/-1.xml', '/product-sitemap/1.xml/admin']) {
    assert.equal(routeKind(path), null);
  }
});

test('configuración enruta índice y páginas de ambos dominios al Worker de catálogo', () => {
  const source = readFileSync(new URL('../../wrangler.mac-catalog.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const config = JSON.parse(source);
  const patterns = new Set(config.routes.map(route => route.pattern));
  for (const hostname of ['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar']) {
    assert.ok(patterns.has(hostname + '/sitemap-index.xml*'));
    assert.ok(patterns.has(hostname + '/product-sitemap/*'));
  }
});

test('ambas selecciones de portada usan Mac y mantienen la respuesta de fallo', async () => {
  const paths = ['/api/home/observed-sections', '/api/home/sections'];
  const sent = [];
  const proxy = createMacCatalogProxy({ fetch: async req => { sent.push(req.url); return new Response('{}', { status: 503 }); } });
  for (const path of paths) {
    assert.equal(routeKind(path), 'catalog');
    assert.equal((await proxy.fetch(request(path), production)).status, 503);
  }
  assert.deepEqual(sent, paths.map(path => MAC_ORIGIN + path));
  const config = JSON.parse(readFileSync(new URL('../../wrangler.mac-catalog.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  for (const host of ['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar']) {
    for (const path of paths) assert.ok(config.routes.some(route => route.pattern === host + path + '*'));
  }
  assert.equal(routeKind('/api/home/observed-sections/admin'), null);
});

test('mapa incluye sólo rutas de catálogo, suggestions y chunks; excluye portada/auth/admin/armador', () => {
  for (const path of ['/search', '/search/', '/product/cg-21565', '/comparar/procesadores', '/comparativa/comparar',
    '/api/search', '/api/search/suggestions', '/api/products', '/api/pc-builder/catalog']) assert.equal(routeKind(path), 'catalog', path);
  for (const path of ['/_next/static/chunks/30k8j4fsiq6zp.js', '/_next/static/media/font.woff2']) assert.equal(routeKind(path), 'static');
  for (const path of ['/', '/auth/login', '/api/auth/session', '/api/admin/catalog-refresh', '/guia/armar', '/guia/foo',
    '/comparativa/foo', '/api/search/refresh', '/product', '/product/id/refresh', '/_next/image', '/_next/static/chunk%2fadmin.js'])
    assert.equal(routeKind(path), null, path);
});
test('Cloudflare selecciona Mac con queries reales sin salir de su allowlist', () => {
  const config = JSON.parse(readFileSync(new URL('../../wrangler.mac-catalog.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const routes = parseRoutes(new Map([['mac', config.routes.map(route => route.pattern)]]));
  const paths = ['/guia/pc-gamer-1-millon', '/guia/pc-gamer-2-millones', '/guia/pc-gamer-3-millones',
    '/api/pc-builder/catalog', '/api/home/sections', '/api/home/observed-sections', '/sitemap-index.xml'];
  for (const host of ['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar']) {
    for (const path of paths) for (const suffix of ['', '/', '?_rsc=cut', '?slot=motherboard&budget=3000000']) {
      const url = new URL('https://' + host + path + suffix);
      assert.equal(matchRoutes(routes, url), 'mac', url.href);
      assert.equal(routeKind(url.pathname), 'catalog');
    }
    for (const path of ['/guia', '/guia/armar', '/guia/nueva', '/api/catalog/refresh'])
      assert.equal(matchRoutes(routes, new URL('https://' + host + path + '?_rsc=cut')), null);
    // Los wildcards de Cloudflare admiten sufijos; el handler rechaza esas subrutas.
    assert.equal(routeKind('/guia/pc-gamer-3-millones/admin'), null);
    assert.equal(routeKind('/api/pc-builder/catalog/admin'), null);
  }
});

test('guías editoriales y catálogo del armador leen Mac con límites de sólo lectura', async () => {
  const paths = ['/guia/pc-gamer-1-millon', '/guia/pc-gamer-2-millones', '/guia/pc-gamer-3-millones', '/api/pc-builder/catalog'];
  const sent = [];
  const proxy = createMacCatalogProxy({ fetch: async req => { sent.push(req.url); return new Response('catalog-current'); } });
  const config = JSON.parse(readFileSync(new URL('../../wrangler.mac-catalog.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  for (const path of paths) {
    assert.equal(routeKind(path), 'catalog');
    assert.equal(routeKind(path + '/'), 'catalog');
    const response = await proxy.fetch(request(path + '?_rsc=cut'), production);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await proxy.fetch(request(path, { method: 'POST' }), production)).status, 405);
    for (const host of ['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar'])
      assert.ok(config.routes.some(route => route.pattern === host + path + '*'));
  }
  assert.deepEqual(sent, paths.map(path => MAC_ORIGIN + path + '?_rsc=cut'));
  for (const path of ['/guia', '/guia/armar', '/guia/pc-gamer-3-millones/admin', '/guia/nueva', '/api/catalog/refresh', '/api/pc-builder/catalog/admin'])
    assert.equal(routeKind(path), null);
});
test('disabled, host no permitido y piloto expirado fallan sin tocar origen', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response('unexpected'); } });
  assert.equal((await proxy.fetch(request(), { ...production, MAC_CATALOG_ENABLED: '0' })).status, 503);
  assert.equal((await proxy.fetch(new Request('https://attacker.example/search'), production)).status, 503);
  assert.equal((await proxy.fetch(new Request('http://www.comparador-hardware.com.ar/search'), production)).status, 503);
  assert.equal((await proxy.fetch(new Request('https://' + host + '/search'), { ...pilot, MAC_CATALOG_PILOT_EXPIRES_AT: '2000-01-01' })).status, 503);
  assert.equal(calls, 0);
});
test('piloto requiere header secreto vigente; Authorization del usuario no sustituye transporte', async () => {
  const calls = []; const proxy = createMacCatalogProxy({ fetch: async req => { calls.push(req); return new Response('ok'); } });
  const url = 'https://' + host + '/api/search/suggestions?q=ryzen';
  assert.equal((await proxy.fetch(new Request(url, { headers: { authorization: 'Bearer ' + pilotSecret } }), pilot)).status, 401);
  assert.equal((await proxy.fetch(new Request(url, { headers: { 'x-comparador-pilot-token': pilotSecret } }), pilot)).status, 200);
  assert.equal(calls.length, 1); assert.equal(calls[0].headers.get('x-comparador-pilot-token'), null);
  assert.equal(calls[0].headers.get('x-comparador-forwarded-host'), 'www.comparador-hardware.com.ar');
});
test('host local sólo piloto; producción exige host público exacto sin puerto alternativo', async () => {
  const proxy = createMacCatalogProxy({ fetch: async () => new Response('ok') });
  const local = new Request('http://127.0.0.1:8787/search', { headers: { 'x-comparador-pilot-token': pilotSecret } });
  assert.equal((await proxy.fetch(local, pilot)).status, 200); assert.equal((await proxy.fetch(local, production)).status, 503);
  assert.equal((await proxy.fetch(new Request('https://www.comparador-hardware.com.ar:444/search'), production)).status, 503);
  assert.equal((await proxy.fetch(new Request('https://comparador-hardware.com.ar/search'), production)).status, 200);
});
test('Mac recibe cookies/auth/RSC, query exacta y headers propios sobrescritos', async () => {
  let sent;
  const proxy = createMacCatalogProxy({ fetch: async req => { sent = req; return new Response('ok'); } });
  await proxy.fetch(request('/product/cg-21565?_rsc=nonce-123', { headers: { cookie: 'sb-session=user-cookie', authorization: 'Bearer user-session',
    rsc: '1', 'next-router-state-tree': '["",{}]', 'x-comparador-origin-token': 'forged', 'x-forwarded-host': 'internal.example',
    'x-forwarded-for': '192.168.1.4', 'x-forwarded-proto': 'http', forwarded: 'host=evil', 'cf-connecting-ip': '2001:db8::1' } }), production);
  assert.equal(sent.url, MAC_ORIGIN + '/product/cg-21565?_rsc=nonce-123'); assert.equal(sent.redirect, 'manual');
  assert.equal(sent.headers.get('cookie'), 'sb-session=user-cookie'); assert.equal(sent.headers.get('authorization'), 'Bearer user-session');
  assert.equal(sent.headers.get('rsc'), '1'); assert.equal(sent.headers.get('next-router-state-tree'), '["",{}]');
  assert.equal(sent.headers.get('x-comparador-origin-token'), secret); assert.equal(sent.headers.get('x-forwarded-host'), 'www.comparador-hardware.com.ar');
  assert.equal(sent.headers.get('x-forwarded-for'), '2001:db8::1'); assert.equal(sent.headers.get('x-forwarded-proto'), 'https');
  assert.equal(sent.headers.get('forwarded'), null);
});
test('CSP nonce, Vary, Set-Cookie y ETag intactos; datos no-store', async () => {
  const upstream = new Headers({ 'Content-Type': 'text/html', 'Content-Security-Policy': "script-src 'nonce-fixed123'", Vary: 'RSC, Next-Router-State-Tree',
    ETag: '"response-123"', 'Cache-Control': 'public,s-maxage=999', 'x-comparador-origin-token': 'must-not-leak' });
  upstream.append('Set-Cookie', 'first=user; HttpOnly; Secure'); upstream.append('Set-Cookie', 'second=user; HttpOnly; Secure');
  const proxy = createMacCatalogProxy({ fetch: async () => new Response('<script nonce="fixed123">ok</script>', { headers: upstream }) });
  const result = await proxy.fetch(request(), production);
  assert.equal(result.headers.get('content-security-policy'), "script-src 'nonce-fixed123'"); assert.equal(result.headers.get('vary'), 'RSC, Next-Router-State-Tree');
  assert.equal(result.headers.get('etag'), '"response-123"'); assert.deepEqual(result.headers.getSetCookie(), upstream.getSetCookie());
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.equal(result.headers.get('x-comparador-origin-token'), null); assert.match(await result.text(), /nonce="fixed123"/);
});
test('RSC conserva streaming: primera parte llega antes de cerrar productor', async () => {
  let controller; const stream = new ReadableStream({ start(value) { controller = value; value.enqueue(new TextEncoder().encode('first\n')); } });
  const proxy = createMacCatalogProxy({ fetch: async () => new Response(stream, { headers: { 'Content-Type': 'text/x-component', Vary: 'RSC' } }) });
  const result = await proxy.fetch(request('/search?_rsc=abc', { headers: { rsc: '1' } }), production);
  const reader = result.body.getReader(), first = await reader.read(); assert.equal(new TextDecoder().decode(first.value), 'first\n');
  controller.enqueue(new TextEncoder().encode('second\n')); controller.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'second\n'); assert.equal((await reader.read()).done, true);
});
test('único fallback: ASSETS404→legacy; ambos nunca reciben cookies/Auth/secret', async () => {
  const calls = [], assetsCalls = []; const legacy = { fetch: async req => {
    calls.push(req); return new Response('legacy-chunk', {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public,max-age=31536000,immutable' } });
  } };
  const proxy = createMacCatalogProxy({ fetch: async () => { throw Error('network-fallback-forbidden'); } });
  const path = '/_next/static/chunks/30k8j4fsiq6zp.js';
  const result = await proxy.fetch(request(path, { headers: { cookie: 'user-cookie', authorization: 'Bearer user',
    'x-comparador-origin-token': 'forged', 'if-none-match': '"old"' } }), { ...production,
      ASSETS: { fetch: async req => { assetsCalls.push(req); return new Response('missing', { status: 404 }); } }, LEGACY_ASSETS: legacy });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, LEGACY_ORIGIN + path); assert.equal(assetsCalls.length, 1);
  for (const sent of [calls[0], assetsCalls[0]]) for (const key of ['cookie', 'authorization', 'x-comparador-origin-token', 'x-comparador-pilot-token'])
    assert.equal(sent.headers.get(key), null);
  assert.equal(calls[0].headers.get('if-none-match'), '"old"'); assert.equal(await result.text(), 'legacy-chunk');
  assert.match(result.headers.get('cache-control'), /immutable/);
});
test('HEAD asset404 usa legacy con HEAD; immutable sólo se conserva si declarado y exitoso', async () => {
  const calls = [];
  const legacy = { fetch: async req => {
    calls.push(req); return new Response(null, { headers: { ETag: '"legacy-head"' } });
  } };
  const proxy = createMacCatalogProxy({ fetch: async () => { throw Error('network-forbidden'); } });
  const result = await proxy.fetch(request('/_next/static/chunks/30k8j4fsiq6zp.js', { method: 'HEAD', headers: { cookie: 'do-not-forward' } }), {
    ...production, ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, LEGACY_ASSETS: legacy });
  assert.equal(calls[0].method, 'HEAD'); assert.equal(calls[0].headers.get('cookie'), null);
  assert.equal(result.headers.get('etag'), '"legacy-head"'); assert.equal(result.headers.get('cache-control'), 'no-store');
  for (const [status, cacheControl] of [[200, 'public,max-age=300'], [503, 'public,max-age=31536000,immutable']]) {
    const worker = createMacCatalogProxy({ fetch: async () => { throw Error('must-not-fetch-Mac'); } });
    const response = await worker.fetch(request('/_next/static/chunks/current.js'), { ...production,
      ASSETS: { fetch: async () => new Response('asset', { status, headers: { 'Cache-Control': cacheControl } }) } });
    assert.equal(response.headers.get('cache-control'), status === 200 ? cacheControl : 'no-store');
    assert.equal(response.headers.get('cache-control').includes('immutable'), false);
  }
});
test('headers IP falsificados/invalidos no sustituyen IP del borde', async () => {
  let sent;
  const proxy = createMacCatalogProxy({ fetch: async req => { sent = req; return new Response('ok'); } });
  await proxy.fetch(request('/search', { headers: { 'x-forwarded-for': 'spoofed', 'x-comparador-forwarded-ip': 'spoofed', 'cf-connecting-ip': '::::' } }), production);
  assert.equal(sent.headers.get('x-forwarded-for'), 'unknown'); assert.equal(sent.headers.get('x-comparador-forwarded-ip'), 'unknown');
  assert.equal(sent.headers.get('cf-connecting-ip'), null);
});
test('404 de datos, 403/503 de asset y fallas de red nunca hacen fallback', async () => {
  for (const [path, status] of [['/api/search?q=ram', 404], ['/_next/static/chunks/a.js', 403], ['/_next/static/chunks/a.js', 503]]) {
    let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response('failed', { status }); } });
    const env = path.startsWith('/_next/static/') ? { ...production, ASSETS: { fetch: async () => new Response('failed', { status }) } } : production;
    assert.equal((await proxy.fetch(request(path), env)).status, status); assert.equal(calls, path.startsWith('/_next/static/') ? 0 : 1);
  }
  let calls = 0; const failed = createMacCatalogProxy({ fetch: async () => { calls++; throw Error('origin down'); } });
  assert.equal((await failed.fetch(request(), production)).status, 503); assert.equal(calls, 1);
});
test('Mac502/504 se normaliza a503JSON sin fallback; 401/404 y statuses de assets se conservan', async () => {
  for (const status of [500, 502, 503, 504]) {
    let calls = 0, assetsCalls = 0, legacyCalls = 0, canceled = false;
    const proxy = createMacCatalogProxy({ fetch: async () => {
      calls++; return new Response(new ReadableStream({ cancel() { canceled = true; } }), { status });
    } });
    const result = await proxy.fetch(request('/api/search?q=ram'), { ...production,
      ASSETS: { fetch: async () => { assetsCalls++; return new Response('forbidden'); } },
      LEGACY_ASSETS: { fetch: async () => { legacyCalls++; return new Response('forbidden'); } } });
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: 'catalog_temporarily_unavailable' });
    assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('cloudflare-cdn-cache-control'), 'no-store');
    assert.equal(canceled, true); assert.equal(calls, 1); assert.equal(assetsCalls, 0); assert.equal(legacyCalls, 0);
  }
  for (const status of [401, 404]) {
    const proxy = createMacCatalogProxy({ fetch: async () => new Response('original', { status }) });
    const result = await proxy.fetch(request('/api/search'), production);
    assert.equal(result.status, status); assert.equal(await result.text(), 'original');
  }
  for (const status of [502, 504]) {
    const proxy = createMacCatalogProxy({ fetch: async () => { throw Error('network-forbidden'); } });
    const result = await proxy.fetch(request('/_next/static/chunks/current.js'), { ...production,
      ASSETS: { fetch: async () => new Response('asset-status', { status }) } });
    assert.equal(result.status, status); assert.equal(await result.text(), 'asset-status');
  }
});
test('assets propios y legacy funcionan con Mac caída; catálogo no usa ninguno', async () => {
  const network = [], assetRequests = [], legacyRequests = [];
  const proxy = createMacCatalogProxy({ fetch: async req => {
    network.push(req.url); assert.equal(req.url.startsWith(MAC_ORIGIN), true); throw Error('Mac offline');
  } });
  const env = { ...production, ASSETS: { fetch: async req => {
    assetRequests.push(req);
    return req.url.endsWith('/current.js') ? new Response('new-build-chunk', { headers: { 'Cache-Control': 'public,max-age=31536000,immutable' } })
      : new Response(null, { status: 404 });
  } }, LEGACY_ASSETS: { fetch: async req => { legacyRequests.push(req.url); return new Response('old-home-chunk'); } } };
  assert.equal(await (await proxy.fetch(request('/_next/static/chunks/current.js'), env)).text(), 'new-build-chunk');
  assert.equal(await (await proxy.fetch(request('/_next/static/chunks/30k8j4fsiq6zp.js'), env)).text(), 'old-home-chunk');
  assert.equal((await proxy.fetch(request('/api/search?q=ram'), env)).status, 503);
  assert.equal(assetRequests.length, 2); assert.deepEqual(network, [MAC_ORIGIN + '/api/search?q=ram']);
  assert.deepEqual(legacyRequests, [LEGACY_ORIGIN + '/_next/static/chunks/30k8j4fsiq6zp.js']);
});
test('ASSETS ausente falla cerrado en producción; ni datos ni static alcanzan Mac/legacy', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; throw Error('not-allowed'); } });
  for (const path of ['/api/search', '/_next/static/chunks/current.js'])
    assert.equal((await proxy.fetch(request(path), { ...production, ASSETS: undefined })).status, 503);
  const pilotAsset = new Request('https://' + host + '/_next/static/chunks/current.js', { headers: { 'x-comparador-pilot-token': pilotSecret } });
  assert.equal((await proxy.fetch(pilotAsset, { ...pilot, ASSETS: undefined })).status, 503); assert.equal(calls, 0);
});
test('ASSETS exception no hace fallback ni consulta Mac; errores son no-store', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response('not-allowed'); } });
  const result = await proxy.fetch(request('/_next/static/chunks/current.js'), { ...production, ASSETS: { fetch: async () => { throw Error('assets failure'); } } });
  assert.equal(result.status, 503); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(calls, 0);
});
test('LEGACY_ASSETS sólo obligatorio ante ASSETS404; ausente da503 sin routing HTTP alternativo', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; throw Error('network-forbidden'); } });
  const own = await proxy.fetch(request('/_next/static/chunks/current.js'), production);
  assert.equal(own.status, 200);
  const missing = await proxy.fetch(request('/_next/static/chunks/0scvtyfldr_kw.css'), {
    ...production, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } });
  assert.equal(missing.status, 503); assert.equal(missing.headers.get('cache-control'), 'no-store'); assert.equal(calls, 0);
  assert.equal((await missing.json()).error, 'catalog_legacy_assets_unavailable');
});
test('service binding devuelve CSS antiguo sin utilizar HTTP workers.dev ni propagar credenciales', async () => {
  let calls = 0;
  const proxy = createMacCatalogProxy({ fetch: async () => { throw Error('HTTP-workers-dev-forbidden'); } });
  const css = await proxy.fetch(request('/_next/static/chunks/0scvtyfldr_kw.css', { headers: {
    cookie: 'session', authorization: 'Bearer session', 'x-comparador-pilot-token': pilotSecret,
    'x-comparador-origin-token': secret, 'x-comparador-forwarded-host': 'internal.example', accept: 'text/css,*/*;q=0.1' } }), {
    ...production, ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, LEGACY_ASSETS: { fetch: async req => {
      calls++; assert.equal(req.url, LEGACY_ORIGIN + '/_next/static/chunks/0scvtyfldr_kw.css');
      assert.equal(req.redirect, 'manual'); assert.equal(req.headers.get('accept'), 'text/css,*/*;q=0.1');
      for (const key of ['cookie', 'authorization', 'x-comparador-origin-token', 'x-comparador-pilot-token', 'x-comparador-forwarded-host'])
        assert.equal(req.headers.get(key), null);
      return new Response('body{color:red}', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public,max-age=31536000,immutable' } });
    } } });
  assert.equal(css.status, 200); assert.equal(css.headers.get('content-type'), 'text/css'); assert.equal(await css.text(), 'body{color:red}'); assert.equal(calls, 1);
});
test('service binding de assets comparte deadline y jamás cae a HTTP si falla', async () => {
  let deadlines = 0, networks = 0;
  const proxy = createMacCatalogProxy({ timeoutMs: 1, signalFactory: ms => { deadlines++; return AbortSignal.timeout(ms); },
    fetch: async () => { networks++; return new Response('not-allowed'); } });
  const keepAlive = setTimeout(() => {}, 100);
  try {
    const result = await proxy.fetch(request('/_next/static/chunks/old.js'), { ...production,
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, LEGACY_ASSETS: { fetch: req => new Promise((_done, reject) => {
        if (req.signal.aborted) reject(Error('timeout'));
        else req.signal.addEventListener('abort', () => reject(Error('timeout')));
      }) } });
    assert.equal(result.status, 503); assert.equal(result.headers.get('cache-control'), 'no-store');
  } finally { clearTimeout(keepAlive); }
  assert.equal(deadlines, 1); assert.equal(networks, 0);
});
test('guard URL8192 del coordinador se conserva y no alcanza bindings', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response('not-allowed'); } });
  const result = await proxy.fetch(request('/search?q=' + 'x'.repeat(8192)), production);
  assert.equal(result.status, 414); assert.equal(calls, 0);
});
test('redirecciones públicas o relativas se conservan; privado/interno bloqueado sin seguir', async () => {
  for (const location of ['/auth/login', 'https://www.comparador-hardware.com.ar/search?q=ram', 'https://comparador-hardware.com.ar/search']) {
    const proxy = createMacCatalogProxy({ fetch: async () => new Response(null, { status: 307, headers: { Location: location } }) });
    const result = await proxy.fetch(request(), production); assert.equal(result.status, 307); assert.equal(result.headers.get('location'), location);
  }
  for (const location of [MAC_ORIGIN + '/search', 'http://127.0.0.1/admin', 'https://internal.example/', '//internal.example/search', 'javascript:alert(1)']) {
    let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response(null, { status: 302, headers: { Location: location } }); } });
    assert.equal((await proxy.fetch(request(), production)).status, 503); assert.equal(calls, 1);
  }
});
test('HEAD conserva headers y no cuerpo; POST y admin nunca alcanzan Mac', async () => {
  let calls = 0; const proxy = createMacCatalogProxy({ fetch: async () => { calls++; return new Response('payload', { headers: { ETag: '"tag"' } }); } });
  const result = await proxy.fetch(request('/api/products', { method: 'HEAD' }), production);
  assert.equal(result.headers.get('etag'), '"tag"'); assert.equal(await result.text(), '');
  assert.equal((await proxy.fetch(request('/api/search', { method: 'POST' }), production)).status, 405);
  assert.equal((await proxy.fetch(request('/api/admin/catalog-refresh'), production)).status, 404); assert.equal(calls, 1);
});
test('timeout compartido limita origen+fallback a15s y responde503 sin datos alternativos', async () => {
  let calls = 0, requestedTimeout;
  const proxy = createMacCatalogProxy({ timeoutMs: 1, signalFactory: milliseconds => { requestedTimeout = milliseconds; return AbortSignal.timeout(milliseconds); },
    fetch: req => new Promise((_done, reject) => { calls++; req.signal.addEventListener('abort', () => reject(Error('timed out'))); }) });
  // Mantiene vivo el proceso mientras el timeout nativo unref despierta.
  const keepAlive = setTimeout(() => {}, 100);
  try { assert.equal((await proxy.fetch(request(), production)).status, 503); } finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1); assert.equal(requestedTimeout, 1);
  assert.throws(() => createMacCatalogProxy({ timeoutMs: 15001 }), /TIMEOUT_CONFIGURATION/);
});

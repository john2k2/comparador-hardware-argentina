// Entrada HTTPS del catálogo: sólo tokens privados conocidos y PostgREST público.
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 4 * 1024 * 1024;
const requestHeaders = ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile'];
const responseHeaders = ['content-type', 'content-range', 'range-unit', 'preference-applied', 'location', 'retry-after'];
const failure = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
function equal(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string') return false;
  const first = Buffer.from(value), second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}
async function boundedBody(request) {
  if (!request.body) return undefined;
  const reader = request.body.getReader(), chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw Error('BODY_LIMIT'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

export function createDatabaseGateway({ tokens, ready, fetcher = fetch }) {
  if (!tokens?.anon || !tokens?.service_role || equal(tokens.anon, tokens.service_role)) throw Error('GATEWAY_CONFIGURATION');
  let sourceBusy = false, sourceNextAt = 0;
  return async request => {
    const authorization = request.headers.get('authorization');
    const credential = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    // La clave de servicio nunca se sustituye por la pública ni por un JWT de Auth Cloud.
    const authorized = equal(credential, tokens.service_role) || equal(credential, tokens.anon);
    if (!authorized) return failure(401, 'unauthorized');
    if (request.url.length > 32768) return failure(414, 'url_too_long');
    const url = new URL(request.url);
    if (url.pathname === '/__sources/katech') {
      if (!equal(credential, tokens.service_role)) return failure(403, 'service_required');
      if (request.method !== 'GET' || request.body) return failure(405, 'method_not_allowed');
      if (!ready()) return failure(503, 'not_ready');
      const target = katechSourceTarget(url);
      if (!target) return failure(400, 'source_target_not_allowed');
      if (sourceBusy || Date.now() < sourceNextAt) return new Response(null, { status: 429, headers: { 'Retry-After': '2', 'Cache-Control': 'no-store' } });
      sourceBusy = true;
      try {
        const response = await fetcher(target, { redirect: 'manual', signal: AbortSignal.timeout(22000),
          headers: { Accept: target.includes('/wp-json/') ? 'application/json' : 'text/html', 'User-Agent': 'Mozilla/5.0' } });
        // No seguir redirects a otros hosts ni transferir credenciales/cookies a la tienda.
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return failure(502, 'source_redirect'); }
        const body = await boundedSourceBody(response);
        const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        for (const name of ['content-type', 'x-wp-total', 'x-wp-totalpages', 'retry-after']) if (response.headers.has(name)) headers.set(name, response.headers.get(name));
        return new Response(body, { status: response.status, headers });
      } catch { return failure(502, 'source_unavailable'); }
      finally { sourceBusy = false; sourceNextAt = Date.now() + 1500; }
    }
    if (url.pathname === '/__ready') {
      if (!['GET', 'HEAD'].includes(request.method)) return failure(405, 'method_not_allowed');
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ ready: ready() }), {
        status: ready() ? 200 : 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '5' },
      });
    }
    if (!/^\/rest\/v1\/(?:[a-z][a-z0-9_]*|rpc\/[a-z][a-z0-9_]*)$/.test(url.pathname)) return failure(404, 'route_not_found');
    if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) return failure(405, 'method_not_allowed');
    if (request.headers.has('content-encoding')) return failure(415, 'encoding_not_supported');
    for (const profile of ['accept-profile', 'content-profile']) {
      if (request.headers.has(profile) && request.headers.get(profile) !== 'public') return failure(403, 'schema_not_allowed');
    }
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) return failure(413, 'body_too_large');
    try {
      const headers = new Headers({ Authorization: authorization });
      for (const name of requestHeaders) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await boundedBody(request);
      const upstream = await fetcher('http://api:8080' + url.pathname + url.search, {
        method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(25000),
      });
      // Las respuestas de PostgREST no deben redirigir al cliente ni fijar sesiones.
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return failure(502, 'unexpected_redirect'); }
      const outputHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      for (const name of responseHeaders) if (upstream.headers.has(name) && name !== 'location') outputHeaders.set(name, upstream.headers.get(name));
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: outputHeaders });
    } catch (error) {
      return failure(error?.message === 'BODY_LIMIT' ? 413 : 502, error?.message === 'BODY_LIMIT' ? 'body_too_large' : 'database_unavailable');
    }
  };
}

/** Destino fijo y rutas públicas acotadas: no es un proxy de URLs arbitrarias. */
export function katechSourceTarget(requestUrl) {
  if ([...requestUrl.searchParams.keys()].some(key => key !== 'target') || requestUrl.searchParams.getAll('target').length !== 1) return null;
  try {
    const raw = requestUrl.searchParams.get('target');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'katech.com.ar' || url.username || url.password || url.port || url.hash || raw.length > 1800) return null;
    if (url.pathname === '/wp-json/wc/store/v1/products') {
      const keys = [...url.searchParams.keys()];
      if (keys.length !== 3 || new Set(keys).size !== 3 || keys.some(key => !['page', 'per_page', '_fields'].includes(key))
        || url.searchParams.get('per_page') !== '100' || url.searchParams.get('_fields') !== 'id,name,permalink'
        || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(url.searchParams.get('page') ?? '')) return null;
    } else if (url.search || !/^\/producto\/[\p{L}\p{N}_-]{1,300}\/?$/u.test(decodeURIComponent(url.pathname))) return null;
    return url.href;
  } catch { return null; }
}
async function boundedSourceBody(response) {
  if (Number(response.headers.get('content-length')) > 8_000_000) { await response.body?.cancel(); throw Error('SOURCE_LIMIT'); }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8_000_000) throw Error('SOURCE_LIMIT');
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, bytes);
  } finally { await reader.cancel().catch(() => undefined); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = '/run/private/gateway-tokens.json', stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw Error('GATEWAY_TOKEN_PERMISSIONS');
  const handle = createDatabaseGateway({ tokens: JSON.parse(readFileSync(path, 'utf8')), ready: () => existsSync('/run/state/handoff-ready') });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request('http://gateway' + incoming.url, {
        method: incoming.method, headers: incoming.headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
      });
      const response = await handle(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
    } catch { if (!outgoing.headersSent) outgoing.writeHead(502, { 'Cache-Control': 'no-store' }); outgoing.end(); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.maxRequestsPerSocket = 100;
  server.listen(8081, '0.0.0.0', () => console.info('CATALOG_GATEWAY_READY'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref();
  });
}

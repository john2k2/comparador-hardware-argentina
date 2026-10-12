// Worker híbrido: sólo lectura del catálogo. No contiene rutas ni configuración de despliegue.
export const MAC_ORIGIN = 'https://mac-catalog-private.comparador-hardware.com.ar';
export const LEGACY_ORIGIN = 'https://comparador-hardware-argentina.ortiz-jonathan.workers.dev';
const publicHosts = new Set(['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar']);
const forwardedHost = 'www.comparador-hardware.com.ar';
const originHeader = 'x-comparador-origin-token', pilotHeader = 'x-comparador-pilot-token';
const exactRoutes = new Set(['/search', '/comparativa/comparar', '/api/search', '/api/search/suggestions', '/api/products', '/api/pc-builder/catalog']);

export function routeKind(pathname) {
  if (/%(?:2f|5c|00)/i.test(pathname) || pathname.includes('\\')) return null;
  if (/^\/_next\/static\/(?:[^/]+\/)*[^/]+$/.test(pathname)) return 'static';
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (exactRoutes.has(path) || /^\/(?:product|comparar)\/[^/]+$/.test(path)) return 'catalog';
  return null;
}
function token(value) { return typeof value === 'string' && /^[A-Za-z0-9_.=+/-]{32,512}$/.test(value); }
function equalSecret(value, expected) {
  if (typeof value !== 'string' || value.length !== expected.length) return false;
  let different = 0; for (let i = 0; i < value.length; i++) different |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}
export function allowedRequestHost(url, env) {
  if (env.MAC_CATALOG_MODE === 'production') return url.protocol === 'https:' && !url.port && publicHosts.has(url.hostname);
  if (env.MAC_CATALOG_MODE !== 'pilot') return false;
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return ['http:', 'https:'].includes(url.protocol);
  const host = env.MAC_CATALOG_PILOT_HOST;
  return typeof host === 'string' && /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(host)
    && url.protocol === 'https:' && !url.port && url.hostname === host;
}
function failure(status, code, extra = {}) {
  return new Response(JSON.stringify({ error: code }), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store', ...extra } });
}
function clientIp(request) {
  const value = request.headers.get('cf-connecting-ip');
  // El borde Cloudflare entrega CF-Connecting-IP; nunca usamos X-Forwarded-For del visitante.
  if (value && value.length <= 45) {
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every(part => Number(part) <= 255)) return value;
    if (value.includes(':') && /^[a-f0-9:]+$/i.test(value)) try { new URL('http://[' + value + ']/'); return value; } catch { /* IP inválida. */ }
  }
  return 'unknown';
}
function macHeaders(request, secret) {
  const headers = new Headers(request.headers), ip = clientIp(request);
  for (const key of ['host', 'forwarded', pilotHeader, originHeader, 'x-forwarded-host', 'x-forwarded-for',
    'x-forwarded-proto', 'x-real-ip', 'x-comparador-forwarded-host', 'x-comparador-forwarded-ip', 'x-comparador-forwarded-proto']) headers.delete(key);
  headers.set(originHeader, secret);
  headers.set('x-comparador-forwarded-host', forwardedHost);
  headers.set('x-comparador-forwarded-ip', ip); headers.set('x-comparador-forwarded-proto', 'https');
  headers.set('x-forwarded-host', forwardedHost); headers.set('x-forwarded-for', ip); headers.set('x-real-ip', ip);
  headers.set('x-forwarded-proto', 'https');
  if (ip === 'unknown') headers.delete('cf-connecting-ip'); else headers.set('cf-connecting-ip', ip);
  return headers;
}
function assetHeaders(request) {
  // Allowlist de headers de assets: jamás reenviar cookies, sesión o secretos de transporte.
  const headers = new Headers();
  for (const key of ['accept', 'accept-encoding', 'if-none-match', 'if-modified-since', 'range', 'if-range']) {
    const value = request.headers.get(key); if (value !== null) headers.set(key, value);
  }
  return headers;
}
export function allowedLocation(location) {
  try {
    if (typeof location !== 'string' || !location.trim()) return false;
    const url = new URL(location, 'https://' + forwardedHost);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && publicHosts.has(url.hostname);
  } catch { return false; }
}
function wrapResponse(upstream, kind, method) {
  const headers = new Headers(upstream.headers), location = headers.get('location');
  if (location !== null && !allowedLocation(location)) {
    void upstream.body?.cancel().catch(() => {}); return failure(503, 'catalog_redirect_unavailable');
  }
  // Secretos de transporte nunca son headers de respuesta al visitante.
  headers.delete(originHeader); headers.delete(pilotHeader);
  const cacheableStatic = kind === 'static' && [200, 206, 304].includes(upstream.status) && headers.has('cache-control');
  if (!cacheableStatic) {
    headers.set('cache-control', 'no-store'); headers.set('CDN-Cache-Control', 'no-store'); headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  }
  if (method === 'HEAD') void upstream.body?.cancel().catch(() => {});
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export function createMacCatalogProxy({ fetch: fetcher = globalThis.fetch, clock = Date.now,
  timeoutMs = 15000, signalFactory = AbortSignal.timeout } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw Error('MAC_PROXY_TIMEOUT_CONFIGURATION');
  return { async fetch(request, env) {
    if (request.url.length > 8192) return failure(414, 'catalog_url_too_long');
    const url = new URL(request.url), mode = env.MAC_CATALOG_MODE;
    if (!token(env.MAC_ORIGIN_TOKEN) || !['pilot', 'production'].includes(mode)
      || mode === 'production' && env.MAC_CATALOG_ENABLED !== '1') return failure(503, 'catalog_proxy_disabled');
    if (mode === 'production' && typeof env.ASSETS?.fetch !== 'function') return failure(503, 'catalog_assets_unavailable');
    if (!allowedRequestHost(url, env)) return failure(503, 'catalog_host_unavailable');
    if (mode === 'pilot') {
      if (!token(env.MAC_CATALOG_PILOT_TOKEN) || !Number.isFinite(Date.parse(env.MAC_CATALOG_PILOT_EXPIRES_AT))
        || Date.parse(env.MAC_CATALOG_PILOT_EXPIRES_AT) <= clock()) return failure(503, 'catalog_pilot_expired');
      if (!equalSecret(request.headers.get(pilotHeader), env.MAC_CATALOG_PILOT_TOKEN)) return failure(401, 'catalog_pilot_unauthorized');
    }
    const kind = routeKind(url.pathname);
    if (!kind) return failure(404, 'catalog_route_not_found');
    if (!['GET', 'HEAD'].includes(request.method)) return failure(405, 'catalog_method_not_allowed', { Allow: 'GET, HEAD' });
    const signal = signalFactory(timeoutMs);
    try {
      if (kind === 'static') {
        if (typeof env.ASSETS?.fetch !== 'function') return failure(503, 'catalog_assets_unavailable');
        const upstream = await env.ASSETS.fetch(new Request(request.url, { method: request.method,
          headers: assetHeaders(request), redirect: 'manual', signal }));
        if (upstream.status !== 404) return wrapResponse(upstream, kind, request.method);
        await upstream.body?.cancel();
        // Worker→Worker de la misma zona usa service binding, nunca routing HTTP workers.dev.
        if (typeof env.LEGACY_ASSETS?.fetch !== 'function') return failure(503, 'catalog_legacy_assets_unavailable');
        const fallback = await env.LEGACY_ASSETS.fetch(new Request(LEGACY_ORIGIN + url.pathname + url.search, {
          method: request.method, headers: assetHeaders(request), redirect: 'manual', signal }));
        return wrapResponse(fallback, kind, request.method);
      }
      const target = MAC_ORIGIN + url.pathname + url.search;
      const upstream = await fetcher(new Request(target, { method: request.method, headers: macHeaders(request, env.MAC_ORIGIN_TOKEN),
        redirect: 'manual', signal }), { redirect: 'manual', signal });
      if (upstream.status >= 500) {
        void upstream.body?.cancel().catch(() => {});
        return failure(503, 'catalog_temporarily_unavailable');
      }
      return wrapResponse(upstream, kind, request.method);
    } catch { return failure(503, 'catalog_temporarily_unavailable'); }
  } };
}

export default createMacCatalogProxy();

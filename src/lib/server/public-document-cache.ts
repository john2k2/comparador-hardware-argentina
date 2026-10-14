// Caché breve de documentos públicos. Conserva fechas de precios, excluye
// sesiones y regenera el nonce tanto en CSP como en HTML y datos de hidratación.
import { parseSearchState } from '@/lib/search/search-state';
import { isCategoryCanonicalLanding } from '@/lib/search/search-seo';

const PLACEHOLDER = 'COMPARADOR_DOCUMENT_NONCE';
const MAXIMUM_BYTES = 512_000;
const LIFETIME_SECONDS = 60;
type FetchHandler = (request: Request, env: DocumentCacheEnv, context: DocumentCacheContext) => Promise<Response>;
type DocumentCacheEnv = { CATALOG_SEARCH_DOCUMENT?: string; CF_VERSION_METADATA?: { id: string }; ASSETS?: { fetch(request: Request): Promise<Response> } };
type DocumentCacheContext = { waitUntil(promise: Promise<unknown>): void };
type CacheStore = Pick<Cache, 'match' | 'put'>;
// Contacto depende del correo configurado en el Worker. Un documento generado
// sin esa variable publicaba un canal deshabilitado aunque el runtime lo tuviera.
const STATIC_ROUTES = new Set(['/', '/comparativa/comparar', '/guia/armar', '/acerca', '/privacidad', '/terminos']);

function hasSearchSessionCookie(header: string | null) {
  if(header===null)return false;
  const cookies=header.split(';').map(value=>value.trim()).filter(Boolean);
  if(!cookies.length)return true;
  // GA y la comprobación de bots no cambian el documento público vacío.
  // Una sesión, una preferencia desconocida o sintaxis inválida conserva SSR.
  return cookies.some(cookie=>{
    const separator=cookie.indexOf('=');if(separator<1)return true;
    const name=cookie.slice(0,separator).trim();
    return !/^(?:_ga(?:_[A-Za-z0-9_]{1,64})?|_gid|_gat(?:_[A-Za-z0-9_]{1,64})?|cf_clearance)$/.test(name);
  });
}
function eligibleSearchDocument(request: Request, url: URL) {
  if (url.pathname !== '/search' || !['GET', 'HEAD'].includes(request.method)
    || !['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar'].includes(url.hostname)
    || hasSearchSessionCookie(request.headers.get('cookie'))
    || ['authorization', 'rsc', 'next-router-state-tree', 'next-action', 'range'].some((name) => request.headers.has(name))
    || url.searchParams.has('_rsc')) return false;
  // Conserva el SSR editorial y su metadata para las categorías canónicas.
  // Los parámetros repetidos se interpretan igual que searchParams de Next.
  const params: Record<string, string[]> = Object.create(null);
  for (const [key, value] of url.searchParams) (params[key] ??= []).push(value);
  return !isCategoryCanonicalLanding(parseSearchState(params));
}

function eligible(request: Request, allowStaticSession = false) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('authorization') || (!allowStaticSession && (request.headers.has('rsc') || request.headers.has('next-router-state-tree'))) || request.headers.has('next-action') || request.headers.has('range')) return false;
  if (!allowStaticSession && /\bsb-(?:access-token|refresh-token|[\w-]+-auth-token(?:\.\d+)?)=/.test(request.headers.get('cookie') ?? '')) return false;
  const onlyFlightMarker = request.headers.get('rsc') === '1' && [...url.searchParams.keys()].every((key) => key === '_rsc');
  if ((url.search && !(allowStaticSession && onlyFlightMarker)) || !['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar'].includes(url.hostname)) return false;
  return /^(?:\/(?:acerca|about|privacidad|terminos|contacto|guia|comparativa)?|\/(?:product|comparar|guia|comparativa)\/[a-zA-Z0-9-]{1,160})$/.test(url.pathname);
}

function defaultCache(): CacheStore | undefined {
  return (globalThis.caches as CacheStorage & { default?: Cache } | undefined)?.default;
}

export function freshDocument(html: string, source: Headers, render: string) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const headers = new Headers(source);
  const policy = headers.get('content-security-policy');
  if (!policy?.includes(`'nonce-${PLACEHOLDER}'`)) throw new Error('DOCUMENT_CACHE_INVALID_NONCE');
  headers.set('Content-Security-Policy', policy.replaceAll(PLACEHOLDER, nonce));
  headers.set('x-content-security-policy-nonce', nonce);
  // El navegador recibe siempre un nonce distinto. Sólo la caché interna
  // comparte el documento neutro; nunca se comparte una autorización.
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Comparador-Render', render);
  for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified', 'age']) headers.delete(name);
  return new Response(html.replaceAll(PLACEHOLDER, nonce), { status: 200, headers });
}

export function createPublicDocumentCache(next: FetchHandler, cacheFactory = defaultCache): FetchHandler {
  return async (request, env, context) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__public-documents/') || url.pathname.startsWith('/__public-document-cache/') || url.pathname.startsWith('/measurement-shell-build')) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
    // El shell de búsqueda no depende de la caché de documentos ni de portada.
    // Sólo contiene el estado vacío: query/filtros se restauran en el cliente.
    if (env.CATALOG_SEARCH_DOCUMENT === '1' && env.ASSETS && eligibleSearchDocument(request, url)) {
      try {
        const asset = await env.ASSETS.fetch(new Request('https://assets.local/__public-documents/search.json'));
        if (asset.ok && !asset.headers.has('set-cookie')) {
          const document = await asset.json() as { version?: number; route?: string; html?: string; headers?: Record<string, string> };
          const headers = new Headers(document.headers);
          if (document.version === 1 && document.route === '/search' && typeof document.html === 'string'
            && document.html.length <= MAXIMUM_BYTES && document.headers && !headers.has('set-cookie')
            && headers.get('content-type')?.includes('text/html')
            && !/id=["']__next_error__|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(document.html)) {
            headers.set('X-Robots-Tag', 'noindex, nofollow');
            const response = freshDocument(document.html, headers, 'static-search-document');
            return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
          }
        }
      } catch { /* Un documento ausente o inválido conserva el SSR habitual. */ }
    }
    const cache = cacheFactory();
    const version = env.CF_VERSION_METADATA?.id;
    if (!cache || !version) return next(request, env, context);
    if (STATIC_ROUTES.has(url.pathname) && env.ASSETS && eligible(request, true)) {
      // Next 16 convierte una respuesta HTML a navegación de documento completo
      // (fetch-server-response.js). También evita SSR al seguir enlaces internos;
      // no reutiliza HTML como si fuera un fragmento de React.
      try {
        const asset = await env.ASSETS.fetch(new Request(`https://assets.local/__public-documents/${url.pathname === '/' ? 'home' : url.pathname.slice(1).replaceAll('/', '-')}.json`));
        if (asset.ok) {
          const document = await asset.json() as { version?: number; route?: string; html?: string; headers?: Record<string, string> };
          if (document.version === 1 && document.route === url.pathname && typeof document.html === 'string' && document.html.length <= MAXIMUM_BYTES && document.headers) return freshDocument(document.html, new Headers(document.headers), 'static-document');
        }
      } catch { /* Sin un documento verificado se conserva el transporte normal. */ }
    }
    if (!eligible(request)) return next(request, env, context);
    const key = new Request(`${url.origin}/__public-document-cache/${encodeURIComponent(version)}${url.pathname}`);
    try {
      const cached = await cache.match(key);
      if (cached) return freshDocument(await cached.text(), cached.headers, 'document-cache');
    } catch { /* Una caída de caché conserva el transporte normal. */ }
    const response = await next(request, env, context);
    const nonce = response.headers.get('x-content-security-policy-nonce');
    if (response.status !== 200 || response.headers.has('set-cookie') || !response.headers.get('content-type')?.includes('text/html') || !nonce || !/^[a-f0-9]{32}$/.test(nonce) || !response.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`)) return response;
    const html = await response.clone().text();
    if (html.length > MAXIMUM_BYTES || /id=["']__next_error__|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(html)) return response;
    const neutral = html.replaceAll(nonce, PLACEHOLDER);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', headers.get('content-security-policy')!.replaceAll(nonce, PLACEHOLDER));
    headers.set('x-content-security-policy-nonce', PLACEHOLDER);
    headers.set('Cache-Control', `public, max-age=${LIFETIME_SECONDS}`);
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified', 'vary']) headers.delete(name);
    context.waitUntil(cache.put(key, new Response(neutral, { status: 200, headers })).catch(() => undefined));
    return freshDocument(neutral, headers, 'server');
  };
}

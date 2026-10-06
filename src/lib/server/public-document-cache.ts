// Caché breve de documentos públicos. Conserva fechas de precios, excluye
// sesiones y regenera el nonce tanto en CSP como en HTML y datos de hidratación.
const PLACEHOLDER = 'COMPARADOR_DOCUMENT_NONCE';
const MAXIMUM_BYTES = 512_000;
const LIFETIME_SECONDS = 60;
type FetchHandler = (request: Request, env: DocumentCacheEnv, context: DocumentCacheContext) => Promise<Response>;
type DocumentCacheEnv = { CF_VERSION_METADATA?: { id: string }; ASSETS?: { fetch(request: Request): Promise<Response> } };
type DocumentCacheContext = { waitUntil(promise: Promise<unknown>): void };
type CacheStore = Pick<Cache, 'match' | 'put'>;
const STATIC_ROUTES = new Set(['/', '/comparativa/comparar', '/guia/armar', '/acerca', '/contacto', '/privacidad', '/terminos']);

function eligible(request: Request, allowStaticSession = false) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('authorization') || request.headers.has('rsc') || request.headers.has('next-router-state-tree') || request.headers.has('next-action') || request.headers.has('range')) return false;
  if (!allowStaticSession && /\bsb-(?:access-token|refresh-token|[\w-]+-auth-token(?:\.\d+)?)=/.test(request.headers.get('cookie') ?? '')) return false;
  if (url.search || !['www.comparador-hardware.com.ar', 'comparador-hardware.com.ar'].includes(url.hostname)) return false;
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
    const cache = cacheFactory();
    const version = env.CF_VERSION_METADATA?.id;
    if (!cache || !version) return next(request, env, context);
    if (STATIC_ROUTES.has(url.pathname) && env.ASSETS && eligible(request, true)) {
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

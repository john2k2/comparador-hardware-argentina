import { describe, expect, it, vi } from 'vitest';
import { createPublicDocumentCache } from './public-document-cache';

const root = 'https://www.comparador-hardware.com.ar';
const nonce = 'ab'.repeat(16);
function document() {
  return new Response(`<h1>Producto público</h1><script nonce="${nonce}">self.data={nonce:"${nonce}",lastUpdated:"2026-10-05T12:00:00Z"}</script>`, {
    headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': `script-src 'self' 'nonce-${nonce}'; script-src-elem 'nonce-${nonce}'`, 'x-content-security-policy-nonce': nonce },
  });
}
function setup(response = document()) {
  const values = new Map<string, Response>();
  const cache = { match: vi.fn(async (request: Request) => values.get(request.url)?.clone()), put: vi.fn(async (request: Request, data: Response) => { values.set(request.url, data.clone()); }) };
  const next = vi.fn(async () => response.clone());
  const promises: Promise<unknown>[] = [];
  const context = { waitUntil: (promise: Promise<unknown>) => { promises.push(promise); } };
  const handler = createPublicDocumentCache(next, () => cache as unknown as Cache);
  const env = { CF_VERSION_METADATA: { id: 'version-one' } };
  return { handler, next, cache, env, context, finish: () => Promise.all(promises) };
}

describe('documentos públicos en el Worker', () => {
  it('evita volver a renderizar y renueva el nonce en la política, script y datos, conservando la fecha real', async () => {
    const s = setup();
    const request = new Request(`${root}/product/katech-api-973502`);
    const first = await s.handler(request, s.env, s.context);
    await s.finish();
    const second = await s.handler(request, s.env, s.context);
    expect(s.next).toHaveBeenCalledTimes(1);
    const firstNonce = first.headers.get('x-content-security-policy-nonce');
    const secondNonce = second.headers.get('x-content-security-policy-nonce');
    expect(firstNonce).not.toBe(secondNonce);
    expect(firstNonce).not.toBe(nonce);
    const html = await second.text();
    expect(second.headers.get('content-security-policy')).toContain(`'nonce-${secondNonce}'`);
    expect(html).toContain(`nonce="${secondNonce}"`);
    expect(html).toContain(`nonce:"${secondNonce}"`);
    expect(html).toContain('2026-10-05T12:00:00Z');
    expect(html).not.toContain(nonce);
    expect(html).not.toContain('COMPARADOR_DOCUMENT_NONCE');
    expect(second.headers.get('cache-control')).toBe('private, no-store');
    expect(s.cache.put.mock.calls[0][1].headers.get('cache-control')).toBe('public, max-age=60');
  });
  it.each(['/admin/seguimiento', '/auth', '/auth/callback', '/api/admin/measurement', '/api/auth/session', '/search?q=cpu', '/product/katech-api-973502?variant=private'])('no comparte datos de la ruta %s', async (path) => {
    const s = setup(); await s.handler(new Request(`${root}${path}`), s.env, s.context);
    expect(s.cache.match).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled(); expect(s.next).toHaveBeenCalledOnce();
  });
  it.each([{ Cookie: 'sb-access-token=private' }, { Cookie: 'sb-zyiyziubpcpgoqlkcrie-auth-token.0=private' }, { Authorization: 'Bearer private' }, { RSC: '1' }, { 'Next-Router-State-Tree': 'private' }])('no almacena peticiones privadas ni fragmentos de navegación %j', async (headers) => {
    const s = setup(); await s.handler(new Request(`${root}/`, { headers }), s.env, s.context);
    expect(s.cache.match).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled();
  });
  it('no almacena cookies ni errores o respuestas sin nonce válido', async () => {
    for (const response of [new Response('error', { status: 503 }), new Response('html', { headers: { 'Content-Type': 'text/html' } }), new Response('private', { headers: { ...Object.fromEntries(document().headers), 'Set-Cookie': 'session=private' } })]) {
      const s = setup(response); await s.handler(new Request(`${root}/`), s.env, s.context); expect(s.cache.put).not.toHaveBeenCalled();
    }
  });
  it('un despliegue nuevo no reutiliza HTML ni scripts de otra versión', async () => {
    const s = setup(); await s.handler(new Request(`${root}/`), s.env, s.context); await s.finish();
    await s.handler(new Request(`${root}/`), { CF_VERSION_METADATA: { id: 'version-two' } }, s.context);
    expect(s.next).toHaveBeenCalledTimes(2);
  });
  it('sirve el documento fijo validado sin entrar a Next y bloquea el archivo interno', async () => {
    const s = setup();
    const source = document();
    const html = (await source.text()).replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE');
    const headers = Object.fromEntries([...source.headers].map(([name, value]) => [name, value.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE')]));
    const env = { ...s.env, ASSETS: { fetch: vi.fn(async () => Response.json({ version: 1, route: '/comparativa/comparar', html, headers })) } };
    const response = await s.handler(new Request(`${root}/comparativa/comparar`), env, s.context);
    expect(s.next).not.toHaveBeenCalled(); expect(response.headers.get('x-comparador-render')).toBe('static-document');
    expect(await response.text()).not.toContain('COMPARADOR_DOCUMENT_NONCE');
    expect((await s.handler(new Request(`${root}/__public-documents/privacidad.json`), env, s.context)).status).toBe(404);
  });

  it('contacto usa el correo del runtime tanto en URL limpia como con parámetros o navegación interna', async () => {
    const runtime = document();
    const html = `${await runtime.text()}<a href="mailto:contacto@example.test">Contacto</a>`;
    const s = setup(new Response(html, { headers: runtime.headers }));
    const assets = vi.fn(async () => Response.json({ version: 1, route: '/contacto', html: 'Canal pendiente de configuración' }));
    const env = { ...s.env, ASSETS: { fetch: assets } };
    for (const request of [new Request(`${root}/contacto`), new Request(`${root}/contacto?intent=pc_advisory`),
      new Request(`${root}/contacto?_rsc=navigation`, { headers: { RSC: '1' } })]) {
      const response = await s.handler(request, env, s.context);
      expect(await response.text()).toContain('mailto:contacto@example.test');
      expect(response.headers.get('x-comparador-render')).not.toBe('static-document');
    }
    expect(assets).not.toHaveBeenCalled();
    await s.finish();
    const cached = await s.handler(new Request(`${root}/contacto`), env, s.context);
    expect(cached.headers.get('x-comparador-render')).toBe('document-cache');
    expect(await cached.text()).toContain('mailto:contacto@example.test');
  });

  it('la portada fija sin datos personales funciona con sesión, pero su fallback nunca comparte el documento de una cuenta', async () => {
    const s = setup(); const source = document();
    const html = (await source.text()).replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE');
    const headers = Object.fromEntries([...source.headers].map(([key, value]) => [key, value.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE')]));
    const assets = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json({ version: 1, route: '/', html, headers }));
    const req = new Request(`${root}/`, { headers: { Cookie: 'sb-access-token=private' } });
    const response = await s.handler(req, { ...s.env, ASSETS: { fetch: assets } }, s.context);
    expect(response.headers.get('x-comparador-render')).toBe('static-document');
    expect(assets.mock.calls[0][0].url).toBe('https://assets.local/__public-documents/home.json');
    expect(s.next).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled();
    await s.handler(req, { ...s.env, ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.cache.match).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled();
  });
  it('seguir un enlace a una página fija entrega HTML completo sin SSR ni caché de fragmentos', async () => {
    const s = setup(); const source = document();
    const html = (await source.text()).replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE');
    const headers = Object.fromEntries([...source.headers].map(([key, value]) => [key, value.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE')]));
    const env = { ...s.env, ASSETS: { fetch: async () => Response.json({ version: 1, route: '/', html, headers }) } };
    const request = new Request(`${root}/?_rsc=navigation`, { headers: { RSC: '1', 'Next-Router-State-Tree': 'state', Cookie: 'sb-access-token=private' } });
    const response = await s.handler(request, env, s.context);
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('text/html');
    expect(response.headers.get('x-comparador-render')).toBe('static-document');
    expect(s.next).not.toHaveBeenCalled(); expect(s.cache.match).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled();
    await s.handler(new Request(`${root}/?q=user-input&_rsc=navigation`, { headers: request.headers }), env, s.context);
    expect(s.next).toHaveBeenCalledOnce();
  });
});

describe('shell opt-in de búsqueda', () => {
  async function setupSearch() {
    const s = setup();
    const source = document();
    const html = (await source.text()).replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE');
    const headers = Object.fromEntries([...source.headers].map(([key, value]) => [key, value.replaceAll(nonce, 'COMPARADOR_DOCUMENT_NONCE')]));
    const payload = { version: 1, route: '/search', html, headers };
    const assets = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json(payload));
    const env = { CATALOG_SEARCH_DOCUMENT: '1', ASSETS: { fetch: assets } };
    return { ...s, env, assets, payload };
  }

  it.each(['/search', '/search?q=Ryzen&stores=compragamer&sortBy=price-asc&page=2', '/search?category=memoria-ram&q=DDR4', '/search?category=memoria-ram&minPrice=0', '/search?__proto__=ignored&q=DDR4'])('sirve %s sin Next, cache API ni metadata de versión', async (route) => {
    const s = await setupSearch();
    const response = await s.handler(new Request(`${root}${route}`), s.env, s.context);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-comparador-render')).toBe('static-search-document');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(s.assets.mock.calls[0][0].url).toBe('https://assets.local/__public-documents/search.json');
    expect(s.next).not.toHaveBeenCalled();
    expect(s.cache.match).not.toHaveBeenCalled();
    expect(s.cache.put).not.toHaveBeenCalled();
  });

  it('GET y HEAD reciben nonce nuevo y HEAD no contiene body', async () => {
    const s = await setupSearch();
    const get = await s.handler(new Request(`${root}/search?q=DDR4`), s.env, s.context);
    const head = await s.handler(new Request(`${root}/search?q=DDR4`, { method: 'HEAD' }), s.env, s.context);
    const getNonce = get.headers.get('x-content-security-policy-nonce');
    const headNonce = head.headers.get('x-content-security-policy-nonce');
    expect(getNonce).not.toBe(headNonce);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-security-policy')).toContain(`'nonce-${headNonce}'`);
    expect(head.headers.get('cache-control')).toBe('private, no-store');
    const html = await get.text();
    expect(html).toContain(`nonce="${getNonce}"`);
    expect(html).toContain('2026-10-05T12:00:00Z');
    expect(html).not.toContain('COMPARADOR_DOCUMENT_NONCE');
  });

  it.each([undefined, '0', 'true'])('el flag %s conserva Next', async (flag) => {
    const s = await setupSearch();
    await s.handler(new Request(`${root}/search?q=DDR4`), { ...s.env, CATALOG_SEARCH_DOCUMENT: flag }, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.assets).not.toHaveBeenCalled();
  });

  it.each(['/search?category=memoria-ram', '/search?category=memoria-ram&page=2', '/search?category=memoria-ram&q=', '/search?category=memoria-ram&minPrice=bad', '/search?category=memoria-ram&category=procesadores', '/comparar/memoria-ram', '/search?_rsc=ignored&q=DDR4'])('mantiene SSR/Flight de %s', async (route) => {
    const s = await setupSearch();
    await s.handler(new Request(`${root}${route}`), s.env, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.assets).not.toHaveBeenCalled();
  });

  it.each([{ Cookie: 'sb-access-token=private' }, { Cookie: 'consent=accepted' }, { Cookie: '' }, { Authorization: 'Bearer private' }, { RSC: '1' }, { 'Next-Router-State-Tree': 'state' }, { 'Next-Action': 'action' }, { Range: 'bytes=0-20' }])('no intercepta contexto %j', async (headers) => {
    const s = await setupSearch();
    await s.handler(new Request(`${root}/search?q=DDR4`, { headers }), s.env, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.assets).not.toHaveBeenCalled();
  });

  it.each(['_ga=GA1.2.public; _ga_ABC123=GS1.1.public', 'cf_clearance=opaque; _gid=public'])('conserva shell vacío con cookies sin contexto de cuenta %s',async(cookie)=>{
    const s=await setupSearch();const response=await s.handler(new Request(`${root}/search?q=DDR4`,{headers:{Cookie:cookie}}),s.env,s.context);
    expect(response.headers.get('x-comparador-render')).toBe('static-search-document');expect(s.next).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(cookie);
  });
  it.each(['_ga=x; sb-example-auth-token=private','_ga=x; comparador_admin_session=private','_ga=x; unknown=private','_ga','_ga=x; invalid'])('delega cookies de sesión, desconocidas o inválidas %s',async(cookie)=>{
    const s=await setupSearch();await s.handler(new Request(`${root}/search?q=DDR4`,{headers:{Cookie:cookie}}),s.env,s.context);
    expect(s.next).toHaveBeenCalledOnce();expect(s.assets).not.toHaveBeenCalled();
  });
  it.each(['POST', 'OPTIONS'])('no intercepta método %s', async (method) => {
    const s = await setupSearch(); await s.handler(new Request(`${root}/search?q=DDR4`, { method }), s.env, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.assets).not.toHaveBeenCalled();
  });

  it('no intercepta host ajeno ni devuelve un archivo interno', async () => {
    const s = await setupSearch();
    await s.handler(new Request('https://otro.example/search?q=DDR4'), s.env, s.context);
    expect(s.next).toHaveBeenCalledOnce(); expect(s.assets).not.toHaveBeenCalled();
    const response = await s.handler(new Request(`${root}/__public-documents/search.json`), s.env, s.context);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('un archivo ausente, inválido, personal o de otra ruta vuelve a Next', async () => {
    const s = await setupSearch();
    const badPayloads = [
      { ...s.payload, version: 2 }, { ...s.payload, route: '/' },
      { ...s.payload, html: 'x'.repeat(512_001) }, { ...s.payload, html: '<div id="__next_error__">error</div>' },
      { ...s.payload, headers: { ...s.payload.headers, 'set-cookie': 'session=private' } },
      { ...s.payload, headers: { ...s.payload.headers, 'content-type': 'application/json' } },
      { ...s.payload, headers: { ...s.payload.headers, 'content-security-policy': "script-src 'self'" } },
    ];
    const responses = [new Response('missing', { status: 404 }), new Response('invalid json'), Response.json(s.payload, { headers: { 'Set-Cookie': 'session=private' } }), ...badPayloads.map((payload) => Response.json(payload))];
    for (const response of responses) {
      const assets = vi.fn(async () => response.clone());
      await s.handler(new Request(`${root}/search?q=DDR4`), { ...s.env, ASSETS: { fetch: assets } }, s.context);
    }
    await s.handler(new Request(`${root}/search?q=DDR4`), { ...s.env, ASSETS: { fetch: async () => { throw new Error('unavailable'); } } }, s.context);
    expect(s.next).toHaveBeenCalledTimes(responses.length + 1);
    expect(s.cache.match).not.toHaveBeenCalled(); expect(s.cache.put).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createScanGuard, isUnambiguousScanPath } from './scan-guard';

const rejectedPaths = [
  '/.env', '/internal/.env', '/client/.env', '/app/.env.production',
  '/.env.local', '/.env.production.local', '/.env.backup', '/INTERNAL/.ENV',
  '/internal/.env/', '/internal//.env', '/internal/%2eenv', '/internal/.%65nv',
  '/internal%2f.env', '/phpinfo.php', '/mail/phpinfo.php', '/preview/PHPINFO.PHP/',
  '/info.php', '/@fs/app/.env.production', '/%40fs/home/ubuntu/.aws/credentials',
  '/@fs/home/ubuntu/.aws%2fcredentials',
];

const validPaths = [
  '/', '/search', '/comparar/procesadores', '/comparativa/rtx-4060-vs-rx-7600',
  '/guia', '/product/ryzen-5600', '/api/search', '/api/products', '/api/auth/session',
  '/api/admin/operational', '/auth/callback', '/login', '/favorites',
  '/_next/static/chunks/app.js', '/_next/image', '/favicon.svg', '/sprites/pixel-art.svg',
  '/robots.txt', '/sitemap.xml', '/.well-known/security.txt', '/.env.example',
  '/.environment', '/.env.svg', '/guides/.env/icon.svg', '/docs/phpinfo.php.txt',
  '/docs/info.php', '/@fs/app/readme.md', '/docs/.aws/credentials', '/swagger.json',
  '/api/system/fileView', '/internal/%252eenv', '/internal/%broken',
];

describe('rutas inequívocas de escaneo', () => {
  it.each(rejectedPaths)('reconoce %s', (pathname) => {
    expect(isUnambiguousScanPath(pathname)).toBe(true);
  });

  it.each(validPaths)('conserva %s', (pathname) => {
    expect(isUnambiguousScanPath(pathname)).toBe(false);
  });
});

describe('respuesta antes de OpenNext', () => {
  it.each(rejectedPaths)('responde a %s sin invocar OpenNext', async (pathname) => {
    const delegate = vi.fn(() => new Response('original'));
    const response = await createScanGuard(delegate)(new Request(`https://example.com${pathname}`), {}, {});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
    expect(delegate).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('responde a HEAD sin cuerpo ni delegación', async () => {
    const delegate = vi.fn(() => new Response('original'));
    const response = await createScanGuard(delegate)(new Request('https://example.com/.env', { method: 'HEAD' }), {}, {});
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
    expect(delegate).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'])('conserva peticiones %s válidas', async (method) => {
    const request = new Request('https://example.com/api/auth/session?q=/internal/.env', {
      method,
      headers: { Cookie: 'diagnostic=fixture', Authorization: 'Bearer fixture', 'X-Custom': 'same' },
      ...(method !== 'GET' && method !== 'HEAD' ? { body: 'body unchanged' } : {}),
    });
    const env = { ASSETS: {} };
    const context = { waitUntil: vi.fn() };
    const originalResponse = new Response('original', {
      status: 201,
      headers: { 'Set-Cookie': 'diagnostic=fixture; HttpOnly', 'Cache-Control': 'private', 'Content-Security-Policy': "script-src 'nonce-original'" },
    });
    const delegate = vi.fn(() => originalResponse);
    const response = await createScanGuard(delegate)(request, env, context);
    expect(delegate).toHaveBeenCalledExactlyOnceWith(request, env, context);
    expect(response).toBe(originalResponse);
    expect(request.bodyUsed).toBe(false);
    expect(response.headers.get('Set-Cookie')).toBe('diagnostic=fixture; HttpOnly');
    expect(response.headers.get('Cache-Control')).toBe('private');
    expect(response.headers.get('Content-Security-Policy')).toBe("script-src 'nonce-original'");
  });

  it.each(validPaths)('delega %s sin cambiar request ni response', async (pathname) => {
    const request = new Request(`https://example.com${pathname}?q=.env&file=/app/.env`);
    const originalResponse = new Response('unchanged');
    const delegate = vi.fn(async () => originalResponse);
    const response = await createScanGuard(delegate)(request, {}, {});
    expect(delegate.mock.calls[0][0]).toBe(request);
    expect(response).toBe(originalResponse);
  });

  it('normaliza segmentos de URL sin interpretar la consulta', async () => {
    const delegate = vi.fn(() => new Response('original'));
    const response = await createScanGuard(delegate)(new Request('https://example.com/app/../internal/.env?x=1'), {}, {});
    expect(response.status).toBe(404);
    expect(delegate).not.toHaveBeenCalled();
  });

  it('conserva los errores del handler original', async () => {
    const error = new Error('original failure');
    const delegate = vi.fn(async () => { throw error; });
    await expect(createScanGuard(delegate)(new Request('https://example.com/api/search?q=ryzen'), {}, {})).rejects.toBe(error);
  });
});

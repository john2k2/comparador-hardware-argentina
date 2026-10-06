import { describe, expect, it, vi } from 'vitest';
import { handleMeasurementEdgeRead } from './edge-read';

const root = 'https://www.comparador-hardware.com.ar';
const env = { MEASUREMENT_COLLECTION_MODE: 'external', SUPABASE_URL: 'https://zyiyziubpcpgoqlkcrie.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-fixture', SUPABASE_SECRET_KEY: 'server-fixture', MEASUREMENT_GOOGLE_CLIENT_TYPE: 'installed' };
const reading = { version: 1, provider: 'cloudflare', origin: 'api', collectedAt: '2026-10-06T00:00:00Z', period: { start: '2026-10-05', end: '2026-10-05', timeZone: 'UTC' }, metrics: { requests: 100, resourceErrors: 2 }, notes: [] };
const view = { demo: false, readings: [reading], history: [reading], connections: [{ id: 'cloudflare', state: 'connected', checkedAt: '2026-10-06T00:00:00Z', issue: null }], privateCredential: 'never-return' };
function request(path = '/api/admin/measurement', headers: Record<string, string> = { Cookie: 'sb-access-token=admin-fixture' }) { return new Request(`${root}${path}`, { headers }); }

describe('lectura ligera con autorización vigente', () => {
  it('sin sesión no consulta la base ni sirve el documento administrativo', async () => {
    const fetcher = vi.fn(); const assets = { fetch: vi.fn() };
    expect((await handleMeasurementEdgeRead(request('/api/admin/measurement', {}), { ...env, ASSETS: assets }, fetcher))?.status).toBe(401);
    const denied = await handleMeasurementEdgeRead(request('/admin/seguimiento', {}), { ...env, ASSETS: assets }, fetcher);
    expect(denied?.status).toBe(307); expect(denied?.headers.get('location')).toBe('/auth?next=%2Fadmin%2Fseguimiento');
    expect(fetcher).not.toHaveBeenCalled(); expect(assets.fetch).not.toHaveBeenCalled();
  });
  it.each([{ id: 'user', app_metadata: { role: 'user' }, user_metadata: { role: 'admin', is_admin: true } }, { id: 'user', app_metadata: { is_admin: 'true' } }, { id: 'user', app_metadata: {} }])('no permite atribuirse administrador mediante metadatos de usuario %j', async (user) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(user));
    expect((await handleMeasurementEdgeRead(request(), env, fetcher))?.status).toBe(401);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('una sesión revocada y una falla de Auth cierran el acceso sin revelar datos', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private-error', { status: 401 }));
    expect((await handleMeasurementEdgeRead(request(), env, fetcher))?.status).toBe(401);
    fetcher.mockResolvedValue(new Response('private-error', { status: 500 }));
    const response = await handleMeasurementEdgeRead(request(), env, fetcher);
    expect(response?.status).toBe(503); expect(await response?.text()).not.toContain('private-error');
  });
  it('valida con Auth antes de leer, conserva origen y fechas y omite credenciales y scopes de autorizaciones', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'admin', app_metadata: { role: 'admin' } })).mockResolvedValueOnce(Response.json([
      { payload: { kind: 'dashboard-view', dashboard: view } },
      { payload: { kind: 'decision', id: 'stability', status: 'in_progress', updatedAt: '2026-10-06T01:00:00Z' } },
      { payload: { kind: 'connection', id: 'cloudflare', state: 'error', checkedAt: '2026-10-06T01:00:00Z', issue: 'Se conserva la lectura anterior.' } },
    ]));
    const response = await handleMeasurementEdgeRead(request(), env, fetcher);
    expect(response?.status).toBe(200); expect(response?.headers.get('cache-control')).toBe('private, no-store');
    const data = await response?.json();
    expect(data.readings[0]).toEqual({ ...reading, collectedAt: new Date(reading.collectedAt).toISOString() }); expect(data.connections.find((item: { id: string }) => item.id === 'cloudflare').state).toBe('error');
    expect(data.decisions[0].status).toBe('in_progress'); expect(JSON.stringify(data)).not.toContain('never-return'); expect(JSON.stringify(data)).not.toContain('server-fixture');
    expect(String(fetcher.mock.calls[0][0]).endsWith('/auth/v1/user')).toBe(true);
    expect(String(fetcher.mock.calls[1][0])).not.toContain('credentials');
  });
  it('no sirve datos demo ni convierte un resumen ausente en un panel de ceros', async () => {
    for (const rows of [[], [{ payload: { kind: 'dashboard-view', dashboard: { ...view, demo: true } } }]]) {
      const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'admin', app_metadata: { is_admin: true } })).mockResolvedValueOnce(Response.json(rows));
      expect((await handleMeasurementEdgeRead(request(), env, fetcher))?.status).toBe(503);
    }
  });
  it('no sigue redirecciones de Auth ni de la base hacia otro destino', async () => {
    const redirect = () => new Response(null, { status: 302, headers: { Location: 'https://other.example' } });
    const fetcher = vi.fn().mockResolvedValue(redirect());
    expect((await handleMeasurementEdgeRead(request(), env, fetcher))?.status).toBe(503);
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
    fetcher.mockReset().mockResolvedValueOnce(Response.json({ id: 'admin', app_metadata: { role: 'admin' } })).mockResolvedValueOnce(redirect());
    expect((await handleMeasurementEdgeRead(request(), env, fetcher))?.status).toBe(503);
    expect(fetcher.mock.calls[1][1].redirect).toBe('manual');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('las escrituras y fragmentos conservan las validaciones de Next', async () => {
    const fetcher = vi.fn();
    expect(await handleMeasurementEdgeRead(new Request(`${root}/api/admin/measurement`, { method: 'POST' }), env, fetcher)).toBeNull();
    expect(await handleMeasurementEdgeRead(request('/admin/seguimiento', { RSC: '1' }), env, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sirve el documento vacío sólo después de validar admin, con nonce nuevo y sin caché pública', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ id: 'admin', app_metadata: { is_admin: true } }));
    const assets = { fetch: vi.fn().mockImplementation(async () => {
      expect(fetcher).toHaveBeenCalled();
      return Response.json({ version: 1, route: '/measurement-shell-build', headers: { 'content-type': 'text/html', 'content-security-policy': "script-src 'nonce-COMPARADOR_DOCUMENT_NONCE'" }, html: '<script nonce="COMPARADOR_DOCUMENT_NONCE">/* sin cuentas */</script>' });
    }) };
    const first = await handleMeasurementEdgeRead(request('/admin/seguimiento'), { ...env, ASSETS: assets }, fetcher);
    const second = await handleMeasurementEdgeRead(request('/admin/seguimiento'), { ...env, ASSETS: assets }, fetcher);
    expect(first?.status).toBe(200); expect(first?.headers.get('cache-control')).toBe('private, no-store');
    const nonce = first?.headers.get('x-content-security-policy-nonce');
    expect(nonce).not.toBe(second?.headers.get('x-content-security-policy-nonce'));
    expect(first?.headers.get('content-security-policy')).toContain(`nonce-${nonce}`);
    expect(await first?.text()).toContain(`nonce="${nonce}"`);
  });
});

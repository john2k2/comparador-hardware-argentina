import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocked = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/admin-auth', () => ({ resolveAdminAccessFromToken: mocked.auth }));
vi.mock('./service', () => ({ getMeasurementDashboard: mocked.read, executeMeasurementCommand: mocked.write }));
import { handleMeasurementGet, handleMeasurementPost } from './route-handler';

const url = 'http://localhost:3122/api/admin/measurement';
function post(body: unknown, origin = 'http://localhost:3122', contentType = 'application/json') {
  return new NextRequest(url, { method: 'POST', headers: { origin, 'content-type': contentType, cookie: 'sb-access-token=admin-fixture' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
describe('frontera privada de seguimiento', () => {
  beforeEach(() => {
    mocked.auth.mockReset().mockResolvedValue({ id: 'admin-fixture' }); mocked.read.mockReset().mockResolvedValue({ readings: [] }); mocked.write.mockReset().mockResolvedValue({ dashboard: {}, message: 'Guardado' });
  });
  it('no devuelve datos ni consulta fuentes a quien no es administrador', async () => {
    mocked.auth.mockResolvedValue(null);
    expect((await handleMeasurementGet(new NextRequest(url))).status).toBe(401);
    expect((await handleMeasurementPost(post({ action: 'sync', provider: 'all' }))).status).toBe(401);
    expect(mocked.read).not.toHaveBeenCalled(); expect(mocked.write).not.toHaveBeenCalled();
  });
  it('las respuestas privadas no se pueden guardar en cachés compartidas', async () => {
    const response = await handleMeasurementGet(new NextRequest(url));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
  it('valida el host visible cuando Next usa una URL interna distinta', async () => {
    const request = new NextRequest(url, { method: 'POST', headers: { host: '127.0.0.1:3122', origin: 'http://127.0.0.1:3122', 'content-type': 'application/json', cookie: 'sb-access-token=admin-fixture' }, body: JSON.stringify({ action: 'decision', id: 'catalog', status: 'done' }) });
    expect((await handleMeasurementPost(request)).status).toBe(200);
  });
  it.each(['https://malicious.example', '', 'http://localhost:3123'])('rechaza una escritura desde otro origen %s', async (origin) => {
    expect((await handleMeasurementPost(post({ action: 'decision', id: 'catalog', status: 'done' }, origin))).status).toBe(403);
    expect(mocked.write).not.toHaveBeenCalled();
  });
  it('rechaza archivos demasiado grandes, campos de credenciales y formatos incorrectos', async () => {
    expect((await handleMeasurementPost(post({ action: 'sync', provider: 'ga4', secret: 'private' }))).status).toBe(400);
    expect((await handleMeasurementPost(post(' '.repeat(65537)))).status).toBe(400);
    const wrongFormat = await handleMeasurementPost(post('{}', 'http://localhost:3122', 'text/plain'));
    expect(wrongFormat.status).toBe(415);
    expect(mocked.write).not.toHaveBeenCalled();
  });
  it('una falla al guardar produce un error visible, sin fingir éxito', async () => {
    mocked.write.mockRejectedValue(new Error('private diagnostic'));
    const response = await handleMeasurementPost(post({ action: 'decision', id: 'catalog', status: 'done' }));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private diagnostic');
  });
});

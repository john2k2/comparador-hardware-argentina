import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), state: vi.fn(), read: vi.fn(), dashboard: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/admin-auth', () => ({ resolveAdminAccessFromToken: mocks.auth }));
vi.mock('./credentials', () => ({ saveCredential: mocks.save }));
vi.mock('./store', () => ({ saveMeasurements: mocks.state }));
vi.mock('./service', () => ({ executeMeasurementCommand: mocks.read, getMeasurementDashboard: mocks.dashboard }));
import { CollectionRequestError } from './collection';
import { handleConnectionPost } from './connection-handler';
const origin = 'http://localhost:3122';
const post = (body: unknown, from = origin) => new NextRequest(`${origin}/api/admin/measurement/connections`, { method: 'POST', headers: { cookie: 'sb-access-token=admin-test', origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const connection = { provider: 'cloudflare', accountId: 'a'.repeat(32), worker: 'comparador-hardware-argentina', token: 'private-token-test' };

describe('configuración privada de las conexiones', () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ id: 'admin-test' }); mocks.save.mockReset().mockResolvedValue(undefined); mocks.state.mockReset().mockResolvedValue(undefined); mocks.read.mockReset().mockResolvedValue({ dashboard: { connections: [{ id: 'cloudflare', state: 'connected' }] }, message: '1 lectura actualizada y guardada.' });
  });
  it('sin administrador o desde otro origen no guarda ni prueba credenciales', async () => {
    expect((await handleConnectionPost(post(connection, 'https://other.example'))).status).toBe(403);
    mocks.auth.mockResolvedValue(null);
    expect((await handleConnectionPost(post(connection))).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ ...connection, accountId: 'invalid' }, { ...connection, worker: '../other' }, { ...connection, url: 'https://other.example' }, { provider: 'database', token: 'private', projectId: 'otherproject' }, { ...connection, token: 'a'.repeat(17000) }])('rechaza un destino, secreto o tamaño fuera del contrato: %j', async (value) => {
    expect((await handleConnectionPost(post(value))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('una conexión nueva se verifica con la API antes de indicar lectura guardada', async () => {
    const response = await handleConnectionPost(post(connection));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('cloudflare', { token: connection.token, accountId: connection.accountId, worker: connection.worker });
    expect(mocks.state).toHaveBeenCalledWith([], [expect.objectContaining({ id: 'cloudflare', state: 'ready' })]);
    expect(mocks.read).toHaveBeenCalledWith({ action: 'sync', provider: 'cloudflare' });
    expect(JSON.stringify(await response.json())).not.toContain(connection.token);
  });
  it('si falla el guardado no consulta fuentes ni devuelve diagnósticos con secretos', async () => {
    mocks.save.mockRejectedValue(new Error('private-token-test'));
    const response = await handleConnectionPost(post(connection));
    expect(response.status).toBe(503); expect(mocks.read).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(connection.token);
  });
  it('si el despacho está limitado informa la autorización guardada y la verificación pendiente', async () => {
    mocks.read.mockRejectedValue(new CollectionRequestError('Esperá cinco minutos.', 429));
    mocks.dashboard.mockResolvedValue({ connections: [{ id: 'cloudflare', state: 'ready' }] });
    const response = await handleConnectionPost(post(connection));
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.message).toContain('Autorización guardada'); expect(data.message).toContain('todavía no está verificada');
    expect(data.dashboard.connections[0].state).toBe('ready');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const gate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => ({ rpc: () => ({ abortSignal: gate }) }) }));
import { requestMeasurementCollection } from './collection';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('consulta externa con límite compartido', () => {
  it('solicita sólo el workflow y la rama autorizados sin divulgar la credencial', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'private-token');
    gate.mockResolvedValue({ data: { allowed: true }, error: null });
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetcher);
    const message = await requestMeasurementCollection('ga4');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/john2k2/comparador-hardware-argentina/actions/workflows/measurement-snapshot.yml/dispatches');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ref: 'main', inputs: { provider: 'ga4' } });
    expect(message).toContain('solicitada'); expect(message).not.toContain('private-token');
  });
  it('un límite compartido o una lectura fallida impiden despachar', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'private-token'); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    gate.mockResolvedValue({ data: { allowed: false }, error: null }); await expect(requestMeasurementCollection('all')).rejects.toMatchObject({ status: 429 });
    gate.mockResolvedValue({ data: null, error: {} }); await expect(requestMeasurementCollection('all')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('no afirma actualización de cifras por un rechazo del despachador', async () => {
    vi.stubEnv('GITHUB_ACTIONS_DISPATCH_TOKEN', 'private-token'); gate.mockResolvedValue({ data: { allowed: true }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private diagnostic', { status: 403 })));
    await expect(requestMeasurementCollection('all')).rejects.toThrow('no confirmó');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), save: vi.fn(), measurements: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/admin-auth', () => ({ resolveAdminAccessFromToken: mocks.admin }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: () => null }));
vi.mock('./credentials', async (original) => ({ ...await original<typeof import('./credentials')>(), saveCredential: mocks.save, loadConnectionSecrets: async () => ({ google: null, cloudflare: null, database: null, ads: null }) }));
vi.mock('./store', async (original) => ({ ...await original<typeof import('./store')>(), saveMeasurements: mocks.measurements }));
import { handleGoogleCallback, handleGoogleStart } from './google-oauth';
import { GOOGLE_SCOPES, openPrivateValue, sealPrivateValue } from './credentials';

const origin = 'http://localhost:3122';
const callback = `${origin}/api/admin/measurement/google/callback`;
const start = (source = 'ga4', from = origin) => new NextRequest(`${origin}/api/admin/measurement/google/start`, { method: 'POST', headers: { origin: from, 'content-type': 'application/json', cookie: 'sb-access-token=admin-test' }, body: JSON.stringify({ provider: source }) });
async function callbackRequest(changes: Record<string, unknown> = {}) {
  const state = await sealPrivateValue({ state: 'test-nonce', verifier: 'test-verifier', adminId: 'admin-test', expires: Date.now() + 300000, clientId: 'test-client', redirectUri: callback, provider: 'ga4', requestedScopes: ['https://www.googleapis.com/auth/analytics.readonly'], ...changes }, 'google-oauth-state');
  return new NextRequest(`${callback}?state=test-nonce&code=test-code`, { headers: { cookie: `sb-access-token=admin-test; measurement-google-state=${state}` } });
}
describe('autorización de Google vinculada al administrador', () => {
  beforeEach(() => {
    mocks.admin.mockReset().mockResolvedValue({ id: 'admin-test' }); mocks.save.mockReset().mockResolvedValue(undefined); mocks.measurements.mockReset().mockResolvedValue(undefined);
    vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_ID', 'test-client'); vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_SECRET', 'private-client-secret'); vi.stubEnv('MEASUREMENT_PUBLIC_URL', origin); vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_TYPE', 'installed'); vi.stubEnv('MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('no inicia autorizaciones ni intercambia códigos sin un administrador', async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await handleGoogleStart(start())).status).toBe(401);
    expect((await handleGoogleCallback(await callbackRequest())).headers.get('location')).toContain('google=admin');
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('requiere el mismo origen y prepara PKCE sin devolver secretos ni el verificador', async () => {
    expect((await handleGoogleStart(start('ga4', 'https://another.example'))).status).toBe(403);
    expect((await handleGoogleStart(start('toString'))).status).toBe(400);
    const response = await handleGoogleStart(start());
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    expect(text).toContain('code_challenge_method=S256');
    expect(text).not.toMatch(/private-client-secret|code_verifier/);
    expect(response.cookies.get('measurement-google-state')).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 600 });
  });
  it.each([{ adminId: 'different-admin' }, { state: 'different-state' }, { expires: Date.now() - 1000 }, { redirectUri: 'https://another.example/callback' }, { provider: 'adsense' }, { provider: 'toString' }])('rechaza un retorno con otra sesión, nonce, fuente o ventana: %j', async (change) => {
    expect((await handleGoogleCallback(await callbackRequest(change))).headers.get('location')).toContain('google=expired');
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('guarda sólo los permisos concedidos y no pone el token en el retorno al panel', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ refresh_token: 'private-refresh-token', scope: 'https://www.googleapis.com/auth/analytics.readonly' }));
    const response = await handleGoogleCallback(await callbackRequest());
    expect(response.headers.get('location')).toBe(`${origin}/admin/seguimiento?google=connected`);
    expect(mocks.save).toHaveBeenCalledWith('google', { refreshToken: 'private-refresh-token', clientId: 'test-client', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    expect(response.headers.get('set-cookie')).not.toContain('private-refresh-token');
    expect(response.cookies.get('measurement-google-state')?.maxAge).toBe(0);
  });
  it.each(['adsense', 'google-ads'] as const)('autoriza %s por separado y conserva el acceso principal de Analytics', async (provider) => {
    const response = await handleGoogleStart(start(provider));
    const authorizationUrl = new URL((await response.json()).url);
    expect(authorizationUrl.searchParams.get('scope')).toBe(GOOGLE_SCOPES[provider]);
    const state = await openPrivateValue(response.cookies.get('measurement-google-state')!.value, 'google-oauth-state');
    expect(state).toMatchObject({ provider, requestedScopes: [GOOGLE_SCOPES[provider]] });
    vi.mocked(fetch).mockResolvedValue(Response.json({ refresh_token: 'separate-private-refresh', scope: GOOGLE_SCOPES[provider] }));
    expect((await handleGoogleCallback(await callbackRequest({ provider, requestedScopes: [GOOGLE_SCOPES[provider]] }))).headers.get('location')).toContain('google=connected');
    expect(mocks.save).toHaveBeenCalledWith(provider === 'adsense' ? 'google-adsense' : 'google-ads-oauth', { refreshToken: 'separate-private-refresh', clientId: 'test-client', scopes: [GOOGLE_SCOPES[provider]] });
    expect(mocks.save).not.toHaveBeenCalledWith('google', expect.anything());
    expect(mocks.measurements).toHaveBeenCalledWith([], [expect.objectContaining({ id: provider, state: 'ready' })]);
  });
  it('un permiso incompleto o un fallo de guardado no se presenta como conectado', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ refresh_token: 'private-refresh-token', scope: 'https://www.googleapis.com/auth/adsense.readonly' }));
    expect((await handleGoogleCallback(await callbackRequest())).headers.get('location')).toContain('google=denied');
    expect(mocks.save).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(Response.json({ refresh_token: 'private-refresh-token', scope: 'https://www.googleapis.com/auth/analytics.readonly' }));
    mocks.save.mockRejectedValue(new Error('private database diagnostic'));
    expect((await handleGoogleCallback(await callbackRequest())).headers.get('location')).toContain('google=failed');
  });
  it('un cliente instalado se limita al retorno local y no se usa en el dominio publicado', async () => {
    vi.stubEnv('MEASUREMENT_PUBLIC_URL', 'https://www.comparador-hardware.com.ar');
    const response = await handleGoogleStart(start());
    expect(response.status).toBe(503); expect(mocks.save).not.toHaveBeenCalled();
  });
});

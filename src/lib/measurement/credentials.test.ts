import { afterEach, describe, expect, it, vi } from 'vitest';
const mockClient = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseServiceClient: mockClient }));
import { googleAuthorizationFor, loadConnectionSecrets, openPrivateValue, sealPrivateValue } from './credentials';
import { MEASUREMENT_SCOPE } from './store';

describe('cifrado de autorizaciones privadas', () => {
  afterEach(() => { vi.unstubAllEnvs(); mockClient.mockReset(); });
  it('cifra con un nonce distinto y rechaza cambios o una conexión diferente', async () => {
    vi.stubEnv('MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY', 'a'.repeat(64));
    const credential = { token: 'private-test-credential' };
    const first = await sealPrivateValue(credential, 'credential:cloudflare');
    const second = await sealPrivateValue(credential, 'credential:cloudflare');
    expect(first).not.toBe(second); expect(first).not.toContain(credential.token);
    expect(await openPrivateValue(first, 'credential:cloudflare')).toEqual(credential);
    await expect(openPrivateValue(first, 'credential:database')).rejects.toThrow();
    const [iv, encoded] = first.split('.');
    const bytes = Buffer.from(encoded, 'base64url'); bytes[0] ^= 1;
    await expect(openPrivateValue(`${iv}.${bytes.toString('base64url')}`, 'credential:cloudflare')).rejects.toThrow();
    vi.stubEnv('MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY', 'b'.repeat(64));
    await expect(openPrivateValue(first, 'credential:cloudflare')).rejects.toThrow();
  });
  it('sin clave privada válida no guarda autorizaciones en texto', async () => {
    vi.stubEnv('MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY', '');
    await expect(sealPrivateValue({ token: 'private-test-credential' }, 'credential:google')).rejects.toThrow('cifrado privado');
  });
  it('recupera autorizaciones cifradas separadas y conserva la cuenta principal existente', async () => {
    vi.stubEnv('MEASUREMENT_CREDENTIAL_ENCRYPTION_KEY', 'a'.repeat(64));
    vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_ID', 'client'); vi.stubEnv('MEASUREMENT_GOOGLE_CLIENT_SECRET', 'private-client-secret');
    const scope = `${MEASUREMENT_SCOPE}:credentials`;
    const records = new Map([
      [`${scope}:google`, await sealPrivateValue({ clientId: 'client', refreshToken: 'main-refresh', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] }, 'credential:google')],
      [`${scope}:google-adsense`, await sealPrivateValue({ clientId: 'client', refreshToken: 'separate-refresh', scopes: ['https://www.googleapis.com/auth/adsense.readonly'] }, 'credential:google-adsense')],
    ]);
    mockClient.mockReturnValue({ from: () => {
      let key = '';
      const query = { select: () => query, eq: (field: string, value: string) => { if (field === 'entry_key') key = value; return query; }, abortSignal: () => query, maybeSingle: async () => ({ data: records.has(key) ? { payload: { encrypted: records.get(key) } } : null, error: null }) };
      return query;
    } });
    const settings = await loadConnectionSecrets();
    expect(googleAuthorizationFor('ga4', settings)?.refreshToken).toBe('main-refresh');
    expect(googleAuthorizationFor('adsense', settings)?.refreshToken).toBe('separate-refresh');
    expect(settings.google?.scopes).not.toContain('https://www.googleapis.com/auth/adsense.readonly');
  });
});

import { afterEach, expect, it, vi } from 'vitest';
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn<(url: string, key: string, options: object) => object>().mockImplementation(() => ({})) }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); createClient.mockClear(); });
it('fetch por lector aislado conserva readonly auth y no modifica singleton ni service', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://catalog.test');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'service-test-key');
  const api = await import('./supabase-server');
  const cached = api.getServerSupabaseReadClient();
  const service = api.getServerSupabaseServiceClient();
  const fetch = vi.fn<typeof globalThis.fetch>();
  const isolated = api.createServerSupabaseReadClientForFetch(fetch);
  expect(isolated).not.toBe(cached);
  expect(api.getServerSupabaseReadClient()).toBe(cached);
  expect(api.getServerSupabaseServiceClient()).toBe(service);
  expect(createClient).toHaveBeenCalledTimes(3);
  expect(createClient.mock.calls[2]).toEqual(['https://catalog.test', 'public-test-key', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch },
  }]);
  expect(createClient.mock.calls[0][2]).not.toHaveProperty('global');
  expect(createClient.mock.calls[1][2]).not.toHaveProperty('global');
});

it('cliente aislado no usa service cuando falta configuración readonly', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://catalog.test');
  for (const key of ['SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY']) vi.stubEnv(key, '');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'service-test-key');
  const api = await import('./supabase-server');
  expect(api.createServerSupabaseReadClientForFetch(vi.fn())).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
});

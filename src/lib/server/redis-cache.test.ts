import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// El modulo lee las env vars al importarse, asi que cada test que necesita
// una config distinta debe resetear modulos y reimportar dinamicamente.
describe('redis-cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isRedisEnabled() es false sin credenciales configuradas', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const { isRedisEnabled } = await import('./redis-cache');
    expect(isRedisEnabled()).toBe(false);
  });

  it('isRedisEnabled() no revienta y devuelve false con una URL invalida (ej: placeholder [SENSITIVE] de vercel env pull)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '[SENSITIVE]');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '[SENSITIVE]');
    const { isRedisEnabled } = await import('./redis-cache');
    expect(() => isRedisEnabled()).not.toThrow();
    expect(isRedisEnabled()).toBe(false);
  });

  it('getRedisCache() no revienta y devuelve null con una URL invalida', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '[SENSITIVE]');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '[SENSITIVE]');
    const { getRedisCache } = await import('./redis-cache');
    await expect(getRedisCache('some-key')).resolves.toBeNull();
  });

  it('incrWithExpiry() no revienta y devuelve null con una URL invalida', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '[SENSITIVE]');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '[SENSITIVE]');
    const { incrWithExpiry } = await import('./redis-cache');
    await expect(incrWithExpiry('some-key', 60)).resolves.toBeNull();
  });

  it('isRedisEnabled() es true con una URL https valida', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'a-valid-token');
    const { isRedisEnabled } = await import('./redis-cache');
    expect(isRedisEnabled()).toBe(true);
  });
});

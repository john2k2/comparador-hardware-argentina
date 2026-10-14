import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ eval: vi.fn(), incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: vi.fn(function () { return redis; }) }));

// El modulo lee las env vars al importarse, asi que cada test que necesita
// una config distinta debe resetear modulos y reimportar dinamicamente.
describe('redis-cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
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

  it('isRedisEnabled() es false con una configuracion parcial', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
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

  it('no separa incremento y expiración en solicitudes que puedan fallar parcialmente', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token');
    redis.incr.mockResolvedValue(1);
    redis.expire.mockRejectedValue(new Error('private-provider-token'));
    redis.eval.mockResolvedValue(1);
    const { incrWithExpiry } = await import('./redis-cache');
    expect(await incrWithExpiry('bucket', 60)).toBe(1);
    expect(redis.eval).toHaveBeenCalledOnce();
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('el script repara un contador previo sin TTL antes de incrementarlo y conserva ventanas con TTL', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token');
    redis.incr.mockResolvedValue(8);
    redis.eval.mockResolvedValue(8);
    const { incrWithExpiry } = await import('./redis-cache');
    expect(await incrWithExpiry('legacy', 60)).toBe(8);
    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(keys).toEqual(['legacy']);
    expect(args).toEqual([60]);
    expect(script).toContain('ttl == -1');
    expect(script).toContain("'EXPIRE'");
    expect(script.indexOf("'EXPIRE'")).toBeLessThan(script.indexOf("'INCR'"));
    expect(script).toContain("'EX'");
  });

  it('un fallo o resultado inválido de EVAL no acredita un incremento y puede recuperarse', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture-token');
    redis.eval.mockRejectedValueOnce(new Error('private-provider-token')).mockResolvedValueOnce('invalid').mockResolvedValueOnce(2);
    const { incrWithExpiry } = await import('./redis-cache');
    expect(await incrWithExpiry('bucket', 60)).toBeNull();
    expect(await incrWithExpiry('bucket', 60)).toBeNull();
    expect(await incrWithExpiry('bucket', 60)).toBe(2);
  });
});

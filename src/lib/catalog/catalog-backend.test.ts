import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), sdkLoaded: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => { mocks.sdkLoaded(); return { getCloudflareContext: mocks.context }; });
import { getD1CatalogReader, isD1CatalogEnabled } from './catalog-backend';
const fingerprint = 'a'.repeat(64);
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('selección explícita de backend de catálogo', () => {
  it.each([undefined, 'supabase', 'D1', ''])('por defecto %s no carga contexto ni hace SQL', async backend => {
    vi.stubEnv('CATALOG_READ_BACKEND', backend);
    expect(isD1CatalogEnabled()).toBe(false);
    expect(await getD1CatalogReader()).toBeNull();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.sdkLoaded).not.toHaveBeenCalled();
  });
  it('D1 exige fingerprint antes de cargar SDK/contexto', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'd1'); vi.stubEnv('CATALOG_FINGERPRINT', '');
    expect(isD1CatalogEnabled()).toBe(true);
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_FINGERPRINT_REQUIRED');
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it('binding ausente o contexto inválido fallan sin devolver backend por defecto', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'd1'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
    mocks.context.mockResolvedValue({ env: {} });
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_D1_BINDING_REQUIRED');
    expect(mocks.context).toHaveBeenCalledWith({ async: true });
    mocks.context.mockRejectedValueOnce(new Error('CONTEXT_UNAVAILABLE'));
    await expect(getD1CatalogReader()).rejects.toThrow('CONTEXT_UNAVAILABLE');
  });
  it('binding real de adapter sin manifiesto certificado rechaza activación', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'd1'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
    const prepare = vi.fn(() => ({ bind: () => ({ all: async () => ({ success: true,
      results: [{ snapshot: '{}', production: null }], meta: {} }) }) }));
    mocks.context.mockResolvedValue({ env: { CATALOG_DB: { prepare } } });
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_PRODUCTION_NOT_READY');
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('binding y manifiesto certificados entregan lector inyectado sin contar tablas', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'd1'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
    const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
    const prepare = vi.fn(() => ({ bind: () => ({ all: async () => ({ success: true, results: [{
      snapshot: JSON.stringify({ counts, catalog: { version: 1, fingerprint, counts } }),
      production: JSON.stringify({ version: 1, complete: true, countsVerified: true, fingerprint, counts }),
    }], meta: {} }) }) }));
    mocks.context.mockResolvedValue({ env: { CATALOG_DB: { prepare } } });
    const reader = await getD1CatalogReader();
    expect(reader?.readProductsPage).toBeTypeOf('function');
    expect(reader?.readProductDetailById).toBeTypeOf('function');
    expect(prepare.mock.calls.every(([sql]) => !String(sql).includes('COUNT('))).toBe(true);
    const readCache = vi.fn(() => ({ match: vi.fn(), put: vi.fn() }));
    vi.stubGlobal('caches', { get default() { return readCache(); } });
    await getD1CatalogReader();
    expect(readCache).not.toHaveBeenCalled();
    vi.stubEnv('CATALOG_RESPONSE_CACHE', '1');
    await getD1CatalogReader();
    expect(readCache).toHaveBeenCalledTimes(1);
  });
});

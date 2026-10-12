import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ context: vi.fn(), sdkLoaded: vi.fn() }));
vi.mock('@/lib/server/supabase-server', () => ({
  getServerSupabaseReadClient: () => { throw new Error('TEST_FORBIDDEN_SUPABASE_FALLBACK'); },
  createServerSupabaseReadClientForFetch: () => { throw new Error('TEST_FORBIDDEN_SUPABASE_FALLBACK'); },
}));
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

describe('catálogo Mac opt-in sin SDK ni caché Cloudflare', () => {
  const symbol = Symbol.for('__comparador_mac_catalog_binding__');
  afterEach(() => { delete (globalThis as unknown as Record<PropertyKey, unknown>)[symbol]; });
  async function register(prepare: (sql: string) => unknown) {
    const { registerMacCatalogBinding } = await import('./mac-catalog-binding');
    registerMacCatalogBinding({ prepare } as never);
  }
  function certifiedBinding(manifestFingerprint = fingerprint) {
    const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
    return vi.fn(() => ({ bind: () => ({ all: async () => ({ success: true, results: [{
      snapshot: JSON.stringify({ counts, catalog: { version: 1, fingerprint, counts } }),
      production: JSON.stringify({ version: 1, complete: true, countsVerified: true, fingerprint: manifestFingerprint, counts }),
    }], meta: {} }) }) }));
  }
  it('MAC selecciona el mismo contrato para callers y ausencia de binding falla cerrada', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
    expect(isD1CatalogEnabled()).toBe(true);
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_MAC_BINDING_REQUIRED');
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.sdkLoaded).not.toHaveBeenCalled();
  });
  it('MAC requiere fingerprint y manifiesto coincidente sin fallback', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', 'wrong');
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_FINGERPRINT_REQUIRED');
    vi.stubEnv('CATALOG_FINGERPRINT', fingerprint); await register(certifiedBinding('b'.repeat(64)));
    await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_PRODUCTION_MANIFEST_INVALID');
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it('MAC certificado usa reader actual e ignora Cache API incluso con flag encendido', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint); vi.stubEnv('CATALOG_RESPONSE_CACHE', '1');
    const cache = vi.fn(); vi.stubGlobal('caches', { get default() { cache(); throw new Error('not-MAC'); } });
    const prepare = certifiedBinding(); await register(prepare);
    const reader = await getD1CatalogReader(); expect(reader?.readProductsPage).toBeTypeOf('function'); expect(reader?.readProductDetailById).toBeTypeOf('function');
    expect(cache).not.toHaveBeenCalled(); expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.sdkLoaded).not.toHaveBeenCalled();
    expect(prepare.mock.calls.every(([sql]) => !String(sql).includes('COUNT('))).toBe(true);
  });
  it('MAC sustituido durante lectura del manifiesto rechaza la factory anterior', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const base = certifiedBinding();
    await register(() => ({ bind: () => ({ async all() { enter(); await gate; return base().bind().all(); } }) }));
    const pending = getD1CatalogReader(); await entered;
    await register(certifiedBinding()); release();
    await expect(pending).rejects.toThrow('CATALOG_MAC_BINDING_CHANGED');
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it('MAC mantiene guard de configuración preparada sin relajar verificaciones', async () => {
    vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint); vi.stubEnv('CATALOG_PREPARED_VIEWS', '1'); vi.stubEnv('CATALOG_PREPARED_PUBLIC_KEY', '');
    await register(certifiedBinding()); await expect(getD1CatalogReader()).rejects.toThrow('CATALOG_PREPARED_CONFIGURATION_INVALID');
    expect(mocks.context).not.toHaveBeenCalled();
  });
});

it('MAC con SQLite real recorre page/category/detail actuales conservando oferta y generación', async () => {
  const { registerMacCatalogBinding, MAC_CATALOG_BINDING_SYMBOL } = await import('./mac-catalog-binding');
  const { readProductsPageFromDatabase, readCategoryLandingPageFromDatabase, readProductDetailByIdFromDatabase } = await import('@/lib/persistence/product-read');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
  vi.stubEnv('CATALOG_READ_BACKEND', 'mac'); vi.stubEnv('CATALOG_FINGERPRINT', fingerprint); vi.stubEnv('CATALOG_PREPARED_VIEWS', '0');
  const db = new DatabaseSync(':memory:'), sql: string[] = [];
  try {
    db.exec(readFileSync(new URL('../../../scripts/pilots/cloudflare-catalog/schema.sql', import.meta.url), 'utf8'));
    const stamp = '2026-10-12T14:30:00.000Z', name = 'RTX 4060 8GB', url = 'https://www.venex.com.ar/rtx-4060-8gb';
    const row = { id: 'gpu-mac', name, category: 'tarjetas-graficas', brand: 'NVIDIA', model: name, description: null, image: null, normalized_title: name,
      canonical_product_key: 'legacy-gpu-mac', family_key: null, variant_key: null, refresh_priority: null, last_scraped_at: stamp, last_normalized_at: null,
      specs: {}, lowest_price: 200000, highest_price: 200000, average_price: 200000, created_at: stamp, updated_at: stamp };
    const offer = { id: 'offer-mac', product_id: row.id, store_id: 'venex', price: 200000, stock: 'in-stock', url, last_updated: stamp, price_condition: 'special' };
    db.prepare('INSERT INTO stores VALUES(?,?)').run('venex', JSON.stringify({ id: 'venex', name: 'Venex' }));
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.id, row.category, row.id, 'rtx 4060 8gb', 'rtx 4060 8gb', 1, 0, stamp, stamp, JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(row.id, 'rtx 4060 8gb');
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id, 200000, 200000, 200000, 1, url, 0, '["venex"]', null, null, stamp, '{}');
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id, row.id, 'venex', offer.price, url, JSON.stringify(offer));
    for (const kind of ['historical', 'current']) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(row.id, kind, offer.id, 'venex', offer.price, offer.stock, url, stamp);
    const counts = { products: 1, product_prices: 1, catalog_price_summaries: 1, stores: 1 };
    const snapshot = { counts, catalog: { version: 1, fingerprint, counts }, clock_observations: { version: 1, validated: true, timestampPolicy: 'js-sql-ms-v1', offers: 1 } };
    db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot', JSON.stringify(snapshot));
    db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('production_catalog', JSON.stringify({ version: 1, complete: true, countsVerified: true, fingerprint, counts }));
    const before = db.prepare('SELECT * FROM product_prices').all();
    registerMacCatalogBinding({ prepare(query: string) {
      sql.push(query); expect(query.trim()).toMatch(/^(SELECT|WITH)\b/i);
      return { bind(...values: unknown[]) { return { async all() {
        return { success: true, results: db.prepare(query).all(...values as (string | number | null)[]) as Record<string, unknown>[], meta: { rows_written: 0 } };
      } }; } };
    } });
    const page = await readProductsPageFromDatabase({ query: 'RTX 4060', page: 1, pageSize: 12, onlyCurrentOffers: true });
    const category = await readCategoryLandingPageFromDatabase('tarjetas-graficas', 1, 12);
    const detail = await readProductDetailByIdFromDatabase(row.id);
    expect(page.total).toBe(1); expect(page.products.map(product => product.id)).toEqual([row.id]);
    expect(category.total).toBe(1); expect(detail?.id).toBe(row.id); expect(detail?.prices[0].price).toBe(offer.price); expect(detail?.prices[0].lastUpdated.toISOString()).toBe(stamp);
    expect(db.prepare('SELECT * FROM product_prices').all()).toEqual(before);
    expect(mocks.context).not.toHaveBeenCalled(); expect(sql.length).toBeGreaterThan(6);
    db.prepare("UPDATE pilot_meta SET value='{}' WHERE key='production_catalog'").run();
    await expect(readProductsPageFromDatabase({ page: 1, pageSize: 12 })).rejects.toThrow('CATALOG_PRODUCTION_MANIFEST_INVALID');
  } finally {
    delete (globalThis as unknown as Record<PropertyKey, unknown>)[MAC_CATALOG_BINDING_SYMBOL]; db.close(); vi.useRealTimers();
  }
});

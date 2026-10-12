import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), reader: vi.fn(), products: vi.fn(), supabase: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('@/lib/catalog/catalog-backend', () => ({ isD1CatalogEnabled: mocks.enabled, getD1CatalogReader: mocks.reader }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: mocks.supabase }));
import { readStoreCatalog } from './store-catalog';
import { buildStoreMetadata } from './store-landings';

describe('catálogo SQL de tienda', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.reader.mockResolvedValue({ readProducts: mocks.products });
  });
  it('filtra la tienda en SQL y distingue catálogo vacío confirmado de indisponibilidad', async () => {
    mocks.products.mockResolvedValue([]);
    expect(await readStoreCatalog('mexx')).toEqual({ products: [], freshProducts: 0, indexable: false, unavailable: false });
    expect(mocks.products).toHaveBeenCalledWith({ storeIds: new Set(['mexx']), sortBy: 'newest', limit: 36 });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it('un fallo SQL conserva unavailable y noindex, sin fallback legado', async () => {
    mocks.products.mockRejectedValue(new Error('generation changed'));
    const result = await readStoreCatalog('venex');
    expect(result).toEqual({ products: [], freshProducts: 0, indexable: false, unavailable: true });
    expect(buildStoreMetadata('venex', result.indexable).robots).toEqual({ index: false, follow: true });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it('tienda fuera de registro y binding ausente no acreditan catálogo disponible', async () => {
    expect((await readStoreCatalog('otra')).unavailable).toBe(true);
    expect(mocks.reader).not.toHaveBeenCalled();
    mocks.reader.mockResolvedValue(null);
    expect((await readStoreCatalog('maximus')).unavailable).toBe(true);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});

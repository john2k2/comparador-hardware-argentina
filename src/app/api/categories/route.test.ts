import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), supabase: vi.fn() }));
vi.mock('@/lib/catalog/catalog-backend', () => ({ isD1CatalogEnabled: mocks.enabled }));
vi.mock('@/lib/server/supabase-server', () => ({ getServerSupabaseReadClient: mocks.supabase }));
import { GET } from './route';
import { categories } from '@/lib/scrapers/static-data';
describe('categorías SQL', () => {
  afterEach(() => vi.clearAllMocks());
  it('entrega registro de metadata conocido sin consultar Supabase', async () => {
    mocks.enabled.mockReturnValue(true);
    const response = await GET();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ categories });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});

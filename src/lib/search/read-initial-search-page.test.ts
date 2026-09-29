import { afterEach, describe, expect, it, vi } from 'vitest';
const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: readPage }));
import { readInitialSearchPage } from './read-initial-search-page';
import { parseSearchState } from './search-state';

afterEach(() => { vi.unstubAllEnvs(); readPage.mockReset(); });

describe('initial catalog page', () => {
  it('preserves page two and totals beyond the former cap', async () => {
    readPage.mockResolvedValue({ products: [{ id: 'target50' }], total: 1501, totalPages: 126, page: 2, pageSize: 12 });
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 7600', page: '2', stores: 'MEXX,mexx' }));
    expect(result.products).toEqual([{ id: 'target50' }]);
    expect(result.pagination).toMatchObject({ total: 1501, page: 2, offset: 12 });
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ category: 'procesadores', storeIds: new Set(['mexx']) }));
  });

  it('propagates database failure instead of producing empty hydration data', async () => {
    readPage.mockRejectedValue(new Error('unavailable'));
    await expect(readInitialSearchPage(parseSearchState({ category: 'procesadores' }))).rejects.toThrow('unavailable');
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    expect((await readInitialSearchPage(parseSearchState({ category: 'procesadores', page: '50' }))).pagination).toMatchObject({ total: 0, page: 1 });
  });

  it('supports explicitly enabled fixtures without a database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    await readInitialSearchPage(parseSearchState({ category: 'procesadores' }));
    expect(readPage).not.toHaveBeenCalled();
  });
});

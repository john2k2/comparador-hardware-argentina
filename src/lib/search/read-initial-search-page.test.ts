import { afterEach, describe, expect, it, vi } from 'vitest';
const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/persistence/product-read', () => ({ readProductsPageFromDatabase: readPage }));
import { readInitialSearchPage } from './read-initial-search-page';
import { parseSearchState } from './search-state';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';

afterEach(() => { vi.unstubAllEnvs(); readPage.mockReset(); });

describe('initial catalog page', () => {
  it('includes historical references only when explicitly requested', async () => {
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    await readInitialSearchPage(parseSearchState({ q: 'rtx 5090', includeUnavailable: '1' }));
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ onlyCurrentOffers: false }));
  });
  it('preserves page two and totals beyond the former cap', async () => {
    readPage.mockResolvedValue({ products: [{ id: 'target50' }], total: 1501, totalPages: 126, page: 2, pageSize: 12 });
    const result = await readInitialSearchPage(parseSearchState({ q: 'ryzen 7600', page: '2', stores: 'MEXX,mexx' }));
    expect(result.products).toEqual([{ id: 'target50' }]);
    expect(result.pagination).toMatchObject({ total: 1501, page: 2, offset: 12 });
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ category: 'procesadores', storeIds: new Set(['mexx']), onlyCurrentOffers: true }));
  });

  it('propagates database failure instead of producing empty hydration data', async () => {
    readPage.mockRejectedValue(new Error('unavailable'));
    await expect(readInitialSearchPage(parseSearchState({ category: 'procesadores' }))).rejects.toThrow('unavailable');
    readPage.mockResolvedValue({ products: [], total: 0, totalPages: 0, page: 1, pageSize: 12 });
    expect((await readInitialSearchPage(parseSearchState({ category: 'procesadores', page: '50' }))).pagination).toMatchObject({ total: 0, page: 1 });
  });

  it('supports explicitly enabled fixtures without a database', async () => {
    vi.stubEnv('E2E_STABLE_MODE', '1');
    const page = await readInitialSearchPage(parseSearchState({ category: 'procesadores' }));
    expect(page.pagination.total).toBe(2);
    expect(page.products.map(product => product.id)).toEqual(['fixture-ryzen-5600', 'fixture-ryzen-5700x']);
    expect(page.products.every(product => getRecentProductOffers(product).length === 2)).toBe(true);
    expect(readPage).not.toHaveBeenCalled();
  });
});

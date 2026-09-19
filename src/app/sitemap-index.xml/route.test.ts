import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readIndexedProductCountMock, readProductSitemapPageMock } = vi.hoisted(() => ({
  readIndexedProductCountMock: vi.fn(),
  readProductSitemapPageMock: vi.fn(),
}));

vi.mock('@/lib/seo/sitemap', () => ({
  PRODUCT_SITEMAP_PAGE_SIZE: 1_000,
  readIndexedProductCount: readIndexedProductCountMock,
  readProductSitemapPage: readProductSitemapPageMock,
}));

import { GET } from './route';

describe('sitemap index route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readProductSitemapPageMock.mockResolvedValue([]);
  });

  it('lists every product sitemap page from the reliable database count', async () => {
    readIndexedProductCountMock.mockResolvedValue({ count: 2_001, source: 'database' });

    const response = await GET();
    const body = await response.text();

    expect(body).toContain('/sitemap.xml');
    expect(body).toContain('/product-sitemap/0.xml');
    expect(body).toContain('/product-sitemap/1.xml');
    expect(body).toContain('/product-sitemap/2.xml');
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(readProductSitemapPageMock).not.toHaveBeenCalled();
  });

  it('does not cache a transient count failure as a catalog-free sitemap', async () => {
    readIndexedProductCountMock.mockResolvedValue({ count: null, source: 'unavailable' });
    readProductSitemapPageMock.mockResolvedValue([{ id: 'agrupado-cpu-1' }]);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain('/product-sitemap/0.xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(readProductSitemapPageMock).toHaveBeenCalledWith(0, 1);
  });
});

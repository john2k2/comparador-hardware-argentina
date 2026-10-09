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

  it('no publica un índice vacío ni sólo la primera página cuando falla el conteo', async () => {
    readIndexedProductCountMock.mockResolvedValue({ count: null, source: 'unavailable' });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.text()).not.toContain('<sitemapindex');
    expect(readProductSitemapPageMock).not.toHaveBeenCalled();
  });
  it('mantiene todas las páginas del último conteo confirmado sin cachear el fallback', async () => {
    readIndexedProductCountMock.mockResolvedValue({ count: 2001, source: 'memory' });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('/product-sitemap/2.xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('un catálogo confirmado sin productos conserva el sitemap editorial', async () => {
    readIndexedProductCountMock.mockResolvedValue({ count: 0, source: 'database' });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('/sitemap.xml');
    expect(body).not.toContain('product-sitemap');
  });
});

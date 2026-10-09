import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('@/lib/seo/sitemap', () => ({ readProductSitemapPage: readPage }));
import { GET } from './route';
const get = (page = '0.xml') => GET(new NextRequest(`https://example.test/product-sitemap/${page}`), { params: Promise.resolve({ page }) });

describe('páginas del sitemap de productos', () => {
  beforeEach(() => vi.resetAllMocks());
  it('devuelve 503 recuperable cuando no se puede leer, en lugar de declarar que la página no existe', async () => {
    readPage.mockResolvedValue({ status: 'unavailable' });
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
  });
  it('reserva 404 para una página vacía confirmada', async () => {
    readPage.mockResolvedValue({ status: 'available', rows: [] });
    expect((await get()).status).toBe(404);
  });
  it.each(['-1.xml', '1.5.xml', '.xml', 'foo.xml', '1e2.xml', '9007199254740992.xml'])('rechaza %s sin consultar el catálogo', async (page) => {
    expect((await get(page)).status).toBe(404);
    expect(readPage).not.toHaveBeenCalled();
  });
  it('publica URLs y fechas sólo de la página solicitada', async () => {
    readPage.mockResolvedValue({ status: 'available', rows: [{ id: 'agrupado-cpu-1', updated_at: '2026-10-09T00:00:00Z', canonical_product_key: null }] });
    const response = await get('2.xml');
    expect(response.status).toBe(200);
    expect(readPage).toHaveBeenCalledWith(2);
    const body = await response.text();
    expect(body).toContain('/product/agrupado-cpu-1');
    expect(body).toContain('<lastmod>2026-10-09T00:00:00.000Z</lastmod>');
  });
});

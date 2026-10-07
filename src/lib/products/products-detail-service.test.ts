import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import { SourceHttpError } from '@/lib/scrapers/source-http';

const source = vi.hoisted(() => ({ detail: vi.fn(), search: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/scrapers/tiendanube', () => ({
  fetchTiendaNubeProductById: source.detail,
  fetchAllTiendaNubeSearch: source.search,
}));
import { resolveLiveProductDetail } from './products-detail-service';

describe('resolveLiveProductDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Estas pruebas nunca consultan una tienda ni la base de datos.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network disabled')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('no sustituye una ficha TiendaNube contradictoria con resultados de búsqueda', async () => {
    source.detail.mockRejectedValue(new SourceHttpError('inconsistent-source'));
    source.search.mockResolvedValue([{ id: 'shopgamer-123-ram' }]);
    const observe = vi.fn();
    const result = await resolveLiveProductDetail('shopgamer-123-ram', 'memoria-ram', observe);
    expect(result).toBeNull();
    expect(source.search).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('conserva el resultado corroborado de TiendaNube sin disparar otras fuentes', async () => {
    const detail = { id: 'shopgamer-123-ram' } as Product;
    source.detail.mockResolvedValue(detail);
    const observe = vi.fn();
    expect(await resolveLiveProductDetail(detail.id, 'memoria-ram', observe)).toBe(detail);
    expect(source.search).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

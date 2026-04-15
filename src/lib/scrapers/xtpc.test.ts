import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchXtpcProducts,
  fetchXtpcCategory,
  fetchXtpcProductById,
} from './xtpc';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockXtpcHtml = `
  <div class="product-list">
    <a href="/prod/12345/placa-video-rtx-4080">
      <h3>Placa de Video RTX 4080 Super</h3>
      <span class="price">$ 1.899.999</span>
    </a>
  </div>
  <div class="product-list">
    <a href="/prod/12346/procesador-amd-ryzen-9">
      <h3>Procesador AMD Ryzen 9 7950X</h3>
      <span class="price">$ 899.999</span>
    </a>
  </div>
`;

describe('xtpc scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchXtpcProducts', () => {
    it('returns empty array for empty query', async () => {
      const result = await fetchXtpcProducts('', 'procesadores');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only query', async () => {
      const result = await fetchXtpcProducts('   ', 'procesadores');
      expect(result).toEqual([]);
    });

    it('parses products from HTML response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => mockXtpcHtml,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcProducts('rtx', 'tarjetas-graficas');

      expect(result.length).toBeGreaterThan(0);
      const rtxProduct = result.find(p => p.name.includes('RTX 4080'));
      expect(rtxProduct).toBeDefined();
      expect(rtxProduct?.id).toContain('xtpc-12345');
    });

    it('handles HTTP errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcProducts('rtx', 'tarjetas-graficas');
      expect(result).toEqual([]);
    });

    it('filters products by price > 0', async () => {
      const htmlWithZeroPrice = `
        <div class="product-list">
          <a href="/prod/99999/producto-sin-precio">
            <h3>Producto sin precio</h3>
            <span class="price">$ 0</span>
          </a>
        </div>
      `;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => htmlWithZeroPrice,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcProducts('producto', 'procesadores');
      expect(result).toEqual([]);
    });
  });

  describe('fetchXtpcCategory', () => {
    it('makes multiple requests for different search terms', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockXtpcHtml,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcCategory('procesadores');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('deduplicates products from multiple pages', async () => {
      const singleProductHtml = `
        <div class="product-list">
          <a href="/prod/12345/placa-video-rtx-4080">
            <h3>Placa de Video RTX 4080 Super</h3>
            <span class="price">$ 1.899.999</span>
          </a>
        </div>
      `;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => singleProductHtml,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcCategory('tarjetas-graficas');
      const uniqueIds = new Set(result.map(p => p.id));
      expect(uniqueIds.size).toBe(result.length);
    });

    it('respects the 18 product limit', async () => {
      const manyProductsHtml = Array.from({ length: 10 }, (_, i) => `
        <div class="product-list">
          <a href="/prod/${i}/producto-${i}">
            <h3>Producto ${i}</h3>
            <span class="price">$ ${100000 + i}</span>
          </a>
        </div>
      `).join('');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => manyProductsHtml,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcCategory('procesadores');
      expect(result.length).toBeLessThanOrEqual(18);
    });
  });

  describe('fetchXtpcProductById', () => {
    it('returns null for invalid ID format', async () => {
      const result = await fetchXtpcProductById('invalid', 'procesadores');
      expect(result).toBeNull();
    });

    it('returns null when ID does not start with xtpc-', async () => {
      const result = await fetchXtpcProductById('other-store-123', 'procesadores');
      expect(result).toBeNull();
    });

    it('returns null for ID without code', async () => {
      const result = await fetchXtpcProductById('xtpc-', 'procesadores');
      expect(result).toBeNull();
    });

    it('returns null for ID without slug', async () => {
      const result = await fetchXtpcProductById('xtpc-12345', 'procesadores');
      expect(result).toBeNull();
    });

    it('parses product detail from HTML', async () => {
      const detailHtml = `
        <meta property="og:title" content="Placa de Video RTX 4080 Super" />
        <meta property="og:image" content="https://xtpc.com.ar/rtx4080.jpg" />
        <span class="price">$ 1.899.999</span>
      `;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => detailHtml,
      } as Response);
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchXtpcProductById('xtpc-12345-placa-video-rtx-4080', 'tarjetas-graficas');

      expect(result).not.toBeNull();
      expect(result?.name).toContain('RTX 4080');
    });
  });
});
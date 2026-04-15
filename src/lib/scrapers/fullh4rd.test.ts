import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchFullh4rdProducts } from './fullh4rd';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const validProductHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="item">
    <a href="/producto/placa-video-rtx-4080-super">
      <h3>Placa de Video RTX 4080 Super 16GB</h3>
      <div class="image"><img src="/images/rtx4080.jpg" /></div>
      <span class="price">$ 1.899.999</span>
    </a>
  </div>
  <div class="item">
    <a href="/producto/procesador-amd-ryzen-9-7950x">
      <h3>Procesador AMD Ryzen 9 7950X</h3>
      <div class="image"><img src="/images/ryzen9.jpg" /></div>
      <span class="price">$ 899.999</span>
    </a>
  </div>
</body>
</html>
`;

const emptyProductHtml = `<!DOCTYPE html><html><body></body></html>`;

describe('fullh4rd scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchFullh4rdProducts', () => {
    it('parses products from HTML response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/tarjetas-graficas',
        text: async () => validProductHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/tarjetas-graficas',
        'tarjetas-graficas'
      );

      expect(result.length).toBeGreaterThan(0);
      const rtxProduct = result.find(p => p.name.includes('RTX 4080'));
      expect(rtxProduct).toBeDefined();
      expect(rtxProduct?.id).toContain('fh-');
      expect(rtxProduct?.lowestPrice).toBe(1899999);
    });

    it('returns empty array when HTTP error occurs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/tarjetas-graficas',
        'tarjetas-graficas'
      );

      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/empty',
        text: async () => emptyProductHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/empty',
        'procesadores'
      );

      expect(result).toEqual([]);
    });

    it('deduplicates products by id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/test',
        text: async () => validProductHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/test',
        'tarjetas-graficas'
      );

      const uniqueIds = new Set(result.map(p => p.id));
      expect(uniqueIds.size).toBe(result.length);
    });

    it('filters out products with zero price', async () => {
      const zeroPriceHtml = `
        <div class="item">
          <a href="/producto/product-zero-price">
            <h3>Product with zero price</h3>
            <span class="price">$ 0</span>
          </a>
        </div>
      `;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/test',
        text: async () => zeroPriceHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/test',
        'procesadores'
      );

      expect(result.every(p => p.lowestPrice > 0)).toBe(true);
    });

    it('assigns correct category to products', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/tarjetas-graficas',
        text: async () => validProductHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/tarjetas-graficas',
        'tarjetas-graficas'
      );

      expect(result.every(p => p.category === 'tarjetas-graficas')).toBe(true);
    });

    it('extracts brand from product name', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.fullh4rd.com.ar/productos/test',
        text: async () => validProductHtml,
      } as Response));

      const result = await fetchFullh4rdProducts(
        'https://www.fullh4rd.com.ar/productos/test',
        'tarjetas-graficas'
      );

      expect(result.some(p => p.brand !== 'Generica')).toBe(true);
    });
  });
});
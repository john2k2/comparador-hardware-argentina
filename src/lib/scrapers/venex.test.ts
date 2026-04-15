import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchVenexProducts } from './venex';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const validVenexHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="product-box">
    <h3>Placa de Video RTX 4080 Super 16GB</h3>
    <a href="/productos/placa-video-rtx-4080-super.html">
      <img src="/images/rtx4080.jpg" />
    </a>
    <span class="current-price">1.899.999</span>
  </div>
  <div class="product-box">
    <h3>Procesador AMD Ryzen 9 7950X</h3>
    <a href="/productos/procesador-amd-ryzen-9-7950x.html">
      <img src="/images/ryzen9.jpg" />
    </a>
    <span class="current-price">899.999</span>
  </div>
</body>
</html>
`;

const emptyVenexHtml = `<!DOCTYPE html><html><body></body></html>`;

describe('venex scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchVenexProducts', () => {
    it('returns products on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return {
          ok: true,
          status: 200,
          url: urlStr,
          text: async () => validVenexHtml,
        };
      }));

      const result = await fetchVenexProducts(
        'https://www.venex.com.ar/productos/tarjetas-graficas',
        'tarjetas-graficas'
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchVenexProducts(
        'https://www.venex.com.ar/productos/tarjetas-graficas',
        'tarjetas-graficas'
      );

      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.venex.com.ar/productos/empty',
        text: async () => emptyVenexHtml,
      } as Response));

      const result = await fetchVenexProducts(
        'https://www.venex.com.ar/productos/empty',
        'procesadores'
      );

      expect(result).toEqual([]);
    });
  });
});
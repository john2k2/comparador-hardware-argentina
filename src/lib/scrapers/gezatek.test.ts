import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchGezatekProducts } from './gezatek';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const validGezatekHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="productos">
    <div class="w-box product">
      <a href="/producto/placa-video-rtx-4080-super" class="click" data-id="12345">
        <img src="/images/rtx4080.jpg" />
        <h2>Placa de Video RTX 4080 Super 16GB</h2>
        <h3 class="precio_web">1.899.999</h3>
      </a>
    </div>
    <div class="w-box product">
      <a href="/producto/procesador-amd-ryzen-9-7950x" class="click" data-id="67890">
        <img src="/images/ryzen9.jpg" />
        <h2>Procesador AMD Ryzen 9 7950X</h2>
        <h3 class="precio_web">899.999</h3>
      </a>
    </div>
  </div>
</body>
</html>
`;

const emptyGezatekHtml = `<!DOCTYPE html><html><body></body></html>`;

describe('gezatek scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGezatekProducts', () => {
    it('parses products from HTML response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return {
          ok: true,
          status: 200,
          url: urlStr,
          text: async () => validGezatekHtml,
        };
      }));

      const result = await fetchGezatekProducts('rtx', 'tarjetas-graficas');

      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchGezatekProducts('rtx', 'tarjetas-graficas');
      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.gezatek.com.ar/buscar?query=empty',
        text: async () => emptyGezatekHtml,
      } as Response));

      const result = await fetchGezatekProducts('empty', 'procesadores');
      expect(result).toEqual([]);
    });

    it('deduplicates products by id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.gezatek.com.ar/buscar?query=test',
        text: async () => validGezatekHtml,
      } as Response));

      const result = await fetchGezatekProducts('test', 'tarjetas-graficas');
      const uniqueIds = new Set(result.map(p => p.id));
      expect(uniqueIds.size).toBe(result.length);
    });
  });
});
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchGamingCityProducts } from './gamingcity';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const validGamingCityHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="cajasoferta">
    <div class="product">
      <h4><a href="/placas-de-video--det--12345">Placa de Video RTX 4080 Super 16GB</a></h4>
      <span class="leyendaConStock">Disponibles: 5</span>
      <span class="price">$ 1.899.999</span>
    </div>
    <div class="product">
      <h4><a href="/procesadores--det--67890">Procesador AMD Ryzen 9 7950X</a></h4>
      <span class="stock">Ultimas unidades</span>
      <span class="price">$ 899.999</span>
    </div>
  </div>
</body>
</html>
`;

const emptyGamingCityHtml = `<!DOCTYPE html><html><body></body></html>`;

describe('gamingcity scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGamingCityProducts', () => {
    it('parses products from HTML response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return {
          ok: true,
          status: 200,
          url: urlStr,
          text: async () => validGamingCityHtml,
        };
      }));

      const result = await fetchGamingCityProducts('rtx', 'tarjetas-graficas');

      expect(result.length).toBeGreaterThan(0);
      const rtxProduct = result.find(p => p.name.includes('RTX 4080'));
      expect(rtxProduct).toBeDefined();
      expect(rtxProduct?.lowestPrice).toBe(1899999);
    });

    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await fetchGamingCityProducts('rtx', 'tarjetas-graficas');
      expect(result).toEqual([]);
    });

    it('returns empty array when no products found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.gamingcity.com.ar/buscar?q=empty',
        text: async () => emptyGamingCityHtml,
      } as Response));

      const result = await fetchGamingCityProducts('empty', 'procesadores');
      expect(result).toEqual([]);
    });
  });
});
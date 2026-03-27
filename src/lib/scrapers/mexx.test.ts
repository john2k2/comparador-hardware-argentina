import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrapeMexxProducts } from './mexx';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('scrapeMexxProducts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('ignores filter accordion cards and keeps real product cards only', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://www.mexx.com.ar/productos-rubro/procesadores/',
      text: async () => `
        <div class="card">
          <h4 class="card-title mh-n">
            <span>Filtros Aplicados</span>
          </h4>
          <div class="panel panel-default panel-rose panel-carac">
            <div class="panel-heading">
              <a class="collapsed" href="#collapseCarac">
                <h4 class="panel-title">Socket</h4>
              </a>
            </div>
          </div>
        </div>

        <div class="card card-ecommerce mt-0 ta-c">
          <div class="view overlay px-20 mi-h-200">
            <a href="https://www.mexx.com.ar/productos-rubro/procesadores/36906-procesador-amd-athlon-3000g-3.5-ghz-+-vega-3-am4.html">
              <img src="https://mexx-img-2019.s3.amazonaws.com/tumb_Procesador.jpeg" />
            </a>
          </div>
          <div class="card-body px-3 pb-0 pt-0">
            <h4 class="card-title mb-1 h-40">
              <a href="https://www.mexx.com.ar/productos-rubro/procesadores/36906-procesador-amd-athlon-3000g-3.5-ghz-+-vega-3-am4.html">
                Procesador Amd Athlon 3000G 3.5 Ghz + Vega 3 - AM4
              </a>
            </h4>
            <strong>$ 89.999</strong>
          </div>
        </div>
      `,
    } as Response);

    const result = await scrapeMexxProducts('https://www.mexx.com.ar/productos-rubro/procesadores/', 'procesadores');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('mexx-36906-procesador-amd-athlon-3000g-3.5-ghz-+-vega-3-am4');
    expect(result.data[0]?.name).toContain('Procesador Amd Athlon 3000G');
    expect(result.data[0]?.lowestPrice).toBe(89999);
  });
});

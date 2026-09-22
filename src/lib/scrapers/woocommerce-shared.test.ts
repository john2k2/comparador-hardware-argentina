import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWooProductDetail, scrapeWooPages } from './woocommerce-shared';

const scpStore = {
  id: 'scphardstore',
  name: 'SCP Hardstore',
  baseUrl: 'https://www.scphardstore.com',
};

const scpProductUrl = 'https://www.scphardstore.com/producto/mother-asus-ayw-b650m-wifi-ddr5-am5/';

const scpDetailHtml = `
  <html>
    <body class="single-product">
      <main class="product">
        <h1 class="scp-single-product__title">Mother ASUS AYW B650M WIFI DDR5 – AM5</h1>
        <div class="summary">
          <span class="price-excl-tax"><span class="woocommerce-Price-amount"><bdi>$ 200.423,87</bdi></span></span>
          <span class="scp-price-main__current"><span class="woocommerce-Price-amount"><bdi>$ 221.468,38</bdi></span></span>
        </div>
        <link rel="canonical" href="${scpProductUrl}" />
      </main>
      <section class="related products"><h2>También te puede interesar</h2><span class="woocommerce-Price-amount"><bdi>$ 6.674</bdi></span></section>
    </body>
  </html>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('woocommerce-shared', () => {
  it('parsea detalle WooCommerce y normaliza precio, stock e imagen', () => {
    const product = parseWooProductDetail(
      `
        <html>
          <head>
            <link rel="canonical" href="/producto/rtx-5070-ti/" />
            <meta property="og:description" content=" GPU premium " />
          </head>
          <body>
            <h1 class="product_title">Placa de video ASUS RTX 5070 Ti</h1>
            <p class="price"><span class="woocommerce-Price-amount"><bdi>$ 1.249.999,00</bdi></span></p>
            <div class="woocommerce-product-gallery__wrapper">
              <img src="/media/rtx.webp" />
            </div>
            <p class="stock">Ultimas unidades</p>
          </body>
        </html>
      `,
      'https://tienda.test/producto/rtx-5070-ti/',
      {
        id: 'store',
        name: 'Store',
        baseUrl: 'https://tienda.test',
      },
      'tarjetas-graficas',
      'fallback-slug',
    );

    expect(product).not.toBeNull();
    expect(product?.id).toBe('store-rtx-5070-ti');
    expect(product?.prices[0].price).toBe(1_249_999);
    expect(product?.prices[0].stock).toBe('low-stock');
    expect(product?.image).toBe('https://tienda.test/media/rtx.webp');
    expect(product?.description).toBe('GPU premium');
  });

  it('prioriza el detalle y el precio principal de SCP sobre impuestos y productos relacionados', () => {
    const product = parseWooProductDetail(
      scpDetailHtml,
      'https://www.scphardstore.com/busqueda?q=mother',
      scpStore,
      'motherboards',
      'fallback-slug',
    );

    expect(product).not.toBeNull();
    expect(product?.name).toBe('Mother ASUS AYW B650M WIFI DDR5 - AM5');
    expect(product?.prices[0].url).toBe(scpProductUrl);
    expect(product?.prices[0].price).toBe(221_468);
    expect(product?.prices[0].price).not.toBe(200_424);
    expect(product?.prices[0].price).not.toBe(6_674);
  });

  it('termina después de un único fetch cuando una búsqueda SCP redirige al detalle', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: scpProductUrl,
      text: async () => scpDetailHtml,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const products = await scrapeWooPages(
      'https://www.scphardstore.com/busqueda?q=mother',
      scpStore,
      'motherboards',
      3,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe('Mother ASUS AYW B650M WIFI DDR5 - AM5');
    expect(products[0]?.prices[0].url).toBe(scpProductUrl);
    expect(products[0]?.prices[0].price).toBe(221_468);
  });
});

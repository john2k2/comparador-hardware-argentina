import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWooCommerceKnownOffer, parseWooProductDetail, scrapeWooPages } from './woocommerce-shared';

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
  it('rechaza USD del Offer principal y no usa metadata numérica sin corroborar ARS', async () => {
    const url = 'https://dinobyte.ar/producto/ram/';
    const store = { id: 'dinobyte', name: 'Dinobyte', baseUrl: 'https://dinobyte.ar' };
    const schema = { '@type': 'Product', name: 'Memoria RAM', url, offers: { '@type': 'Offer', price: 200, priceCurrency: 'USD' } };
    const html = '<main class="product instock"><h1 class="product_title">Memoria RAM</h1></main>'
      + `<link rel="canonical" href="${url}"><meta property="product:price:amount" content="200">`
      + `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
    expect(parseWooProductDetail(html, url, store, 'memoria-ram', 'ram')).toBeNull();
    const relativeSchema = html.replace(JSON.stringify(url), JSON.stringify('/producto/ram/'))
      .replace('</main>', '<p class="price"><bdi>$200</bdi></p></main>');
    expect(parseWooProductDetail(relativeSchema, url, store, 'memoria-ram', 'ram')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html)));
    await expect(fetchWooCommerceKnownOffer(store.id, url, 'memoria-ram')).rejects.toMatchObject({ reason: 'inconsistent-source' });
    expect(parseWooProductDetail(html.replace('USD', 'ARS'), url, store, 'memoria-ram', 'ram')).toBeNull();
  });

  it('el USD de otro Product no cambia el importe ARS visible del principal', () => {
    const related = JSON.stringify({ '@type': 'Product', name: 'Otro producto', offers: { price: 200, priceCurrency: 'USD' } });
    const html = scpDetailHtml.replace('</html>', `<script type="application/ld+json">${related}</script></html>`);
    expect(parseWooProductDetail(html, scpProductUrl, scpStore, 'motherboards', 'mother')?.prices[0].price).toBe(221468);
  });
  it('no usa el fallback JSON-LD para sanar una moneda extranjera en el precio principal', async () => {
    const html = '<h1 class="product_title">Memoria RAM</h1><p class="price"><bdi>USD 100</bdi></p>'
      + '<link rel="canonical" href="https://katech.com.ar/producto/ram/"><script type="application/ld+json">'
      + JSON.stringify({ '@type': 'Product', name: 'Memoria RAM', offers: { '@type': 'Offer', price: 100, priceCurrency: 'ARS' } }) + '</script>';
    const source = vi.fn().mockResolvedValue(new Response(html));
    vi.stubGlobal('fetch', source);
    await expect(fetchWooCommerceKnownOffer('katech', 'https://katech.com.ar/producto/ram/', 'memoria-ram'))
      .rejects.toMatchObject({ reason: 'inconsistent-source' });
    expect(source).toHaveBeenCalledTimes(1);
  });
  it.each(['USD 221.468,38', 'U$S 221.468,38', 'US$ 221.468,38', 'EUR 221.468,38'])('no interpreta %s como pesos argentinos', amount => {
    const html = scpDetailHtml.replace('$ 221.468,38', amount);
    expect(parseWooProductDetail(html, scpProductUrl, scpStore, 'motherboards', 'mother')).toBeNull();
  });

  it('rechaza moneda extranjera explícita del principal y excluye monedas de relacionados', () => {
    const currency = '<meta itemprop="priceCurrency" content="USD">';
    const parse = (html: string) => parseWooProductDetail(html, scpProductUrl, scpStore, 'motherboards', 'mother');
    expect(parse(scpDetailHtml.replace('<main class="product">', `<main class="product">${currency}`))).toBeNull();
    const related = scpDetailHtml.replace('<section class="related products">', `<section class="related products">${currency}`);
    expect(parse(related)?.prices[0].price).toBe(221468);
    expect(parse(scpDetailHtml.replace('<html>', '<html><meta property="product:price:currency" content="ARS">'))?.prices[0].price).toBe(221468);
  });
  it('toma el ID de la publicación principal y rechaza IDs contradictorios', () => {
    const html = scpDetailHtml.replace('<main class="product">', '<main id="product-123" class="product instock"><button name="add-to-cart" value="123">Comprar</button>')
      .replace('<section class="related products">', '<section class="related products"><button name="add-to-cart" value="987">Comprar otro</button>');
    expect(parseWooProductDetail(html, scpProductUrl, scpStore, 'motherboards', 'mother')?.specs.SourceListingId).toBe('123');
    expect(parseWooProductDetail(html.replace('value="123"', 'value="456"'), scpProductUrl, scpStore, 'motherboards', 'mother')).toBeNull();
  });
  it('MaxTecno usa el efectivo/transferencia visible y excluye lista, cuotas e impuestos', () => {
    const product = parseWooProductDetail(`<body class="single-product"><main class="product instock"><h1 class="product-title">Memoria Corsair 16GB</h1><div class="price-showcase-box"><span class="price-old">$120.000</span><span class="price-main">$100.000</span></div><div class="cuotas">12 x $10.000</div></main><section class="related products"><p class="price"><bdi>$1.000</bdi></p><div class="product outofstock"></div></section></body>`, 'https://maxtecno.com.ar/producto/ram/', { id:'maxtecno', name:'MaxTecno', baseUrl:'https://maxtecno.com.ar' }, 'memoria-ram', 'ram');
    expect(product?.prices[0]).toMatchObject({ price:100000, stock:'in-stock', priceCondition:'special' });
  });
  it('SCP reconoce stock sólo en la raíz principal y conserva el agotamiento explícito', () => {
    const html = scpDetailHtml.replace('<main class="product">', '<main id="product-123" class="product instock">');
    expect(parseWooProductDetail(html, scpProductUrl, scpStore, 'motherboards', 'mother')?.prices[0].stock).toBe('in-stock');
    expect(parseWooProductDetail(html.replace('product instock', 'product outofstock'), scpProductUrl, scpStore, 'motherboards', 'mother')?.prices[0].stock).toBe('out-of-stock');
  });
  it('LionTech reconoce el encabezado simple y no presume stock por tener precio', () => {
    const html = '<body class="single-product"><h1>GPU RTX 5060</h1><p class="price"><bdi>$500.000</bdi></p><p class="stock out-of-stock">Agotado</p></body>';
    expect(parseWooProductDetail(html, 'https://liontech.com.ar/producto/gpu/', { id:'liontech', name:'LionTech', baseUrl:'https://liontech.com.ar' }, 'tarjetas-graficas', 'gpu')?.prices[0]).toMatchObject({ price:500000, stock:'out-of-stock' });
  });
  it('no recupera el importe personalizado de MaxTecno desde un relacionado', () => {
    const html = '<main class="product"><h1 class="product-title">GPU RTX 5060</h1><section class="related products"><div class="price-showcase-box"><span class="price-main">$100.000</span></div></section></main>';
    expect(parseWooProductDetail(html, 'https://maxtecno.com.ar/producto/gpu/', { id:'maxtecno', name:'MaxTecno', baseUrl:'https://maxtecno.com.ar' }, 'tarjetas-graficas', 'gpu')).toBeNull();
  });
  it('usa el precio principal de Katech y no el descuento de otra memoria recomendada', () => {
    const product = parseWooProductDetail(`
      <body class="single-product">
        <h1 class="post_title">MEMORIA RAM 16GB DDR4 3200 KINGSTON FURY BEAST</h1>
        <section class="related products"><p class="price"><ins><bdi>$150.412,00</bdi></ins></p></section>
        <p class="product_field price">$385.890,00</p>
        <div class="cuotas-mp-precio-lista">$501.657,00</div>
        <p class="stock in-stock">Disponible en 24-48hs</p>
      </body>`,
      'https://katech.com.ar/producto/memoria-ram-16gb-ddr4-3200-kingston-fury-beast/',
      { id: 'katech', name: 'Katech', baseUrl: 'https://katech.com.ar' },
      'memoria-ram', 'fallback');
    expect(product?.prices[0].price).toBe(385_890);
    expect(product?.prices[0].stock).toBe('in-stock');
  });

  it('no inventa un precio de detalle cuando solo hay precios en recomendaciones', () => {
    const product = parseWooProductDetail(`
      <h1 class="product_title">NVIDIA RTX 5060</h1>
      <section class="related products"><p class="price"><bdi>$150.412</bdi></p></section>`,
      'https://tienda.test/producto/5060/',
      { id: 'store', name: 'Store', baseUrl: 'https://tienda.test' },
      'tarjetas-graficas', 'fallback');
    expect(product).toBeNull();
  });

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

  it('no mezcla stock ni SKU de relacionados con el detalle principal', () => {
    const product = parseWooProductDetail(
      `
        <body class="single-product">
          <h1 class="product_title">Placa de video ASUS RTX 5060</h1>
          <p class="price"><bdi>$ 500.000</bdi></p>
          <section class="related products">
            <p class="stock in-stock">Disponible</p>
            <span class="sku">SKU-RELACIONADO</span>
          </section>
        </body>
      `,
      'https://tienda.test/producto/rtx-5060/',
      { id: 'store', name: 'Store', baseUrl: 'https://tienda.test' },
      'tarjetas-graficas',
      'fallback',
    );

    expect(product?.prices[0].stock).toBe('unknown');
    expect(product?.specs.SKU).toBeUndefined();
  });

  it('mantiene out-of-stock del principal aunque un relacionado tenga stock', () => {
    const product = parseWooProductDetail(
      `
        <body class="single-product">
          <h1 class="product_title">Placa de video ASUS RTX 5060</h1>
          <p class="price"><bdi>$ 500.000</bdi></p>
          <p class="stock out-of-stock">Agotado</p>
          <section class="related products">
            <p class="stock in-stock">Disponible</p>
          </section>
        </body>
      `,
      'https://tienda.test/producto/rtx-5060/',
      { id: 'store', name: 'Store', baseUrl: 'https://tienda.test' },
      'tarjetas-graficas',
      'fallback',
    );

    expect(product?.prices[0].stock).toBe('out-of-stock');
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

it('no convierte ausencia de stock en disponibilidad y reconoce el título de Katech', () => {
  const product = parseWooProductDetail('<body class="single-product"><h1 class="post_title">SSD Kingston NV3 1TB</h1><p class="price"><bdi>$ 311.039</bdi><span class="woocommerce-Price-amount"><bdi>$ 311.039</bdi></span></p><span class="sku">DIS793</span></body>', 'https://katech.com.ar/producto/ssd/', {id:'katech',name:'Katech',baseUrl:'https://katech.com.ar'}, 'almacenamiento', 'ssd');
  expect(product?.prices[0].stock).toBe('unknown');
  expect(product?.specs.SKU).toBe('DIS793');
});


it('no toma el precio mínimo de una publicación con variantes sin selección exacta', () => {
  const parsed = parseWooProductDetail('<h1 class="product_title">Memoria RAM</h1><p class="price"><bdi>$40.000</bdi> – <bdi>$80.000</bdi></p><form class="variations_form"><table class="variations"></table></form>', 'https://katech.com.ar/producto/ram/', {id:'katech',name:'Katech',baseUrl:'https://katech.com.ar'}, 'memoria-ram', 'ram');
  expect(parsed).toBeNull();
});

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

// Fragmento de la ficha real 3750614/DIS731 leída el 08/10/2026 13:13:24 UTC.
// Sólo se conservaron nodos del principal; el HTML completo queda en el corte.
const dinobyteReserveUrl = 'https://dinobyte.ar/producto/disco-solido-nvme-western-digital-green-sn3000-500gb/';
const dinobyteStore = { id: 'dinobyte', name: 'Dinobyte', baseUrl: 'https://dinobyte.ar' };
const dinobyteReserveFragment = `
  <body class="single-product">
    <h1 class="w-post-elm post_title us_custom_8e46ea77 entry-title color_link_inherit">Disco Solido Nvme Western Digital Green SN3000 500GB</h1>
    <p class="w-post-elm product_field price us_custom_0809a129 has_text_color"><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol" translate="no">$</span><span class="woocommerce-Price-amount amount">174.900,00&nbsp;</span></bdi></span></p>
    <span class="sku">DIS731</span>
    <p class="stock available-on-backorder">Disponible para reserva</p>
    <button type="submit" name="add-to-cart" value="3750614" class="single_add_to_cart_button button alt">Añadir al carrito</button>
  </body>
`;

// Fragmentos mínimos de respuestas reales Katech del 14/10/2026, 13:36 UTC.
// RAM 1023210/MSO047 y notebook 1023037/NOT1348; capturas completas en outputs/seguimiento-post-publicacion-2026-10-14/tiendas.
const katechStore = { id: 'katech', name: 'Katech', baseUrl: 'https://katech.com.ar' };
const katechAcuFixture = (id = '1023210', sku = 'MSO047', name = 'MEMORIA RAM SODIMM 32GB DDR5 5600 CORSAIR VENGEANCE', amount = '1.022.610,00', slug = 'memoria-ram-sodimm-32gb-ddr5-5600-corsair-vengeance') => {
  const url = `https://katech.com.ar/producto/${slug}/`;
  return { url, html: `<html><head><link rel="canonical" href="${url}"><meta property="product:price:currency" content="ARS"></head>
    <body class="single-product"><div id="product-${id}" class="acu-hero product onbackorder">
      <section id="acu-buy" class="acu-card acu-buy"><h1 class="acu-title">${name}</h1>
        <div class="acu-meta"><span class="acu-sku">${sku}</span></div>
        <div class="acu-pricebox"><div class="acu-cash-l acu-desk"><h5>Precio especial EFECTIVO/TRANSFERENCIA </h5></div>
          <div class="acu-cash-l acu-mob">Precio especial EFECTIVO/TRANSFERENCIA </div>
          <div class="acu-price"><p class="price"><span class="woocommerce-Price-amount"><bdi>$${amount}</bdi></span></p></div></div>
        <p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>
        <button class="single_add_to_cart_button" name="add-to-cart" value="${id}">Añadir al carrito</button>
        <div class="cuotas-mp-precio-lista">$1.329.393,00</div>
      </section></div></body></html>` };
};

describe('Katech ficha acu', () => {
  const read = (html: string, url = katechAcuFixture().url) => parseWooProductDetail(html, url, katechStore, 'memoria-ram', 'diag');
  it.each([
    katechAcuFixture(),
    katechAcuFixture('1023037', 'NOT1348', 'NOTEBOOK HP 16 ZBOOK XG2I U9-386H 32G 1T RTX 1000 8G W11', '8.270.050,00', 'notebook-hp-16-zbook-xg2i-u9-386h-32g-1t-rtx-1000-8g-w11'),
  ])('observa importe especial e identidad de captura real, conserva la reserva unknown', ({ html, url }) => {
    const product = read(html, url);
    expect(product?.prices[0]).toMatchObject({ stock: 'unknown', priceCondition: 'special', url });
    expect(product?.prices[0].price).toBe(url.includes('notebook') ? 8270050 : 1022610);
    expect(product?.specs).toMatchObject(url.includes('notebook') ? { SKU: 'NOT1348', SourceListingId: '1023037' } : { SKU: 'MSO047', SourceListingId: '1023210' });
  });
  it('no usa recomendaciones, lista, cuotas ni metadata para sanar un precio principal ausente', () => {
    const { html } = katechAcuFixture();
    const poisoned = html.replace('</body>', '<section class="related products"><h1 class="acu-title">Otra RAM</h1><p class="price">$1</p><span class="stock in-stock">En stock</span></section><meta property="product:price:amount" content="999999"></body>');
    expect(read(poisoned)?.prices[0].price).toBe(1022610);
    expect(read(poisoned.replace('<p class="price"><span class="woocommerce-Price-amount"><bdi>$1.022.610,00</bdi></span></p>', ''))).toBeNull();
  });
  it('retiene unknown sin stock aunque el botón esté habilitado y la raíz diga instock', () => {
    const html = katechAcuFixture().html.replace('product onbackorder', 'product instock').replace('<p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>', '');
    expect(read(html)?.prices[0].stock).toBe('unknown');
    expect(read(html.replace('</section>', '<p class="stock in-stock">Hay existencias</p></section>'))?.prices[0].stock).toBe('in-stock');
  });
  it('lee ins vigente antes de del y rechaza ins oculto en vez de recuperar el precio tachado', () => {
    const html = katechAcuFixture().html.replace('<span class="woocommerce-Price-amount"><bdi>$1.022.610,00</bdi></span>',
      '<del><span class="woocommerce-Price-amount"><bdi>$1.200.000,00</bdi></span></del><ins><span class="woocommerce-Price-amount"><bdi>$1.022.610,00</bdi></span></ins>');
    expect(read(html)?.prices[0].price).toBe(1022610);
    expect(read(html.replace('<ins>', '<ins hidden>'))).toBeNull();
  });
  // Controles sintéticos offline derivados de la revisión; no son nuevas observaciones de Katech.
  it.each(['del', 's', 'strike', 'span style="text-decoration: line-through"', 'span style="text-decoration-line: line-through"'])('rechaza un único importe tachado con %s sin precio vigente', tag => {
    const html = katechAcuFixture().html.replace('<span class="woocommerce-Price-amount"><bdi>$1.022.610,00</bdi></span>',
      `<${tag}><span class="woocommerce-Price-amount"><bdi>$1.022.610,00</bdi></span></${tag.split(' ')[0]}>`);
    expect(read(html)).toBeNull();
  });
  it.each(['No hay existencias', 'Sin existencias', 'No hay stock', 'No hay existencias; últimas unidades', 'Sin existencias; pocas unidades'])('negación explícita %s prevalece sobre carrito, instock y pocas unidades', stockText => {
    const html = katechAcuFixture().html.replace('product onbackorder', 'product instock')
      .replace('<p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>', `<p class="stock in-stock">${stockText}</p>`);
    expect(read(html)?.prices[0].stock).toBe('out-of-stock');
  });
  it.each(['Últimas unidades', 'Pocas unidades'])('conserva disponibilidad limitada sin negación: %s', stockText => {
    const html = katechAcuFixture().html.replace('product onbackorder', 'product instock')
      .replace('<p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>', `<p class="stock in-stock">${stockText}</p>`);
    expect(read(html)?.prices[0].stock).toBe('low-stock');
  });
  it.each(['No está en stock', 'No se encuentra en stock', 'No contamos con stock', 'Stock no disponible'].flatMap(stockText => [
    [stockText, ''], [stockText, ' in-stock'],
  ]))('una negación %s con clase %s jamás activa disponibilidad positiva', (stockText, className) => {
    const html = katechAcuFixture().html.replace('product onbackorder', 'product instock')
      .replace('<p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>', `<p class="stock${className}">${stockText}</p>`);
    expect(read(html)?.prices[0].stock).toBe(stockText === 'Stock no disponible' ? 'out-of-stock' : 'unknown');
  });
  it.each(['Hay stock disponible!', 'Hay existencias', 'En stock', 'Stock disponible'])('conserva afirmación inequívoca sin clase positiva: %s', stockText => {
    const html = katechAcuFixture().html.replace('product onbackorder', 'product')
      .replace('<p class="stock available-on-backorder">Disponible en 24/48hs hábiles para retiro/despacho</p>', `<p class="stock">${stockText}</p>`);
    expect(read(html)?.prices[0].stock).toBe('in-stock');
  });
  it('mantiene pago unspecified si faltan etiquetas y captura cambios de SKU sin reutilizar el anterior', () => {
    const html = katechAcuFixture().html.replaceAll('Precio especial EFECTIVO/TRANSFERENCIA ', '').replace('MSO047', 'MSO999');
    expect(read(html)?.prices[0].priceCondition).toBe('unspecified');
    expect(read(html)?.specs.SKU).toBe('MSO999');
  });
  it.each([
    ['canonical de otra publicación', (html: string) => html.replace('href="https://katech.com.ar/producto/memoria-ram-sodimm-32gb-ddr5-5600-corsair-vengeance/"', 'href="https://katech.com.ar/producto/otra-ram/"')],
    ['ID contradictorio', (html: string) => html.replace('value="1023210"', 'value="1023037"')],
    ['moneda distinta', (html: string) => html.replace('content="ARS"', 'content="USD"')],
    ['título ausente', (html: string) => html.replace('class="acu-title"', 'class="unrelated-title"')],
    ['SKU ausente', (html: string) => html.replace('MSO047', '')],
    ['segundo importe principal', (html: string) => html.replace('</p></div></div>', '</p><p class="price">$999</p></div></div>')],
  ])('rechaza %s', (_, alter) => expect(read(alter(katechAcuFixture().html))).toBeNull());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('woocommerce-shared', () => {
  it('conserva como desconocida la reserva del fragmento real de Dinobyte aunque permita comprar', () => {
    const product = parseWooProductDetail(dinobyteReserveFragment, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000');
    expect(product?.prices[0]).toMatchObject({ price: 174900, stock: 'unknown', url: dinobyteReserveUrl });
    expect(product?.specs).toMatchObject({ SourceListingId: '3750614', SKU: 'DIS731' });
  });

  // Controles sintéticos: no representan otras publicaciones observadas.
  it.each([
    ['clase de reserva', '<p class="stock available-on-backorder">Disponible</p>'],
    ['texto de reserva sin clase', '<p class="stock">Disponible para reserva</p>'],
    ['texto inglés', '<p class="stock">Available on backorder</p>'],
    ['raíz en reserva', '<main class="product onbackorder"></main>'],
    ['últimas unidades contradictorias', '<p class="stock">Ultimas unidades</p><p class="stock available-on-backorder">Disponible para reserva</p>'],
  ])('reserva por %s prevalece sobre raíz instock y botón habilitado', (_, stockMarkup) => {
    const html = dinobyteReserveFragment.replace('<body class="single-product">', '<body class="single-product"><main class="product instock">')
      .replace('<p class="stock available-on-backorder">Disponible para reserva</p>', stockMarkup)
      .replace('</body>', '</main></body>');
    expect(parseWooProductDetail(html, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000')?.prices[0].stock).toBe('unknown');
  });

  it('mantiene agotamiento explícito antes de reserva y señales positivas contradictorias', () => {
    const html = dinobyteReserveFragment.replace('<body class="single-product">', '<body class="single-product"><main class="product instock outofstock">')
      .replace('</body>', '<p class="stock">Ultimas unidades</p></main></body>');
    expect(parseWooProductDetail(html, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000')?.prices[0].stock).toBe('out-of-stock');
  });

  it.each(['related products', 'up-sells', 'cross-sells', 'w-grid-item'])('no toma reserva de %s para bloquear disponibilidad del principal', className => {
    const html = dinobyteReserveFragment.replace('class="stock available-on-backorder">Disponible para reserva', 'class="stock in-stock">Disponible')
      .replace('</body>', `<section class="${className}"><p class="stock available-on-backorder">Disponible para reserva</p><div class="product onbackorder"></div></section></body>`);
    expect(parseWooProductDetail(html, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000')?.prices[0].stock).toBe('in-stock');
  });

  it.each(['up-sells', 'upsells', 'cross-sells'].flatMap(className => [
    [className, '<main class="product onbackorder"></main>'],
    [className, '<div id="product-987" class="product onbackorder"></div>'],
  ]))('excluye raíces de producto relacionadas en %s: %s', (className, relatedRoot) => {
    const html = dinobyteReserveFragment.replace('class="stock available-on-backorder">Disponible para reserva', 'class="stock in-stock">Disponible')
      .replace('</body>', `<section class="${className}">${relatedRoot}</section></body>`);
    const product = parseWooProductDetail(html, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000');
    expect(product?.prices[0].stock).toBe('in-stock');
    expect(product?.specs.SourceListingId).toBe('3750614');
  });

  it.each([
    ['disponible normal', '<p class="stock in-stock">Disponible</p>', 'in-stock'],
    ['pocas unidades', '<p class="stock">Pocas unidades</p>', 'low-stock'],
  ])('conserva %s del principal cuando no hay reserva', (_, stockMarkup, expected) => {
    const html = dinobyteReserveFragment.replace('<p class="stock available-on-backorder">Disponible para reserva</p>', stockMarkup);
    expect(parseWooProductDetail(html, dinobyteReserveUrl, dinobyteStore, 'almacenamiento', 'sn3000')?.prices[0].stock).toBe(expected);
  });

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

  // Fragmento del principal 8121/CPU083 leído el 11/10/2026 a las 15:22:07 UTC.
  const goldenUrl = 'https://goldentechstore.com.ar/producto/procesador-amd-ryzen-7-8700g-am5-con-video-con-cooler/';
  const goldenPill = '<span class="gt-ficha__pill gt-ficha__pill--blue"><svg aria-hidden="true"></svg>Disponible en 24-48 hs</span>';
  const goldenDetail = (meta = goldenPill, stock = '<p class="stock in-stock"></p>', extra = '') => `<link rel="canonical" href="${goldenUrl}"><body class="single-product"><div class="gt-ficha"><div class="gt-ficha__buy"><div class="gt-ficha__meta">${meta}<span class="gt-ficha__sku">SKU: CPU083</span></div><h1 class="gt-ficha__title">PROCESADOR AMD RYZEN 7 8700G AM5 CON VIDEO CON COOLER</h1><span class="gt-ficha-cash__now">$ 454.585,76</span><span class="gt-ficha-cash__was">$ 509.136,05</span>${stock}<button name="add-to-cart" value="8121" class="single_add_to_cart_button">Agregar al carrito</button>${extra}</div></div></body>`;
  const parseGolden = (html: string) => parseWooProductDetail(html, goldenUrl, { id:'goldentechstore', name:'GoldenTech', baseUrl:'https://goldentechstore.com.ar' }, 'procesadores', '8700g');

  it('GoldenTech conserva precio cash y registra stock desconocido ante disponibilidad primaria en 24–48 horas', () => {
    const product = parseGolden(goldenDetail());
    expect(product?.prices[0]).toMatchObject({ price:454586, stock:'unknown', priceCondition:'special', url:goldenUrl });
    expect(product?.specs).toMatchObject({ SKU:'CPU083', SourceListingId:'8121' });
    expect(parseGolden(goldenDetail(goldenPill, '<p class="stock in-stock">Últimas unidades</p>'))?.prices[0].stock).toBe('unknown');
  });
  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"'])('GoldenTech ignora disponibilidad diferida oculta por %s', attribute => {
    expect(parseGolden(goldenDetail(goldenPill.replace('<span ', `<span ${attribute} `)))?.prices[0].stock).toBe('in-stock');
    expect(parseGolden(goldenDetail().replace('class="gt-ficha__meta"', `class="gt-ficha__meta" ${attribute}`))?.prices[0].stock).toBe('in-stock');
    expect(parseGolden(goldenDetail(goldenPill.replace('Disponible en 24-48 hs', `<span ${attribute}>Disponible en 24-48 hs</span>`)))?.prices[0].stock).toBe('in-stock');
  });
  it.each(['gt-ficha-related', 'related products'])('GoldenTech ignora disponibilidad diferida de recomendados %s', className => {
    const related = `<section class="${className}"><div class="gt-ficha__meta">${goldenPill}</div></section>`;
    expect(parseGolden(goldenDetail('', undefined, related))?.prices[0].stock).toBe('in-stock');
  });
  it('GoldenTech no toma envío o cotización general como disponibilidad diferida', () => {
    expect(parseGolden(goldenDetail(goldenPill.replace('Disponible en', 'Envío en')))?.prices[0].stock).toBe('in-stock');
    expect(parseGolden(goldenDetail('', undefined, `<aside class="shipping">${goldenPill}</aside>`))?.prices[0].stock).toBe('in-stock');
    expect(parseGolden(goldenDetail('').replace('</body>', `<div class="gt-ficha__meta">${goldenPill}</div></body>`))?.prices[0].stock).toBe('in-stock');
  });
  it.each(['<p class="stock out-of-stock">Sin stock</p>', '<p class="stock">Agotado</p>', '<main class="product outofstock"></main>'])('GoldenTech conserva agotamiento explícito sobre disponibilidad diferida: %s', stock => {
    expect(parseGolden(goldenDetail(goldenPill, stock))?.prices[0]).toMatchObject({ price:454586, stock:'out-of-stock', priceCondition:'special' });
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

  it.each(['', '<p class="product_field price"><ins hidden><bdi>$3.162.723</bdi></ins></p>', '<p class="price" hidden><bdi>$3.162.723</bdi></p>', '<section class="related products"><p class="price"><bdi>$3.162.723</bdi></p></section>'])('Katech sin precio visible no observa metadata conservada ni sanada con JSON-LD: %s', async content => {
    // Ficha conocida 5080 leída el11/10/2026: SinStock, sin bloque de precio,
    // OpenGraph aún conservaba3162723. El fallback tampoco puede renovar ese importe.
    const name = 'VIDEO GEFORCE RTX 5080 16GB GIGABYTE GAMING OC';
    const url = 'https://katech.com.ar/producto/video-geforce-rtx-5080-16gb-gigabyte-gaming-oc/';
    const store = {id:'katech',name:'Katech',baseUrl:'https://katech.com.ar'};
    const schema = {'@type':'Product',name,url,offers:{'@type':'Offer',price:3162723,priceCurrency:'ARS',availability:'https://schema.org/OutOfStock'}};
    const html = `<body class="single-product"><h1 class="post_title">${name}</h1><link rel="canonical" href="${url}"><meta property="product:price:currency" content="ARS"><meta property="product:price:amount" content="3162723">${content}<p class="stock out-of-stock">Sin Stock</p><script type="application/ld+json">${JSON.stringify(schema)}</script></body>`;
    expect(parseWooProductDetail(html,url,store,'tarjetas-graficas','gpu')).toBeNull();
    const source=vi.fn().mockResolvedValue(new Response(html));vi.stubGlobal('fetch',source);
    expect(await fetchWooCommerceKnownOffer(store.id,url,'tarjetas-graficas')).toBeNull();
    expect(source).toHaveBeenCalledTimes(1);
    // Un precio principal visible sí permite registrar la observación agotada.
    const visible=html.replace(content+'<p class="stock', '<p class="product_field price"><bdi>$3.162.723</bdi></p><p class="stock');
    expect(parseWooProductDetail(visible,url,store,'tarjetas-graficas','gpu')?.prices[0]).toMatchObject({price:3162723,stock:'out-of-stock'});
  });

  it('Katech reconoce special sólo con etiqueta e importe del mismo bloque principal', () => {
    // Estructura del HTML de Katech leído el 11/10/2026 a las 14:19 UTC.
    const block = (label: string, price = '$428.250,00') => `<div class="w-vwrapper"><h5>${label}</h5><p class="product_field price"><bdi>${price}</bdi></p></div>`;
    const body = (content: string) => `<body class="single-product"><h1 class="post_title">PROCESADOR AMD RYZEN 7 8700G AM5</h1>${content}<p class="stock in-stock">Hay stock disponible!</p></body>`;
    const url = 'https://katech.com.ar/producto/procesador-amd-ryzen-7-8700g-am5/';
    const store = {id:'katech',name:'Katech',baseUrl:'https://katech.com.ar'};
    const parse = (content: string, selectedStore = store) => parseWooProductDetail(body(content), url, selectedStore, 'procesadores', 'cpu');
    const label = 'Precio especial EFECTIVO/TRANSFERENCIA';
    expect(parse(block(label))?.prices[0]).toMatchObject({price:428250,priceCondition:'special'});
    // La representación móvil incluye texto directo en lugar de h5.
    expect(parse(block(label).replace(`<h5>${label}</h5>`, label))?.prices[0].priceCondition).toBe('special');
    expect(parse(block(label) + block(label))?.prices[0].priceCondition).toBe('special');
    expect(parse(block('Precio de lista'))?.prices[0].priceCondition).toBeUndefined();
    expect(parse(`<h5>${label}</h5>` + block('Precio de lista'))?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block(label), {id:'dinobyte',name:'Dinobyte',baseUrl:'https://dinobyte.ar'})?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block(label) + block(label, '$500.000,00'))?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block('Precio de lista') + `<section class="related products">${block(label)}</section>`)?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block(label).replace('w-vwrapper', 'w-vwrapper" style="display:none'))?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block(label).replace('<h5>', '<h5 hidden>'))?.prices[0].priceCondition).toBeUndefined();
    expect(parse(block(label).replace('</div>', '<p class="product_field price">$500.000,00</p></div>'))?.prices[0].priceCondition).toBeUndefined();
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

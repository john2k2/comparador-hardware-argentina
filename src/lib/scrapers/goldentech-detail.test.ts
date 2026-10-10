import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./source-http', async () => ({ ...await vi.importActual<typeof import('./source-http')>('./source-http'), sourceFetch: mocks.fetch }));
import { parseWooProductDetail } from './woocommerce-shared';
import { fetchWooStoreKnownBatch } from './woocommerce-known-batch';

const store = { id: 'goldentechstore', name: 'Golden Tech', baseUrl: 'https://www.goldentechstore.com.ar' };
const url = 'https://goldentechstore.com.ar/producto/placa-de-video-gigabyte-amd-radeon-rx-9070-gaming-16g/';
// Nodos del principal real recibidos con SCRAPE_HEADERS el 10/10/2026 02:16:13 UTC.
// El corte externo conserva request-18.html; se omitieron envío, scripts y FAQ.
const fragment = `<link rel="canonical" href="${url}"><meta property="product:price:currency" content="ARS"><meta property="product:price:amount" content="1460226.88">
<body class="single-product"><div class="gt-ficha"><div class="gt-ficha__buy">
<h1 class="gt-ficha__title">Placa de Video GIGABYTE AMD Radeon RX 9070 GAMING 16G</h1>
<span class="gt-ficha__sku copy">SKU: EL_GIGPDV9070G16</span>
<span class="gt-ficha-cash__now">$ 1.460.226,88</span><span class="gt-ficha-cash__was">$ 1.635.454,11</span>
<p class="stock in-stock">\n</p><button type="submit" name="add-to-cart" value="185476" class="single_add_to_cart_button button alt">Agregar al carrito</button>
</div></div></body>`;
const item = { id: 185476, name: 'Placa de Video GIGABYTE AMD Radeon RX 9070 GAMING 16G', permalink: url, sku: 'EL_GIGPDV9070G16', type: 'simple', has_options: false, is_in_stock: true, is_purchasable: true, is_on_backorder: false,
  prices: { price: '146022688', currency_code: 'ARS', currency_minor_unit: 2, price_range: null }, stock_availability: { class: 'in-stock' } };
const parse = (html = fragment) => parseWooProductDetail(html, url, store, 'tarjetas-graficas', 'fallback');
beforeEach(() => vi.resetAllMocks());

it('reconoce título, transferencia, stock y SKU del principal nuevo de GoldenTech', () => {
  const product = parse();
  expect(product?.name).toBe(item.name);
  expect(product?.prices[0]).toMatchObject({ price: 1460227, stock: 'in-stock', url, priceCondition: 'special' });
  expect(product?.specs).toMatchObject({ SKU: item.sku, SourceListingId: String(item.id) });
});
it('corrobora el lote real conservando centavos y sin observar destinos ausentes', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]))).mockResolvedValueOnce(new Response(fragment));
  const products = await fetchWooStoreKnownBatch(store.id, [{ url, category: 'tarjetas-graficas' }, { url: 'https://goldentechstore.com.ar/producto/fuente-gamer-asus-tuf-gaming-1000w-evo/', category: 'fuentes-alimentacion' }]);
  expect(products).toHaveLength(1);
  expect(products[0].prices[0]).toMatchObject({ price: 1460226.88, stock: 'in-stock', url, priceCondition: 'special' });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it.each([
  fragment.replace('class="gt-ficha-cash__now"', 'class="missing-price"'),
  fragment.replace('class="gt-ficha__title"', 'class="missing-title"'),
  fragment.replace('$ 1.460.226,88', 'USD 1.460.226,88'),
  fragment.replace('</body>', '<form class="variations_form"></form></body>'),
  fragment.replace('value="185476"', 'value="185476"><input name="product_id" value="123"'),
  fragment.replace(`href="${url}"`, 'href="https://goldentechstore.com.ar/producto/otra/"'),
  fragment.replace('value="185476"', 'value=""'),
])('rechaza principal incompleto, moneda/variante o identidad contradictoria', html => {
  expect(parse(html)).toBeNull();
});
it('no sana el principal vacío con precios o stock de recomendaciones GoldenTech', () => {
  const related = '<section class="gt-ficha-related"><div class="gt-ficha__buy"><h1 class="gt-ficha__title">Otro producto</h1><span class="gt-ficha-cash__now">$1.000</span><p class="stock in-stock">Disponible</p><button name="add-to-cart" value="123">Comprar</button></div></section>';
  expect(parse(fragment.replace('class="gt-ficha-cash__now"', 'class="missing-price"').replace('</body>', related + '</body>'))).toBeNull();
  const withoutStock = fragment.replace('<p class="stock in-stock">\n</p>', '').replace('class="single_add_to_cart_button button alt"', 'class="single_add_to_cart_button button alt" disabled');
  expect(parse(withoutStock.replace('</body>', related + '</body>'))?.prices[0].stock).toBe('unknown');
});
it.each([['out-of-stock', 'Agotado', 'out-of-stock'], ['available-on-backorder', 'Disponible para reserva', 'unknown']])('conserva %s aunque el botón esté habilitado', (className, text, expected) => {
  expect(parse(fragment.replace('<p class="stock in-stock">\n</p>', `<p class="stock ${className}">${text}</p>`))?.prices[0].stock).toBe(expected);
});
it('el contraste sigue rechazando precio, SKU e ID discordantes', async () => {
  for (const html of [fragment.replace('$ 1.460.226,88', '$ 1.500.000'), fragment.replace(item.sku, 'OTRO-SKU'), fragment.replace('value="185476"', 'value="123"')]) {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]))).mockResolvedValueOnce(new Response(html));
    await expect(fetchWooStoreKnownBatch(store.id, [{ url, category: 'tarjetas-graficas' }])).rejects.toThrow('inconsistent-source');
  }
});

// Negativos de revisión: el JSON-LD conserva datos plausibles aunque el principal
// visible falte o sea contradictorio. El lote entero debe seguir rechazándolos.
const corroboratingSchema = '<script type="application/ld+json">' + JSON.stringify({
  '@type': 'Product', name: item.name, url, sku: item.sku,
  offers: { '@type': 'Offer', url, priceCurrency: 'ARS', price: '1460226.88', availability: 'https://schema.org/InStock' },
}) + '</script>';
const emptyTitleRelated = fragment.replace(`<h1 class="gt-ficha__title">${item.name}</h1>`, '<h1 class="gt-ficha__title"> </h1>')
  .replace('</body>', `<section class="gt-ficha-related"><h1 class="entry-title">${item.name}</h1></section></body>`);
const hiddenAttributes = ['hidden', 'aria-hidden="true"', 'style="display: none"', 'style="visibility: hidden !important"'];
const reviewedNegatives = [
  ['título vacío y título recomendado', emptyTitleRelated],
  ['precio ausente', fragment.replace('class="gt-ficha-cash__now"', 'class="missing-price"')],
  ['ID ausente', fragment.replace('value="185476"', 'value=""')],
  ['ID contradictorio', fragment.replace('value="185476"', 'value="185476"><input name="product_id" value="123"')],
  ['canonical adicional discordante', fragment.replace('</body>', '<link rel="canonical" href="https://goldentechstore.com.ar/producto/otra/"></body>')],
  ['canonical relativo discordante', fragment.replace('</body>', '<link rel="canonical" href="/producto/otra/"></body>')],
  ...hiddenAttributes.flatMap(attribute => [
    [`principal ${attribute}`, fragment.replace('class="gt-ficha__buy"', `class="gt-ficha__buy" ${attribute}`)],
    [`título ${attribute}`, fragment.replace('class="gt-ficha__title"', `class="gt-ficha__title" ${attribute}`)],
    [`precio ${attribute}`, fragment.replace('class="gt-ficha-cash__now"', `class="gt-ficha-cash__now" ${attribute}`)],
    [`contenido del precio ${attribute}`, fragment.replace('$ 1.460.226,88', `<span ${attribute}>$ 1.460.226,88</span>`)],
    [`stock ${attribute}`, fragment.replace('class="stock in-stock"', `class="stock in-stock" ${attribute}`).replace('class="single_add_to_cart_button button alt"', `class="single_add_to_cart_button button alt" ${attribute}`)],
    [`ID ${attribute}`, fragment.replace('class="single_add_to_cart_button button alt"', `class="single_add_to_cart_button button alt" ${attribute}`)],
  ]),
];
it.each(reviewedNegatives)('el lote rechaza %s aun con JSON-LD concordante', async (_, html) => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify([item]))).mockResolvedValueOnce(new Response(html + corroboratingSchema));
  await expect(fetchWooStoreKnownBatch(store.id, [{ url, category: 'tarjetas-graficas' }])).rejects.toThrow('inconsistent-source');
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it('admite canonicals equivalentes normalizados y mantiene stock explícito del principal', () => {
  const html = fragment.replace('</body>', `<link rel="canonical" href="https://www.goldentechstore.com.ar${new URL(url).pathname}?utm_source=test"></body>`);
  expect(parse(html)?.prices[0]).toMatchObject({ url, stock: 'in-stock' });
});
it('excluye señales y textos ocultos secundarios sin modificar título, precio o stock visibles', () => {
  const html = fragment.replace(item.name, `${item.name}<span hidden> Otro modelo</span>`)
    .replace('$ 1.460.226,88', '$ 1.460.226,88<span aria-hidden="true"> $1.000</span>')
    .replace('</div></div></body>', '<span class="gt-ficha__sku" hidden>SKU: OTRO</span><p class="stock out-of-stock" style="display:none">Agotado</p><button name="add-to-cart" value="123" aria-hidden="true">Comprar</button></div></div></body>');
  expect(parse(html)?.name).toBe(item.name);
  expect(parse(html)?.prices[0]).toMatchObject({ price: 1460227, stock: 'in-stock' });
  expect(parse(html)?.specs).toMatchObject({ SourceListingId: '185476', SKU: item.sku });
});

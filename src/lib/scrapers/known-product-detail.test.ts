import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./source-http', async () => ({ ...await vi.importActual('./source-http'), sourceFetch: mocks.fetch }));
import { fetchKnownProductDetail, parseKnownProductDetail } from './known-product-detail';
import { SourceHttpError } from './source-http';

const store = {
  id: 'known-store',
  name: 'Known Store',
  baseUrl: 'https://known.example',
};
const pageUrl = 'https://known.example/producto/rtx-5060/';

function detailHtml(input: {
  canonical?: string;
  products?: unknown[];
  json?: string;
  heading?: string;
} = {}) {
  const heading = input.heading ?? 'Placa de video ASUS RTX 5060';
  const canonical = input.canonical ?? pageUrl;
  const json = input.json ?? JSON.stringify(input.products ?? [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: heading,
    url: pageUrl,
    sku: 'ASUS-RTX5060-8G',
    offers: {
      '@type': 'Offer',
      price: 500000,
      priceCurrency: 'ARS',
    },
  }]);

  return `
    <html>
      <head><link rel="canonical" href="${canonical}" /></head>
      <body><h1>${heading}</h1><script type="application/ld+json">${json}</script></body>
    </html>
  `;
}

function parse(html: string) {
  return parseKnownProductDetail(html, pageUrl, store, 'tarjetas-graficas');
}

afterEach(() => vi.resetAllMocks());

describe('parseKnownProductDetail', () => {
  it('acepta un unico Product coincidente, precio ARS positivo y SKU principal', () => {
    const product = parse(detailHtml());

    expect(product).not.toBeNull();
    expect(product?.prices[0]).toMatchObject({
      price: 500000,
      stock: 'unknown',
      url: pageUrl,
    });
    expect(product?.specs.SKU).toBe('ASUS-RTX5060-8G');
  });

  it('reconoce InStock y no toma el precio de un Product relacionado con otro nombre', () => {
    const product = parse(detailHtml({
      products: [
        {
          '@type': 'Product',
          name: 'Placa de video ASUS RTX 5060',
          url: pageUrl,
          offers: { '@type': 'Offer', price: 500000, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' },
        },
        {
          '@type': 'Product',
          name: 'Producto relacionado RTX 4070',
          offers: { '@type': 'Offer', price: 1, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' },
        },
      ],
    }));

    expect(product?.prices[0]).toMatchObject({ price: 500000, stock: 'in-stock' });
  });

  it.each([
    ['rechaza AggregateOffer', { '@type': 'AggregateOffer', lowPrice: 400000, priceCurrency: 'ARS' }],
    ['rechaza moneda USD', { '@type': 'Offer', price: 500000, priceCurrency: 'USD' }],
    ['rechaza multiples offers', [
      { '@type': 'Offer', price: 500000, priceCurrency: 'ARS' },
      { '@type': 'Offer', price: 510000, priceCurrency: 'ARS' },
    ]],
  ])('%s', (_label, offers) => {
    expect(parse(detailHtml({ products: [{
      '@type': 'Product',
      name: 'Placa de video ASUS RTX 5060',
      url: pageUrl,
      offers,
    }] }))).toBeNull();
  });

  it('rechaza canonical distinto y JSON-LD invalido', () => {
    expect(parse(detailHtml({ canonical: 'https://known.example/producto/otro/' }))).toBeNull();
    expect(parse(detailHtml({ json: '{"@type":"Product",' }))).toBeNull();
  });

  it('rechaza la probe con precio y stock visibles contradictorios aunque identidad y moneda coincidan', () => {
    const source = detailHtml({ products: [{ '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl,
      offers: { '@type': 'Offer', price: 100000, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' } }] });
    expect(parse(source + '<span class="price">$200.000</span><span class="stock">Sin stock</span>')).toBeNull();
  });

  it('sólo stock contradictorio basta para rechazar; ausencia de stock conserva unknown', () => {
    const source = detailHtml({ products: [{ '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl,
      offers: { '@type': 'Offer', price: 500000, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' } }] });
    expect(parse(source + '<span class="stock">Sin stock</span>')).toBeNull();
    expect(parse(detailHtml())?.prices[0].stock).toBe('unknown');
    expect(parse(detailHtml() + '<span class="stock">0 disponibles</span>')?.prices[0].stock).toBe('out-of-stock');
    expect(parse(detailHtml() + '<span class="stock">Sin stock / Disponible</span>')).toBeNull();
  });

  it('conserva precio numérico y centavos, y corrobora el importe localizado', () => {
    const source = detailHtml({ products: [{ '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl,
      offers: { '@type': 'Offer', price: 500000.45, priceCurrency: 'ARS' } }] });
    expect(parse(source + '<span class="price">$500.000,45</span>')?.prices[0].price).toBe(500000.45);
    expect(parse(source + '<span class="price">$500.000,46</span>')).toBeNull();
    expect(parse(source + '<span class="price">$500.001,45</span>')).toBeNull();
  });

  it('no exige DOM de precio/stock para un único esquema exacto; sin H1 exige una URL de identidad', () => {
    const item = { '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl, offers: { price: 500000, priceCurrency: 'ARS' } };
    expect(parse(detailHtml({ heading: '', products: [item] }))?.prices[0].price).toBe(500000);
    expect(parse(detailHtml({ heading: '', products: [{ '@type': 'Product', name: 'Placa de video ASUS RTX 5060',
      offers: { price: 500000, priceCurrency: 'ARS' } }] }))).toBeNull();
  });

  it.each([
    ['URL del Product', { url: 'https://known.example/producto/otro/' }],
    ['URL de Offer', { offers: { price: 500000, priceCurrency: 'ARS', url: 'https://known.example/producto/otro/' } }],
    ['moneda ausente', { offers: { price: 500000 } }],
    ['stock estructurado contradictorio', { offers: { price: 500000, priceCurrency: 'ARS', availability: 'https://schema.org/InStock', inventoryLevel: { value: 0 } } }],
  ])('no sana %s con precio/stock válidos de DOM', (_label, override) => {
    const source = detailHtml({ products: [{ '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl,
      offers: { '@type': 'Offer', price: 500000, priceCurrency: 'ARS' }, ...override }] });
    expect(parse(source + '<span class="price">$500.000</span><span class="stock">En stock</span>')).toBeNull();
  });

  it('ignora tarjetas relacionadas, cuotas y precio anterior pero rechaza dos precios principales', () => {
    const source = detailHtml() + '<span class="price"><del>$600.000</del>$500.000</span>';
    const unrelated = '<div class="js-item-product"><span class="price">$1</span><span class="stock">Sin stock</span></div><span class="cuotas price">6 cuotas de $99.000</span>';
    expect(parse(source + unrelated)?.prices[0].price).toBe(500000);
    expect(parse(source + '<span class="price">$510.000</span>')).toBeNull();
  });

  it('rechaza Product duplicado o H1 distinto del esquema, sin elegir el primero', () => {
    const item = { '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl, offers: { price: 500000, priceCurrency: 'ARS' } };
    expect(parse(detailHtml({ products: [item, item] }))).toBeNull();
    expect(parse(detailHtml({ products: [item], heading: 'Otra placa RTX 4070' }))).toBeNull();
  });

  it('un hijo oculto no oculta el conflicto visible del padre ni impone un stock falso', () => {
    expect(parse(detailHtml() + '<span class="price">$400.000<span class="price" hidden>$500.000</span></span>')).toBeNull();
    expect(parse(detailHtml() + '<span class="price">$500.000<span class="price" hidden>$1</span></span>')?.prices[0].price).toBe(500000);
    expect(parse(detailHtml() + '<span class="stock">En stock<span hidden>Sin stock</span></span>')?.prices[0].stock).toBe('in-stock');
  });

  it.each(['Product', 'Offer'])('rechaza SKU de variante seleccionado distinto de %s aunque el precio sea igual', source => {
    const name = 'Memoria Kingston 16GB DDR4';
    const item = { '@type': 'Product', name, url: pageUrl,
      ...(source === 'Product' ? { sku: 'DDR4-SKU' } : {}),
      offers: { '@type': 'Offer', price: 100000, priceCurrency: 'ARS', ...(source === 'Offer' ? { sku: 'DDR4-SKU' } : {}) } };
    const variants = [{ id: 1, sku: 'DDR4-SKU', price: 100000, stock: 0, available: false },
      { id: 2, sku: 'DDR5-SKU', price: 100000, stock: 10, available: true }];
    const body = `<div data-variants='${JSON.stringify(variants)}'><input name="variant_id" value="2"></div>`;
    expect(parse(detailHtml({ heading: name, products: [item] }) + body)).toBeNull();
  });

  it('acepta SKU exactos de Product, Offer y variante, y conserva el stock de la selección', () => {
    const item = { '@type': 'Product', name: 'Placa de video ASUS RTX 5060', url: pageUrl, sku: 'ASUS-RTX5060-8G',
      offers: { '@type': 'Offer', price: 500000, priceCurrency: 'ARS', sku: 'ASUS-RTX5060-8G' } };
    const variants = [{ id: 1, sku: 'OTRO-SKU', price: 500000, stock: 0, available: false },
      { id: 2, sku: 'ASUS-RTX5060-8G', price: 500000, stock: 10, available: true }];
    const body = `<div data-variants='${JSON.stringify(variants)}'><input name="variant_id" value="2"></div>`;
    expect(parse(detailHtml({ products: [item] }) + body)?.prices[0]).toMatchObject({ price: 500000, stock: 'in-stock' });
  });

  it.each(['USD 2', '$510.000'])('excluye recomendaciones de carrito Qloud con precio %s sin excluir la card principal', price => {
    const main = '<div class="card card-ecommerce"><span class="price">$500.000</span><span class="stock">En stock</span></div>';
    const recommendations = `<div class="qloud-cart-reco-carousel"><div class="row qloud-cart-reco-products-native">
      <div class="card card-ecommerce"><h1>Otra placa</h1><span class="price">${price}</span><span class="stock">Sin stock</span></div></div></div>`;
    expect(parse(detailHtml() + main + recommendations)?.prices[0]).toMatchObject({ price: 500000, stock: 'in-stock' });
    expect(parse(detailHtml() + main.replace('$500.000', '$400.000') + recommendations)).toBeNull();
  });

  it('el fetch distingue inconsistencia de falta de evidencia con una única solicitud aislada', async () => {
    mocks.fetch.mockResolvedValue(new Response(detailHtml() + '<span class="price">$400.000</span>'));
    await expect(fetchKnownProductDetail(pageUrl, store, 'tarjetas-graficas')).rejects.toMatchObject({ reason: 'inconsistent-source' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    mocks.fetch.mockResolvedValue(new Response('<html><h1>Sin datos</h1></html>'));
    await expect(fetchKnownProductDetail(pageUrl, store, 'tarjetas-graficas')).resolves.toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(new SourceHttpError('inconsistent-source').message).toBe('inconsistent-source');
  });
});

import { describe, expect, it } from 'vitest';
import { parseKnownProductDetail } from './known-product-detail';

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
});

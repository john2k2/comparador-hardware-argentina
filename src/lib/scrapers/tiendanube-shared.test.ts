import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTiendaNubeProductFromStore, inferTiendaNubeStockFromOffer, inferTiendaNubeStockFromVariants, parseTiendaNubeProductDetailHtml } from './tiendanube-shared';
const store = { id: 'shopgamer', name: 'ShopGamer', baseUrl: 'https://www.shopgamer.com.ar' };
const url = `${store.baseUrl}/productos/monitor-odyssey/`;
const name = 'Monitor Samsung Odyssey';
const offer = { '@type': 'Offer', url, price: 899999, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' };
const node = { '@type': 'Product', name, url, description: ' Monitor gamer curvo ', image: 'https://cdn.example/monitor.webp', offers: offer };
function html(input: { node?: unknown; heading?: string; body?: string; canonical?: string } = {}) {
  return `<link rel="canonical" href="${input.canonical ?? url}"><h1>${input.heading ?? name}</h1>
    <script type="application/ld+json">${JSON.stringify(input.node ?? node)}</script>${input.body ?? ''}`;
}
function parse(page: string) {
  return parseTiendaNubeProductDetailHtml(page, url, 'shopgamer-monitor-odyssey', store, 'perifericos');
}
function variantHtml(items: unknown[], selector = '') {
  return `<div class="js-product-container" data-variants='${JSON.stringify(items)}'>${selector}</div>`;
}
afterEach(() => vi.unstubAllGlobals());

describe('TiendaNube: publicación y variante exactas', () => {
  it('conserva identidad, moneda, precio numérico, imagen y descripción del esquema correcto', () => {
    const product = parse(html());
    expect(product?.name).toBe(name);
    expect(product?.prices[0]).toMatchObject({ price: 899999, stock: 'in-stock', url });
    expect(product?.description).toBe('Monitor gamer curvo');
    expect(product?.image).toBe('https://cdn.example/monitor.webp');
  });
  it('conserva centavos numéricos y corrobora el importe localizado', () => {
    const product = parse(html({ node: { ...node, offers: { ...offer, price: 899999.45 } }, body: '<span class="js-price-display">$899.999,45</span>' }));
    expect(product?.prices[0].price).toBe(899999.45);
  });
  it('permite esquema sin DOM de precio/stock, pero exige URL exacta si falta H1', () => {
    expect(parse(html({ heading: '' }))?.prices[0].price).toBe(899999);
    expect(parse(html({ heading: '', node: { ...node, url: undefined, offers: { ...offer, url: undefined } } }))).toBeNull();
  });
  it('rechaza la probe de Product/H1/canonical ajenos, moneda USD y ofertas múltiples', () => {
    const bad = { ...node, name: 'Memoria Kingston DDR4 16GB 3200', url: 'https://otro.example/ram/', offers: [
      { ...offer, priceCurrency: 'USD', price: 100000 }, { ...offer, price: 200000, availability: 'https://schema.org/OutOfStock' },
    ] };
    expect(parse(html({ node: bad, heading: 'Memoria Corsair DDR4 8GB 2666', canonical: 'https://otro.example/ram/' }))).toBeNull();
  });
  it.each([
    ['moneda USD', { ...node, offers: { ...offer, priceCurrency: 'USD' } }],
    ['moneda ausente', { ...node, offers: { ...offer, priceCurrency: undefined } }],
    ['AggregateOffer', { ...node, offers: { '@type': 'AggregateOffer', lowPrice: 1, priceCurrency: 'ARS' } }],
    ['dos ofertas', { ...node, offers: [offer, { ...offer, price: 1 }] }],
    ['URL del Product ajena', { ...node, url: 'https://otro.example/productos/monitor/' }],
    ['URL de oferta ajena', { ...node, offers: { ...offer, url: 'https://otro.example/productos/monitor/' } }],
    ['otro nombre', { ...node, name: 'Monitor Samsung de otro tamaño' }],
    ['cantidad cero frente a InStock', { ...node, offers: { ...offer, inventoryLevel: { value: 0 } } }],
  ])('no usa DOM como fallback para sanar %s', (_label, bad) => {
    expect(parse(html({ node: bad, body: '<span class="js-price-display">$899.999</span><span class="stock">En stock</span>' }))).toBeNull();
  });
  it('rechaza precio o sólo stock visibles que contradigan el esquema', () => {
    expect(parse(html({ body: '<span class="js-price-display">$800.000</span>' }))).toBeNull();
    expect(parse(html({ body: '<span class="stock">Sin stock</span>' }))).toBeNull();
    expect(parse(html({ canonical: url.replace('monitor-odyssey', 'otro') }))).toBeNull();
  });
  it('preserva unknown cuando falta stock y no interpreta null como agotamiento', () => {
    const product = parse(html({ node: { ...node, offers: { ...offer, availability: undefined, inventoryLevel: { value: null } } } }));
    expect(product?.prices[0].stock).toBe('unknown');
    expect(inferTiendaNubeStockFromOffer({ inventoryLevel: { value: null } })).toBe('unknown');
    expect(inferTiendaNubeStockFromOffer({ availability: 'https://schema.org/InStock', inventoryLevel: { value: 0 } })).toBe('unknown');
  });
  it('infiere una variante única y stock estructurado compatible', () => {
    expect(inferTiendaNubeStockFromVariants('[{"available":true,"stock":2}]')).toBe('low-stock');
    expect(inferTiendaNubeStockFromOffer({ availability: 'https://schema.org/InStock', inventoryLevel: { value: 8 } })).toBe('in-stock');
    expect(parse(html({ body: variantHtml([{ available: true, stock: 2 }]) }))?.prices[0].stock).toBe('low-stock');
  });
  it('nunca toma la primera variante de varias, ni aunque ambas informen stock', () => {
    const items = [{ id: 1, available: true, stock: 5 }, { id: 2, available: false, stock: 0 }];
    expect(inferTiendaNubeStockFromVariants(JSON.stringify(items))).toBe('unknown');
    expect(inferTiendaNubeStockFromVariants(JSON.stringify(items.slice().reverse()))).toBe('unknown');
    expect(parse(html({ body: variantHtml(items) }))).toBeNull();
    expect(inferTiendaNubeStockFromVariants(JSON.stringify(items), '2')).toBe('out-of-stock');
  });
  it.each([
    '<input type="hidden" name="variant_id" value="2">',
    '<select name="variant_id"><option value="1">Otro</option><option value="2" selected>Exacto</option></select>',
  ])('vincula stock y precio mediante un selector explícito: %s', selector => {
    const items = [{ id: 1, available: false, stock: 0, price: 1 }, { id: 2, available: true, stock: 2, price: 899999 }];
    expect(parse(html({ body: variantHtml(items, selector) }))?.prices[0]).toMatchObject({ price: 899999, stock: 'low-stock' });
  });
  it('rechaza selector implícito, ajeno, precio de otra variante y stock contradictorio', () => {
    const items = [{ id: 1, available: true, stock: 5, price: 1 }, { id: 2, available: true, stock: 2, price: 899999 }];
    expect(parse(html({ body: variantHtml(items, '<select name="variant_id"><option value="2">Default</option></select>') }))).toBeNull();
    expect(parse(html({ body: variantHtml(items, '<input name="variant_id" value="3">') }))).toBeNull();
    expect(parse(html({ body: variantHtml(items, '<input name="variant_id" value="1">') }))).toBeNull();
    expect(parse(html({ body: variantHtml([{ available: false, stock: 0 }]) }))).toBeNull();
  });
  it('ignora tarjetas y conserva esquema @graph principal con forma retenida TiendaNube', () => {
    const main = { ...node, url: undefined, offers: { ...offer, inventoryLevel: { value: '9' } } };
    const body = variantHtml([{ id: 2, stock: 9, available: true, price_number: 899999, price_long: '$899.999,00 ARS' }], '<input name="variant_id" value="2">')
      + '<div class="js-item-product"><span class="js-price-display">$1</span><span class="stock">Sin stock</span></div>';
    expect(parse(html({ node: { '@graph': [main, { ...node, name: 'Relacionado', url: url + 'otro', offers: { ...offer, url: url + 'otro', price: 1 } }] }, body }))?.prices[0].price).toBe(899999);
  });
  it('no confunde etiquetas de template ocultas y títulos editoriales con el producto principal', () => {
    const body = '<div class="stock" style="display:none">Sin stock</div>'
      + '<div hidden><span class="price">$1</span></div>'
      + '<div class="user-content"><h1>Diseño y rendimiento</h1><span class="price">$2</span></div>';
    expect(parse(html({ body }))?.prices[0]).toMatchObject({ price: 899999, stock: 'in-stock' });
    expect(parse(html({ body: body.replace('display:none', 'display:block') }))).toBeNull();
  });
  it('detiene rutas alternativas del fetch cuando la publicación recibida tiene un conflicto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, url, text: async () => html({ body: '<span class="stock">Sin stock</span>' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchTiendaNubeProductFromStore('shopgamer-monitor-odyssey', 'perifericos')).rejects.toMatchObject({ reason: 'inconsistent-source' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

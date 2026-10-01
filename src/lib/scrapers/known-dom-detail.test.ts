import { describe, expect, it } from 'vitest';
import { parseKnownProductDetail } from './known-product-detail';

function parse(id: string, html: string, url: string) {
  return parseKnownProductDetail(html, url, { id, name: id, baseUrl: new URL(url).origin }, 'tarjetas-graficas');
}
const xtUrl = 'https://www.xt-pc.com.ar/prod/32420/old-gpu-slug';
function xtHtml(web = 'Stock alto en la web', price = '$918.900,03', id = 32420) {
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'GPU RTX 5060', url: `https://www.xt-pc.com.ar/prod/${id}/new-gpu-slug`, offers: { price: 999, availability: 'OutOfStock', priceValidUntil: '2020-02-24' } })}</script>
    <div class="product"><div class="meta"><h1>GPU RTX 5060</h1><p class="codebar">Código del producto: VGA3059</p>
      <div class="price-list-container"><p><span class="bold">${price}</span></p><p>Precio sin impuestos: $831.584</p></div>
      <h5>${web}</h5><h5>Sin stock en el local</h5></div></div>
    <div class="product-list"><div class="price">$9.999</div><h5>Stock alto en la web</h5></div>`;
}
describe('fichas conocidas con DOM específico', () => {
  it('XTPC contrasta el ID estable y usa precio/stock web visibles, no el JSON-LD vencido ni el local', () => {
    const p = parse('xtpc', xtHtml(), xtUrl);
    expect(p?.prices[0]).toMatchObject({ price: 918900, stock: 'in-stock', priceCondition: 'special' });
    expect(p?.specs.SKU).toBe('VGA3059');
  });
  it.each([['Sin stock en la web', 'out-of-stock'], ['Stock bajo en la web', 'low-stock'], ['Consultar', 'unknown']])('XTPC conserva disponibilidad explícita %s', (text, stock) => {
    expect(parse('xtpc', xtHtml(text), xtUrl)?.prices[0].stock).toBe(stock);
  });
  it('XTPC rechaza otro ID y no usa relacionados cuando falta el importe principal', () => {
    expect(parse('xtpc', xtHtml('Stock alto en la web', '', 32421), xtUrl)).toBeNull();
    expect(parse('xtpc', xtHtml('Stock alto en la web', ''), xtUrl)).toBeNull();
    expect(parse('xtpc', xtHtml(), xtUrl.replace('xt-pc.com.ar', 'other.example'))).toBeNull();
  });
  it('un fallo de la evidencia visible nunca habilita el JSON-LD de plantilla', () => {
    const html = `<link rel="canonical" href="${xtUrl}">` + xtHtml('Stock alto en la web', '').replace('"price":999', '"price":999,"priceCurrency":"ARS"');
    expect(parse('xtpc', html, xtUrl)).toBeNull();
  });
  it('Compugarden valida ITEM_ID contra COD y distingue envío de falta de stock local', () => {
    const url = 'https://www.compugarden.com.ar/DETALLE/GPU/ITEM_ID=123/compugarden.aspx';
    const html = `<div id="detalle"><h1 class="prod-titulo" id="COD123">GPU RTX 5060</h1><span id="precio">$382.288,70</span><div class="cg-stock-api"><div class="stock-box"><div class="stock-title">DISPONIBLE PARA ENVÍO</div></div><div class="local"><div class="stock-box"><div class="stock-title">SIN STOCK EN EL LOCAL</div></div></div></div></div>`;
    expect(parse('compugarden', html, url)?.prices[0]).toMatchObject({ price: 382289, stock: 'in-stock' });
    expect(parse('compugarden', html.replace('COD123', 'COD124'), url)).toBeNull();
  });
  it('GamingCity toma precio con impuestos y unidades disponibles del detalle, nunca el relacionado', () => {
    const url = 'https://www.gamingcity.com.ar/gpu--det--123';
    const html = `<link rel="canonical" href="${url}"><div id="detalle"><div class="det_prod_1"><h1 class="product-title">GPU RTX 5060</h1><div class="product-price"><span id="precio">$247.000</span></div><div class="precio-sin-imp">$223.529</div><h3 class="stock-ley_stoc"><span>6</span>Disponibles</h3></div></div><div class="price">$100</div>`;
    expect(parse('gamingcity', html, url)?.prices[0]).toMatchObject({ price: 247000, stock: 'in-stock' });
    expect(parse('gamingcity', html.replace('<span>6</span>', '<span>0</span>'), url)?.prices[0].stock).toBe('out-of-stock');
    expect(parse('gamingcity', html.replace('gpu--det--123', 'gpu--det--124'), url)).toBeNull();
  });
  it('Mexx exige nombre y URL del único Offer, moneda ARS y corroboración con el precio visible', () => {
    const url = 'https://www.mexx.com.ar/productos-rubro/placas-de-video/123-gpu.html';
    const html = `<div itemscope itemtype="http://schema.org/Product"><meta itemprop="name" content="GPU RTX 5060"><div itemscope itemtype="http://schema.org/Offer"><link itemprop="url" href="${url}"><meta itemprop="price" content="248579"><meta itemprop="priceCurrency" content="ARS"><link itemprop="availability" content="InStock"></div></div><div id="prod_desc_edit"><h1 class="title">GPU RTX 5060</h1><div class="main-price"><b class="preciotop">$279.302</b><b>$248.579</b></div><span class="en_stock_prod">EN STOCK</span></div>`;
    expect(parse('mexx', html, url)?.prices[0]).toMatchObject({ price: 248579, stock: 'in-stock' });
    expect(parse('mexx', html.replace('content="248579"', 'content="148579"'), url)).toBeNull();
    expect(parse('mexx', html.replace('content="ARS"', 'content="USD"'), url)).toBeNull();
  });
  it('un H1 vacío de la plantilla no oculta el Product principal coincidente', () => {
    const url = 'https://hftecnologia.com.ar/123-mother';
    const html = `<link rel="canonical" href="${url}"><h1></h1><h1>Mother Gigabyte B550M</h1><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Mother Gigabyte B550M', offers: { price: 100000, priceCurrency: 'ARS', availability: 'https://schema.org/InStock' } })}</script>`;
    expect(parse('hftecnologia', html, url)?.prices[0].price).toBe(100000);
  });
});

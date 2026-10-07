import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchKnownMaximusOffer, parseMaximusKnownDetail } from './maximus-known-detail';
import { SourceHttpError } from './source-http';
const sourceFetchMock = vi.hoisted(() => vi.fn());
vi.mock('./source-http', async importOriginal => ({ ...await importOriginal<typeof import('./source-http')>(), sourceFetch: sourceFetchMock }));

const url = 'https://www.maximus.com.ar/Producto/Micro-AMD-Ryzen-5-8600G-50-Ghz-AM5/ITEM=13444/maximus.aspx?PN=100-100001237BOX';
const at = new Date('2026-10-07T02:44:28.601Z');
// Campos y bindings de la lectura pública 13444 del 07/10/2026 02:44:17–28 UTC.
// Los montos HTML son ejemplos del template; sólo el payload contiene valores actuales.
const html = `<input id="hidWebSiteID" value="a632009a-7686-4fcb-a0b4-24b18caf5234">
<link rel="canonical" href="${url.split('?')[0]}"><meta property="product:price:currency" content="ARS">
<div id="contenedorproducto"><h1>Micro AMD Ryzen 5 8600G 5.0 Ghz AM5</h1>
<div class="mx-best"><span class="mx-best-method-txt">Efectivo / Transferencia / Depósito</span>
<div class="mx-best-amount" v-text="'$' + String(detail.bestPriceData.disc_price_formated).split(',')[0]">$374.120</div></div>
<div class="mx-card"><span class="mx-card-label">Con tarjeta débito / crédito</span>
<div class="mx-card-amount" v-text="'$' + String(detail.price_1).split(',')[0]">$398.000</div></div>
<div class="producto-stock"><span v-if="detail.itst_LastAvailableInRelalculation &lt;= 0">SIN STOCK EN LA WEB</span>
<span v-else-if="detail.itst_LastAvailableInRelalculation &gt; 5">STOCK ALTO EN LA WEB</span></div></div>`;
function payload(overrides: Record<string, unknown> = {}) {
  return { scName: 'web.MAX.GetItemDetail_V6', data: { item_id: 13444, item_code4web: '100-100001237BOX',
    item_desc: 'Micro AMD Ryzen 5 8600G 5.0 Ghz AM5', itst_LastAvailableInRelalculation: 6,
    price_1: '359.100,00', price_1_original: 359100, prli_priceNOTaxes: '324.977', currency_symbol: '$',
    cantLocal: 20, quota_mercadopago: { price: 697426 },
    bestPriceData: { disc_price: 323190, disc_price_formated: '323.190,00', disc_price_no_taxes: 292479.642 }, ...overrides } };
}
function parse(overrides: Record<string, unknown> = {}, page = html, target = url) {
  return parseMaximusKnownDetail(payload(overrides), page, target, 'procesadores', at);
}
beforeEach(() => sourceFetchMock.mockReset());

describe('Maximus exact public detail', () => {
  it('reads the special ARS amount, online stock and SKU without list, tax, quota or template mixing', () => {
    const product = parse()!;
    expect(product.prices[0]).toMatchObject({ url, price: 323190, priceCondition: 'special', stock: 'in-stock', lastUpdated: at });
    expect(product.specs).toEqual({ SKU: '100-100001237BOX', SourceListingId: '13444' });
    expect(product.lowestPrice).toBe(323190);
    expect(product.canonicalProductKey).toBeUndefined();
  });
  it.each([[0, 'out-of-stock'], [1, 'low-stock'], [5, 'low-stock'], [6, 'in-stock']])(
    'uses explicit online quantity %s', (quantity, stock) => expect(parse({ itst_LastAvailableInRelalculation: quantity })!.prices[0].stock).toBe(stock));
  it.each([undefined, null])('preserves unknown online stock %s despite local availability', quantity => {
    expect(parse({ itst_LastAvailableInRelalculation: quantity })!.prices[0].stock).toBe('unknown');
  });
  it('uses the corroborated card amount when there is no special payment price', () => {
    expect(parse({ bestPriceData: null })!.prices[0]).toMatchObject({ price: 359100, priceCondition: 'unspecified' });
  });
  it('preserves cents from matching numeric and formatted payload fields', () => {
    expect(parse({ bestPriceData: { disc_price: 323190.5, disc_price_formated: '323.190,50' } })!.prices[0].price).toBe(323190.5);
  });
  it.each([
    { item_id: 19672 }, { item_code4web: 'other-variant' }, { item_desc: 'Micro AMD Ryzen 7 9800X3D' },
    { currency_symbol: 'USD' }, { price_1_original: 0 }, { price_1: '359.101,00' },
    { bestPriceData: { disc_price: 0, disc_price_formated: '0,00' } },
    { bestPriceData: { disc_price: 323190, disc_price_formated: '323.191,00' } },
    { bestPriceData: { disc_price: 400000, disc_price_formated: '400.000,00' } },
    { itst_LastAvailableInRelalculation: -1 }, { itst_LastAvailableInRelalculation: 1.5 },
    { itst_LastAvailableInRelalculation: '6' },
  ])('stops conflicts without replacing evidence: %j', override => {
    expect(() => parse(override)).toThrowError(SourceHttpError);
  });
  it.each([-1, null, undefined])('does not infer exhaustion from absent detail %s', data => {
    expect(parseMaximusKnownDetail({ scName: 'web.MAX.GetItemDetail_V6', data }, html, url, 'procesadores', at)).toBeNull();
  });
  it.each([html.replace('13444/maximus.aspx', '13445/maximus.aspx'), html.replace('content="ARS"', 'content="USD"'),
    html.replace('detail.bestPriceData.disc_price_formated', 'related.bestPriceData.disc_price_formated'),
    html.replace('String(detail.price_1)', 'String(detail.price_10)'), html.replace(url.split('?')[0], 'https://['),
    html + '<meta property="product:price:currency" content="USD">']) (
    'rejects wrong listing, currency or price binding', page => expect(() => parse({}, page)).toThrowError(SourceHttpError));
  it('rejects an external URL before any transport', async () => {
    expect(await fetchKnownMaximusOffer(url.replace('www.maximus.com.ar', 'example.com'), 'procesadores')).toBeNull();
    expect(sourceFetchMock).not.toHaveBeenCalled();
  });
  it('fetches only the page and anonymous detail, dating the offer after POST', async () => {
    const startedAt = Date.now();
    sourceFetchMock.mockResolvedValueOnce(new Response(html)).mockResolvedValueOnce(Response.json({ d: JSON.stringify(payload()) }));
    const product = await fetchKnownMaximusOffer(url, 'procesadores');
    expect(sourceFetchMock).toHaveBeenCalledTimes(2);
    const [, endpoint, options] = sourceFetchMock.mock.calls[1];
    expect(endpoint).toBe('https://www.maximus.com.ar/wfmWebSite2.aspx/wsNRW_Script');
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store' });
    const envelope = JSON.parse(options.body);
    expect(envelope.strScriptLabel).toBe('web.MAX.GetItemDetail_V6');
    expect(JSON.parse(envelope.JSonParameters)).toMatchObject({ item_id: 13444, cust_id: -1, prli_id: 17 });
    expect(product!.prices[0].lastUpdated.getTime()).toBeGreaterThanOrEqual(startedAt);
  });
  it('propagates a blocked source without a search or HTML fallback', async () => {
    sourceFetchMock.mockResolvedValueOnce(new Response(html)).mockRejectedValueOnce(new SourceHttpError('blocked', 403));
    await expect(fetchKnownMaximusOffer(url, 'procesadores')).rejects.toMatchObject({ reason: 'blocked' });
    expect(sourceFetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed detail envelopes', async () => {
    sourceFetchMock.mockResolvedValueOnce(new Response(html)).mockResolvedValueOnce(Response.json({ d: 'not-json' }));
    await expect(fetchKnownMaximusOffer(url, 'procesadores')).rejects.toMatchObject({ reason: 'invalid-response' });
  });
});

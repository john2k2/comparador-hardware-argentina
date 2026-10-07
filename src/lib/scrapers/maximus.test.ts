import { describe, expect, it, vi, beforeEach } from 'vitest';

const sourceFetchMock = vi.hoisted(() => vi.fn());
vi.mock('./source-http', () => ({ sourceFetch: sourceFetchMock }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const item = { item_id: 13444, item_desc: 'Micro AMD Ryzen 5 8600G 5.0 Ghz AM5',
  item_desc4link: 'Micro-AMD-Ryzen-5-8600G-50-Ghz-AM5', item_code4web: '100-100001237BOX',
  prli_price_original: 359100, prli_price: '359.100' };

async function search(data: object) {
  sourceFetchMock.mockResolvedValueOnce(new Response('<input id="hidWebSiteID" value="anonymous-site">'));
  sourceFetchMock.mockResolvedValueOnce(Response.json({ d: JSON.stringify({ scName: 'web.MAX.GetItemList4Search_v3', data }) }));
  const { fetchMaximusProducts } = await import('./maximus');
  return fetchMaximusProducts('8600G', 'procesadores');
}

beforeEach(() => { vi.resetModules(); sourceFetchMock.mockReset(); });

describe('maximus search', () => {
  it('preserves unknown availability even when the search reports price or a stock-like field', async () => {
    const products = await search({ match: 1, items: [{ ...item, stock: 50 }] });
    expect(products).toHaveLength(1);
    expect(products[0].prices[0]).toMatchObject({ price: 359100, stock: 'unknown',
      url: 'https://www.maximus.com.ar/Producto/Micro-AMD-Ryzen-5-8600G-50-Ghz-AM5/ITEM=13444/maximus.aspx?PN=100-100001237BOX' });
    expect(products[0].specs.SKU).toBe('100-100001237BOX');
  });

  it('does not turn match:0 recommendations into query-category observations', async () => {
    expect(await search({ match: 0, items: [item] })).toEqual([]);
  });

  it.each([['359.100,50', 359100.5], ['359100.50', 359100.5], ['$ 359.100', 359100], [359100.5, 359100.5]])(
    'preserves the ARS amount %s', async (raw, expected) => {
      const products = await search({ items: [{ ...item, prli_price_original: raw }] });
      expect(products[0].prices[0].price).toBe(expected);
    });

  it.each(['USD 359100', 'U$S 359100', '-359100', '3 cuotas de 119700', '', 0, null])(
    'rejects invalid or non ARS prices %s without inventing fallback', async raw => {
      expect(await search({ items: [{ ...item, prli_price_original: raw, prli_price: raw }] })).toEqual([]);
    });

  it('returns no products on failed transport', async () => {
    sourceFetchMock.mockRejectedValue(new Error('blocked'));
    const { fetchMaximusProducts } = await import('./maximus');
    expect(await fetchMaximusProducts('rtx', 'tarjetas-graficas')).toEqual([]);
  });

  it('does not dispatch the public script without a website context', async () => {
    sourceFetchMock.mockResolvedValueOnce(new Response('<html></html>'));
    const { fetchMaximusProducts } = await import('./maximus');
    expect(await fetchMaximusProducts('empty', 'procesadores')).toEqual([]);
    expect(sourceFetchMock).toHaveBeenCalledTimes(1);
  });
});

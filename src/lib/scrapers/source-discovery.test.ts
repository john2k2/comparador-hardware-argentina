import { describe, expect, it, vi } from 'vitest';
vi.mock('./source-http', () => ({ sourceFetch: vi.fn() }));
import { sourceFetch } from './source-http';
import { discoverWooPublicListings, parseWooPublicListings, resolveDiscoveredListing } from './source-discovery';
import { SHARED_PRICE_STORE_IDS, sourceContract } from './source-contracts';

const item = { id: 14, name: 'Corsair Vengeance LPX 16GB 3200', permalink: 'https://katech.com.ar/producto/corsair-lpx/', sku: 'local-14' };
describe('descubrimiento público e identidad de publicación', () => {
  it('descubre Katech y SCP sin habilitar precios de sus APIs', () => {
    expect(sourceContract('katech')?.priceSource).toBe('visible-detail');
    expect(sourceContract('scphardstore')?.priceSource).toBe('visible-detail');
    expect(SHARED_PRICE_STORE_IDS).toEqual(['compragamer', 'maxtecno', 'dinobyte', 'goldentechstore']);
    const [listing] = parseWooPublicListings('katech', [{ ...item, prices: { price: '1' }, is_in_stock: true }]);
    expect(listing).toEqual({ storeId: 'katech', sourceId: '14', title: item.name, url: item.permalink, storeSku: 'local-14' });
    expect(listing).not.toHaveProperty('price');
    expect(listing).not.toHaveProperty('stock');
  });
  it('rechaza otro host, categoría, opciones, ID duplicado y credenciales', () => {
    for (const permalink of ['https://other.example/producto/ram/', 'https://katech.com.ar/product-category/ram/', `${item.permalink}?variation_id=2`, `https://user:password@katech.com.ar/producto/ram/`])
      expect(parseWooPublicListings('katech', [{ ...item, permalink }])).toEqual([]);
    expect(parseWooPublicListings('katech', [item, { ...item, permalink: 'https://katech.com.ar/producto/otra/' }])).toEqual([]);
  });
  it('decodifica el título público sin tratar el marcado como instrucciones ni conservar SKU vacío', () => {
    expect(parseWooPublicListings('katech', [{ ...item, name: 'Monitor 24&#8243; <b>IPS</b>', sku: '' }])[0])
      .toMatchObject({ title: 'Monitor 24″ IPS' });
    expect(parseWooPublicListings('katech', [{ ...item, sku: '' }])[0]).not.toHaveProperty('storeSku');
  });
  it('consulta por ID estable o slug exacto, con límites y sin credenciales', async () => {
    vi.mocked(sourceFetch).mockResolvedValue(new Response(JSON.stringify([item])));
    await discoverWooPublicListings('katech', { sourceIds: ['14'] });
    const args = vi.mocked(sourceFetch).mock.calls.at(-1)!;
    expect(new URL(args[1]).searchParams.get('include')).toBe('14');
    expect(args[2]?.headers).toEqual({ Accept: 'application/json' });
    await expect(discoverWooPublicListings('katech', { sourceIds: ['14'], slugs: ['ram'] })).rejects.toThrow('SOURCE_INVALID_DISCOVERY_TARGET');
  });
  it('reporta cambio de permalink sin aceptar sustituciones por palabras similares', () => {
    const [prior] = parseWooPublicListings('katech', [item]);
    expect(resolveDiscoveredListing(prior, [{ ...prior, sourceId: '15' }]).status).toBe('unresolved');
    expect(resolveDiscoveredListing(prior, [{ ...prior, url: 'https://katech.com.ar/producto/nuevo/' }]).status).toBe('url-changed');
    expect(resolveDiscoveredListing(prior, [{ ...prior, storeSku: 'other-sku' }]).status).toBe('identity-changed');
  });
});

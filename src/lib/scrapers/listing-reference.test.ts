import { describe, expect, it } from 'vitest';
import { listingReference, sameListing } from './listing-reference';

describe('listing-reference', () => {
  it('keeps a CompraGamer listing identity when its slug changes', () => {
    const first = 'https://compragamer.com/producto/amd_ryzen_7_7800x3d_12345';
    const second = 'https://compragamer.com/producto/ryzen-7-7800x3d-box_12345';

    expect(listingReference('compragamer', first)).toBe('compragamer:id:12345');
    expect(sameListing('compragamer', first, second)).toBe(true);
  });

  it('keeps a Maximus listing identity when its slug changes', () => {
    const first = 'https://maximus.com.ar/Producto/amd-ryzen-7-7800x3d/ITEM=67890/maximus.aspx?PN=RYZEN7800';
    const second = 'https://maximus.com.ar/Producto/ryzen-7-7800x3d-box/ITEM=67890/maximus.aspx?PN=RENAMED';

    expect(listingReference('maximus', first)).toBe('maximus:id:67890');
    expect(sameListing('maximus', first, second)).toBe(true);
  });

  it('does not match a different ID, store, or host', () => {
    const compraGamer = 'https://compragamer.com/producto/ryzen_12345';
    const differentId = 'https://compragamer.com/producto/ryzen_12346';
    const differentHost = 'https://other.example/producto/ryzen_12345';
    const differentStore = 'https://maximus.com.ar/Producto/ryzen/ITEM=12345/maximus.aspx';

    expect(sameListing('compragamer', compraGamer, differentId)).toBe(false);
    expect(sameListing('compragamer', compraGamer, differentHost)).toBe(false);
    expect(sameListing('compragamer', compraGamer, differentStore)).toBe(false);
  });

  it('rejects credentials and non-HTTPS URLs', () => {
    expect(listingReference('compragamer', 'http://compragamer.com/producto/ryzen_12345')).toBeNull();
    expect(listingReference('compragamer', 'https://user:password@compragamer.com/producto/ryzen_12345')).toBeNull();
    expect(listingReference('compragamer', 'https://compragamer.com:8443/producto/ryzen_12345')).toBeNull();
    expect(sameListing('compragamer', 'https://compragamer.com/producto/ryzen_12345', 'http://compragamer.com/producto/ryzen_12345')).toBe(false);
  });

  it('uses the Maximus item ID and never PN as the listing reference', () => {
    const first = 'https://maximus.com.ar/Producto/old-slug/ITEM=67890/maximus.aspx?PN=SAME-PN';
    const changedPn = 'https://maximus.com.ar/Producto/new-slug/ITEM=67890/maximus.aspx?PN=SAME-PN';
    const differentItem = 'https://maximus.com.ar/Producto/other-slug/ITEM=67891/maximus.aspx?PN=SAME-PN';

    expect(sameListing('maximus', first, changedPn)).toBe(true);
    expect(sameListing('maximus', first, differentItem)).toBe(false);
    expect(listingReference('maximus', first)).toBe('maximus:id:67890');
  });
});

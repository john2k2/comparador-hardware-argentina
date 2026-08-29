import { describe, expect, it } from 'vitest';
import { decideProductPageIndexing } from './product-indexing';

describe('decideProductPageIndexing', () => {
  it('404s missing products instead of serving a 200 noindex shell', () => {
    expect(decideProductPageIndexing({
      product: null,
      resolvedCanonicalId: null,
      comparableStoreCount: 0,
    })).toEqual({ status: 'not-found' });
  });

  it('keeps thin grouped products noindex so Google does not index 1-store fichas', () => {
    expect(decideProductPageIndexing({
      product: { id: 'agrupado-almacenamiento-seagate-12tb-44ep3a' },
      resolvedCanonicalId: 'agrupado-almacenamiento-seagate-12tb-44ep3a',
      comparableStoreCount: 1,
    })).toEqual({ status: 'noindex', reason: 'thin-offers' });
  });

  it('indexes grouped products with a self canonical and two comparable stores', () => {
    expect(decideProductPageIndexing({
      product: { id: 'agrupado-motherboards-asus-prime-am4' },
      resolvedCanonicalId: 'agrupado-motherboards-asus-prime-am4',
      comparableStoreCount: 2,
    })).toEqual({ status: 'index' });
  });
});

import { describe, expect, it } from 'vitest';
import { resolveSearchMetadata } from './search-page-metadata';

describe('search page metadata', () => {
  it('indexa solo la landing pura de categoria', () => {
    const metadata = resolveSearchMetadata({
      query: '',
      category: 'procesadores',
      stores: [],
      sortBy: 'relevance',
      page: 1,
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/search?category=procesadores');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('mantiene noindex en busquedas query-heavy', () => {
    const metadata = resolveSearchMetadata({
      query: 'rtx 5070',
      category: undefined,
      stores: [],
      sortBy: 'relevance',
      page: 1,
    });

    expect(metadata.alternates?.canonical).toBe('https://www.comparador-hardware.com.ar/search');
    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });
});

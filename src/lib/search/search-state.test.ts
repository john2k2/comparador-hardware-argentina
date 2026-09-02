import { describe, expect, it } from 'vitest';
import {
  buildApiSearchKey,
  buildSearchPaginationHref,
  buildSearchRoute,
  hasSearchIntent,
  parseSearchState,
  toSearchFilters,
} from './search-state';

describe('search state', () => {
  it('normalizes invalid params and swaps min/max ranges', () => {
    const state = parseSearchState({
      q: '  ryzen 5600  ',
      category: 'procesadores',
      minPrice: '300000',
      maxPrice: '200000',
      stores: 'venex,mexx',
      sortBy: 'invalid-sort',
      page: '0',
    });

    expect(state).toEqual({
      query: 'ryzen 5600',
      category: 'procesadores',
      minPrice: 200000,
      maxPrice: 300000,
      stores: ['mexx', 'venex'],
      sortBy: 'relevance',
      page: 1,
    });
  });

  it('builds canonical search keys without page noise', () => {
    const state = parseSearchState({
      q: 'g502 x',
      stores: 'venex,mexx',
      sortBy: 'price-desc',
      page: '3',
    });

    expect(buildApiSearchKey(state)).toBe('q=g502+x&stores=mexx%2Cvenex&sortBy=price-desc');
    expect(buildSearchRoute(state)).toBe('/search?q=g502+x&stores=mexx%2Cvenex&sortBy=price-desc&page=3');
  });

  it('builds crawlable pagination links while preserving active filters', () => {
    const currentRoute = '/search?q=ryzen+7600&category=procesadores&stores=mexx%2Cvenex&sortBy=price-desc&page=3';

    expect(buildSearchPaginationHref(currentRoute, 2)).toBe(
      '/search?q=ryzen+7600&category=procesadores&stores=mexx%2Cvenex&sortBy=price-desc&page=2',
    );
    expect(buildSearchPaginationHref(currentRoute, 1)).toBe(
      '/search?q=ryzen+7600&category=procesadores&stores=mexx%2Cvenex&sortBy=price-desc',
    );
  });

  it('derives filters and intent consistently', () => {
    const state = parseSearchState({
      category: 'perifericos',
      sortBy: 'price-desc',
    });

    expect(hasSearchIntent(state)).toBe(true);
    expect(toSearchFilters(state)).toEqual({
      query: '',
      category: 'perifericos',
      minPrice: undefined,
      maxPrice: undefined,
      stores: [],
      brands: [],
      sortBy: 'price-desc',
      sortOrder: 'desc',
    });
  });

  it('infers category from the query and accepts computadoras', () => {
    expect(parseSearchState({ q: 'ryzen 5600x' }).category).toBe('procesadores');
    expect(parseSearchState({ q: 'rtx 4070 ti', category: 'tarjetas-graficas' }).category).toBe('tarjetas-graficas');
    expect(parseSearchState({ category: 'computadoras' }).category).toBe('computadoras');
    expect(parseSearchState({ q: 'ryzen 5600x', category: 'perifericos' }).category).toBe('perifericos');
  });

  it('treats a fully empty state as no search intent', () => {
    const state = parseSearchState({});

    expect(hasSearchIntent(state)).toBe(false);
    expect(buildApiSearchKey(state)).toBeNull();
    expect(buildSearchRoute(state)).toBe('/search');
  });
});

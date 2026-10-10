import { describe, expect, it } from 'vitest';
import {
  buildApiSearchKey,
  buildSearchPaginationHref,
  buildSearchRoute,
  hasSearchIntent,
  parseSearchState,
  toSearchFilters,
  withSearchQuery,
} from './search-state';

describe('search state', () => {
  it('preserves opt-in references through URLs, keys and pagination', () => {
    const current = parseSearchState({ q: 'rtx 5090', page: '2' });
    const references = parseSearchState({ q: 'rtx 5090', page: '2', includeUnavailable: '1' });
    expect(current.includeUnavailable).toBe(false);
    expect(parseSearchState({ q: 'rtx 5090', includeUnavailable: 'true' }).includeUnavailable).toBe(false);
    expect(buildApiSearchKey(references)).not.toBe(buildApiSearchKey(current));
    expect(toSearchFilters(references).includeUnavailable).toBe(true);
    expect(buildSearchPaginationHref(buildSearchRoute(references), 3)).toContain('includeUnavailable=1&page=3');
    expect(hasSearchIntent(parseSearchState({ includeUnavailable: '1' }))).toBe(false);
  });
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
      includeUnavailable: false,
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
      includeUnavailable: false,
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

  it('cambia la categoría automática con el producto y mantiene los demás filtros', () => {
    let state = parseSearchState({ q: 'RTX 5090', stores: 'compragamer', minPrice: '100000', sortBy: 'price-asc', page: '2' });
    for (const [query, category] of [['Ryzen 7600', 'procesadores'], ['Memoria DDR5 32GB', 'memoria-ram'], ['SSD NVMe', 'almacenamiento'], ['producto desconocido', undefined]] as const) {
      state = withSearchQuery(state, query);
      expect(state).toMatchObject({ query, category, categoryInferred: true, stores: ['compragamer'], minPrice: 100000, sortBy: 'price-asc', page: 1 });
      expect(buildSearchRoute(state)).not.toContain('category=');
    }
  });

  it('conserva la categoría elegida explícitamente, incluso si coincide con la inferencia', () => {
    const explicit = parseSearchState({ q: 'RTX 5090', category: 'tarjetas-graficas' });
    expect(withSearchQuery(explicit, 'Ryzen 7600').category).toBe('tarjetas-graficas');
    expect(buildSearchRoute(withSearchQuery(explicit, 'Ryzen 7600'))).toContain('category=tarjetas-graficas');
  });

  it('no vuelve manual una categoría automática al recargar o paginar', () => {
    const initial = parseSearchState({ q: 'RTX 5090' });
    const route = buildSearchPaginationHref(buildSearchRoute(initial), 2);
    const restored = parseSearchState(Object.fromEntries(new URLSearchParams(route.split('?')[1])));
    expect(restored.categoryInferred).toBe(true);
    expect(withSearchQuery(restored, 'Ryzen 7600').category).toBe('procesadores');
    expect(buildApiSearchKey(initial)).toBe(buildApiSearchKey(parseSearchState({ q: 'RTX 5090', category: 'tarjetas-graficas' })));
  });
});

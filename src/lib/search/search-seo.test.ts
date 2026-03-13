import { describe, expect, it } from 'vitest';
import type { SearchPageState } from './search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from './search-seo';

function buildState(overrides: Partial<SearchPageState> = {}): SearchPageState {
  return {
    query: '',
    category: 'procesadores',
    stores: [],
    sortBy: 'relevance',
    page: 1,
    ...overrides,
  };
}

describe('search-seo', () => {
  it('reconoce una landing de categoria indexable solo cuando no hay query ni filtros avanzados', () => {
    expect(isIndexableCategoryLanding(buildState())).toBe(true);
    expect(isIndexableCategoryLanding(buildState({ query: 'ryzen 7600' }))).toBe(false);
    expect(isIndexableCategoryLanding(buildState({ stores: ['mexx'] }))).toBe(false);
    expect(isIndexableCategoryLanding(buildState({ page: 2 }))).toBe(false);
  });

  it('expone copy SEO para categorias soportadas', () => {
    const copy = getCategorySeoCopy('procesadores');

    expect(copy).not.toBeNull();
    expect(copy?.heading).toContain('procesadores');
    expect(copy?.description).toContain('Argentina');
  });
});

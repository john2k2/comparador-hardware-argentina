import { describe, expect, it } from 'vitest';
import { categories } from '@/lib/scrapers/static-data';
import { SITE_URL } from '@/lib/site-config';
import { buildCategoryLandingState } from './category-landing-state';
import { isCategoryCanonicalLanding, isIndexableCategoryLanding } from './search-seo';
import { resolveSearchMetadata } from './search-page-metadata';

describe('estado de la landing de categoría', () => {
  it('produce un estado sin filtros para cualquier categoría', () => {
    for (const category of categories) {
      const state = buildCategoryLandingState(category.id);

      expect(state).toEqual({
        query: '',
        category: category.id,
        minPrice: undefined,
        maxPrice: undefined,
        stores: [],
        sortBy: 'relevance',
        page: 1,
      });
    }
  });

  it('es siempre una landing canónica e indexable', () => {
    for (const category of categories) {
      const state = buildCategoryLandingState(category.id);

      expect(isCategoryCanonicalLanding(state)).toBe(true);
      expect(isIndexableCategoryLanding(state)).toBe(true);
    }
  });

  it('canoniza la landing de GPUs hacia su URL limpia e indexable', () => {
    const metadata = resolveSearchMetadata(buildCategoryLandingState('tarjetas-graficas'));

    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/comparar/placas-de-video`);
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('nunca canoniza una landing hacia /search', () => {
    for (const category of categories) {
      const metadata = resolveSearchMetadata(buildCategoryLandingState(category.id));

      expect(String(metadata.alternates?.canonical)).toContain('/comparar/');
      expect(String(metadata.alternates?.canonical)).not.toContain('/search');
    }
  });
});

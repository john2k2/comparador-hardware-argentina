import { EDITORIAL_UPDATED_AT } from './editorial-freshness';
import { getEditorialMethodology } from './editorial-methodology';
import { getComparisonBySlug } from './comparisons-data';

/** Fecha de revisión del contenido; nunca la de una oferta, petición o build. */
export function getEditorialReviewDate(slug: string): string {
  const dates = [getComparisonBySlug(slug)?.reviewedAt, getEditorialMethodology(slug)?.updatedAt];
  return dates.reduce<string>((latest, reviewed) => reviewed && reviewed > latest ? reviewed : latest, EDITORIAL_UPDATED_AT);
}

export function getLatestEditorialReviewDate(slugs: readonly string[]): string {
  return slugs.reduce((latest, slug) => {
    const reviewed = getEditorialReviewDate(slug);
    return reviewed > latest ? reviewed : latest;
  }, EDITORIAL_UPDATED_AT);
}

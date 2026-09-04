import type { HardwareCategory } from '@/lib/types';

export const CATEGORY_LANDING_BASE_PATH = '/comparar';

/**
 * Public slug for each category landing.
 *
 * These slugs are the indexable surface of the catalog, so they follow the
 * wording shoppers actually search for in Argentina rather than the internal
 * category id. `tarjetas-graficas` is the clearest case: the demand sits on
 * "placas de video", so the landing owns that term in its URL.
 */
export const CATEGORY_LANDING_SLUGS: Record<HardwareCategory, string> = {
  'procesadores': 'procesadores',
  'tarjetas-graficas': 'placas-de-video',
  'motherboards': 'motherboards',
  'memoria-ram': 'memoria-ram',
  'almacenamiento': 'almacenamiento',
  'fuentes-alimentacion': 'fuentes',
  'gabinetes': 'gabinetes',
  'refrigeracion': 'refrigeracion',
  'computadoras': 'computadoras',
  'perifericos': 'perifericos',
};

const CATEGORY_BY_LANDING_SLUG = new Map<string, HardwareCategory>(
  (Object.entries(CATEGORY_LANDING_SLUGS) as Array<[HardwareCategory, string]>)
    .map(([category, slug]) => [slug, category]),
);

/** Query params that turn a category landing into a filtered search result. */
const SEARCH_FILTER_PARAMS = ['q', 'minPrice', 'maxPrice', 'stores', 'sortBy', 'page'] as const;

const LEGACY_LANDING_PATHNAME = '/search';

export function buildCategoryLandingPath(category: HardwareCategory): string {
  return `${CATEGORY_LANDING_BASE_PATH}/${CATEGORY_LANDING_SLUGS[category]}`;
}

export function resolveCategoryFromLandingSlug(slug: string): HardwareCategory | null {
  return CATEGORY_BY_LANDING_SLUG.get(slug) ?? null;
}

export function listCategoryLandingSlugs(): string[] {
  return Object.values(CATEGORY_LANDING_SLUGS);
}

/**
 * Resolves the clean landing a legacy `/search?category=<id>` URL should 301 to.
 *
 * Returns `null` for anything that is not a bare category landing, so filtering,
 * sorting and pagination keep working on `/search` without bouncing through a
 * redirect. This lives in middleware rather than `next.config` redirects because
 * those forward the original query string to the destination, which would leave
 * the clean landing reachable as `/comparar/<slug>?category=<id>`.
 */
export function resolveLegacyCategoryLandingRedirect(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  if (pathname !== LEGACY_LANDING_PATHNAME) return null;

  const category = searchParams.get('category');
  if (!category || !(category in CATEGORY_LANDING_SLUGS)) return null;

  if (SEARCH_FILTER_PARAMS.some((param) => searchParams.has(param))) return null;

  return buildCategoryLandingPath(category as HardwareCategory);
}

import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import type { HardwareCategory, SearchFilters } from '@/lib/types';

const VALID_CATEGORIES: HardwareCategory[] = [
  'procesadores',
  'tarjetas-graficas',
  'motherboards',
  'memoria-ram',
  'almacenamiento',
  'fuentes-alimentacion',
  'gabinetes',
  'refrigeracion',
  'computadoras',
  'perifericos',
];

const VALID_SORTS = new Set<SearchFilters['sortBy']>([
  'relevance',
  'price-asc',
  'price-desc',
  'name',
  'newest',
]);

export type SearchPageState = {
  query: string;
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  stores: string[];
  sortBy: SearchFilters['sortBy'];
  page: number;
};

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseNonNegativeNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parsePositiveInteger(value: string | null): number {
  if (value === null) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function parseStores(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((storeId) => storeId.trim())
    .filter(Boolean)
    .sort();
}

export function parseSearchState(params: Record<string, string | string[] | undefined>): SearchPageState {
  const query = (getSingleParam(params.q) ?? '').trim();
  const categoryParam = getSingleParam(params.category);
  const explicitCategory = categoryParam && VALID_CATEGORIES.includes(categoryParam as HardwareCategory)
    ? categoryParam as HardwareCategory
    : undefined;
  const category = explicitCategory ?? (query ? inferHardwareCategoryFromName(query) : undefined);

  const rawMinPrice = parseNonNegativeNumber(getSingleParam(params.minPrice));
  const rawMaxPrice = parseNonNegativeNumber(getSingleParam(params.maxPrice));
  const minPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.min(rawMinPrice, rawMaxPrice) : rawMinPrice;
  const maxPrice = rawMinPrice !== undefined && rawMaxPrice !== undefined ? Math.max(rawMinPrice, rawMaxPrice) : rawMaxPrice;
  const sortByParam = getSingleParam(params.sortBy);
  const sortBy = sortByParam && VALID_SORTS.has(sortByParam as SearchFilters['sortBy'])
    ? sortByParam as SearchFilters['sortBy']
    : 'relevance';

  return {
    query,
    category,
    minPrice,
    maxPrice,
    stores: parseStores(getSingleParam(params.stores)),
    sortBy,
    page: parsePositiveInteger(getSingleParam(params.page)),
  };
}

export function hasSearchIntent(state: SearchPageState): boolean {
  return Boolean(
    state.query
    || state.category
    || state.minPrice !== undefined
    || state.maxPrice !== undefined
    || state.stores.length > 0,
  );
}

export function buildApiSearchKey(state: SearchPageState): string | null {
  if (!hasSearchIntent(state)) return null;

  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.category) params.set('category', state.category);
  if (state.minPrice !== undefined) params.set('minPrice', String(state.minPrice));
  if (state.maxPrice !== undefined) params.set('maxPrice', String(state.maxPrice));
  if (state.stores.length > 0) params.set('stores', state.stores.join(','));
  if (state.sortBy !== 'relevance') params.set('sortBy', state.sortBy);

  return params.toString() || '__empty__';
}

export function buildSearchPageParams(state: SearchPageState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.query) params.set('q', state.query);
  if (state.category) params.set('category', state.category);
  if (state.minPrice !== undefined) params.set('minPrice', String(state.minPrice));
  if (state.maxPrice !== undefined) params.set('maxPrice', String(state.maxPrice));
  if (state.stores.length > 0) params.set('stores', state.stores.join(','));
  if (state.sortBy !== 'relevance') params.set('sortBy', state.sortBy);
  if (state.page > 1) params.set('page', String(state.page));

  return params;
}

export function buildSearchRoute(state: SearchPageState): string {
  const queryString = buildSearchPageParams(state).toString();
  return queryString ? `/search?${queryString}` : '/search';
}

export function buildSearchPaginationHref(searchRoute: string, page: number): string {
  const [path, queryString = ''] = searchRoute.split('?', 2);
  const params = new URLSearchParams(queryString);
  const safePage = Math.max(1, Math.trunc(page));

  if (safePage === 1) {
    params.delete('page');
  } else {
    params.set('page', String(safePage));
  }

  const nextQueryString = params.toString();
  return nextQueryString ? `${path}?${nextQueryString}` : path;
}

export function toSearchFilters(state: SearchPageState): SearchFilters {
  return {
    query: state.query,
    category: state.category,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    stores: state.stores,
    brands: [],
    sortBy: state.sortBy,
    sortOrder: state.sortBy === 'price-desc' ? 'desc' : 'asc',
  };
}

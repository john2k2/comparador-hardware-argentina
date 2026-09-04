import type { HardwareCategory } from '@/lib/types';
import type { SearchPageState } from './search-state';

/**
 * The search state behind a `/comparar/<slug>` landing.
 *
 * A landing is the unfiltered view of one category: no free-text query, no
 * store or price filter, default sorting, first page. Anything narrower is a
 * search result set and belongs on `/search`, which stays out of the index.
 */
export function buildCategoryLandingState(category: HardwareCategory): SearchPageState {
  return {
    query: '',
    category,
    minPrice: undefined,
    maxPrice: undefined,
    stores: [],
    sortBy: 'relevance',
    page: 1,
  };
}

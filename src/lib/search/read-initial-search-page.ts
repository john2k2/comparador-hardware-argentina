import { hasSearchIntent, type SearchPageState } from './search-state';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { SEARCH_PAGE_SIZE, paginateProducts } from './search-pagination';
import type { SearchApiResponse } from './search-api';
import { catalogPageResponse, emptySearchResponse } from './search-handler-shared';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { filterCurrentCatalogProducts } from './search-availability';

export type InitialSearchPage = Pick<SearchApiResponse, 'products' | 'pagination'>;

export async function readInitialSearchPage(state: SearchPageState): Promise<InitialSearchPage> {
  if (!hasSearchIntent(state)) return emptySearchResponse();
  const storeIds = new Set(state.stores.map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (isStableRuntimeMode()) {
    const products = filterCurrentCatalogProducts(getStableFixtureProducts({ ...state, selectedStoreIds: storeIds }), state.includeUnavailable);
    const slice = paginateProducts(products, state.page, SEARCH_PAGE_SIZE);
    return catalogPageResponse({ products: slice.paginatedProducts, total: products.length,
      totalPages: slice.totalPages, page: slice.currentPage, pageSize: SEARCH_PAGE_SIZE });
  }
  // Propagate failures to the error boundary, never hydrate an empty success cache.
  return catalogPageResponse(await readProductsPageFromDatabase({
    query: state.query, category: state.category, minPrice: state.minPrice, maxPrice: state.maxPrice,
    storeIds, sortBy: state.sortBy, page: state.page, pageSize: SEARCH_PAGE_SIZE,
    onlyCurrentOffers: !state.includeUnavailable,
  }));
}

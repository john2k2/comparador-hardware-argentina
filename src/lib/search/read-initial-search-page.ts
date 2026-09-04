import { hasSearchIntent, type SearchPageState } from './search-state';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { SEARCH_PAGE_SIZE } from './search-pagination';
import type { SearchApiResponse } from './search-api';

export type InitialSearchPage = {
  products: SearchApiResponse['products'];
  pagination: SearchApiResponse['pagination'];
};

function emptyPage(page: number): InitialSearchPage {
  return {
    products: [],
    pagination: {
      limit: 0,
      offset: 0,
      total: 0,
      totalPages: 0,
      page,
      pageSize: SEARCH_PAGE_SIZE,
    },
  };
}

export async function readInitialSearchPage(state: SearchPageState): Promise<InitialSearchPage> {
  if (!hasSearchIntent(state)) {
    return emptyPage(1);
  }

  try {
    const result = await readProductsPageFromDatabase({
      query: state.query || undefined,
      category: state.category,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      storeIds: new Set(state.stores),
      sortBy: state.sortBy,
      page: state.page,
      pageSize: SEARCH_PAGE_SIZE,
    });

    return {
      products: result.products,
      pagination: {
        limit: result.products.length,
        offset: (result.page - 1) * result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        pageSize: result.pageSize,
      },
    };
  } catch (error) {
    console.warn('[Search Page] Initial DB-first render unavailable:', error);
    return emptyPage(state.page);
  }
}

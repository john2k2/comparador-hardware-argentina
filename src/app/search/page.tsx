import type { Metadata } from 'next';
import { SearchPageClient } from '@/components/search/SearchPageClient';
import { buildApiSearchKey, hasSearchIntent, parseSearchState, type SearchPageState } from '@/lib/search/search-state';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { SEARCH_PAGE_SIZE } from '@/lib/search/search-pagination';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { resolveSearchMetadata } from '@/lib/search/search-page-metadata';
import { isIndexableCategoryLanding } from '@/lib/search/search-seo';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function readInitialSearchPage(state: SearchPageState): Promise<{
  products: SearchApiResponse['products'];
  pagination: SearchApiResponse['pagination'];
}> {
  if (!hasSearchIntent(state)) {
    return {
      products: [],
      pagination: {
        limit: 0,
        offset: 0,
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize: SEARCH_PAGE_SIZE,
      },
    };
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
    return {
      products: [],
      pagination: {
        limit: 0,
        offset: 0,
        total: 0,
        totalPages: 0,
        page: state.page,
        pageSize: SEARCH_PAGE_SIZE,
      },
    };
  }
}

export const revalidate = 120;

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  return resolveSearchMetadata(parseSearchState(await searchParams));
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const state = parseSearchState(await searchParams);
  const initialPage = await readInitialSearchPage(state);
  const initialResolvedRequestKey = initialPage.pagination.total > 0
    ? `${buildApiSearchKey(state) ?? '__empty__'}|page=${initialPage.pagination.page}`
    : null;

  const isCategoryLanding = isIndexableCategoryLanding(state);

  return (
    <SearchPageClient
      initialState={state}
      initialBaseProducts={initialPage.products}
      initialPagination={initialPage.pagination}
      initialResolvedRequestKey={initialResolvedRequestKey}
      initialHasSearchIntent={hasSearchIntent(state)}
      initialIsCategoryLanding={isCategoryLanding}
    />
  );
}

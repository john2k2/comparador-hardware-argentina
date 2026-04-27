'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { hydrateProducts } from '@/lib/product-serialization';
import { buildApiSearchKey, buildSearchRoute, toSearchFilters, type SearchPageState } from '@/lib/search/search-state';
import { getCategorySeoCopy } from '@/lib/search/search-seo';
import { stores as defaultStores } from '@/lib/scrapers/static-data';
import type { Product, SearchFilters } from '@/lib/types';
import { trackFilterChange, trackSearch } from '@/lib/analytics';
import { SearchCacheProvider, useProductLoader, useSearchCache, useScrollRestoration } from '@/lib/search/search-hooks';
import { SearchPageView } from './SearchPageView';

export type SearchPageClientProps = {
  initialState: SearchPageState;
  initialBaseProducts: Product[];
  initialPagination: SearchApiResponse['pagination'];
  initialResolvedRequestKey: string | null;
  initialHasSearchIntent: boolean;
  initialIsCategoryLanding: boolean;
};

export function SearchPageClient(props: SearchPageClientProps) {
  const pageKey = useMemo(() => buildSearchRoute(props.initialState), [props.initialState]);

  return (
    <SearchCacheProvider>
      <SearchPageClientInner key={pageKey} {...props} />
    </SearchCacheProvider>
  );
}

function SearchPageClientInner({
  initialState,
  initialBaseProducts,
  initialPagination,
  initialResolvedRequestKey,
  initialHasSearchIntent,
  initialIsCategoryLanding,
}: SearchPageClientProps) {
  const router = useRouter();
  const { setCached } = useSearchCache();

  const [currentState, setCurrentState] = useState<SearchPageState>(initialState);
  const [baseProducts, setBaseProducts] = useState<Product[]>(hydrateProducts(initialBaseProducts));
  const [pagination, setPagination] = useState(initialPagination);
  const [isLoading, setIsLoading] = useState(initialHasSearchIntent && initialPagination.total === 0);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(initialResolvedRequestKey);
  const [searchError, setSearchError] = useState<string | null>(null);
  const pendingSearchTrackRef = useRef<{ query: string; category?: string } | null>(null);
  const filterDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!initialResolvedRequestKey || initialPagination.total === 0) return;
    setCached(initialResolvedRequestKey, {
      products: initialBaseProducts,
      pagination: initialPagination,
      facets: { categories: [], brands: [], stores: [] },
    });
  }, [initialBaseProducts, initialPagination, initialResolvedRequestKey, setCached]);

  const availableStores = useMemo(() => defaultStores, []);
  const filters = useMemo(() => toSearchFilters(currentState), [currentState]);
  const searchQuery = currentState.query;
  const apiSearchKey = useMemo(() => buildApiSearchKey(currentState) ?? '__empty__', [currentState]);
  const requestKey = useMemo(() => `${apiSearchKey}|page=${currentState.page}`, [apiSearchKey, currentState.page]);

  const hasStoreFilters = (filters.stores?.length ?? 0) > 0;
  const hasPriceFilters = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  const hasActiveFilters = Boolean(filters.category || hasStoreFilters || hasPriceFilters || filters.sortBy !== 'relevance');
  const hasSearchIntent = apiSearchKey !== '__empty__';
  const isSearchSyncing = hasSearchIntent && resolvedRequestKey !== null && resolvedRequestKey !== requestKey;
  const isBusy = isLoading || isSearchSyncing;
  const searchRoute = useMemo(() => buildSearchRoute(currentState), [currentState]);
  const categorySeoCopy = useMemo(() => getCategorySeoCopy(currentState.category), [currentState.category]);
  const isSeoCategoryLanding = initialIsCategoryLanding;

  const totalResults = pagination.total;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;

  useScrollRestoration(isBusy, searchRoute, initialPagination);

  useProductLoader({
    currentState,
    hasSearchIntent,
    requestKey,
    pageSize: initialPagination.pageSize,
    onLoadingChange: setIsLoading,
    onResolvedRequestKey: setResolvedRequestKey,
    onError: useCallback((error: string) => {
      setSearchError(error);
      setIsLoading(false);
    }, []),
    onProductsLoaded: useCallback((products, nextPagination) => {
      setSearchError(null);
      setBaseProducts(hydrateProducts(products));
      setPagination(nextPagination);
    }, []),
  });

  useEffect(() => {
    if (pendingSearchTrackRef.current && totalResults >= 0 && !isBusy) {
      trackSearch({
        searchTerm: pendingSearchTrackRef.current.query,
        category: pendingSearchTrackRef.current.category,
        resultCount: totalResults,
      });
      pendingSearchTrackRef.current = null;
    }
  }, [totalResults, isBusy]);

  const buildStateFromFilters = useCallback((nextFilters: SearchFilters, page = 1): SearchPageState => ({
    query: nextFilters.query.trim(),
    category: nextFilters.category,
    minPrice: nextFilters.minPrice,
    maxPrice: nextFilters.maxPrice,
    stores: (nextFilters.stores ?? []).map((store) => store.trim()).filter(Boolean).sort(),
    sortBy: nextFilters.sortBy,
    page,
  }), []);

  const commitState = useCallback((nextState: SearchPageState) => {
    router.replace(buildSearchRoute(nextState), { scroll: false });
    setCurrentState(nextState);
  }, [router]);

  const handleSearch = useCallback((query: string) => {
    const nextQuery = query.trim();
    pendingSearchTrackRef.current = { query: nextQuery, category: filters.category };
    commitState(buildStateFromFilters({ ...filters, query: nextQuery }, 1));
  }, [filters, buildStateFromFilters, commitState]);

  const handleFiltersChange = useCallback((newFilters: Partial<SearchFilters>) => {
    const nextFilters: SearchFilters = { ...filters, ...newFilters, query: searchQuery };
    if (newFilters.category && newFilters.category !== filters.category) {
      trackFilterChange({ filterType: 'category', filterValue: newFilters.category });
    }
    if (newFilters.minPrice !== undefined || newFilters.maxPrice !== undefined) {
      trackFilterChange({ filterType: 'price_range', filterValue: `$${newFilters.minPrice || 0}-$${newFilters.maxPrice || '∞'}` });
    }
    if (newFilters.stores && filters.stores && newFilters.stores.length !== filters.stores.length) {
      trackFilterChange({ filterType: 'store', filterValue: newFilters.stores.join(',') });
    }

    // P2: Debounce de 250ms para evitar navegaciones excesivas al cambiar filtros
    if (filterDebounceRef.current !== null) {
      window.clearTimeout(filterDebounceRef.current);
    }
    filterDebounceRef.current = window.setTimeout(() => {
      filterDebounceRef.current = null;
      commitState(buildStateFromFilters(nextFilters, 1));
    }, 250);
  }, [filters, searchQuery, buildStateFromFilters, commitState]);

  // Cleanup del debounce de filtros al desmontar
  useEffect(() => {
    return () => {
      if (filterDebounceRef.current !== null) {
        window.clearTimeout(filterDebounceRef.current);
      }
    };
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    const clamped = Math.max(1, Math.min(Math.max(totalPages, 1), nextPage));
    commitState(buildStateFromFilters(filters, clamped));
  }, [filters, totalPages, buildStateFromFilters, commitState]);

  const handleClearFilters = useCallback(() => {
    commitState(buildStateFromFilters({
      ...filters,
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      stores: [],
      sortBy: 'relevance',
      sortOrder: 'asc',
    }, 1));
  }, [filters, buildStateFromFilters, commitState]);

  return (
    <SearchPageView
      products={baseProducts}
      filters={filters}
      searchQuery={searchQuery}
      isBusy={isBusy}
      hasActiveFilters={hasActiveFilters}
      totalResults={totalResults}
      totalPages={totalPages}
      currentPage={currentPage}
      isSeoCategoryLanding={isSeoCategoryLanding}
      categorySeoCopy={categorySeoCopy}
      searchRoute={searchRoute}
      availableStores={availableStores}
      searchError={searchError}
      showNoResultsState={!isBusy && totalResults === 0 && hasSearchIntent && !searchError}
      showIdleState={!isBusy && totalResults === 0 && !hasSearchIntent && !searchError}
      onSearch={handleSearch}
      onFiltersChange={handleFiltersChange}
      onClearFilters={handleClearFilters}
      onPageChange={handlePageChange}
    />
  );
}

export default SearchPageClient;

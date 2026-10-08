'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { hydrateProducts } from '@/lib/product-serialization';
import { buildApiSearchKey, buildSearchRoute, parseSearchState, toSearchFilters, type SearchPageState } from '@/lib/search/search-state';
import { getCategorySeoCopy, isCategoryCanonicalLanding, isIndexableCategoryLanding } from '@/lib/search/search-seo';
import { stores as defaultStores } from '@/lib/scrapers/static-data';
import type { Product, SearchFilters } from '@/lib/types';
import { trackFilterChange, trackSearch } from '@/lib/analytics';
import { ANALYTICS_READY_EVENT } from '@/lib/analytics/consent';
import { SearchCacheProvider, useProductLoader, useSearchCache, useScrollRestoration, useSearchMetadata } from '@/lib/search/search-hooks';
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
  const [draftFilters, setDraftFilters] = useState(() => toSearchFilters(initialState));
  const [baseProducts, setBaseProducts] = useState<Product[]>(() => hydrateProducts(initialBaseProducts));
  const [pagination, setPagination] = useState(initialPagination);
  const [isLoading, setIsLoading] = useState(initialHasSearchIntent && !initialResolvedRequestKey);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(initialResolvedRequestKey);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  const filterDebounceRef = useRef<number | null>(null);
  const initialRouteRef = useRef(buildSearchRoute(initialState));

  useEffect(() => {
    if (!initialResolvedRequestKey) return;
    setCached(initialResolvedRequestKey, {
      products: initialBaseProducts,
      pagination: initialPagination,
      facets: { categories: [], brands: [], stores: [] },
    });
  }, [initialBaseProducts, initialPagination, initialResolvedRequestKey, setCached]);

  const availableStores = useMemo(() => defaultStores, []);
  const filters = draftFilters;
  const searchQuery = currentState.query;
  const apiSearchKey = useMemo(() => buildApiSearchKey(currentState) ?? '__empty__', [currentState]);
  const requestKey = useMemo(() => `${apiSearchKey}|page=${currentState.page}`, [apiSearchKey, currentState.page]);

  const hasStoreFilters = (filters.stores?.length ?? 0) > 0;
  const hasPriceFilters = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  const hasActiveFilters = Boolean(filters.category || hasStoreFilters || hasPriceFilters || filters.includeUnavailable || filters.sortBy !== 'relevance');
  const hasSearchIntent = apiSearchKey !== '__empty__';
  const isSearchSyncing = hasSearchIntent && resolvedRequestKey !== null && resolvedRequestKey !== requestKey;
  const isBusy = isLoading || isSearchSyncing || isNavigating;
  const searchRoute = useMemo(() => buildSearchRoute(currentState), [currentState]);
  const categorySeoCopy = useMemo(() => getCategorySeoCopy(currentState.category), [currentState.category]);
  // La URL puede cambiar en el cliente sin remontar este componente. La copia
  // editorial solo debe persistir mientras el estado actual siga siendo la
  // landing canónica de la categoría.
  const isSeoCategoryLanding = initialIsCategoryLanding && isIndexableCategoryLanding(currentState);

  const totalResults = pagination.total;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;

  useScrollRestoration(isBusy, searchRoute, initialPagination);
  useSearchMetadata(currentState);

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
    if (!searchQuery.trim() || isBusy || searchError || resolvedRequestKey !== requestKey) return;
    const track = () => trackSearch({ searchTerm: searchQuery, category: currentState.category, resultCount: totalResults });
    track();
    window.addEventListener(ANALYTICS_READY_EVENT, track);
    return () => window.removeEventListener(ANALYTICS_READY_EVENT, track);
  }, [searchQuery, currentState.category, totalResults, isBusy, searchError, resolvedRequestKey, requestKey]);

  const buildStateFromFilters = useCallback((nextFilters: SearchFilters, page = 1): SearchPageState => ({
    query: nextFilters.query.trim(),
    category: nextFilters.category,
    minPrice: nextFilters.minPrice,
    maxPrice: nextFilters.maxPrice,
    includeUnavailable: nextFilters.includeUnavailable,
    stores: (nextFilters.stores ?? []).map((store) => store.trim()).filter(Boolean).sort(),
    sortBy: nextFilters.sortBy,
    page,
  }), []);

  const cancelFilterDebounce = useCallback(() => {
    if (filterDebounceRef.current !== null) {
      window.clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = null;
    }
  }, []);

  const commitState = useCallback((nextState: SearchPageState) => {
    cancelFilterDebounce();
    const route = buildSearchRoute(nextState);
    // Las landings necesitan una navegación real para renovar metadatos y JSON-LD.
    // No iniciamos también el loader cliente durante esa transición.
    if (window.location.pathname !== '/search' || isCategoryCanonicalLanding(currentState) || isCategoryCanonicalLanding(nextState)) {
      startNavigation(() => router.push(route, { scroll: false }));
      return;
    }
    // Una sola fuente de resultados por interacción: API cliente, sin respuesta RSC.
    if (`${window.location.pathname}${window.location.search}` !== route) {
      window.history.pushState(null, '', route);
    }
    const normalizedState = parseSearchState(Object.fromEntries(new URLSearchParams(route.split('?')[1])));
    setDraftFilters(toSearchFilters(normalizedState));
    setCurrentState(normalizedState);
  }, [router, cancelFilterDebounce, startNavigation, currentState]);

  useEffect(() => {
    const restoreFromHistory = () => {
      cancelFilterDebounce();
      // Next conserva la navegación de documentos y de landings de categorías.
      if (window.location.pathname !== '/search') return;
      const nextState = parseSearchState(Object.fromEntries(new URLSearchParams(window.location.search)));
      setDraftFilters(toSearchFilters(nextState));
      setCurrentState(nextState);
    };
    // Al volver desde un producto, Next puede restaurar el árbol SSR original
    // con una URL que ya contiene filtros añadidos mediante historial nativo.
    if (window.location.pathname === '/search') {
      const urlState = parseSearchState(Object.fromEntries(new URLSearchParams(window.location.search)));
      if (buildSearchRoute(urlState) !== initialRouteRef.current) restoreFromHistory();
    }
    window.addEventListener('popstate', restoreFromHistory);
    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, [cancelFilterDebounce]);

  const handleSearch = useCallback((query: string) => {
    const nextQuery = query.trim();
    commitState(buildStateFromFilters({ ...filters, query: nextQuery }, 1));
  }, [filters, buildStateFromFilters, commitState]);

  const handleFiltersChange = useCallback((newFilters: Partial<SearchFilters>) => {
    const nextFilters: SearchFilters = { ...filters, ...newFilters, query: searchQuery };
    setDraftFilters(nextFilters);
    if (newFilters.category !== undefined && newFilters.category !== filters.category) {
      trackFilterChange({ filterType: 'category', filterValue: newFilters.category || 'all' });
    }
    if (newFilters.minPrice !== undefined || newFilters.maxPrice !== undefined) {
      trackFilterChange({ filterType: 'price_range', filterValue: `$${newFilters.minPrice || 0}-$${newFilters.maxPrice || '∞'}` });
    }
    if (newFilters.stores !== undefined) {
      const previousStores = [...(filters.stores ?? [])].sort().join(',');
      const nextStores = [...newFilters.stores].sort().join(',');
      if (previousStores !== nextStores) {
        trackFilterChange({ filterType: 'store', filterValue: nextStores || 'all' });
      }
    }
    if (newFilters.sortBy !== undefined && newFilters.sortBy !== filters.sortBy) {
      trackFilterChange({ filterType: 'sort', filterValue: newFilters.sortBy });
    }
    if (newFilters.includeUnavailable !== undefined && newFilters.includeUnavailable !== filters.includeUnavailable) {
      trackFilterChange({ filterType: 'availability', filterValue: newFilters.includeUnavailable ? 'include_references' : 'current_offers' });
    }

    // Los campos se actualizan inmediatamente; solo se demora la búsqueda confirmada.
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
      includeUnavailable: false,
      sortBy: 'relevance',
      sortOrder: 'asc',
    }, 1));
  }, [filters, buildStateFromFilters, commitState]);

  return (
    <SearchPageView
      products={baseProducts}
      categoryExcludedOnPage={pagination.categoryExcludedOnPage}
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

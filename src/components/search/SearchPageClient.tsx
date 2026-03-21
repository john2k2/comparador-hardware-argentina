'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar, ProductGrid, Filters } from '@/components/functional';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { hydrateProducts } from '@/lib/product-serialization';
import { buildApiSearchKey, buildSearchRoute, toSearchFilters, type SearchPageState } from '@/lib/search/search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from '@/lib/search/search-seo';
import { stores as defaultStores, categories } from '@/lib/scrapers/static-data';
import type { HardwareCategory, Product, SearchFilters } from '@/lib/types';
import { trackSearch, trackFilterChange } from '@/lib/analytics';
import { SearchCacheProvider, useSearchCache, useScrollRestoration } from '@/lib/search/search-hooks';

export type SearchPageClientProps = {
  initialState: SearchPageState;
  initialBaseProducts: Product[];
  initialPagination: SearchApiResponse['pagination'];
  initialResolvedRequestKey: string | null;
  initialHasSearchIntent: boolean;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SearchPageClient(props: SearchPageClientProps) {
  return (
    <SearchCacheProvider>
      <SearchPageClientInner {...props} />
    </SearchCacheProvider>
  );
}

function SearchPageClientInner({
  initialState,
  initialBaseProducts,
  initialPagination,
  initialResolvedRequestKey,
  initialHasSearchIntent,
}: SearchPageClientProps) {
  const router = useRouter();
  const { setCached, checkStored } = useSearchCache();

  // State
  const [currentState, setCurrentState] = useState<SearchPageState>(initialState);
  const [baseProducts, setBaseProducts] = useState<Product[]>(hydrateProducts(initialBaseProducts));
  const [pagination, setPagination] = useState(initialPagination);
  const [isLoading, setIsLoading] = useState(initialHasSearchIntent && initialPagination.total === 0);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(initialResolvedRequestKey);
  const [pendingSearchTrack, setPendingSearchTrack] = useState<{ query: string; category?: string } | null>(null);

  // Sync state when server props change
  useEffect(() => {
    setCurrentState(initialState);
    setBaseProducts(hydrateProducts(initialBaseProducts));
    setPagination(initialPagination);
    setResolvedRequestKey(initialResolvedRequestKey);
    setIsLoading(initialHasSearchIntent && initialPagination.total === 0);
  }, [initialState, initialBaseProducts, initialPagination, initialResolvedRequestKey, initialHasSearchIntent]);

  // Cache initial products
  useEffect(() => {
    if (!initialResolvedRequestKey || initialPagination.total === 0) return;
    const data: SearchApiResponse = {
      products: initialBaseProducts,
      pagination: initialPagination,
      facets: { categories: [], brands: [], stores: [] },
    };
    setCached(initialResolvedRequestKey, data);
  }, [initialBaseProducts, initialPagination, initialResolvedRequestKey, setCached]);

  // Derived values
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
  const isSeoCategoryLanding = useMemo(() => isIndexableCategoryLanding(currentState), [currentState]);

  const products = baseProducts;
  const totalResults = pagination.total;
  const showNoResultsState = !isBusy && totalResults === 0 && hasSearchIntent;
  const showIdleState = !isBusy && totalResults === 0 && !hasSearchIntent;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;

  // Scroll restoration
  useScrollRestoration(isBusy, searchRoute, initialPagination);

  // Product loading
  useEffect(() => {
    const controller = new AbortController();

    const loadProducts = async () => {
      if (!hasSearchIntent) {
        setBaseProducts([]);
        setPagination({ limit: 0, offset: 0, total: 0, totalPages: 0, page: 1, pageSize: initialPagination.pageSize });
        setIsLoading(false);
        setResolvedRequestKey(requestKey);
        return;
      }

      // Check memory cache
      const cached = checkStored(requestKey);
      if (cached) {
        setBaseProducts(cached.products);
        setPagination(cached.pagination);
        setIsLoading(false);
        setResolvedRequestKey(requestKey);
        return;
      }

      setIsLoading(true);
      try {
        const searchParams = buildSearchRoute(currentState).split('?')[1] || '';
        const endpoint = searchParams ? `/api/search?${searchParams}` : '/api/search';
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json() as SearchApiResponse;
        setBaseProducts(data.products);
        setPagination(data.pagination);
        setCached(requestKey, data);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setBaseProducts([]);
          setPagination({ limit: 0, offset: 0, total: 0, totalPages: 0, page: currentState.page, pageSize: initialPagination.pageSize });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setResolvedRequestKey(requestKey);
        }
      }
    };

    void loadProducts();
    return () => controller.abort();
  }, [currentState, hasSearchIntent, initialPagination.pageSize, requestKey, checkStored, setCached]);

  // Track search events
  useEffect(() => {
    if (pendingSearchTrack && totalResults >= 0 && !isBusy) {
      trackSearch({ searchTerm: pendingSearchTrack.query, category: pendingSearchTrack.category, resultCount: totalResults });
      setPendingSearchTrack(null);
    }
  }, [pendingSearchTrack, totalResults, isBusy]);

  // Handlers
  const buildStateFromFilters = useCallback((nextFilters: SearchFilters, page = 1): SearchPageState => ({
    query: nextFilters.query.trim(),
    category: nextFilters.category,
    minPrice: nextFilters.minPrice,
    maxPrice: nextFilters.maxPrice,
    stores: (nextFilters.stores ?? []).map((s) => s.trim()).filter(Boolean).sort(),
    sortBy: nextFilters.sortBy,
    page,
  }), []);

  const commitState = useCallback((nextState: SearchPageState) => {
    router.replace(buildSearchRoute(nextState), { scroll: false });
    setCurrentState(nextState);
  }, [router]);

  const handleSearch = useCallback((query: string) => {
    const nextQuery = query.trim();
    setPendingSearchTrack({ query: nextQuery, category: filters.category });
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
    commitState(buildStateFromFilters(nextFilters, 1));
  }, [filters, searchQuery, buildStateFromFilters, commitState]);

  const handlePageChange = useCallback((nextPage: number) => {
    const clamped = Math.max(1, Math.min(Math.max(totalPages, 1), nextPage));
    commitState(buildStateFromFilters(filters, clamped));
  }, [filters, totalPages, buildStateFromFilters, commitState]);

  const handleClearFilters = useCallback(() => {
    commitState(buildStateFromFilters({ ...filters, category: undefined, minPrice: undefined, maxPrice: undefined, stores: [], sortBy: 'relevance', sortOrder: 'asc' }, 1));
  }, [filters, buildStateFromFilters, commitState]);

  return (
    <SearchPageUI
      products={products}
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
      showNoResultsState={showNoResultsState}
      showIdleState={showIdleState}
      onSearch={handleSearch}
      onFiltersChange={handleFiltersChange}
      onClearFilters={handleClearFilters}
      onPageChange={handlePageChange}
    />
  );
}

// ---------------------------------------------------------------------------
// UI Sub-component
// ---------------------------------------------------------------------------

type SearchPageUIProps = {
  products: Product[];
  filters: ReturnType<typeof toSearchFilters>;
  searchQuery: string;
  isBusy: boolean;
  hasActiveFilters: boolean;
  totalResults: number;
  totalPages: number;
  currentPage: number;
  isSeoCategoryLanding: boolean;
  categorySeoCopy: ReturnType<typeof getCategorySeoCopy>;
  searchRoute: string;
  availableStores: typeof defaultStores;
  showNoResultsState: boolean;
  showIdleState: boolean;
  onSearch: (query: string) => void;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
};

function SearchPageUI({
  products,
  filters,
  searchQuery,
  isBusy,
  hasActiveFilters,
  totalResults,
  totalPages,
  currentPage,
  isSeoCategoryLanding,
  categorySeoCopy,
  searchRoute,
  availableStores,
  showNoResultsState,
  showIdleState,
  onSearch,
  onFiltersChange,
  onClearFilters,
  onPageChange,
}: SearchPageUIProps) {
  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-6">
      {isSeoCategoryLanding && categorySeoCopy && (
        <header className="mb-8 bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
          <p className="text-[8px] uppercase tracking-[0.3em] text-secondary font-bold mb-3">LANDING DE CATEGORIA</p>
          <h1 className="text-sm md:text-lg uppercase font-bold leading-relaxed text-foreground">{categorySeoCopy.heading}</h1>
          <p className="mt-4 text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">{categorySeoCopy.intro}</p>
        </header>
      )}

      <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
        <div className="w-full">
          <SearchBar
            key={searchQuery}
            onSearch={onSearch}
            placeholder="NUEVA BUSQUEDA..."
            initialValue={searchQuery}
            isLoading={isBusy}
            loadingText={searchQuery ? `Consultando tiendas para ${searchQuery}...` : 'Consultando tiendas y precios...'}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 flex-shrink-0 lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin pr-2 pb-4 flex flex-col gap-8">
          <FiltersPanel filters={filters} stores={availableStores} onChange={onFiltersChange} />
          <CategoriesPanel filters={filters} onChange={onFiltersChange} />
        </aside>

        <div className="flex-1">
          <SearchHeader totalResults={totalResults} searchQuery={searchQuery} isBusy={isBusy} />
          {isBusy && <LoadingState searchQuery={searchQuery} />}
          <div id="product-grid-start" className="bg-muted p-4 border-4 border-border relative">
            {showNoResultsState && <NoResultsState searchQuery={searchQuery} hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} onRetry={() => onSearch(searchQuery)} />}
            {showIdleState && <IdleState />}
            {!showNoResultsState && !showIdleState && <ProductGrid products={products} isLoading={isBusy} emptyMessage="No se encontraron productos" returnTo={searchRoute} />}
            <PaginationControls currentPage={currentPage} totalPages={totalPages} isBusy={isBusy} onPageChange={onPageChange} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel Sub-components
// ---------------------------------------------------------------------------

function FiltersPanel({ filters, stores, onChange }: { filters: ReturnType<typeof toSearchFilters>; stores: typeof defaultStores; onChange: (f: Partial<SearchFilters>) => void }) {
  return (
    <div className="bg-card border-4 border-border p-4 flex-shrink-0">
      <h2 className="text-[12px] mb-6 border-b-4 border-primary pb-2 uppercase font-bold text-primary">FILTROS</h2>
      <Filters filters={filters} onChange={onChange} categories={categories} stores={stores} />
    </div>
  );
}

function CategoriesPanel({ filters, onChange }: { filters: ReturnType<typeof toSearchFilters>; onChange: (f: Partial<SearchFilters>) => void }) {
  return (
    <div className="bg-card border-4 border-border p-4 flex-shrink-0">
      <h3 className="text-[10px] uppercase font-bold text-primary mb-3 border-b-2 border-muted pb-2">CATEGORIAS</h3>
      <div className="flex flex-col gap-1">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onChange({ category: category.id as HardwareCategory })}
            aria-label={`Filtrar por categoría: ${category.name}`}
            className={`text-left text-[9px] uppercase font-bold px-2 py-1.5 transition-colors ${filters.category === category.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchHeader({ totalResults, searchQuery, isBusy }: { totalResults: number; searchQuery: string; isBusy: boolean }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="bg-primary text-primary-foreground p-2 inline-block border-2 border-border">
        <p className="text-[10px] uppercase font-bold" aria-live="polite">{isBusy ? 'BUSCANDO...' : `RESULTADOS: ${totalResults} ITEMS`}</p>
      </div>
      {searchQuery && (
        <div className="text-[10px] uppercase font-bold text-muted-foreground">
          BUSQUEDA: <span className="text-secondary">&quot;{searchQuery}&quot;</span>
        </div>
      )}
    </div>
  );
}

function LoadingState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="mb-4 border-2 border-secondary bg-card px-4 py-3 pixel-shadow animate-pulse">
      <p className="text-[10px] uppercase font-bold text-secondary tracking-wide">
        {searchQuery ? `ESCANEANDO TIENDAS PARA "${searchQuery}"...` : 'ESCANEANDO TIENDAS Y PRECIOS...'}
      </p>
      <p className="text-[8px] uppercase text-muted-foreground mt-1 tracking-wide">
        Espera a que termine la busqueda antes de asumir que no hay stock o resultados.
      </p>
    </div>
  );
}

function NoResultsState({ searchQuery, hasActiveFilters, onClearFilters, onRetry }: { searchQuery: string; hasActiveFilters: boolean; onClearFilters: () => void; onRetry: () => void }) {
  return (
    <div className="border-4 border-primary bg-card p-6 md:p-8 text-center pixel-shadow">
      <p className="text-[11px] uppercase font-bold text-primary">[ SIN RESULTADOS ]</p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2 leading-relaxed">
        {searchQuery ? `No encontramos coincidencias para "${searchQuery}".` : 'No encontramos coincidencias con los filtros actuales.'}
      </p>
      <p className="text-[8px] uppercase text-muted-foreground mt-2 leading-relaxed">Proba otra palabra, una marca/modelo mas corto o amplia los filtros.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {hasActiveFilters && <button onClick={onClearFilters} className="pixel-button text-[9px] px-3 py-2">LIMPIAR FILTROS</button>}
        <button onClick={onRetry} className="pixel-button text-[9px] px-3 py-2">REINTENTAR BUSQUEDA</button>
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="border-4 border-border bg-card p-8 text-center pixel-shadow">
      <p className="text-[10px] uppercase font-bold text-primary">[ LISTO PARA BUSCAR ]</p>
      <p className="text-[9px] uppercase text-muted-foreground mt-2">Escribi un producto para empezar (ej: RTX 5060, Ryzen 7600).</p>
    </div>
  );
}

function PaginationControls({ currentPage, totalPages, isBusy, onPageChange }: { currentPage: number; totalPages: number; isBusy: boolean; onPageChange: (p: number) => void }) {
  if (isBusy || currentPage >= totalPages || totalPages <= 1) return null;
  return (
    <div className="flex justify-between items-center mt-6 pt-6 border-t-4 border-border border-dashed">
      <button
        onClick={() => { onPageChange(currentPage - 1); document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' }); }}
        disabled={currentPage === 1}
        className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
      >
        {`<< PREV`}
      </button>
      <div className="text-[10px] font-bold uppercase text-primary px-4 py-2 border-2 border-primary bg-card pixel-shadow-primary flex items-center gap-2">
        <span className="hidden sm:inline">NIVEL</span> {currentPage} / {totalPages}
      </div>
      <button
        onClick={() => { onPageChange(currentPage + 1); document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' }); }}
        disabled={currentPage === totalPages}
        className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
      >
        {`NEXT >>`}
      </button>
    </div>
  );
}

export default SearchPageClient;

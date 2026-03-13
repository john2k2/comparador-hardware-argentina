'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar, ProductGrid, Filters } from '@/components/functional';
import type { SearchApiResponse } from '@/lib/search/search-api';
import { hydrateProducts } from '@/lib/product-serialization';
import { buildApiSearchKey, buildSearchPageParams, buildSearchRoute, toSearchFilters, type SearchPageState } from '@/lib/search/search-state';
import { getCategorySeoCopy, isIndexableCategoryLanding } from '@/lib/search/search-seo';
import { stores as defaultStores, categories } from '@/lib/scrapers/static-data';
import type { Product, SearchFilters } from '@/lib/types';

const CLIENT_SEARCH_CACHE_TTL_MS = 90 * 1000;
const clientSearchCache = new Map<string, { expiresAt: number; payload: SearchApiResponse }>();
const CLIENT_SEARCH_STORAGE_PREFIX = 'search-cache:v3:';
const SEARCH_SCROLL_STORAGE_PREFIX = 'search-scroll:v1:';
const SEARCH_SCROLL_TTL_MS = 10 * 60 * 1000;

function getStorageKey(cacheKey: string): string {
  return `${CLIENT_SEARCH_STORAGE_PREFIX}${cacheKey}`;
}

function normalizeSearchPayload(payload: SearchApiResponse): SearchApiResponse {
  return {
    ...payload,
    products: hydrateProducts(payload.products ?? []),
  };
}

function readStoredSearch(cacheKey: string): { expiresAt: number; payload: SearchApiResponse } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; payload?: SearchApiResponse };
    if (!parsed.expiresAt || !parsed.payload || !Array.isArray(parsed.payload.products)) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(getStorageKey(cacheKey));
      return null;
    }
    return { expiresAt: parsed.expiresAt, payload: normalizeSearchPayload(parsed.payload) };
  } catch {
    return null;
  }
}

function writeStoredSearch(cacheKey: string, value: { expiresAt: number; payload: SearchApiResponse }) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getStorageKey(cacheKey), JSON.stringify(value));
  } catch {
    // Ignore storage quota errors.
  }
}

type StoredScrollPayload = {
  y?: number;
  savedAt?: number;
};

function readStoredScrollPosition(searchRoute: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredScrollPayload;
    const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : null;
    const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;

    if (y === null || y < 0) return null;
    if (savedAt > 0 && Date.now() - savedAt > SEARCH_SCROLL_TTL_MS) {
      window.sessionStorage.removeItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
      return null;
    }

    return Math.round(y);
  } catch {
    return null;
  }
}

function clearStoredScrollPosition(searchRoute: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${SEARCH_SCROLL_STORAGE_PREFIX}${searchRoute}`);
  } catch {
    // Ignore storage failures.
  }
}

export type SearchPageClientProps = {
  initialState: SearchPageState;
  initialBaseProducts: Product[];
  initialPagination: SearchApiResponse['pagination'];
  initialResolvedRequestKey: string | null;
  initialHasSearchIntent: boolean;
};

export function SearchPageClient({
  initialState,
  initialBaseProducts,
  initialPagination,
  initialResolvedRequestKey,
  initialHasSearchIntent,
}: SearchPageClientProps) {
  const router = useRouter();
  const [currentState, setCurrentState] = useState<SearchPageState>(initialState);
  const [baseProducts, setBaseProducts] = useState<Product[]>(hydrateProducts(initialBaseProducts));
  const [pagination, setPagination] = useState(initialPagination);
  const [isLoading, setIsLoading] = useState(initialHasSearchIntent && initialPagination.total === 0);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(initialResolvedRequestKey);

  useEffect(() => {
    setCurrentState(initialState);
    setBaseProducts(hydrateProducts(initialBaseProducts));
    setPagination(initialPagination);
    setResolvedRequestKey(initialResolvedRequestKey);
    setIsLoading(initialHasSearchIntent && initialPagination.total === 0);
  }, [initialBaseProducts, initialHasSearchIntent, initialPagination, initialResolvedRequestKey, initialState]);

  useEffect(() => {
    if (!initialResolvedRequestKey || initialPagination.total === 0) return;

    const entry = {
      payload: {
        products: initialBaseProducts,
        pagination: initialPagination,
        facets: {
          categories: [],
          brands: [],
          stores: [],
        },
      },
      expiresAt: Date.now() + CLIENT_SEARCH_CACHE_TTL_MS,
    };
    clientSearchCache.set(initialResolvedRequestKey, {
      ...entry,
      payload: normalizeSearchPayload(entry.payload),
    });
    writeStoredSearch(initialResolvedRequestKey, entry);
  }, [initialBaseProducts, initialPagination, initialResolvedRequestKey]);

  const availableStores = useMemo(() => defaultStores, []);

  const filters = useMemo(() => toSearchFilters(currentState), [currentState]);
  const searchQuery = currentState.query;
  const apiSearchKey = useMemo(() => {
    return buildApiSearchKey(currentState) ?? '__empty__';
  }, [currentState]);
  const requestKey = useMemo(
    () => `${apiSearchKey}|page=${currentState.page}`,
    [apiSearchKey, currentState.page],
  );
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

  useEffect(() => {
    const controller = new AbortController();

    const loadProducts = async () => {
      if (!hasSearchIntent) {
        setBaseProducts([]);
        setPagination({
          limit: 0,
          offset: 0,
          total: 0,
          totalPages: 0,
          page: 1,
          pageSize: initialPagination.pageSize,
        });
        setIsLoading(false);
        setResolvedRequestKey(requestKey);
        return;
      }

      const cacheKey = requestKey;

      const cached = clientSearchCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        setBaseProducts(cached.payload.products);
        setPagination(cached.payload.pagination);
        setIsLoading(false);
        setResolvedRequestKey(requestKey);
        return;
      }

      const stored = readStoredSearch(cacheKey);
      if (stored) {
        clientSearchCache.set(cacheKey, stored);
        setBaseProducts(stored.payload.products);
        setPagination(stored.payload.pagination);
        setIsLoading(false);
        setResolvedRequestKey(requestKey);
        return;
      }

      setIsLoading(true);
      try {
        const searchParams = buildSearchPageParams(currentState).toString();
        const endpoint = searchParams ? `/api/search?${searchParams}` : '/api/search';
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
        const data = normalizeSearchPayload(await res.json() as SearchApiResponse);
        setBaseProducts(data.products);
        setPagination(data.pagination);
        const entry = {
          payload: data,
          expiresAt: Date.now() + CLIENT_SEARCH_CACHE_TTL_MS,
        };
        clientSearchCache.set(cacheKey, entry);
        writeStoredSearch(cacheKey, entry);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setBaseProducts([]);
          setPagination({
            limit: 0,
            offset: 0,
            total: 0,
            totalPages: 0,
            page: currentState.page,
            pageSize: initialPagination.pageSize,
          });
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
  }, [currentState, hasSearchIntent, initialPagination.pageSize, requestKey]);

  useEffect(() => {
    if (isBusy || typeof window === 'undefined') return;

    const targetY = readStoredScrollPosition(searchRoute);
    if (targetY === null) return;

    let cancelled = false;
    const timers: number[] = [];
    const restore = () => {
      if (cancelled) return;
      window.scrollTo(0, targetY);
    };

    restore();
    timers.push(window.setTimeout(restore, 80));
    timers.push(window.setTimeout(restore, 220));
    timers.push(window.setTimeout(() => {
      if (cancelled) return;
      restore();
      clearStoredScrollPosition(searchRoute);
    }, 420));

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [isBusy, searchRoute]);

  const buildStateFromFilters = (nextFilters: SearchFilters, page = 1): SearchPageState => ({
    query: nextFilters.query.trim(),
    category: nextFilters.category,
    minPrice: nextFilters.minPrice,
    maxPrice: nextFilters.maxPrice,
    stores: (nextFilters.stores ?? [])
      .map((storeId) => storeId.trim())
      .filter(Boolean)
      .sort(),
    sortBy: nextFilters.sortBy,
    page,
  });

  const commitState = (nextState: SearchPageState) => {
    const url = buildSearchRoute(nextState);
    setCurrentState(nextState);
    router.replace(url, { scroll: false });
  };

  const handleSearch = (query: string) => {
    const nextQuery = query.trim();
    commitState(buildStateFromFilters({ ...filters, query: nextQuery }, 1));
  };

  const handleFiltersChange = (newFilters: Partial<SearchFilters>) => {
    const nextFilters: SearchFilters = {
      ...filters,
      ...newFilters,
      query: searchQuery,
    };
    commitState(buildStateFromFilters(nextFilters, 1));
  };

  const handlePageChange = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(Math.max(totalPages, 1), nextPage));
    commitState(buildStateFromFilters(filters, clamped));
  };

  const handleClearFilters = () => {
    commitState(buildStateFromFilters({
      ...filters,
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      stores: [],
      sortBy: 'relevance',
      sortOrder: 'asc',
    }, 1));
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8 py-6">
      {isSeoCategoryLanding && categorySeoCopy ? (
        <header className="mb-8 bg-card border-4 border-border p-5 md:p-6 pixel-shadow">
          <p className="text-[8px] uppercase tracking-[0.3em] text-secondary font-bold mb-3">
            LANDING DE CATEGORIA
          </p>
          <h1 className="text-sm md:text-lg uppercase font-bold leading-relaxed text-foreground">
            {categorySeoCopy.heading}
          </h1>
          <p className="mt-4 text-[11px] md:text-[12px] leading-relaxed normal-case tracking-normal text-foreground/80 font-mono">
            {categorySeoCopy.intro}
          </p>
        </header>
      ) : null}

      <div className="flex flex-col md:flex-row gap-6 mb-8 items-center">
        {!isSeoCategoryLanding && (
          <section className="flex-1 w-full border-4 border-dashed border-muted p-2 text-center bg-card">
            <div className="bg-muted w-full h-16 md:h-20 flex items-center justify-center border-4 border-border relative overflow-hidden pixel-shadow">
              <span className="text-primary font-bold text-sm md:text-base animate-pixel-blink">[ SPONSORED BANNER ]</span>
            </div>
          </section>
        )}

        <div className={isSeoCategoryLanding ? 'w-full' : 'w-full md:w-1/3 min-w-0 sm:min-w-[300px]'}>
          <SearchBar
            key={searchQuery}
            onSearch={handleSearch}
            placeholder="NUEVA BUSQUEDA..."
            initialValue={searchQuery}
            isLoading={isBusy}
            loadingText={searchQuery
              ? `Consultando tiendas para ${searchQuery}...`
              : 'Consultando tiendas y precios...'}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-72 flex-shrink-0 lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin pr-2 pb-4 flex flex-col gap-8">
          <div className="bg-card border-4 border-border p-4 flex-shrink-0">
            <h2 className="text-[12px] mb-6 border-b-4 border-primary pb-2 uppercase font-bold text-primary">FILTROS</h2>
            <Filters
              filters={filters}
              onChange={handleFiltersChange}
              categories={categories}
              stores={availableStores}
            />
          </div>

          {!isSeoCategoryLanding && (
            <div className="border-4 border-dashed border-muted p-4 text-center bg-card flex-shrink-0">
              <div className="text-muted-foreground uppercase text-[8px] tracking-widest mb-2 font-bold">
                -- VERTICAL BANNER --
              </div>
              <div className="bg-muted w-full h-[300px] flex items-center justify-center border-4 border-border relative overflow-hidden pixel-shadow">
                <span className="text-primary font-bold text-sm animate-pixel-blink text-center px-2">[ INSERT COIN ]</span>
              </div>
            </div>
          )}
        </aside>

        <div className="flex-1">
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="bg-primary text-primary-foreground p-2 inline-block border-2 border-border">
              <p className="text-[10px] uppercase font-bold" aria-live="polite">
                {isBusy ? 'BUSCANDO...' : `RESULTADOS: ${totalResults} ITEMS`}
              </p>
            </div>
            {searchQuery && (
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                BUSQUEDA: <span className="text-secondary">&quot;{searchQuery}&quot;</span>
              </div>
            )}
          </div>

          {isBusy && (
            <div className="mb-4 border-2 border-secondary bg-card px-4 py-3 pixel-shadow animate-pulse">
              <p className="text-[10px] uppercase font-bold text-secondary tracking-wide">
                {searchQuery
                  ? `ESCANEANDO TIENDAS PARA "${searchQuery}"...`
                  : 'ESCANEANDO TIENDAS Y PRECIOS...'}
              </p>
              <p className="text-[8px] uppercase text-muted-foreground mt-1 tracking-wide">
                Espera a que termine la busqueda antes de asumir que no hay stock o resultados.
              </p>
            </div>
          )}

          <div id="product-grid-start" className="bg-muted p-4 border-4 border-border relative">
            {!isSeoCategoryLanding && products.length > 4 && (
              <div className="col-span-full border-4 border-dashed border-muted p-4 my-8 text-center bg-card">
                <div className="text-muted-foreground uppercase text-[8px] tracking-widest mb-2 font-bold">
                  -- SPONSOR --
                </div>
                <div className="bg-muted w-full h-16 flex items-center justify-center border-4 border-border relative overflow-hidden">
                  <span className="text-accent font-bold text-sm">[ HOT DEAL BANNER ]</span>
                </div>
              </div>
            )}

            {showNoResultsState ? (
              <div className="border-4 border-primary bg-card p-6 md:p-8 text-center pixel-shadow">
                <p className="text-[11px] uppercase font-bold text-primary">
                  [ SIN RESULTADOS ]
                </p>
                <p className="text-[9px] uppercase text-muted-foreground mt-2 leading-relaxed">
                  {searchQuery
                    ? `No encontramos coincidencias para "${searchQuery}".`
                    : 'No encontramos coincidencias con los filtros actuales.'}
                </p>
                <p className="text-[8px] uppercase text-muted-foreground mt-2 leading-relaxed">
                  Proba otra palabra, una marca/modelo mas corto o amplia los filtros.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="pixel-button text-[9px] px-3 py-2"
                    >
                      LIMPIAR FILTROS
                    </button>
                  )}
                  <button
                    onClick={() => handleSearch(searchQuery)}
                    className="pixel-button text-[9px] px-3 py-2"
                  >
                    REINTENTAR BUSQUEDA
                  </button>
                </div>
              </div>
            ) : showIdleState ? (
              <div className="border-4 border-border bg-card p-8 text-center pixel-shadow">
                <p className="text-[10px] uppercase font-bold text-primary">
                  [ LISTO PARA BUSCAR ]
                </p>
                <p className="text-[9px] uppercase text-muted-foreground mt-2">
                  Escribi un producto para empezar (ej: RTX 5060, Ryzen 7600).
                </p>
              </div>
            ) : (
              <ProductGrid
                products={products}
                isLoading={isBusy}
                emptyMessage="No se encontraron productos"
                returnTo={searchRoute}
              />
            )}

            {!isBusy && totalResults > 0 && totalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-6 border-t-4 border-border border-dashed">
                <button
                  onClick={() => {
                    handlePageChange(currentPage - 1);
                    document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage === 1}
                  className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
                >
                  {`<< PREV`}
                </button>
                <div className="text-[10px] font-bold uppercase text-primary px-4 py-2 border-2 border-primary bg-card pixel-shadow-primary flex items-center gap-2">
                  <span className="hidden sm:inline">NIVEL</span> {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => {
                    handlePageChange(currentPage + 1);
                    document.getElementById('product-grid-start')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage === totalPages}
                  className="pixel-button disabled:opacity-50 disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:cursor-not-allowed text-[10px]"
                >
                  {`NEXT >>`}
                </button>
              </div>
            )}
          </div>
        </div>

        {!isSeoCategoryLanding && (
          <aside className="hidden xl:block w-64 flex-shrink-0">
            <div className="xl:sticky xl:top-8 flex flex-col gap-8">
              <div className="border-4 border-dashed border-muted p-4 text-center bg-card">
                <div className="text-muted-foreground uppercase text-[8px] tracking-widest mb-2 font-bold">
                  -- PREMIUM AD SPACE --
                </div>
                <div className="bg-muted w-full h-[600px] flex flex-col items-center justify-center border-4 border-border px-2 text-center relative overflow-hidden pixel-shadow">
                  <span className="text-accent font-bold text-lg animate-pixel-blink mb-4">[ MEGA DEAL ]</span>
                  <p className="text-[10px] text-muted-foreground leading-loose">
                    RESERVA ESTE ESPACIO PARA DESTACAR TU TIENDA EN TODA LA NAVEGACION.
                  </p>
                </div>
              </div>

              <div className="border-4 border-dashed border-muted p-4 text-center bg-card">
                <div className="text-muted-foreground uppercase text-[8px] tracking-widest mb-2 font-bold">
                  -- SIDEBAR AD --
                </div>
                <div className="bg-muted w-full h-[300px] flex items-center justify-center border-4 border-border relative overflow-hidden pixel-shadow">
                  <span className="text-primary font-bold text-sm animate-pixel-blink px-2">[ AD SPACE 2 ]</span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default SearchPageClient;

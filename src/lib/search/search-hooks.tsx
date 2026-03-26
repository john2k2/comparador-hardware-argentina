/**
 * Custom hooks for search functionality
 */

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { SearchPageState } from './search-state';
import { buildSearchPageParams } from './search-state';
import type { SearchApiResponse } from './search-api';
import {
  readStoredSearch,
  writeStoredSearch,
  createSearchCacheEntry,
  writeStoredScrollPosition,
  readStoredScrollPosition,
  clearStoredScrollPosition,
} from './search-cache-utils';

type SearchCacheEntry = { expiresAt: number; payload: SearchApiResponse };

type SearchCacheContextValue = {
  getCached: (key: string) => SearchApiResponse | null;
  setCached: (key: string, payload: SearchApiResponse) => void;
  checkStored: (key: string) => SearchApiResponse | null;
};

const SearchCacheContext = createContext<SearchCacheContextValue | null>(null);

export function SearchCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, SearchCacheEntry>>(new Map());

  const getCached = useCallback((key: string) => {
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
    return null;
  }, []);

  const setCached = useCallback((key: string, payload: SearchApiResponse) => {
    const entry = createSearchCacheEntry(payload);
    cacheRef.current.set(key, { ...entry, payload: { ...entry.payload, products: entry.payload.products } });
    writeStoredSearch(key, entry);
  }, []);

  const checkStored = useCallback((key: string) => {
    const stored = readStoredSearch(key);
    if (stored) {
      cacheRef.current.set(key, stored);
      return stored.payload;
    }
    return null;
  }, []);

  return (
    <SearchCacheContext.Provider value={{ getCached, setCached, checkStored }}>
      {children}
    </SearchCacheContext.Provider>
  );
}

export function useSearchCache() {
  const ctx = useContext(SearchCacheContext);
  if (!ctx) {
    throw new Error('useSearchCache must be used within SearchCacheProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// useScrollRestoration - Restores scroll position after search
// ---------------------------------------------------------------------------

export function useScrollRestoration(
  isBusy: boolean,
  searchRoute: string,
  initialPagination: SearchApiResponse['pagination']
) {
  void initialPagination;
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const persistScroll = () => {
      writeStoredScrollPosition(searchRoute, window.scrollY || window.pageYOffset || 0);
    };
    let timeoutId: number | null = null;
    const schedulePersist = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        persistScroll();
      }, 120);
    };

    window.addEventListener('scroll', schedulePersist, { passive: true });

    return () => {
      window.removeEventListener('scroll', schedulePersist);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [searchRoute]);
}

// ---------------------------------------------------------------------------
// useProductLoader - Loads products from API with caching
// ---------------------------------------------------------------------------

export function useProductLoader({
  currentState,
  hasSearchIntent,
  pageSize,
  onProductsLoaded,
}: {
  currentState: SearchPageState;
  hasSearchIntent: boolean;
  pageSize: number;
  onProductsLoaded: (products: SearchApiResponse['products'], pagination: SearchApiResponse['pagination']) => void;
}) {
  const { getCached, setCached, checkStored } = useSearchCache();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const loadProducts = async () => {
      if (!hasSearchIntent) {
        onProductsLoaded([], {
          limit: 0,
          offset: 0,
          total: 0,
          totalPages: 0,
          page: 1,
          pageSize,
        });
        return;
      }

      const cacheKey = `${currentState.query || ''}|${currentState.category || ''}|page=${currentState.page}`;

      // Check memory cache
      const cached = getCached(cacheKey);
      if (cached) {
        onProductsLoaded(cached.products, cached.pagination);
        return;
      }

      // Check sessionStorage cache
      const stored = checkStored(cacheKey);
      if (stored) {
        onProductsLoaded(stored.products, stored.pagination);
        return;
      }

      // Fetch from API
      try {
        const searchParams = buildSearchPageParams(currentState).toString();
        const endpoint = searchParams ? `/api/search?${searchParams}` : '/api/search';
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
        const data = await res.json() as SearchApiResponse;
        setCached(cacheKey, data);
        onProductsLoaded(data.products, data.pagination);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          onProductsLoaded([], {
            limit: 0,
            offset: 0,
            total: 0,
            totalPages: 0,
            page: currentState.page,
            pageSize,
          });
        }
      }
    };

    void loadProducts();
    return () => controller.abort();
  }, [currentState, hasSearchIntent, pageSize, onProductsLoaded, getCached, setCached, checkStored]);
}

// ---------------------------------------------------------------------------
// useSearchTracking - Tracks search events for analytics
// ---------------------------------------------------------------------------

export function useSearchTracking(
  pendingTrack: { query: string; category?: string } | null,
  totalResults: number,
  isBusy: boolean,
  category?: string
) {
  useEffect(() => {
    if (pendingTrack && totalResults >= 0 && !isBusy) {
      // GA4 tracking would go here
      console.debug('[SearchTrack]', pendingTrack.query, totalResults, category);
    }
  }, [pendingTrack, totalResults, isBusy, category]);
}

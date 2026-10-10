/**
 * Custom hooks for search functionality
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { SearchPageState } from './search-state';
import { buildSearchRoute } from './search-state';
import type { SearchApiResponse } from './search-api';
import { resolveSearchMetadata } from './search-page-metadata';
import { isCategoryCanonicalLanding } from './search-seo';
import { SITE_NAME } from '@/lib/site-config';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';
import { CATALOG_OFFER_FRESH_MS } from '@/lib/price-freshness';
import { hasCurrentSearchPagePrices } from './search-availability';
import {
  readStoredSearch,
  writeStoredSearch,
  createSearchCacheEntry,
  writeStoredScrollPosition,
  readStoredScrollPosition,
  clearStoredScrollPosition,
} from './search-cache-utils';

type SearchCacheEntry = { expiresAt: number; payload: SearchApiResponse };

// El historial nativo no vuelve a ejecutar generateMetadata. Se reutiliza su
// resolver para mantener la búsqueda coherente sin tocar las landings SEO.
export function useSearchMetadata(state: SearchPageState) {
  useEffect(() => {
    if (window.location.pathname !== '/search' || isCategoryCanonicalLanding(state)) return;
    const metadata = resolveSearchMetadata(state);
    const title = typeof metadata.title === 'string' ? `${metadata.title} | ${SITE_NAME}` : undefined;
    if (title) document.title = title;

    const setMeta = (attribute: 'name' | 'property', key: string, value: unknown) => {
      if (typeof value !== 'string') return;
      const element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`) ?? document.createElement('meta');
      element.setAttribute(attribute, key);
      element.content = value;
      if (!element.isConnected) document.head.append(element);
    };
    setMeta('name', 'description', metadata.description);
    setMeta('name', 'robots', 'noindex, follow');
    setMeta('property', 'og:title', metadata.openGraph?.title);
    setMeta('property', 'og:description', metadata.openGraph?.description);
    setMeta('property', 'og:url', metadata.openGraph?.url);
    setMeta('name', 'twitter:title', metadata.twitter?.title);
    setMeta('name', 'twitter:description', metadata.twitter?.description);
    const canonical = metadata.alternates?.canonical;
    if (typeof canonical === 'string') {
      const element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.createElement('link');
      element.rel = 'canonical';
      element.href = canonical;
      if (!element.isConnected) document.head.append(element);
    }
  }, [state]);
}

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

  const value = useMemo(() => ({ getCached, setCached, checkStored }), [getCached, setCached, checkStored]);

  return (
    <SearchCacheContext.Provider value={value}>
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
  requestKey,
  pageSize,
  onLoadingChange,
  onResolvedRequestKey,
  onProductsLoaded,
  onError,
}: {
  currentState: SearchPageState;
  hasSearchIntent: boolean;
  requestKey: string;
  pageSize: number;
  onLoadingChange: (isLoading: boolean) => void;
  onResolvedRequestKey: (requestKey: string) => void;
  onProductsLoaded: (products: SearchApiResponse['products'], pagination: SearchApiResponse['pagination']) => void;
  onError?: (error: string) => void;
}) {
  const { getCached, setCached, checkStored } = useSearchCache();

  useEffect(() => {
    const controller = new AbortController();
    // Capturar el requestKey al inicio del efecto para detectar races
    const snapshotKey = requestKey;
    const needsCurrentPrices = !currentState.includeUnavailable || currentState.minPrice !== undefined || currentState.maxPrice !== undefined;
    const hasValidPrices = (payload: SearchApiResponse) => !needsCurrentPrices || hasCurrentSearchPagePrices(payload.products);
    let expiryTimer: number | undefined;
    let nextOfferExpiry = Infinity;
    let refreshing = false;

    // Releer sólo al vencer una oferta visible, no hacer polling cada TTL.
    // El +1 conserva la inclusión exacta en el límite de 24 horas.
    const scheduleOfferExpiry = (payload: SearchApiResponse) => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      nextOfferExpiry = Math.min(...payload.products.flatMap(product =>
        getRecentProductOffers(product).map(offer => new Date(offer.lastUpdated).getTime() + CATALOG_OFFER_FRESH_MS + 1)));
      if (Number.isFinite(nextOfferExpiry)) {
        expiryTimer = window.setTimeout(recheckExpiredOffers, Math.max(1, nextOfferExpiry - Date.now()));
      }
    };
    const recheckExpiredOffers = () => {
      if (controller.signal.aborted || refreshing || Date.now() < nextOfferExpiry || document.visibilityState === 'hidden') return;
      refreshing = true;
      nextOfferExpiry = Infinity;
      void loadProducts().finally(() => { refreshing = false; });
    };

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
        onLoadingChange(false);
        onResolvedRequestKey(snapshotKey);
        return;
      }

      // Check memory cache
      const cached = getCached(snapshotKey);
      if (cached && hasValidPrices(cached)) {
        scheduleOfferExpiry(cached);
        onProductsLoaded(cached.products, cached.pagination);
        onLoadingChange(false);
        onResolvedRequestKey(snapshotKey);
        return;
      }

      // Check sessionStorage cache
      const stored = checkStored(snapshotKey);
      if (stored && hasValidPrices(stored)) {
        scheduleOfferExpiry(stored);
        onProductsLoaded(stored.products, stored.pagination);
        onLoadingChange(false);
        onResolvedRequestKey(snapshotKey);
        return;
      }

      // Fetch from API
      onLoadingChange(true);
      try {
        const endpoint = buildSearchRoute(currentState).replace('/search', '/api/search');
        // Una respuesta puede cruzar el vencimiento mientras viaja. Releer una
        // sola vez; nunca filtrar una página parcial ni inventar su total.
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await fetch(endpoint, { signal: controller.signal });
          if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
          const data = await res.json() as SearchApiResponse;
          if (controller.signal.aborted) return;
          if (!hasValidPrices(data)) {
            if (attempt === 0) continue;
            throw new Error('Vencieron ofertas durante la consulta. Reintentá la búsqueda para obtener precios recientes.');
          }
          setCached(snapshotKey, data);
          scheduleOfferExpiry(data);
          onProductsLoaded(data.products, data.pagination);
          break;
        }
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') {
          const errorMessage = (error as Error).message || 'Error al buscar productos';
          onProductsLoaded([], {
            limit: 0,
            offset: 0,
            total: 0,
            totalPages: 0,
            page: currentState.page,
            pageSize,
          });
          onError?.(errorMessage);
        }
      } finally {
        if (!controller.signal.aborted) {
          onLoadingChange(false);
          onResolvedRequestKey(snapshotKey);
        }
      }
    };

    window.addEventListener('focus', recheckExpiredOffers);
    window.addEventListener('pageshow', recheckExpiredOffers);
    document.addEventListener('visibilitychange', recheckExpiredOffers);
    void loadProducts();
    return () => {
      controller.abort();
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      window.removeEventListener('focus', recheckExpiredOffers);
      window.removeEventListener('pageshow', recheckExpiredOffers);
      document.removeEventListener('visibilitychange', recheckExpiredOffers);
    };
  }, [
    currentState,
    hasSearchIntent,
    requestKey,
    pageSize,
    onLoadingChange,
    onResolvedRequestKey,
    onProductsLoaded,
    onError,
    getCached,
    setCached,
    checkStored,
  ]);
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

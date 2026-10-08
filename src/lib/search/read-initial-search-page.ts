import { hasSearchIntent, type SearchPageState } from './search-state';
import { readProductsPageFromDatabase } from '@/lib/persistence/product-read';
import { SEARCH_PAGE_SIZE, paginateProducts } from './search-pagination';
import type { SearchApiResponse } from './search-api';
import {
  buildSearchCacheKey,
  catalogPageResponse,
  emptySearchResponse,
  getCachedSearchResponse,
  hasCurrentSearchPagePrices,
  setCachedSearchResponse,
} from './search-handler-shared';
import { isStableRuntimeMode } from '@/lib/server/runtime-flags';
import { getStableFixtureProducts } from '@/lib/server/stable-search-fixtures';
import { filterCurrentCatalogProducts } from './search-availability';
import { createCoalescedRead } from '@/lib/server/coalesced-read';
import { logger } from '@/lib/logger';

export type InitialSearchPage = Pick<SearchApiResponse, 'products' | 'pagination'>;
const readPendingInitialSearchPage = createCoalescedRead<SearchApiResponse>();

export async function readInitialSearchPage(state: SearchPageState): Promise<InitialSearchPage> {
  if (!hasSearchIntent(state)) return emptySearchResponse();
  const storeIds = new Set(state.stores.map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (isStableRuntimeMode()) {
    const products = filterCurrentCatalogProducts(getStableFixtureProducts({ ...state, selectedStoreIds: storeIds }), state.includeUnavailable);
    const slice = paginateProducts(products, state.page, SEARCH_PAGE_SIZE);
    return catalogPageResponse({ products: slice.paginatedProducts, total: products.length,
      totalPages: slice.totalPages, page: slice.currentPage, pageSize: SEARCH_PAGE_SIZE });
  }
  const cacheKey = buildSearchCacheKey({ ...state, stores: storeIds });
  const stillCurrent = (payload: SearchApiResponse) => state.includeUnavailable || hasCurrentSearchPagePrices(payload.products);
  const read = async (): Promise<SearchApiResponse> => {
    // SSR reutiliza el mismo resultado público validado que la API, sin otra cuota/TTL.
    const cached = await getCachedSearchResponse(cacheKey, state.includeUnavailable).catch(() => {
      logger.warn('Initial catalog cache read skipped');
      return null;
    });
    if (cached && stillCurrent(cached)) return cached;

    // Un fallo SQL llega al error boundary; nunca se guarda un vacío sintético.
    const payload = catalogPageResponse(await readProductsPageFromDatabase({
      query: state.query, category: state.category, minPrice: state.minPrice, maxPrice: state.maxPrice,
      storeIds, sortBy: state.sortBy, page: state.page, pageSize: SEARCH_PAGE_SIZE,
      onlyCurrentOffers: !state.includeUnavailable,
    }));
    if (stillCurrent(payload)) {
      await setCachedSearchResponse(cacheKey, payload).catch(() => {
        logger.warn('Initial catalog cache write skipped');
      });
    }
    return payload;
  };

  // Cada consumidor revalida después de esperar: el mínimo pudo vencer durante
  // la lectura/escritura compartida. Releer la página, sin filtrarla tras paginar.
  for (let attempt = 0; attempt < 2; attempt++) {
    const payload = await readPendingInitialSearchPage(cacheKey, read);
    if (stillCurrent(payload)) return payload;
  }
  throw new Error('INITIAL_SEARCH_PAGE_NO_LONGER_CURRENT');
}

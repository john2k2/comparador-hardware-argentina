import type { SearchApiResponse } from './search-api';
import type { ProductPageResult } from '@/lib/persistence/product-read-types';
import { dedupeCpuSearchProducts } from './search-dedupe';
import { guardIdentityPage, type IdentityPageOptions } from './identity-page-guard';

export function dedupeSearchResponse(payload: SearchApiResponse, options: IdentityPageOptions = {}): SearchApiResponse {
  const products = dedupeCpuSearchProducts(payload.products, options);
  // El mínimo puede subir al invalidarse un dictamen de alias para el título
  // final. SQL ordenó las filas originales: se ordena de nuevo esta página.
  if (options.sortBy === 'price-asc' || options.sortBy === 'price-desc') {
    products.sort((a, b) => options.sortBy === 'price-asc' ? a.lowestPrice - b.lowestPrice : b.lowestPrice - a.lowestPrice);
  }
  // Sólo podemos recalcular el total si esta página contiene el conjunto entero.
  // En páginas parciales se conserva el conteo SQL; no inventamos cobertura global.
  const complete = payload.pagination.page === 1 && payload.pagination.total === payload.products.length
    && !payload.pagination.categoryExcludedOnPage && !payload.pagination.identityExcludedOnPage;
  return { ...payload, products, pagination: {
    ...payload.pagination, limit: products.length,
    ...(complete ? { total: products.length, totalPages: products.length ? 1 : 0 } : {}),
  } };
}

export function catalogPageResponse(result: ProductPageResult, options: IdentityPageOptions = {}): SearchApiResponse {
  const guarded = guardIdentityPage(result.products, options);
  const identityExcludedOnPage = (result.identityExcludedOnPage ?? 0) + guarded.identityExcludedOnPage;
  return dedupeSearchResponse({
    products: guarded.products,
    pagination: {
      limit: guarded.products.length, offset: (result.page - 1) * result.pageSize,
      total: result.total, totalPages: result.totalPages, page: result.page, pageSize: result.pageSize,
      ...(result.categoryExcludedOnPage ? { categoryExcludedOnPage: result.categoryExcludedOnPage } : {}),
      ...(identityExcludedOnPage ? { identityExcludedOnPage } : {}),
    },
    facets: { categories: [], brands: [], stores: [] },
  }, options);
}

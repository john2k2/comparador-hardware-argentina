import type { Product } from '@/lib/types';

export const SEARCH_PAGE_SIZE = 12;

export type PaginationResult = {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  paginatedProducts: Product[];
};

export function paginateProducts(
  products: Product[],
  requestedPage: number,
  itemsPerPage: number,
): PaginationResult {
  const safeItemsPerPage = Math.max(1, Math.trunc(itemsPerPage) || 1);
  const totalPages = Math.ceil(products.length / safeItemsPerPage);
  const currentPage = Math.max(1, Math.min(requestedPage, Math.max(totalPages, 1)));
  const start = (currentPage - 1) * safeItemsPerPage;
  const end = currentPage * safeItemsPerPage;

  return {
    currentPage,
    totalPages,
    itemsPerPage: safeItemsPerPage,
    paginatedProducts: products.slice(start, end),
  };
}

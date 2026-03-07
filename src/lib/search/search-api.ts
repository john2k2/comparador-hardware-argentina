import type { Product } from '@/lib/types';

export type SearchResponsePagination = {
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

export type SearchApiResponse = {
  products: Product[];
  pagination: SearchResponsePagination;
  facets: {
    categories: unknown[];
    brands: unknown[];
    stores: unknown[];
  };
};


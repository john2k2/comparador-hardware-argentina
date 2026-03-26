import type { HardwareCategory } from '@/lib/types';

export type ProductSort = 'relevance' | 'price-asc' | 'price-desc' | 'name' | 'newest';

export interface ReadProductsParams {
  query?: string;
  category?: HardwareCategory;
  minPrice?: number;
  maxPrice?: number;
  storeIds?: Set<string>;
  sortBy?: ProductSort;
  limit?: number;
}

export interface ReadProductsPageParams extends ReadProductsParams {
  page: number;
  pageSize: number;
}

export type ProductPageResult = {
  products: import('@/lib/types').Product[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

export interface DbProductPriceRow {
  store_id: string;
  url: string;
  price: number | string;
  original_price: number | string | null;
  stock: string | null;
  installment_count: number | null;
  installment_amount: number | string | null;
  last_updated: string | null;
}

export interface DbProductRow {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string | null;
  image: string | null;
  normalized_title: string | null;
  canonical_product_key: string | null;
  family_key: string | null;
  variant_key: string | null;
  refresh_priority: string | null;
  last_scraped_at: string | null;
  last_normalized_at: string | null;
  specs: Record<string, string> | null;
  lowest_price: number | string;
  highest_price: number | string;
  average_price: number | string;
  created_at: string;
  updated_at: string;
  product_prices?: DbProductPriceRow[] | null;
}

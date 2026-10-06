import type { Product } from '@/lib/types';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';

/** Apply before pagination in paths that do not use the catalog RPC. */
export function filterCurrentCatalogProducts(products: Product[], includeUnavailable = false): Product[] {
  return includeUnavailable ? products : products.filter((product) => getRecentProductOffers(product).length > 0);
}

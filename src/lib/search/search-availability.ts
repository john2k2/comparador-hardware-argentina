import type { Product } from '@/lib/types';
import { getRecentProductOffers } from '@/lib/product/product-page-metadata';

/** Un mínimo vencido puede invalidar filtros, orden y el total de la página. */
export function hasCurrentSearchPagePrices(products: Product[]): boolean {
  return products.every(product => {
    const offers = getRecentProductOffers(product);
    return offers.length > 0 && Math.min(...offers.map(offer => offer.price)) === product.lowestPrice;
  });
}

/** Apply before pagination in paths that do not use the catalog RPC. */
export function filterCurrentCatalogProducts(products: Product[], includeUnavailable = false): Product[] {
  return includeUnavailable ? products : products.filter((product) => getRecentProductOffers(product).length > 0);
}

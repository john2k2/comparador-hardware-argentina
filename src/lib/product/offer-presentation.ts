import { computeComparableStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import type { Product, ProductPrice } from '@/lib/types';

// Las referencias no participan del mínimo, del orden ni del descarte de
// outliers recientes. Conservamos las publicaciones y sus fechas reales.
export function buildOfferPresentation(product: Product, prices: ProductPrice[], now = Date.now()) {
  const candidates = prices.filter((price) => Boolean(price.url)
    && isComparableStoreOffer(price, product) && isCatalogOfferFresh(price.lastUpdated, now));
  // Todas ya son elegibles con el reloj recibido. Elegimos una por tienda
  // antes de usar stats, cuyo desempate general consulta el reloj del proceso.
  const stores = new Set<string>();
  const bestPerStore = candidates.sort((a, b) => a.price - b.price
    || new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()).filter((price) => {
    const store = price.storeId.toLowerCase();
    if (!store || stores.has(store)) return false;
    stores.add(store);
    return true;
  });
  const stats = computeComparableStorePriceStats(bestPerStore);
  const recentPrices = stats.comparablePrices;
  const recent = new Set(recentPrices);
  const sortablePrice = (price: ProductPrice) => Number.isFinite(price.price) && price.price > 0 ? price.price : Infinity;
  const referencePrices = prices.filter((price) => !recent.has(price))
    .sort((a, b) => sortablePrice(a) - sortablePrice(b));
  return { recentPrices, referencePrices, bestOffer: recentPrices[0], lowest: stats.lowest, highest: stats.highest };
}

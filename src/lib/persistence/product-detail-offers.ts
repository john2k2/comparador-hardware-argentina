import type { Product } from '@/lib/types';
import { buildProductIdentityKey } from '@/lib/product-identity';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { listingReference } from '@/lib/scrapers/listing-reference';

/** Lectura solamente: reunir publicaciones exactas sin renovar fechas ni reasignar IDs. */
export function mergeCanonicalDetailOffers(product: Product, candidates: Product[]): Product {
  if (!product.canonicalProductKey) return product;
  const prices = new Map<string, Product['prices'][number]>();
  for (const candidate of [product, ...candidates]) {
    if (candidate.category !== product.category || candidate.canonicalProductKey !== product.canonicalProductKey) continue;
    // Las claves antiguas RAM/GPU omitían variantes: exigir además su identidad actual.
    if (['memoria-ram','tarjetas-graficas'].includes(product.category)
      && buildProductIdentityKey(product.category,candidate.name) !== buildProductIdentityKey(product.category,product.name)) continue;
    if (hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:candidate.name})
      || hasExplicitIdentityConflict({name:candidate.name,category:product.category,offerText:product.name})) continue;
    for (const price of candidate.prices) {
      if (price.sourceIdentity?.title && hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:price.sourceIdentity.title})) continue;
      const key=listingReference(price.storeId,price.url) ?? `${price.storeId}:${price.url}`;
      const previous=prices.get(key);
      const observationTime=(value:Product['prices'][number])=>{
        const time=new Date(value.lastUpdated).getTime();
        return Number.isFinite(time) && time<=Date.now()+60000 ? time : 0;
      };
      if (!previous || observationTime(price)>observationTime(previous)) prices.set(key,price);
    }
  }
  const merged=[...prices.values()], stats=computeComparableStorePriceStats(merged);
  return {...product,prices:merged,lowestPrice:stats.lowest,highestPrice:stats.highest,averagePrice:stats.average};
}

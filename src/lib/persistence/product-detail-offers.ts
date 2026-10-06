import type { Product } from '@/lib/types';
import { normalizeIdentityText } from '@/lib/product-identity';
import { proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { computeComparableStorePriceStats } from '@/lib/price-utils';
import { listingReference } from '@/lib/scrapers/listing-reference';

type ProductVariant=Pick<Product,'name'|'category'|'canonicalProductKey'>;
export function shareExactProductVariant(product:ProductVariant,candidate:ProductVariant):boolean {
  if(candidate.category!==product.category||candidate.canonicalProductKey!==product.canonicalProductKey) return false;
  if(hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:candidate.name})
    ||hasExplicitIdentityConflict({name:candidate.name,category:product.category,offerText:product.name})) return false;
  if(normalizeIdentityText(product.name)===normalizeIdentityText(candidate.name)) return true;
  if(['procesadores','memoria-ram','tarjetas-graficas'].includes(product.category)) {
    return proveOfferAttributes(product.name,product.category,candidate.name)!==null;
  }
  // Una clave heredada puede reducir WD Green y Sandisk Plus a "1TB", o
  // descartar blanco/negro y una edición M75. Para categorías sin prueba de
  // atributos no basta repetir esa misma clave: exigir los tokens completos.
  const tokens = (name:string) => [...new Set(normalizeIdentityText(name).split(' '))].sort().join(' ');
  return tokens(candidate.name) === tokens(product.name);
}

/** Lectura solamente: reunir publicaciones exactas sin renovar fechas ni reasignar IDs. */
export function mergeCanonicalDetailOffers(product: Product, candidates: Product[]): Product {
  if (!product.canonicalProductKey) return product;
  const prices = new Map<string, Product['prices'][number]>();
  for (const candidate of [product, ...candidates]) {
    if (!shareExactProductVariant(product,candidate)) continue;
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

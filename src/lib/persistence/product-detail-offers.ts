import type { Product } from '@/lib/types';
import { normalizeIdentityText } from '@/lib/product-identity';
import { proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { hasExplicitIdentityConflict, needsIdentityReview } from '@/lib/quality/offer-identity';
import { computeComparableStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { captureRamSpecs, hasRamSubjectConflict, planRamEnrichment } from '@/lib/quality/ram-enrichment';

type ProductVariant=Pick<Product,'name'|'category'|'canonicalProductKey'> & Partial<Pick<Product,'specs'>>;

/** Una redirección no puede volver pendiente una oferta válida de la tarjeta.
 * Los dictámenes conservan su título original incluso si el chip es el mismo. */
export function canRedirectToCanonicalProduct(product: ProductVariant & Pick<Product,'prices'>, candidate: ProductVariant): boolean {
  if (product.prices.some(offer => offer.identityReview?.proof?.method === 'manufacturer-ram'
    && needsIdentityReview(offer, product))) return false;
  return shareExactProductVariant(product, candidate)
    && product.prices.filter(offer => isComparableStoreOffer(offer, product))
      .every(offer => isComparableStoreOffer(offer, candidate));
}
export function shareExactProductVariant(product:ProductVariant,candidate:ProductVariant):boolean {
  if(candidate.category!==product.category||candidate.canonicalProductKey!==product.canonicalProductKey) return false;
  if(hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:candidate.name})
    ||hasExplicitIdentityConflict({name:candidate.name,category:product.category,offerText:product.name})) return false;
  if (product.category === 'memoria-ram') {
    if (hasRamSubjectConflict({ title: product.name, specs: product.specs },
      { title: candidate.name, specs: candidate.specs })) return false;
    const first = captureRamSpecs(product.specs), second = captureRamSpecs(candidate.specs);
    if (!first || !second) return false;
    const sku = (specs: Record<string, string | number>) => Object.entries(specs)
      .find(([key]) => normalizeIdentityText(key) === 'sku')?.[1];
    const firstSku = sku(first), secondSku = sku(second);
    if (firstSku !== undefined && secondSku !== undefined && firstSku !== secondSku) return false;
    if (typeof firstSku === 'string' && firstSku === secondSku) {
      const enriched = planRamEnrichment({ manufacturerMpn: firstSku,
        target: { title: product.name, sku: firstSku, specs: first },
        source: { title: candidate.name, sku: firstSku, specs: second } });
      if (enriched.ok) return true;
      if (enriched.reason !== 'unknown-mpn') return false;
    }
    // Un título idéntico e incompleto y una clave heredada no prueban un kit.
    return proveOfferAttributes(product.name, product.category, candidate.name) !== null;
  }
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
    if (candidate !== product && !shareExactProductVariant(product,candidate)) continue;
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
  const merged=[...prices.values()], stats=computeComparableStorePriceStats(merged, product);
  return {...product,prices:merged,lowestPrice:stats.lowest,highestPrice:stats.highest,averagePrice:stats.average};
}

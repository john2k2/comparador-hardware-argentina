import type { Product } from '@/lib/types';
import type { ProductSort } from '@/lib/persistence/product-read-types';
import { computeCurrentStorePriceStats } from '@/lib/price-utils';
import { buildIdentityEvidence, hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';

export type IdentityPageOptions = { minPrice?: number; maxPrice?: number; sortBy?: ProductSort };

/** Corrige resúmenes antiguos sólo ante una contradicción explícita de identidad.
 * Conserva las observaciones originales y el conteo SQL del llamador.
 */
export function guardIdentityPage(products: Product[], options: IdentityPageOptions = {}) {
  let identityExcludedOnPage = 0;
  let changed = false;
  const guarded: Product[] = [];
  for (const product of products) {
    const conflict = product.prices.some(offer => {
      const evidence = buildIdentityEvidence(product.name, product.category, offer.url,
        offer.sourceIdentity?.title ?? offer.identityReview?.sourceIdentity?.title);
      return evidence !== null && hasExplicitIdentityConflict(evidence);
    });
    if (!conflict) { guarded.push(product); continue; }
    changed = true;
    const stats = computeCurrentStorePriceStats(product.prices, product);
    if (!stats.comparablePrices.length
      || (options.minPrice !== undefined && stats.lowest < options.minPrice)
      || (options.maxPrice !== undefined && stats.lowest > options.maxPrice)) {
      identityExcludedOnPage++;
      continue;
    }
    guarded.push({ ...product, lowestPrice: stats.lowest, highestPrice: stats.highest, averagePrice: stats.average });
  }
  // La paginación ya ocurrió en SQL: este orden sólo describe la página recibida.
  if (changed && (options.sortBy === 'price-asc' || options.sortBy === 'price-desc')) {
    guarded.sort((a, b) => options.sortBy === 'price-asc' ? a.lowestPrice - b.lowestPrice : b.lowestPrice - a.lowestPrice);
  }
  return { products: changed ? guarded : products, identityExcludedOnPage };
}

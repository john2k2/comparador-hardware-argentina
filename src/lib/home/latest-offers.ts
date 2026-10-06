import type { Product } from '@/lib/types';
import { inferHardwareCategoryFromName } from '@/lib/catalog/hardware-categories';
import { isOfferFresh } from '@/lib/price-freshness';
import { computeComparableStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';

export const LATEST_OFFERS_LIMIT = 4;

/** Agrupación de presentación; no cambia la identidad ni las variantes del catálogo. */
function displayFamily(product: Product): string {
  if (product.familyKey) return `${product.category}:${product.familyKey}`;
  if (product.category === 'memoria-ram') {
    const name = product.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(?:\d+\s*x\s*)?\d+\s*gb\b/g, '')
      .replace(/\b\d+\s*(?:mhz|mt\/s)\b|\bcl\s*\d+\b/g, '')
      .replace(/\s+/g, ' ').trim();
    return `${product.category}:${name}`;
  }
  return `${product.category}:${product.canonicalProductKey || product.id}`;
}

/** Diversifica categorías/familias sin rellenar con precios no aptos o antiguos. */
export function pickLatestOfferProducts(products: Product[], limit = LATEST_OFFERS_LIMIT, now = Date.now()): Product[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const candidates = products.flatMap((product) => {
    // La portada no promueve altas de inventario con categoría desconocida o contradictoria.
    if (inferHardwareCategoryFromName(product.name) !== product.category) return [];
    const prices = product.prices.filter((offer) => Boolean(offer.storeId && offer.url)
      && isComparableStoreOffer(offer, product) && isOfferFresh(offer.lastUpdated, now));
    if (prices.length === 0) return [];

    const stats = computeComparableStorePriceStats(prices);
    if (stats.comparablePrices.length === 0) return [];
    return [{
      observedAt: Math.max(...stats.comparablePrices.map((offer) => new Date(offer.lastUpdated).getTime())),
      product: {
        ...product,
        prices,
        lowestPrice: stats.lowest,
        highestPrice: stats.highest,
        averagePrice: stats.average,
      },
    }];
  })
    .sort((a, b) => b.observedAt - a.observedAt
      || a.product.lowestPrice - b.product.lowestPrice || a.product.id.localeCompare(b.product.id));

  const selected: typeof candidates = [];
  const families = new Set<string>();
  const categories = new Set<string>();
  const ids = new Set<string>();
  const add = (candidate: typeof candidates[number]) => {
    selected.push(candidate);
    families.add(displayFamily(candidate.product));
    categories.add(candidate.product.category);
    ids.add(candidate.product.id);
  };
  for (const candidate of candidates) {
    if (selected.length === limit) break;
    if (!ids.has(candidate.product.id) && !families.has(displayFamily(candidate.product)) && !categories.has(candidate.product.category)) add(candidate);
  }
  for (const candidate of candidates) {
    if (selected.length === limit) break;
    if (!ids.has(candidate.product.id) && !families.has(displayFamily(candidate.product))) add(candidate);
  }
  // Dentro de la selección variada se conserva el orden por observación real.
  const selectedEntries = new Set(selected);
  return candidates.filter((candidate) => selectedEntries.has(candidate)).map(({ product }) => product);
}

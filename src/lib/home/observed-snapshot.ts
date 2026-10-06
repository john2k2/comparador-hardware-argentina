import type { Product } from '@/lib/types';
import { hydrateProducts } from '@/lib/product-serialization';
import { pickLatestOfferProducts } from './latest-offers';
import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { computeComparableStorePriceStats, isComparableStoreOffer } from '@/lib/price-utils';

export const PUBLIC_HOME_SCOPE = 'measurement-dashboard-v1';
export const PUBLIC_HOME_KEY = `${PUBLIC_HOME_SCOPE}:public-home`;
export interface ObservedHomeSnapshot {
  collectedAt: string;
  latestOfferProducts: Product[];
  priceDropProducts: Product[];
  priceDropFallbackUsed: boolean;
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function products(value: unknown): Product[] | null {
  if (!Array.isArray(value) || value.length > 12 || value.some((item) => !record(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.category !== 'string' || !Array.isArray(item.prices) || item.prices.length > 60 || item.prices.some((price) => !record(price) || typeof price.storeId !== 'string' || typeof price.storeName !== 'string' || typeof price.url !== 'string' || typeof price.price !== 'number'))) return null;
  return hydrateProducts((value as Product[]).map((product) => ({
    id: product.id, name: product.name, category: product.category,
    brand: typeof product.brand === 'string' ? product.brand : '', model: typeof product.model === 'string' ? product.model : '',
    image: typeof product.image === 'string' ? product.image : undefined,
    canonicalProductKey: product.canonicalProductKey, familyKey: product.familyKey, variantKey: product.variantKey,
    specs: record(product.specs) ? Object.fromEntries(Object.entries(product.specs).filter(([, entry]) => typeof entry === 'string')) : {},
    createdAt: product.createdAt, updatedAt: product.updatedAt,
    lowestPrice: product.lowestPrice, highestPrice: product.highestPrice, averagePrice: product.averagePrice,
    prices: product.prices.map((price) => ({ storeId: price.storeId, storeName: price.storeName, url: price.url, price: price.price,
      originalPrice: price.originalPrice, stock: price.stock, installment: price.installment, lastUpdated: price.lastUpdated,
      identityReview: price.identityReview, sourceIdentity: price.sourceIdentity, priceCondition: price.priceCondition })),
  })));
}

// Mantener las reglas auditadas al leer el corte: no renovar lastUpdated,
// no rellenar con ofertas vencidas ni presentar fallback como una baja real.
export function decodeObservedHome(value: unknown, now = Date.now()): ObservedHomeSnapshot | null {
  if (!record(value) || value.kind !== 'public-home' || !record(value.data)) return null;
  const data = value.data;
  const collectedAt = typeof data.collectedAt === 'string' ? Date.parse(data.collectedAt) : NaN;
  if (!Number.isFinite(collectedAt) || collectedAt > now + 60_000 || now - collectedAt > 75 * 60_000 || typeof data.priceDropFallbackUsed !== 'boolean') return null;
  const latest = products(data.latestOfferProducts), drops = products(data.priceDropProducts);
  if (!latest || !drops) return null;
  const latestOfferProducts = pickLatestOfferProducts(latest, 4, now);
  const latestIds = new Set(latestOfferProducts.map((product) => product.id));
  const priceDropProducts = data.priceDropFallbackUsed ? [] : drops.flatMap((product) => {
    if (latestIds.has(product.id)) return [];
    const prices = product.prices.filter((price) => isComparableStoreOffer(price, product) && isCatalogOfferFresh(price.lastUpdated, now));
    const stats = computeComparableStorePriceStats(prices);
    if (!stats.comparablePrices.length) return [];
    latestIds.add(product.id);
    return [{ ...product, prices, lowestPrice: stats.lowest, highestPrice: stats.highest, averagePrice: stats.average }];
  }).slice(0, 4);
  return { collectedAt: new Date(collectedAt).toISOString(), latestOfferProducts, priceDropProducts, priceDropFallbackUsed: data.priceDropFallbackUsed };
}

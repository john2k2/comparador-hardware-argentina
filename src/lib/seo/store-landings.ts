import type { Metadata } from 'next';
import type { Product } from '@/lib/types';
import { getComparableStorePrices } from '@/lib/price-utils';
import { buildIdentityEvidence, hasExplicitIdentityConflict, needsIdentityReview } from '@/lib/quality/offer-identity';
import { buildPublicPageMetadata } from './metadata';

export const STORE_LANDINGS = [
  { id: 'maximus', name: 'Maximus', website: 'https://www.maximus.com.ar' },
  { id: 'venex', name: 'Venex', website: 'https://www.venex.com.ar' },
  { id: 'mexx', name: 'Mexx', website: 'https://www.mexx.com.ar' },
] as const;

export function getStoreLanding(slug: string) {
  return STORE_LANDINGS.find((store) => store.id === slug) ?? null;
}

export function buildStoreLandingPath(storeId: string): string {
  return getStoreLanding(storeId) ? `/tiendas/${storeId}` : `/search?stores=${encodeURIComponent(storeId)}`;
}

export type StoreCatalogSnapshot = {
  products: Product[];
  freshProducts: number;
  indexable: boolean;
  unavailable: boolean;
};

/** Solo ofertas de la tienda elegida; una fecha de producto no renueva una oferta. */
export function buildStoreCatalogSnapshot(products: Product[], storeId: string, now = Date.now()): StoreCatalogSnapshot {
  if (!getStoreLanding(storeId)) return { products: [], freshProducts: 0, indexable: false, unavailable: true };
  const seen = new Set<string>();
  const candidates: Product[] = [];
  for (const product of products) {
    const prices = getComparableStorePrices(product.prices.filter((offer) => {
      if (offer.storeId !== storeId || !['in-stock', 'low-stock'].includes(offer.stock) || needsIdentityReview(offer, product)) return false;
      try { const url = new URL(offer.url); if (url.protocol !== 'https:' || url.username || url.password) return false; } catch { return false; }
      const evidence = buildIdentityEvidence(product.name, product.category, offer.url);
      return !evidence || !hasExplicitIdentityConflict(evidence);
    }));
    if (!prices.length) continue;
    const key = product.canonicalProductKey || product.id;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...product, prices, lowestPrice: prices[0].price, highestPrice: prices[prices.length - 1].price,
      averagePrice: prices.reduce((sum, price) => sum + price.price, 0) / prices.length,
      lastScrapedAt: new Date(prices[0].lastUpdated) });
  }
  const dated = (product: Product) => new Date(product.prices[0].lastUpdated).getTime();
  candidates.sort((a, b) => (dated(b) || 0) - (dated(a) || 0));
  const selected = candidates.slice(0, 24);
  const freshProducts = selected.filter((product) => {
    const timestamp = dated(product);
    return timestamp > 0 && timestamp <= now && now - timestamp <= 72 * 60 * 60 * 1000;
  }).length;
  return { products: selected, freshProducts, indexable: selected.length >= 6 && freshProducts >= 3, unavailable: false };
}

export function buildStoreMetadata(slug: string, indexable: boolean): Metadata {
  const store = getStoreLanding(slug);
  if (!store) return { title: 'Tienda no encontrada', robots: { index: false, follow: false } };
  return {
    ...buildPublicPageMetadata({ path: `/tiendas/${store.id}`, title: `${store.name}: precios de hardware y componentes`,
      description: `Compará ofertas registradas de ${store.name}, revisá la fecha de cada precio y consultá alternativas antes de armar tu PC. Compra directa en la tienda.` }),
    robots: { index: indexable, follow: true },
  };
}

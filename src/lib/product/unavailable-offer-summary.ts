import { isCatalogOfferFresh } from '@/lib/price-freshness';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import type { Product, ProductPrice } from '@/lib/types';

/** Explains missing comparable prices without inferring stock from age. */
export function describeUnavailableOffers(product: Product, offers: ProductPrice[], nowMs = Date.now()) {
  const priced = offers.filter((offer) => Number.isFinite(offer.price) && offer.price > 0);
  if (!priced.length) return {
    heading: 'SIN OFERTAS PARA COMPARAR',
    reasons: ['No tenemos publicaciones con un precio utilizable para esta ficha. Esto no confirma que el producto esté agotado.'],
    latestObservedAt: null,
  };

  const observedDates = priced.map((offer) => new Date(offer.lastUpdated).getTime())
    .filter((time) => Number.isFinite(time) && time > 0 && time <= nowMs + 60_000);
  const latestObservedAt = observedDates.length ? new Date(Math.max(...observedDates)) : null;
  const hasRecentPrice = priced.some((offer) => isCatalogOfferFresh(offer.lastUpdated, nowMs));
  const pendingIdentity = priced.some((offer) => needsIdentityReview(offer, product));
  const reasons: string[] = [];
  if (!hasRecentPrice) {
    reasons.push(latestObservedAt
      ? 'Los precios guardados tienen más de 24 horas. Los importes de abajo son referencias anteriores: verificá precio y stock en la tienda antes de comprar.'
      : 'Las publicaciones no tienen una fecha de precio válida. No podemos confirmar que sus importes sean recientes.');
  }
  if (pendingIdentity) reasons.push('Hay publicaciones cuya variante todavía no está confirmada para esta ficha. Sus precios quedan fuera de la comparación.');
  if (!reasons.length) reasons.push('No tenemos una oferta con precio, disponibilidad y enlace válidos para comparar. Esto no confirma que el producto esté agotado.');
  return {
    heading: !hasRecentPrice && latestObservedAt ? 'PRECIOS PENDIENTES DE ACTUALIZAR' : 'SIN OFERTAS APTAS PARA COMPARAR',
    reasons,
    latestObservedAt,
  };
}

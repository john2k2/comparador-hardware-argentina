import type { Product, ProductPrice } from '@/lib/types';
import { buildOfferPresentation } from './offer-presentation';

// La entrada pertenece a una observación concreta: no se transfiere a otro
// precio, publicación o fecha cuando se actualiza la ficha.
export function finalCostOfferKey(offer: ProductPrice): string {
  return JSON.stringify([offer.storeId.toLowerCase(), offer.url, offer.price,
    new Date(offer.lastUpdated).toISOString(), offer.priceCondition ?? 'unspecified']);
}

export function parseShippingCents(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function compareFinalCosts(product: Product, prices: ProductPrice[], shipping: Record<string, string>, now?: number) {
  const rows = buildOfferPresentation(product, prices, now).recentPrices.map(offer => {
    const key = finalCostOfferKey(offer);
    const input = shipping[key] ?? '';
    const shippingCents = parseShippingCents(input);
    const priceCents = Math.round(offer.price * 100);
    const sum = shippingCents === null ? null : priceCents + shippingCents;
    const totalCents = sum !== null && Number.isSafeInteger(sum) && sum > 0 ? sum : null;
    return { key, offer, input, totalCents, invalid: input.trim() !== '' && totalCents === null };
  });
  const completed = rows.filter(row => row.totalCents !== null)
    .sort((a, b) => a.totalCents! - b.totalCents!);
  const minimum = completed.length >= 2 ? completed[0].totalCents : null;
  const winners = minimum === null ? [] : completed.filter(row => row.totalCents === minimum);
  return { rows, completed, winners, pending: rows.length - completed.length };
}

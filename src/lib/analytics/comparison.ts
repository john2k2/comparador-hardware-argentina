import { trackEvent } from './ga4';
import { firstEventInNavigation } from './navigation-events';
import { COMPARABLE_CATEGORIES, COMPARISON_USE_CASES, compareProducts, type ComparisonUseCase } from '@/lib/comparison/dynamic-comparison';
import { getComparableStorePrices, isComparableStoreOffer } from '@/lib/price-utils';
import { isOfferFresh } from '@/lib/price-freshness';
import type { Product } from '@/lib/types';

type ComparisonContext = { left: Product | null; right: Product | null; useCase: ComparisonUseCase };
export type ComparisonProductSide = 'a' | 'b';

function canMeasure(): boolean {
  if (typeof window === 'undefined' || window.__chaAnalyticsAllowed !== true || typeof window.gtag !== 'function') return false;
  return /^G-[A-Z0-9]+$/.test(window.__chaAnalyticsMeasurementId ?? process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? '');
}

function resolvedPair(context: ComparisonContext): context is ComparisonContext & { left: Product; right: Product } {
  return Boolean(context.left && context.right
    && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(context.left.id)
    && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(context.right.id)
    && context.left.id !== context.right.id
    && context.left.category === context.right.category
    && COMPARABLE_CATEGORIES.some(entry => entry.id === context.left?.category)
    && COMPARISON_USE_CASES.some(entry => entry.id === context.useCase));
}

function pairKey(context: ComparisonContext & { left: Product; right: Product }): string {
  return JSON.stringify([context.left.category, context.useCase, context.left.id, context.right.id]);
}

/** GA4 admite hasta 100 caracteres: omitir el campo conserva la identidad completa en la deduplicación local. */
function identifierParam(key: 'left_product_id' | 'right_product_id' | 'product_id', id: string): Record<string, string> {
  return id.length <= 100 ? { [key]: id } : {};
}

function eligibleStoreCount(product: Product, now: number): number {
  return getComparableStorePrices(product.prices.filter(offer =>
    isComparableStoreOffer(offer, product) && isOfferFresh(offer.lastUpdated, now)), product).length;
}

/** Comparación resuelta, aunque falte evidencia para recomendar por precio. No acredita una compra. */
export function trackComparisonResult(context: ComparisonContext, now = Date.now()): void {
  if (!canMeasure() || !resolvedPair(context) || !Number.isFinite(now) || now <= 0) return;
  if (!firstEventInNavigation(`comparison_result:${pairKey(context)}`)) return;
  const comparison = compareProducts(context.left, context.right, context.useCase, now);
  trackEvent('comparison_result', {
    product_category: context.left.category,
    comparison_use_case: context.useCase,
    ...identifierParam('left_product_id', context.left.id),
    ...identifierParam('right_product_id', context.right.id),
    left_eligible_offers_3h: eligibleStoreCount(context.left, now),
    right_eligible_offers_3h: eligibleStoreCount(context.right, now),
    comparison_price_gate_3h: comparison.leftPrice !== null && comparison.rightPrice !== null
      && comparison.leftPriceFresh && comparison.rightPriceFresh,
  });
}

/** Apertura explícita de una ficha desde A/B; no se llama desde prefetch ni se recuperan clics anteriores al consentimiento. */
export function trackComparisonProductOpen(context: ComparisonContext, side: ComparisonProductSide): void {
  if (!canMeasure() || !resolvedPair(context) || (side !== 'a' && side !== 'b')) return;
  if (!firstEventInNavigation(`comparison_product_open:${pairKey(context)}:${side}`)) return;
  trackEvent('comparison_product_open', {
    product_category: context.left.category,
    comparison_use_case: context.useCase,
    ...identifierParam('left_product_id', context.left.id),
    ...identifierParam('right_product_id', context.right.id),
    ...identifierParam('product_id', side === 'a' ? context.left.id : context.right.id),
    comparison_side: side,
  });
}

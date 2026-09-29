import { isOfferFresh } from '@/lib/price-freshness';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { resolveGuideComponent, resolveGuideRefreshOffers } from '@/lib/seo/budget-guide-pricing';
import type { BudgetGuideDefinition } from '@/lib/seo/budget-guides-data';
import type { Product } from '@/lib/types';
import { parseRefreshTargets, type RefreshItemResult, type RefreshTarget } from './on-demand/contracts';

export const PRIORITY_RECHECK_MS = 90 * 60_000;
export const PRIORITY_MAX_GUIDE_OFFERS = 42;
export const PRIORITY_MAX_SAMPLE_OFFERS = 80;
export type PriorityGroup = { key: string; targets: RefreshTarget[]; covered: boolean };
export const targetKey = (target: RefreshTarget) => JSON.stringify([target.productId, target.storeId, target.url]);

/** El plan usa las mismas variantes y ofertas que la guía, sin alterar su elegibilidad. */
export function planGuideGroups(guide: BudgetGuideDefinition, products: Product[], now = Date.now()): PriorityGroup[] {
  return Object.entries(guide.components).map(([slot, spec]) => {
    const current = resolveGuideComponent(spec, products);
    const covered = current.offers.some(offer => {
      const observed = Date.parse(offer.lastUpdated ?? '');
      return Number.isFinite(observed) && observed <= now && now - observed < PRIORITY_RECHECK_MS;
    });
    const references = resolveGuideRefreshOffers(spec, products, now);
    // Una respuesta agotada reciente no desplaza una alternativa previamente disponible.
    references.sort((a, b) => {
      const available = (ref: typeof a) => products.find(p => p.id === ref.productId)?.prices
        .some(p => p.storeId === ref.storeId && p.url === ref.url && ['in-stock', 'low-stock'].includes(p.stock));
      return Number(Boolean(available(b))) - Number(Boolean(available(a))) || a.price - b.price;
    });
    return { key: `${guide.slug}/${slot}`, covered,
      targets: references.map(({ productId, storeId, url }) => ({ productId, storeId, url })) };
  });
}

export function nextPriorityTargets(groups: PriorityGroup[], attempted: Set<string>, results: RefreshItemResult[]): RefreshTarget[] {
  const selected = new Map<string, RefreshTarget>();
  for (const group of groups) {
    if (group.covered || results.some(result => result.comparable === true && result.state === 'updated'
      && isOfferFresh(result.observedAt) && group.targets.some(target => targetKey(target) === targetKey(result)))) continue;
    const next = group.targets.find(target => !attempted.has(targetKey(target)));
    if (next && parseRefreshTargets([next])) selected.set(targetKey(next), next);
  }
  return [...selected.values()];
}

export function planSampleTargets(products: Product[], now = Date.now()): RefreshTarget[] {
  const targets = products.flatMap(product => product.prices.filter(price => {
    const observed = new Date(price.lastUpdated).getTime();
    return !Number.isFinite(observed) || observed > now || now - observed >= PRIORITY_RECHECK_MS || needsIdentityReview(price, product);
  }).map(price => ({ productId: product.id, storeId: price.storeId, url: price.url })))
    .filter(target => parseRefreshTargets([target]));
  return [...new Map(targets.map(target => [targetKey(target), target])).values()];
}

import type { RefreshTarget } from '@/lib/catalog/on-demand/contracts';
import { isOfferFresh } from '@/lib/price-freshness';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import type { Product } from '@/lib/types';

export function buildProductRefreshTargets(product: Product): RefreshTarget[] {
  if (!/^[\w.-]{1,240}$/.test(product.id)) return [];
  const seen = new Set<string>();
  return [...product.prices]
    .filter((price) => !isOfferFresh(price.lastUpdated) || needsIdentityReview(price, product))
    .sort((left, right) => new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime())
    .flatMap((price) => {
      if (!/^[a-z0-9-]{1,80}$/.test(price.storeId) || price.url.length > 2048) return [];
      try {
        const url = new URL(price.url);
        if (url.protocol !== 'https:' || url.username || url.password) return [];
      } catch { return []; }
      const key = `${price.storeId}|${price.url}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ productId: product.id, storeId: price.storeId, url: price.url }];
    })
    .slice(0, 8);
}

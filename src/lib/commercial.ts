import type { Store } from './types';

export type OutboundLinkType = 'organic' | 'sponsored';

export function parseSponsoredStoreIds(value: string | null | undefined): string[] {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function getSponsoredStoreIds(envValue = process.env.NEXT_PUBLIC_SPONSORED_STORE_IDS): string[] {
  return parseSponsoredStoreIds(envValue);
}

export function isSponsoredStore(storeId: string, sponsoredStoreIds = getSponsoredStoreIds()): boolean {
  return sponsoredStoreIds.includes(storeId.trim().toLowerCase());
}

export function getOutboundStoreLinkType(storeId: string, sponsoredStoreIds = getSponsoredStoreIds()): OutboundLinkType {
  return isSponsoredStore(storeId, sponsoredStoreIds) ? 'sponsored' : 'organic';
}

export function getOutboundStoreRel(linkType: OutboundLinkType): string {
  return linkType === 'sponsored' ? 'sponsored noopener noreferrer' : 'noopener noreferrer';
}

export function resolveSponsoredStores(
  stores: Store[],
  sponsoredStoreIds = getSponsoredStoreIds(),
): Store[] {
  const sponsoredIds = new Set(sponsoredStoreIds);
  return stores.filter((store) => sponsoredIds.has(store.id.toLowerCase()));
}

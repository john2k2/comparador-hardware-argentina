import { parseStoreListingUrl } from './source-contracts';
import type { OfferSourceIdentity } from '@/lib/types';

/** Una identidad capturada nunca puede contradecir la publicación observada. */
export function sourceIdentityMatchesListing(storeId: string, url: string, source: OfferSourceIdentity): boolean {
  const reference = listingReference(storeId, url);
  return reference !== null && reference === source.listingRef
    && (source.sourceId === undefined || !reference.startsWith(`${storeId}:id:`)
      || source.sourceId === reference.slice(`${storeId}:id:`.length));
}

/** Los IDs de tienda nunca se usan como MPN/GTIN ni para unir fabricantes. */
export function listingReference(storeId: string, rawUrl: string): string | null {
  try {
    const url = parseStoreListingUrl(storeId, rawUrl);
    if (!url) return null;
    const host = url.hostname.replace(/^www\./, '');
    if (storeId === 'compragamer' && host !== 'compragamer.com') return null;
    if (storeId === 'maximus' && host !== 'maximus.com.ar') return null;
    if (storeId === 'xtpc') {
      if (host !== 'xt-pc.com.ar') return null;
      const id = url.pathname.match(/^\/prod\/(\d+)\/[^/]+\/?$/i)?.[1];
      return id && !url.search ? `${storeId}:id:${id}` : null;
    }
    if (storeId === 'compragamer') {
      if (url.search) return null;
      const id = url.pathname.match(/^\/producto\/(?:[^/]*_)?(\d+)\/?$/)?.[1];
      return id ? `${storeId}:id:${id}` : null;
    }
    if (storeId === 'maximus') {
      if ([...url.searchParams.keys()].some(key => key !== 'PN')) return null;
      const id = url.pathname.match(/\/ITEM=(\d+)\/maximus\.aspx$/i)?.[1];
      return id ? `${storeId}:id:${id}` : null;
    }
    url.hostname = host;
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
    return `${storeId}:url:${url.href}`;
  } catch { return null; }
}
export function sameListing(storeId: string, first: string, second: string): boolean {
  const a = listingReference(storeId, first), b = listingReference(storeId, second);
  return a !== null && a === b;
}

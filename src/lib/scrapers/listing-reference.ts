/** Los IDs de tienda nunca se usan como MPN/GTIN ni para unir fabricantes. */
export function listingReference(storeId: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    if (storeId === 'compragamer' && host !== 'compragamer.com') return null;
    if (storeId === 'maximus' && host !== 'maximus.com.ar') return null;
    if (storeId === 'compragamer') {
      const id = url.pathname.match(/^\/producto\/(?:[^/]*_)?(\d+)\/?$/)?.[1];
      return id ? `${storeId}:id:${id}` : null;
    }
    if (storeId === 'maximus') {
      const id = url.pathname.match(/\/ITEM=(\d+)\/maximus\.aspx$/i)?.[1];
      return id ? `${storeId}:id:${id}` : null;
    }
    url.hash = '';
    url.hostname = host;
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
    return `${storeId}:url:${url.href}`;
  } catch { return null; }
}
export function sameListing(storeId: string, first: string, second: string): boolean {
  const a = listingReference(storeId, first), b = listingReference(storeId, second);
  return a !== null && a === b;
}

import { stores } from './static-data';

/** Descubrir un permalink no autoriza a publicar el precio de una API. */
export const WOO_PUBLIC_STORE_IDS = [
  'acuarioinsumos', 'beings', 'gamerspoint', 'katech', 'dinobyte', 'liontech',
  'maxtecno', 'scphardstore', 'thegamershop', 'hardcore', 'goldentechstore',
] as const;
export const WOO_SHARED_PRICE_STORE_IDS = ['maxtecno', 'dinobyte', 'goldentechstore'] as const;
export const SHARED_PRICE_STORE_IDS = ['compragamer', ...WOO_SHARED_PRICE_STORE_IDS] as const;

const byId = new Map(stores.map(store => [store.id, store]));
const wooIds = new Set<string>(WOO_PUBLIC_STORE_IDS);

export function sourceContract(storeId: string) {
  const store = byId.get(storeId);
  if (!store) return null;
  return {
    storeId, baseUrl: store.url, host: new URL(store.url).hostname.replace(/^www\./, ''),
    publicProductsApi: wooIds.has(storeId) ? new URL('/wp-json/wc/store/v1/products', store.url).href : null,
    // Sólo el piloto contrastado puede usar precios de lecturas compartidas.
    priceSource: (SHARED_PRICE_STORE_IDS as readonly string[]).includes(storeId) ? 'shared-verified' : 'visible-detail',
  };
}

export function isTrackingParameter(key: string): boolean {
  return /^utm_/i.test(key) || /^(?:fbclid|gclid|dclid|msclkid)$/i.test(key);
}

/** Hosts registrados, HTTPS y rutas de publicaciones; nunca enlaces de sesión. */
export function parseStoreListingUrl(storeId: string, rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const contract = sourceContract(storeId);
    if (contract && url.hostname.replace(/^www\./, '') !== contract.host) return null;
    if (contract && (url.pathname === '/' || /(?:^|\/)(?:cart|checkout|carrito|mi-cuenta|wp-admin|wp-json|categoria|category|product-category|search)(?:\/|$)/i.test(url.pathname))) return null;
    if ([...url.searchParams.keys()].some(key => /^(?:token|session|access_token|api_key|apikey|password|auth)$/i.test(key))) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (isTrackingParameter(key)) url.searchParams.delete(key);
    return url;
  } catch { return null; }
}

import { parseStoreListingUrl, sourceContract } from './source-contracts';
import { sourceFetch } from './source-http';
import { load } from 'cheerio';

export type PublicListing = { storeId: string; sourceId: string; url: string; title: string; storeSku?: string };

/** El ID pertenece a una tienda; no es un identificador universal del fabricante. */
export function parseWooPublicListings(storeId: string, data: unknown): PublicListing[] {
  if (!sourceContract(storeId)?.publicProductsApi || !Array.isArray(data) || data.length > 100) return [];
  const result: PublicListing[] = [], ids = new Set<string>(), urls = new Set<string>();
  for (const value of data) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    if (!Number.isSafeInteger(item.id) || Number(item.id) < 1 || item.is_password_protected === true
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 400 || typeof item.permalink !== 'string') continue;
    const url = parseStoreListingUrl(storeId, item.permalink);
    if (!url || url.search || !/^\/(?:producto|product)\/[^/]+\/?$/.test(url.pathname)) continue;
    const id = String(item.id);
    // Un lote ambiguo no sirve para reconciliar publicaciones.
    if (ids.has(id) || urls.has(url.href)) return [];
    ids.add(id); urls.add(url.href);
    const title = load(item.name).text().replace(/\s+/g, ' ').trim();
    if (!title || title.length > 400) continue;
    result.push({ storeId, sourceId: id, url: url.href, title,
      ...(typeof item.sku === 'string' && item.sku.trim() && item.sku.length <= 160 && !/[\x00-\x1f]/.test(item.sku) ? { storeSku: item.sku.trim() } : {}) });
  }
  return result;
}

/** Sólo descubrimiento público acotado. No devuelve ni guarda precios o stock. */
export async function discoverWooPublicListings(storeId: string, options: { sourceIds?: string[]; slugs?: string[]; signal?: AbortSignal } = {}): Promise<PublicListing[]> {
  const contract = sourceContract(storeId);
  if (!contract?.publicProductsApi) return [];
  const ids = options.sourceIds ?? [], slugs = options.slugs ?? [];
  if (ids.length > 24 || slugs.length > 24 || (ids.length && slugs.length)
    || ids.some(id => !/^[1-9]\d{0,14}$/.test(id)) || slugs.some(slug => !slug || /[\/?,#\x00-\x1f]/.test(slug))) throw new Error('SOURCE_INVALID_DISCOVERY_TARGET');
  const url = new URL(contract.publicProductsApi);
  url.searchParams.set('per_page', ids.length || slugs.length ? '100' : '1');
  if (ids.length) url.searchParams.set('include', ids.join(','));
  if (slugs.length) url.searchParams.set('slug', slugs.join(','));
  const response = await sourceFetch(storeId, url.href, { signal: options.signal, headers: { Accept: 'application/json' } }, 1_500_000, [contract.host]);
  return parseWooPublicListings(storeId, await response.json());
}

/** Una coincidencia de palabras o SKU de tienda nunca alcanza para cambiar de URL. */
export function resolveDiscoveredListing(previous: PublicListing, candidates: PublicListing[]) {
  const matches = candidates.filter(item => item.storeId === previous.storeId && item.sourceId === previous.sourceId);
  if (matches.length !== 1) return { status: 'unresolved' as const };
  const next = matches[0];
  if (previous.storeSku && next.storeSku && previous.storeSku !== next.storeSku)
    return { status: 'identity-changed' as const, listing: next };
  return { status: next.url === previous.url ? 'unchanged' as const : 'url-changed' as const, listing: next };
}

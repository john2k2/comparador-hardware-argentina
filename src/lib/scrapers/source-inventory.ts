import { sourceFetch, SourceHttpError } from './source-http';
import { WOOCOMMERCE_STORES } from './woocommerce-shared';
import { parseWooStoreKnownProducts, verifyWooStoreProducts, WOO_BATCH_STORES } from './woocommerce-known-batch';
import { fetchCompraGamerCatalogProducts } from './compragamer';
import { getCompraGamerCatalog } from './compragamer-catalog';
import { buildCompraGamerProductUrl } from './compragamer-mapper';
import { listingReference } from './listing-reference';
import { resolveHardwareCategoryForProduct } from '@/lib/catalog/hardware-categories';
import type { Product } from '@/lib/types';

export type InventoryListing = { sourceId: string; url: string; title: string; product?: Product };
export type SourceInventory = { listings: InventoryListing[]; pages: number; rejectedProducts: number };
export const WOO_INVENTORY_STORES = new Set([...WOO_BATCH_STORES, 'katech']);

export function parseInventoryPage(data: unknown, storeId: string, observedAt: Date): InventoryListing[] {
  const store = WOOCOMMERCE_STORES.find(item => item.id === storeId);
  if (!store || !WOO_INVENTORY_STORES.has(storeId) || !Array.isArray(data) || data.length > 100) throw new SourceHttpError('invalid-response');
  const host = new URL(store.baseUrl).hostname.replace(/^www\./, '');
  const listings: InventoryListing[] = [];
  for (const item of data) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.name !== 'string' || !item.name.trim()
      || item.name.length > 400 || typeof item.permalink !== 'string') throw new SourceHttpError('invalid-response');
    let url: URL;
    try { url = new URL(item.permalink); } catch { throw new SourceHttpError('invalid-response'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || url.hostname.replace(/^www\./, '') !== host) throw new SourceHttpError('invalid-response');
    const product = parseWooStoreKnownProducts([item], storeId,
      [{ url: url.href, category: resolveHardwareCategoryForProduct(item.name) }], observedAt)[0];
    listings.push({ sourceId: String(item.id), url: url.href, title: item.name, product });
  }
  return listings;
}

/** La presencia se guarda sólo después de recorrer todas las páginas coherentes. */
export async function fetchSourceInventory(storeId: string, signal: AbortSignal): Promise<SourceInventory> {
  if (storeId === 'compragamer') {
    const [raw, products] = await Promise.all([getCompraGamerCatalog(signal), fetchCompraGamerCatalogProducts(signal)]);
    if (!raw.length || raw.length > 10000) throw new SourceHttpError('invalid-response');
    const mapped = new Map(products.map(product => [listingReference(storeId, product.prices[0].url)?.split(':').pop(), product]));
    const listings = raw.map(item => {
      const id = Number(item.id_producto), title = item.nombre?.trim();
      if (!Number.isSafeInteger(id) || id <= 0 || !title || title.length > 400) throw new SourceHttpError('invalid-response');
      const sourceId = String(id), product = mapped.get(sourceId);
      return { sourceId, url: buildCompraGamerProductUrl(id, title), title, product };
    });
    if (new Set(listings.map(item => item.sourceId)).size !== listings.length) throw new SourceHttpError('invalid-response');
    return { listings, pages: 1, rejectedProducts: raw.length - products.length };
  }
  const store = WOOCOMMERCE_STORES.find(item => item.id === storeId);
  if (!store || !WOO_INVENTORY_STORES.has(storeId)) throw new SourceHttpError('inconsistent-source');
  const host = new URL(store.baseUrl).hostname.replace(/^www\./, '');
  const listings: InventoryListing[] = [];
  let total: number | undefined, pages = 1;
  for (let page = 1; page <= pages; page++) {
    signal.throwIfAborted();
    const url = new URL('/wp-json/wc/store/v1/products', store.baseUrl.replace('://www.', '://'));
    url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
    url.searchParams.set('_fields', 'id,name,permalink,type,has_options,is_password_protected,is_in_stock,is_purchasable,is_on_backorder,stock_availability,prices,sku,images');
    const response = await sourceFetch(storeId, url.href, { signal, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } }, 8000000, [host]);
    const countHeader = response.headers.get('x-wp-total'), pagesHeader = response.headers.get('x-wp-totalpages');
    const count = Number(countHeader), pageCount = Number(pagesHeader);
    if (countHeader === null || pagesHeader === null || !Number.isSafeInteger(count) || count < 1 || count > 10000
      || !Number.isSafeInteger(pageCount) || pageCount !== Math.ceil(count / 100)
      || (total !== undefined && (total !== count || pages !== pageCount))) throw new SourceHttpError('invalid-response');
    total = count; pages = pageCount;
    const batch = parseInventoryPage(await response.json(), storeId, new Date());
    if (batch.length !== Math.min(100, count - (page - 1) * 100)) throw new SourceHttpError('invalid-response');
    listings.push(...batch);
  }
  if (listings.length !== total || new Set(listings.map(item => item.sourceId)).size !== total
    || new Set(listings.map(item => listingReference(storeId, item.url))).size !== total) throw new SourceHttpError('invalid-response');
  const products = listings.flatMap(item => item.product ? [item.product] : []);
  if (WOO_BATCH_STORES.has(storeId)) {
    if (!products.length) throw new SourceHttpError('invalid-response');
    await verifyWooStoreProducts(storeId, products, signal);
  }
  return { listings, pages, rejectedProducts: listings.length - products.length };
}

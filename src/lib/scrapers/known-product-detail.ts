import * as cheerio from 'cheerio';
import { sourceFetch } from './source-http';
import { sameListing } from './listing-reference';
import { buildSinglePriceProduct } from './scraper-helpers';
import { normalizeIdentityText } from '@/lib/product-identity';
import { parseKnownDomDetail } from './known-dom-detail';
import type { HardwareCategory, Product, StockStatus } from '@/lib/types';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);

/** Sólo datos del producto principal: nunca lowPrice de un agregado o similares. */
export function parseKnownProductDetail(html: string, url: string, store: { id: string; name: string; baseUrl: string }, category: HardwareCategory): Product | null {
  // Estas fuentes requieren corroboración visible; un fallo no habilita volver
  // al JSON-LD de plantilla, que puede conservar precio o stock vencidos.
  if (['mexx', 'xtpc', 'gamingcity', 'compugarden'].includes(store.id)) return parseKnownDomDetail(html, url, store, category);
  const $ = cheerio.load(html);
  const heading = $('h1').filter((_, element) => $(element).text().trim().length > 0).first().text().replace(/\s+/g,' ').trim();
  const canonical = $('link[rel=canonical]').attr('href');
  if (!heading || !canonical || !sameListing(store.id,new URL(canonical,url).href,url)) return null;
  const nodes: JsonRecord[] = [];
  function collect(value: unknown, depth = 0) {
    if (depth > 6 || nodes.length >= 200) return;
    if (Array.isArray(value)) { value.slice(0,200).forEach(item=>collect(item,depth+1)); return; }
    if (!record(value)) return;
    const type = value['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) nodes.push(value);
    if (value['@graph']) collect(value['@graph'],depth+1);
    if (value.mainEntity) collect(value.mainEntity,depth+1);
  }
  $('script[type="application/ld+json"]').each((_,element)=>{
    try { collect(JSON.parse($(element).text())); } catch { /* JSON inválido no prueba precio. */ }
  });
  const matching = nodes.filter(node => typeof node.name === 'string' && normalizeIdentityText(node.name) === normalizeIdentityText(heading)
    && (typeof node.url !== 'string' || sameListing(store.id,new URL(node.url,url).href,url)));
  if (matching.length !== 1) return null;
  const node = matching[0], offers = Array.isArray(node.offers) ? node.offers : [node.offers];
  // Múltiples variantes/precios requieren un adaptador específico.
  if (offers.length !== 1 || !record(offers[0])) return null;
  const offer = offers[0];
  if (offer['@type'] === 'AggregateOffer' || offer.priceCurrency !== 'ARS'
    || (typeof offer.url === 'string' && !sameListing(store.id,new URL(offer.url,url).href,url))) return null;
  const price = typeof offer.price === 'number' || typeof offer.price === 'string' ? Number(offer.price) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;
  const availability = typeof offer.availability === 'string' ? offer.availability.split('/').pop() : '';
  const stock: StockStatus = availability === 'InStock' ? 'in-stock' : availability === 'LimitedAvailability' ? 'low-stock'
    : availability === 'OutOfStock' || availability === 'SoldOut' ? 'out-of-stock' : 'unknown';
  const image = typeof node.image === 'string' ? node.image : Array.isArray(node.image) && typeof node.image[0] === 'string' ? node.image[0] : undefined;
  const product = buildSinglePriceProduct({ id:`${store.id}-known`,name:heading,category,storeId:store.id,storeName:store.name,
    storeBaseUrl:store.baseUrl,url,price,stock,image });
  if (product && typeof node.sku === 'string' && node.sku.length <= 160) product.specs.SKU=node.sku;
  return product;
}
export async function fetchKnownProductDetail(url: string, store: { id: string; name: string; baseUrl: string }, category: HardwareCategory, signal?: AbortSignal): Promise<Product | null> {
  const allowed = new URL(store.baseUrl).hostname.replace(/^www\./,'');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.port || target.hostname.replace(/^www\./,'') !== allowed) return null;
  const response = await sourceFetch(store.id,url,{signal,headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html'}},8_000_000,[allowed]);
  return parseKnownProductDetail(await response.text(),url,store,category);
}

import { sourceFetch, SourceHttpError } from './source-http';
import { normalizeIdentityText } from '@/lib/product-identity';
import { WOOCOMMERCE_STORES, fetchWooCommerceKnownOffer } from './woocommerce-shared';
import { sameListing } from './listing-reference';
import { buildSinglePriceProduct } from './scraper-helpers';
import { resolveHardwareCategoryForProduct } from '@/lib/catalog/hardware-categories';
import type { HardwareCategory, Product, StockStatus } from '@/lib/types';

// Sólo fuentes contrastadas contra precio/stock principales de su página.
// SCP queda fuera: se constató un precio de API distinto del visible.
export const WOO_BATCH_STORES = new Set(['maxtecno','katech']);
export type WooKnownTarget = { url: string; category: HardwareCategory };
const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
export function parseWooStoreKnownProducts(data: unknown,storeId: string,targets: WooKnownTarget[],observedAt: Date): Product[] {
 const store=WOOCOMMERCE_STORES.find(item=>item.id===storeId);
 if (!store || !WOO_BATCH_STORES.has(storeId) || !Array.isArray(data) || data.length>100 || !Number.isFinite(observedAt.getTime())) return [];
 const result: Product[] = [], seen = new Set<number>();
 for(const item of data){
  if(!object(item) || !Number.isSafeInteger(item.id) || Number(item.id)<=0 || typeof item.name!=='string' || typeof item.permalink!=='string'
   || item.type!=='simple' || item.has_options!==false || item.is_password_protected===true || !object(item.prices)) continue;
  const target=targets.find(target=>sameListing(storeId,item.permalink as string,target.url));
  if(!target || seen.has(Number(item.id))) continue;
  const url=new URL(item.permalink),host=new URL(store.baseUrl).hostname.replace(/^www\./,'');
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.hostname.replace(/^www\./,'')!==host || url.search || url.hash) continue;
  const prices=item.prices;
  if(prices.currency_code!=='ARS' || !Number.isInteger(prices.currency_minor_unit) || Number(prices.currency_minor_unit)<0 || Number(prices.currency_minor_unit)>4
   || typeof prices.price!=='string' || !/^\d+$/.test(prices.price) || prices.price_range!=null) continue;
  const minor=Number(prices.price),price=minor/10**Number(prices.currency_minor_unit);
  if(!Number.isSafeInteger(minor) || price<=0) continue;
  let stock: StockStatus='unknown';
  const availability=object(item.stock_availability)?item.stock_availability.class:undefined;
  if(item.is_on_backorder===true || availability==='available-on-backorder') stock='unknown';
  else if(item.is_in_stock===false && availability==='out-of-stock') stock='out-of-stock';
  else if(item.is_in_stock===true && item.is_purchasable===true && availability==='in-stock')
   stock=typeof item.low_stock_remaining==='number' && item.low_stock_remaining>0 && item.low_stock_remaining<=2?'low-stock':'in-stock';
  const product=buildSinglePriceProduct({id:`${storeId}-api-${item.id}`,name:item.name,category:resolveHardwareCategoryForProduct(item.name,target.category),
   storeId,storeName:store.name,storeBaseUrl:store.baseUrl,url:url.href,price,stock});
  if(!product) continue;
  // El constructor común redondea pesos; esta fuente expresa centavos explícitos.
  product.prices[0].price=price;
  product.lowestPrice=price;product.highestPrice=price;product.averagePrice=price;
  product.prices[0].lastUpdated=observedAt;
  product.prices[0].priceCondition=storeId==='maxtecno'?'special':'unspecified';
  if(typeof item.sku==='string' && item.sku.length<=160 && !/[\x00-\x1f]/.test(item.sku)) product.specs.SKU=item.sku;
  seen.add(Number(item.id));result.push(product);
 }
 return result;
}
export async function fetchWooStoreKnownBatch(storeId:string,targets:WooKnownTarget[],signal?:AbortSignal,verifiedStores=new Set<string>()):Promise<Product[]> {
 const store=WOOCOMMERCE_STORES.find(item=>item.id===storeId);
 if(!store || !WOO_BATCH_STORES.has(storeId) || !targets.length || targets.length>24) return [];
 const host=new URL(store.baseUrl).hostname.replace(/^www\./,'');
 const slugs=targets.map(target=>{
  const url=new URL(target.url);
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.hostname.replace(/^www\./,'')!==host || url.search || url.hash) throw new SourceHttpError('invalid-response');
  const slug=url.pathname.match(/^\/producto\/([^/]+)\/?$/)?.[1];
  if(!slug || slug.includes(',')) throw new SourceHttpError('invalid-response');
  return slug;
 });
 const url=new URL('/wp-json/wc/store/v1/products',store.baseUrl.replace('://www.','://'));
 url.searchParams.set('slug',[...new Set(slugs)].join(','));url.searchParams.set('per_page','100');
 const response=await sourceFetch(storeId,url.href,{signal,headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'}},8000000,[host]);
 const data:unknown=await response.json();
 if(!Array.isArray(data) || data.length>100) throw new SourceHttpError('invalid-response');
 const products=parseWooStoreKnownProducts(data,storeId,targets,new Date());
 // Una lectura visible por fuente y ejecución detecta cambios de moneda, pago o caché.
 // La oferta conserva la hora original de la API, nunca la del control posterior.
 if(products.length && !verifiedStores.has(storeId)){
  const probe=products[0],price=probe.prices[0];
  const visible=await fetchWooCommerceKnownOffer(storeId,price.url,probe.category,signal);
  const observed=visible?.prices[0];
  if(!visible || !observed || normalizeIdentityText(visible.name)!==normalizeIdentityText(probe.name)
   || Math.abs(observed.price-price.price)>1
   || (price.stock!=='unknown' && observed.stock!==price.stock
     && !(['in-stock','low-stock'].includes(price.stock) && ['in-stock','low-stock'].includes(observed.stock)))
   || (visible.specs.SKU && probe.specs.SKU && visible.specs.SKU!==probe.specs.SKU)) throw new SourceHttpError('inconsistent-source');
  verifiedStores.add(storeId);
 }
 return products;
}

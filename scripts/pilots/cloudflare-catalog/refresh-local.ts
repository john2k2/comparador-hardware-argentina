// Consumidor explícito de prueba: sólo SQLite sample.sqlite y fichas públicas conocidas.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchKnownProductDetail } from '@/lib/scrapers/known-product-detail';
import { fetchWooCommerceKnownOffer } from '@/lib/scrapers/woocommerce-shared';
import { SourceHttpError, sourceHttpMetrics, sourceBlockedUntil } from '@/lib/scrapers/source-http';
import { proveOfferAttributes, proveManufacturerRamAttributes, attributeProofMatches, exactOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { proveExactListing, exactListingCategories } from '@/lib/quality/exact-listing-proof';
import { sourceContract, WOO_PUBLIC_STORE_IDS } from '@/lib/scrapers/source-contracts';
import { hasExplicitIdentityConflict, readIdentityReview, needsIdentityReview, type OfferIdentityReview } from '@/lib/quality/offer-identity';
import { normalizeIdentityText } from '@/lib/product-identity';
import { listingReference, sameListing } from '@/lib/scrapers/listing-reference';
import { getCompraGamerCatalog, getCompraGamerSubcategoryMap, getCompraGamerBrandMap } from '@/lib/scrapers/compragamer-catalog';
import { mapCompraGamerProduct } from '@/lib/scrapers/compragamer-mapper';
import { isComparableStoreOffer } from '@/lib/price-utils';
import { buildPriceStateSignature } from '@/lib/persistence/product-write-dedupe';
import type { HardwareCategory, Product, ProductPrice } from '@/lib/types';
import { initializeRefreshDemand, enqueueKnownProducts, claimRefreshBatch, acknowledgeRefresh } from './refresh-demand.mjs';
import { chargeDailyBudget } from './daily-budget.mjs';

type Lease = { offerId:string; productId:string; storeId:string; url:string; observedAt:string|null; leaseToken:string; leasedAt:number; leaseUntil:number };
type Reader = (storeId:string,url:string,category:HardwareCategory,signal?:AbortSignal,
  context?:{observedAfter:number})=>ReturnType<typeof fetchWooCommerceKnownOffer>;
type Projection = (db:DatabaseSync, options:{now:number;generation:string;affectedProductIds:string[]}) => {
  statements:Array<{sql:string;values:unknown[]}>;baseRowsWritten:number;changedProjectionRows:number;cache:unknown;
};
type Statement = { sql:string;values:unknown[];expectedRows:number };
type Dependencies = { reader?:Reader; clock?:()=>number; projection:Projection; estimateIndexes:(db:DatabaseSync,statements:Statement[])=>number };
const historySchema = `CREATE TABLE IF NOT EXISTS pilot_offer_observations(
 offer_id TEXT NOT NULL,observed_at TEXT NOT NULL,row_json TEXT NOT NULL,
 PRIMARY KEY(offer_id,observed_at));`;
export const localStoreIds = [...WOO_PUBLIC_STORE_IDS,'fullh4rd','mexx','xtpc','gamingcity','compugarden','compragamer','37bytes'];
export const localCategories = ['procesadores','tarjetas-graficas','memoria-ram','almacenamiento'];

export function canRefreshLocalTarget(storeId:string,url:string,category:string,name:string,specs?:Record<string,unknown>):boolean {
  const ref=listingReference(storeId,url);
  const generic=storeId==='compragamer'&&exactListingCategories.includes(category as typeof exactListingCategories[number])
    &&typeof specs?.SKU==='string'&&ref?proveExactListing({title:name,category,sku:specs.SKU},
      {title:name,category,sku:specs.SKU},{storeId,url,listingRef:ref,sourceId:ref.split(':').at(-1)!}):null;
  return (localCategories.includes(category)||Boolean(generic))&&(storeId!=='37bytes'||category==='almacenamiento')
    &&validateLocalTarget(storeId,url)&&(generic!==null||exactOfferAttributes(name,category)!==null
      ||category==='memoria-ram'&&storeId==='compragamer'&&typeof specs?.SKU==='string'
        &&proveManufacturerRamAttributes({title:name,sku:specs.SKU,specs},{title:name,sku:specs.SKU,specs},
          {storeId,url,listingRef:listingReference(storeId,url)!})!==null);
}

function selectedLocalStores(storeIds:string[]=localStoreIds):string[] {
  if(!Array.isArray(storeIds)||!storeIds.length||storeIds.length>localStoreIds.length
    ||storeIds.some(id=>!localStoreIds.includes(id)))throw new Error('REFRESH_LOCAL_STORES');
  return [...new Set(storeIds)];
}

/** Selección explícita: Katech conserva precio HTML, sin API ni búsqueda alternativa. */
export function createLocalOfferReader({wooReader=fetchWooCommerceKnownOffer,detailReader=fetchKnownProductDetail}={}):Reader {
  return async(storeId,url,category,signal,context)=>{
    if(!validateLocalTarget(storeId,url))throw new Error('REFRESH_LOCAL_IDENTITY');
    if(storeId==='compragamer') {
      const reference=listingReference(storeId,url)!;
      const catalog=await getCompraGamerCatalog(signal,context);
      const item=catalog.find(row=>`${storeId}:id:${row.id_producto}`===reference);
      if(!item)return null;
      const subcategoryMap=await getCompraGamerSubcategoryMap(signal),brandMap=await getCompraGamerBrandMap(signal);
      return mapCompraGamerProduct({item,subcategoryMap,brandMap});
    }
    const contract=sourceContract(storeId)!;
    return (WOO_PUBLIC_STORE_IDS as readonly string[]).includes(storeId)?wooReader(storeId,url,category,signal)
      :detailReader(url,{id:storeId,name:storeId,baseUrl:contract.baseUrl},category,signal);
  };
}

export function validateLocalTarget(storeId:string, url:string): boolean {
  if(!localStoreIds.includes(storeId))return false;
  const store=sourceContract(storeId);
  if(!store) return false;
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!parsed.search&&!parsed.hash
      &&parsed.hostname.replace(/^www\./,'')===store.host&&listingReference(storeId,url)!==null
      &&(storeId!=='fullh4rd'||/^\/prod\/\d+\/[^/]+\/?$/.test(parsed.pathname))
      &&(storeId!=='37bytes'||/^\/productos\/[^/]+\/?$/.test(parsed.pathname));
  } catch {return false;}
}

/** Prueba local estricta; SSD conserva además el título completo de ambas fuentes. */
export function reviewLocalObservation(product:{name:string;category:HardwareCategory;specs?:Record<string,unknown>},lease:Lease,source:Product,now:number):ProductPrice {
  if(!validateLocalTarget(lease.storeId,lease.url)||source.category!==product.category) throw new Error('REFRESH_LOCAL_IDENTITY');
  const price=source.prices.find(offer=>offer.storeId===lease.storeId&&sameListing(lease.storeId,offer.url,lease.url));
  const observed=price?new Date(price.lastUpdated).valueOf():NaN;
  if(!price||!Number.isFinite(price.price)||price.price<=0||!Number.isFinite(observed)||observed<lease.leasedAt||observed>now
    ||(lease.observedAt&&observed<=Date.parse(lease.observedAt))) throw new Error('REFRESH_LOCAL_NO_OBSERVATION');
  const reference=listingReference(lease.storeId,lease.url)!;
  const sourceId=source.id?.startsWith('cg-')?source.id.slice(3):'';
  const listingProof=lease.storeId==='compragamer'?proveExactListing(
    {title:product.name,category:product.category,sku:typeof product.specs?.SKU==='string'?product.specs.SKU:''},
    {title:source.name,category:source.category,sku:source.specs.SKU??''},
    {storeId:lease.storeId,url:lease.url,listingRef:reference,sourceId}):null;
  const proof=listingProof??proveOfferAttributes(product.name,product.category,source.name)
    ??(product.category==='memoria-ram'?proveManufacturerRamAttributes(
      {title:product.name,sku:typeof product.specs?.SKU==='string'?product.specs.SKU:undefined,specs:product.specs},
      {title:source.name,sku:source.specs.SKU,specs:source.specs},{storeId:lease.storeId,url:lease.url,listingRef:reference}):null);
  if(proof?.method==='exact-listing'&&source.specs.SourceListingId!==undefined
    &&source.specs.SourceListingId!==proof.binding.sourceId)throw new Error('REFRESH_LOCAL_IDENTITY');
  if(!proof||hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:source.name})) throw new Error('REFRESH_LOCAL_IDENTITY');
  if((proof.method==='manufacturer-ram'||proof.method==='exact-listing')&&price.sourceIdentity
    &&(price.sourceIdentity.listingRef!==reference||normalizeIdentityText(price.sourceIdentity.title)!==normalizeIdentityText(source.name)
      ||price.sourceIdentity.storeSku!==undefined&&price.sourceIdentity.storeSku!==source.specs.SKU
      ||proof.method==='exact-listing'&&price.sourceIdentity.sourceId!==undefined&&price.sourceIdentity.sourceId!==sourceId))throw new Error('REFRESH_LOCAL_IDENTITY');
  const sourceIdentity={...price.sourceIdentity,listingRef:reference,title:source.name.slice(0,400),
    ...(source.specs.SKU?{storeSku:source.specs.SKU.slice(0,160)}:{}),
    ...(proof.method==='exact-listing'?{sourceId:proof.binding.sourceId}:source.specs.SourceListingId?{sourceId:source.specs.SourceListingId}:{}),
  };
  const identityReview:OfferIdentityReview={version:1,status:'consistent',reason:proof.method==='manufacturer-ram'?'manufacturer-ram':proof.method==='exact-listing'?'exact-listing':'exact-attributes',reviewedAt:new Date(now).toISOString(),
    model:null,confidence:null,subject:{name:normalizeIdentityText(product.name),category:product.category,url:lease.url},sourceIdentity,proof};
  return {...price,url:lease.url,lastUpdated:new Date(observed),sourceIdentity,identityReview};
}

export function persistLocalObservation(db:DatabaseSync,lease:Lease,price:ProductPrice,{projection,estimateIndexes,clock=Date.now}:Dependencies,now:number) {
  if(db.isTransaction) throw new Error('REFRESH_LOCAL_TRANSACTION');
  db.exec('BEGIN IMMEDIATE');
  try {
  const queued=db.prepare('SELECT * FROM pilot_refresh_demand WHERE offer_id=?').get(lease.offerId) as {
    status:string;lease_token:string;lease_until:number;leased_at:number;product_id:string;store_id:string;url:string;
  }|undefined;
  if(!queued||queued.status!=='leased'||queued.lease_token!==lease.leaseToken||queued.lease_until<=now||queued.leased_at>now
    ||queued.product_id!==lease.productId||queued.store_id!==lease.storeId||queued.url!==lease.url)throw new Error('REFRESH_LOCAL_LEASE_CONFLICT');
  const row=db.prepare('SELECT * FROM product_prices WHERE id=?').get(lease.offerId) as {product_id:string;store_id:string;url:string;row_json:string}|undefined;
  const productRow=db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId) as {row_json:string;category:HardwareCategory}|undefined;
  if(!row||!productRow||row.product_id!==lease.productId||row.store_id!==lease.storeId||row.url!==lease.url) throw new Error('REFRESH_LOCAL_DESTINATION_CHANGED');
  const before=JSON.parse(row.row_json),product={...JSON.parse(productRow.row_json),category:productRow.category};
  const marker=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get() as {value:string}|undefined;
  if(!marker) throw new Error('REFRESH_LOCAL_SNAPSHOT');
  const observedMs=price.lastUpdated.valueOf();
  if(!Number.isFinite(observedMs)||observedMs<queued.leased_at||observedMs>now||price.url!==lease.url||price.storeId!==lease.storeId
    ||!price.sourceIdentity||!attributeProofMatches(price.identityReview?.proof,product.name,product.category,price.sourceIdentity.title,
      {targetSpecs:product.specs,sourceIdentity:price.sourceIdentity,url:lease.url})
    ||readIdentityReview(price.identityReview)?.status!=='consistent'||needsIdentityReview(price,product)
    ||hasExplicitIdentityConflict({name:product.name,category:product.category,offerText:price.sourceIdentity.title}))throw new Error('REFRESH_LOCAL_IDENTITY');
  if(before.last_updated&&price.lastUpdated.valueOf()<=Date.parse(before.last_updated)) throw new Error('REFRESH_LOCAL_OBSERVATION_REGRESSION');
  const observed=price.lastUpdated.toISOString(),comparable=isComparableStoreOffer(price,product);
  const state={price:price.price,original_price:price.originalPrice??null,stock:price.stock,
    installment_count:price.installment?.count??null,installment_amount:price.installment?.amount??null,identity_review:price.identityReview};
  const next={...before,...state,last_updated:observed,updated_at:new Date(now).toISOString(),
    source_identity:price.sourceIdentity,price_condition:price.priceCondition??'unspecified',state_signature:buildPriceStateSignature(state)};
  const statements:Statement[]=[];
  const write=(sql:string,values:unknown[])=>{
    const count=Number(db.prepare(sql).run(...values as never[]).changes);
    if(count)statements.push({sql,values,expectedRows:count});return count;
  };
    // Registro privado de antes/después. No exportarlo como D1 ni modificar historia remota.
    db.exec(historySchema);
    if(before.last_updated)write('INSERT OR IGNORE INTO pilot_offer_observations VALUES(?,?,?)',[lease.offerId,before.last_updated,row.row_json]);
    write('INSERT INTO pilot_offer_observations VALUES(?,?,?)',[lease.offerId,observed,JSON.stringify(next)]);
    write('UPDATE product_prices SET price=?,row_json=? WHERE id=?',[price.price,JSON.stringify(next),lease.offerId]);
    write("DELETE FROM price_basis WHERE kind='current' AND id=? AND product_id=?",[lease.offerId,lease.productId]);
    if(comparable)write("INSERT INTO price_basis(product_id,kind,id,store_id,price,stock,url,observed_at) VALUES(?,'current',?,?,?,?,?,?)",
      [lease.productId,lease.offerId,lease.storeId,price.price,price.stock,lease.url,observed]);
    // El resumen comparable precalculado anterior ya no describe esta observación.
    write("UPDATE summaries SET comparable_stats_json=NULL,comparable_valid_until=NULL,comparable_latest_observed_at=(SELECT MAX(observed_at) FROM price_basis WHERE product_id=? AND kind='current') WHERE product_id=?",[lease.productId,lease.productId]);
    const generation=createHash('sha256').update(marker.value).update(JSON.stringify(next)).digest('hex');
    const rebuilt=projection(db,{now,generation,affectedProductIds:[lease.productId]});
    for(const statement of rebuilt.statements)statements.push({...statement,expectedRows:1});
    const completedAt=clock();
    if(!Number.isSafeInteger(completedAt)||completedAt<queued.leased_at||completedAt>=queued.lease_until)throw new Error('REFRESH_LOCAL_LEASE_CONFLICT');
    const ack=acknowledgeRefresh(db,{...lease,now:completedAt,withinTransaction:true,outcome:'observed',receipt:{offerId:lease.offerId,url:lease.url,observedAt:observed,
      source:'public-page',persisted:true,identityVerified:true,priceVerified:true,stockVerified:true,comparableVerified:comparable}});
    statements.push({sql:"UPDATE pilot_refresh_demand SET status='observed',last_observed_at=?,last_error=NULL,lease_token=NULL,lease_until=NULL,attempts=0 WHERE offer_id=?",values:[observed,lease.offerId],expectedRows:1});
    const baseRowsWritten=statements.reduce((sum,statement)=>sum+statement.expectedRows,0);
    const estimatedRowsWritten=baseRowsWritten+estimateIndexes(db,statements);
    const budget=chargeDailyBudget(db,{now:completedAt,estimatedRowsWritten});
    const commitAt=clock();
    if(!Number.isSafeInteger(commitAt)||commitAt<completedAt||commitAt>=queued.lease_until)throw new Error('REFRESH_LOCAL_LEASE_CONFLICT');
    db.exec('COMMIT');
    return {observedAt:observed,comparable,baseRowsWritten,estimatedRowsWritten,budget,
      projectionChanged:rebuilt.changedProjectionRows,generation,ack,localOnly:true,remotePublishSafe:false};
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export async function runLocalRefresh(db:DatabaseSync,{limit=3,storeIds,productIds,failureRetryAfterMs=0,...dependencies}:Dependencies&{limit?:number;storeIds?:string[];productIds?:string[];failureRetryAfterMs?:number}) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>3)throw new Error('REFRESH_LOCAL_LIMIT');
  if(!Number.isSafeInteger(failureRetryAfterMs)||failureRetryAfterMs<0||failureRetryAfterMs>86400000)throw new Error('REFRESH_LOCAL_RETRY');
  const beforeHttp=sourceHttpMetrics();
  const selectedStores=selectedLocalStores(storeIds);
  const clock=dependencies.clock??Date.now,reader=dependencies.reader??createLocalOfferReader();
  const results=[];
  let attempted=0;
  for(let index=0;index<limit;index++) {
    const lease=claimRefreshBatch(db,{now:clock(),limit:1,leaseMs:300000,storeIds:selectedStores,productIds})[0] as Lease|undefined;
    if(!lease)break;
    attempted++;
    let readSource:Product|null=null;
    try {
      if(!validateLocalTarget(lease.storeId,lease.url))throw new Error('REFRESH_LOCAL_IDENTITY');
      const row=db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId) as {row_json:string;category:HardwareCategory};
      const product={...JSON.parse(row.row_json),category:row.category};
      if(!canRefreshLocalTarget(lease.storeId,lease.url,product.category,product.name,product.specs))throw new Error('REFRESH_LOCAL_IDENTITY');
      const source=await reader(lease.storeId,lease.url,product.category,AbortSignal.timeout(25000),{observedAfter:lease.leasedAt});
      readSource=source;
      if(!source)throw new Error('REFRESH_LOCAL_NO_OBSERVATION');
      const price=reviewLocalObservation(product,lease,source,clock());
      const saved=persistLocalObservation(db,lease,price,dependencies,clock());
      results.push({offerId:lease.offerId,storeId:lease.storeId,url:lease.url,status:'observed',...saved,sourceTitle:source.name,price:price.price,stock:price.stock,
        sourceIdentity:price.sourceIdentity,identityProof:price.identityReview?.proof});
    } catch(error) {
      const outcome=error instanceof SourceHttpError?(error.reason==='rate-limited'?'http-429':error.reason==='blocked'?'http-403':'http-error')
        :error instanceof Error&&error.message==='REFRESH_LOCAL_IDENTITY'?'identity-mismatch'
        :error instanceof Error&&error.message==='REFRESH_LOCAL_NO_OBSERVATION'?'no-observation':'persistence-error';
      const retryAfterMs=Math.min(86400000,Math.max(failureRetryAfterMs,sourceBlockedUntil(lease.storeId)-clock(),0));
      let acknowledged=false;
      try{acknowledgeRefresh(db,{...lease,now:clock(),outcome,retryAfterMs});acknowledged=true;}catch{/* Lease vencido conserva su estado; no imprimir SDK. */}
      results.push({offerId:lease.offerId,storeId:lease.storeId,url:lease.url,status:'failed',outcome,acknowledged,
        ...(error instanceof SourceHttpError?{sourceFailure:error.reason,httpStatus:error.status??null}:{}),
        ...(readSource?{sourceTitle:readSource.name.slice(0,400),sourceCategory:readSource.category}:{}),
        code:error instanceof Error&&/^REFRESH_LOCAL_[A-Z_]+$/.test(error.message)?error.message:outcome});
    }
  }
  return {localOnly:true,attempted,observed:results.filter(item=>item.status==='observed').length,results,sourceHttp:Object.fromEntries(Object.entries(sourceHttpMetrics()).map(([store,metric])=>[store,{
    requests:metric.requests-(beforeHttp[store]?.requests??0),bytes:metric.bytes-(beforeHttp[store]?.bytes??0)
  }]))};
}

export async function refreshLocalCli(args:string[]) {
  const mode=args[0],path=args[1];
  if(!['--dry-run','--execute'].includes(mode)||!path)throw new Error('REFRESH_LOCAL_USAGE');
  const file=realpathSync(resolve(path));
  const fullCatalog=args.includes('--full-catalog');
  if((basename(file)!==(fullCatalog?'catalog-all.sqlite':'sample.sqlite'))||!statSync(file).isFile())throw new Error('REFRESH_LOCAL_SAMPLE_REQUIRED');
  const productIds:string[]=[],requestedStores:string[]=[];let freshMs=86400000;
  for(let i=2;i<args.length;i++) {
    if(args[i]==='--full-catalog')continue;
    else if(args[i]==='--product-id'&&args[i+1])productIds.push(args[++i]);
    else if(args[i]==='--store-id'&&args[i+1])requestedStores.push(args[++i]);
    else if(args[i]==='--fresh-hours'&&['3','24'].includes(args[i+1]))freshMs=Number(args[++i])*3600000;
    else throw new Error('REFRESH_LOCAL_USAGE');
  }
  if(productIds.length>20)throw new Error('REFRESH_LOCAL_LIMIT');
  const selectedStores=selectedLocalStores(requestedStores.length?requestedStores:undefined);
  const db=new DatabaseSync(file,{readOnly:mode==='--dry-run'});
  try{
    if(fullCatalog) {
      const meta=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get() as {value:string}|undefined;
      if(!meta||JSON.parse(meta.value).counts?.product_prices!==Number(db.prepare('SELECT COUNT(*) n FROM product_prices').get()?.n))throw new Error('REFRESH_LOCAL_SNAPSHOT');
    }
    const queueExists=Boolean(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='pilot_refresh_demand'").get());
    const storeFilter=selectedStores.map(()=>'?').join(',');
    const rows=(productIds.length?db.prepare(`SELECT pp.id,pp.product_id,pp.store_id,pp.url,p.category FROM product_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.product_id IN(${productIds.map(()=>'?').join(',')}) AND pp.store_id IN(${storeFilter}) ORDER BY pp.id LIMIT 100`).all(...productIds,...selectedStores)
      :queueExists?db.prepare(`SELECT pp.id,pp.product_id,pp.store_id,pp.url,p.category FROM pilot_refresh_demand q JOIN product_prices pp ON pp.id=q.offer_id JOIN products p ON p.id=pp.product_id WHERE q.expires_at>? AND q.due_at<=? AND q.status IN('pending','backoff') AND pp.store_id IN(${storeFilter}) ORDER BY q.priority DESC,q.due_at LIMIT 100`).all(Date.now(),Date.now(),...selectedStores):[]) as Array<{store_id:string;url:string}>;
    if(mode==='--dry-run')return {localOnly:true,dryRun:true,writes:0,httpRequests:0,limit:3,storeIds:selectedStores,productIds:productIds.length?productIds:null,knownSupported:rows.filter(row=>selectedStores.includes(row.store_id)&&validateLocalTarget(row.store_id,row.url)).slice(0,3)};
    initializeRefreshDemand(db);
    if(productIds.length)enqueueKnownProducts(db,{productIds,now:Date.now(),freshMs,refreshAheadMs:90*60000,storeIds:selectedStores});
    // Imports dinámicos conservan el URL original de projection.sql tras esbuild.
    const modules=resolve('scripts/pilots/cloudflare-catalog');
    const {rebuildProjection}=await import(pathToFileURL(resolve(modules,'projection.mjs')).href);
    const {estimateIndexMaintenance}=await import(pathToFileURL(resolve(modules,'incremental-sync.mjs')).href);
    return await runLocalRefresh(db,{storeIds:selectedStores,productIds:productIds.length?productIds:undefined,projection:rebuildProjection,estimateIndexes:estimateIndexMaintenance});
  }finally{db.close();}
}
// Esbuild usa el nombre de salida explícito del consumidor. Al importar en tests no ejecutar CLI.
if(process.argv[1]&&/(?:^|\/)refresh-local(?:\.bundle)?\.(?:mjs|ts)$/.test(process.argv[1])) {
  refreshLocalCli(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(()=>{console.error('REFRESH_LOCAL_FAILED');process.exitCode=1;});
}

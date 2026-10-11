// Admisión única y explícita de las cuatro ofertas RAM autorizadas al piloto.
import { validateSync } from './remote-sync.mjs';
import { catalogSearchText,catalogIdentityText } from './catalog-matchers.mjs';
export const RAM_ADMISSION = {
  '2639e7ea-0d9f-4a66-87d7-3e16a7913198': ['agrupado-memoria-ram-corsair-16gb-1co0hh2','CMG16GX4M1E3200C16','compragamer:id:15558'],
  '727c2eef-012f-46f5-b9a4-957d2ac64f15': ['cg-15558','CMG16GX4M1E3200C16','compragamer:id:15558'],
  '0f9c233c-df54-44da-86dc-47f1737dac7c': ['cg-15522','CMK8GX4M1E3200C16','compragamer:id:15522'],
  '398fe1a7-7f15-4ab4-aab5-97c201f73733': ['cg-16112','CMK16GX5M1B5600C40','compragamer:id:16112'],
};
const productColumns=['id','category','catalog_identity','catalog_name','catalog_document','catalog_component','grouped_identity','last_scraped_at','updated_at','row_json'];
const tableColumns={product_prices:['id','product_id','store_id','price','url','row_json'],summaries:['product_id','lowest','highest','average','available','urls','portable_listing','store_ids_json','comparable_stats_json','comparable_valid_until','comparable_latest_observed_at','row_json'],search_projection:['product_id','category','catalog_identity','canonical','lowest','highest','average','available','comparable_available','urls','observed_at','next_transition'],price_basis:['product_id','kind','id','store_id','price','stock','url','observed_at']};
const productIds=Object.values(RAM_ADMISSION).map(value=>value[0]);
function exactIds(rows,field,ids){return Array.isArray(rows)&&rows.length===ids.length&&new Set(rows.map(row=>row[field])).size===ids.length&&rows.every(row=>ids.includes(row[field]));}
/** @param {unknown} payload @param {{now?: number, verifyOffer?: (raw: Record<string, unknown>, product: Record<string, unknown>) => boolean}} [options] */
export function validateRamAdmission(payload,{now=Date.now(),verifyOffer}={}){
  if(typeof verifyOffer!=='function')throw Error('RAM_ADMISSION_VERIFIER_REQUIRED');
  const keys=['expectedSnapshot','finalSnapshot','products','product_prices','summaries','search_projection','price_basis'];
  if(!payload||Object.keys(payload).length!==keys.length||keys.some(key=>!(key in payload))
    ||!exactIds(payload.products,'id',productIds)||!exactIds(payload.product_prices,'id',Object.keys(RAM_ADMISSION))
    ||!exactIds(payload.summaries,'product_id',productIds)||!Array.isArray(payload.price_basis)||payload.price_basis.length!==8
    ||!exactIds(payload.search_projection,'product_id',productIds))throw Error('RAM_ADMISSION_SCOPE');
  const old=JSON.parse(payload.expectedSnapshot),next=JSON.parse(payload.finalSnapshot);
  for(const key of ['products','product_prices','catalog_price_summaries'])
    if(!Number.isSafeInteger(old.counts?.[key])||next.counts?.[key]!==old.counts[key]+4)throw Error('RAM_ADMISSION_COUNTS');
  if(next.counts.stores!==old.counts.stores||Date.parse(next.cache?.validFrom)>now||Date.parse(next.cache?.validUntil)<=now
    ||!Number.isFinite(Date.parse(old.cache?.validUntil))||Date.parse(next.cache.validUntil)>Date.parse(old.cache.validUntil))throw Error('RAM_ADMISSION_CLOCK');
  const products=new Map(payload.products.map(row=>[row.id,row]));
  for(const row of payload.products){
    if(Object.keys(row).length!==productColumns.length||productColumns.some(key=>!(key in row))
      ||row.category!=='memoria-ram'||row.catalog_component!==1||row.grouped_identity!==Number(row.id.startsWith('agrupado-'))
      ||productColumns.some(key=>!['string','number','object'].includes(typeof row[key])))throw Error('RAM_ADMISSION_PRODUCT');
    const raw=JSON.parse(row.row_json);if(raw.id!==row.id||raw.category!==row.category||typeof raw.name!=='string'||typeof raw.specs?.SKU!=='string')throw Error('RAM_ADMISSION_PRODUCT');
  }
  for(const offer of payload.product_prices){
    const [productId,mpn,reference]=RAM_ADMISSION[offer.id],product=JSON.parse(products.get(productId).row_json),raw=JSON.parse(offer.row_json);
    const observed=Date.parse(raw.last_updated),source=raw.source_identity;
    if(offer.product_id!==productId||offer.store_id!=='compragamer'||product.specs.SKU!==mpn
      ||source?.storeSku!==mpn||source?.listingRef!==reference||!offer.url.startsWith('https://compragamer.com/producto/')
      ||!offer.url.endsWith('_'+reference.split(':').at(-1))||raw.identity_review?.proof?.version!==2||raw.identity_review.proof.method!=='manufacturer-ram'
      ||!Number.isFinite(observed)||observed>now||observed<now-3*3600000)throw Error('RAM_ADMISSION_OFFER');
    const basis=payload.price_basis.filter(row=>row.product_id===productId);
    if(basis.length!==2||new Set(basis.map(row=>row.kind)).size!==2||basis.some(row=>row.id!==offer.id||row.store_id!==offer.store_id||row.url!==offer.url||row.price!==offer.price||row.stock!==raw.stock||row.observed_at!==raw.last_updated))throw Error('RAM_ADMISSION_BASIS');
    if(verifyOffer(raw,product)!==true)throw Error('RAM_ADMISSION_VARIANT_PROOF');
    const storedProduct=products.get(productId),searchName=catalogSearchText(raw.identity_review.proof.attributes?.title??'');
    if(!searchName||storedProduct.catalog_name!==searchName||storedProduct.catalog_document!==searchName+' '+mpn.toLowerCase()
      ||storedProduct.catalog_identity!==catalogIdentityText(product.name))throw Error('RAM_ADMISSION_SEARCH_IDENTITY');
    const summary=payload.summaries.find(row=>row.product_id===productId),projection=payload.search_projection.find(row=>row.product_id===productId);
    // Cada producto admitido tiene exactamente una oferta. Derivados de otra
    // cifra nunca pueden sustituir el precio real al leer la proyección.
    for(const derived of [summary,projection])if(derived.lowest!==offer.price||derived.highest!==offer.price
      ||derived.average!==Math.round(offer.price)||derived.available!==1||derived.urls!==offer.url)throw Error('RAM_ADMISSION_DERIVED_PRICE');
    if(summary.comparable_stats_json!==null||summary.comparable_valid_until!==null||summary.comparable_latest_observed_at!==raw.last_updated
      ||JSON.stringify(JSON.parse(summary.store_ids_json))!=='["compragamer"]'||summary.portable_listing!==0
      ||projection.category!=='memoria-ram'||projection.catalog_identity!==products.get(productId).catalog_identity
      ||projection.comparable_available!==1||projection.observed_at!==raw.last_updated
      ||projection.next_transition!==new Date(observed+14400000+1).toISOString())throw Error('RAM_ADMISSION_DERIVED_STATE');
    const peers=payload.products.filter(row=>row.catalog_identity===storedProduct.catalog_identity).sort((a,b)=>
      b.grouped_identity-a.grouped_identity||String(b.last_scraped_at??'').localeCompare(String(a.last_scraped_at??''))
      ||String(b.updated_at??'').localeCompare(String(a.updated_at??''))||a.id.localeCompare(b.id));
    if(projection.canonical!==Number(peers[0].id===productId))throw Error('RAM_ADMISSION_CANONICAL');
    // El transporte existente verifica tipos, base actual y consistencia del precio.
    validateSync({expectedSnapshot:payload.expectedSnapshot,finalSnapshot:payload.finalSnapshot,basisProductIds:[productId],
      product_prices:[offer],summaries:payload.summaries.filter(row=>row.product_id===productId),search_projection:payload.search_projection,price_basis:basis});
  }
  for(const id of productIds)if(payload.search_projection.filter(row=>row.product_id===id).length!==1)throw Error('RAM_ADMISSION_PROJECTION');
  const nextTransition=Math.min(Date.parse(old.cache.validUntil),...payload.search_projection.map(row=>Date.parse(row.next_transition)));
  if(Date.parse(next.cache.validUntil)>nextTransition)throw Error('RAM_ADMISSION_CLOCK_TRANSITION');
  if(JSON.stringify(payload).length>128000)throw Error('RAM_ADMISSION_SIZE');
  return payload;
}
export async function applyRamAdmission(db,input,{now=Date.now(),verifyOffer}={}){
  const p=validateRamAdmission(input,{now,verifyOffer}),statements=[];
  const add=(sql,values=[])=>statements.push(db.prepare(sql).bind(...values));
  add('CREATE TABLE IF NOT EXISTS pilot_sync_guard(id INTEGER PRIMARY KEY CHECK(id=1),expected TEXT NOT NULL,actual TEXT NOT NULL CHECK(expected=actual))');
  add("INSERT OR REPLACE INTO pilot_sync_guard VALUES(1,?,(SELECT value FROM pilot_meta WHERE key='snapshot'))",[p.expectedSnapshot]);
  // No reemplazar miembros previos: toda admisión requiere ausencia y conteo exactos.
  const counts=JSON.parse(p.expectedSnapshot).counts;
  add(`INSERT OR REPLACE INTO pilot_sync_guard SELECT 1,'admission-allowed',CASE WHEN
    (SELECT COUNT(*) FROM products)=? AND (SELECT COUNT(*) FROM product_prices)=? AND (SELECT COUNT(*) FROM summaries)=? AND (SELECT COUNT(*) FROM stores)=?
    AND EXISTS(SELECT 1 FROM stores WHERE id='compragamer')
    AND NOT EXISTS(SELECT 1 FROM products old JOIN json_each(?) candidate ON old.category=json_extract(candidate.value,'$.category') AND old.catalog_identity=json_extract(candidate.value,'$.catalog_identity'))
    AND NOT EXISTS(SELECT 1 FROM products WHERE id IN(SELECT value FROM json_each(?)))
    AND NOT EXISTS(SELECT 1 FROM product_prices WHERE id IN(SELECT value FROM json_each(?)))
    THEN 'admission-allowed' ELSE 'admission-rejected' END`,[counts.products,counts.product_prices,counts.catalog_price_summaries,counts.stores,JSON.stringify(p.products),JSON.stringify(productIds),JSON.stringify(Object.keys(RAM_ADMISSION))]);
  add(`INSERT INTO products(${productColumns.join(',')}) SELECT ${productColumns.map(key=>`json_extract(value,'$.${key}')`).join(',')} FROM json_each(?)`,[JSON.stringify(p.products)]);
  add("INSERT INTO product_substrings(id,document) SELECT json_extract(value,'$.id'),json_extract(value,'$.catalog_document') FROM json_each(?)",[JSON.stringify(p.products)]);
  for(const table of ['product_prices','summaries','search_projection','price_basis']){
    const columns=tableColumns[table];
    const conflict=table==='search_projection'?' ON CONFLICT(product_id) DO UPDATE SET '+columns.slice(1).map(key=>`${key}=excluded.${key}`).join(','):'';
    add(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(key=>`json_extract(value,'$.${key}')`).join(',')} FROM json_each(?) WHERE 1${conflict}`,[JSON.stringify(p[table])]);
  }
  add("UPDATE pilot_meta SET value=? WHERE key='snapshot'",[p.finalSnapshot]);
  add('DELETE FROM pilot_sync_guard WHERE id=1');
  const result=await db.batch(statements);if(result.some(row=>!row.success))throw Error('RAM_ADMISSION_BATCH_FAILED');
  return {atomic:true,generation:JSON.parse(p.finalSnapshot).cache.generation,admittedOffers:4,admittedProducts:4,
    rowsRead:result.reduce((n,row)=>n+(row.meta?.rows_read??0),0),rowsWritten:result.reduce((n,row)=>n+(row.meta?.rows_written??0),0)};
}

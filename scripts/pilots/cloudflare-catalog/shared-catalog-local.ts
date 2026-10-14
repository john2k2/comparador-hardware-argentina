// Una lectura compartida acredita publicaciones; no sanea su asociación al catálogo.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getCompraGamerCatalog, getCompraGamerSubcategoryMap, getCompraGamerBrandMap } from '@/lib/scrapers/compragamer-catalog';
import { mapCompraGamerProduct } from '@/lib/scrapers/compragamer-mapper';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { sourceHttpMetrics } from '@/lib/scrapers/source-http';
import type { Product, HardwareCategory } from '@/lib/types';

type Observation = {reference:string;product:Product};
export function stageSharedObservations(db:DatabaseSync,observations:Observation[],{now=Date.now(),storeId='compragamer'}={}) {
  if(db.isTransaction||storeId!=='compragamer'||observations.length>20000)throw new Error('SHARED_LOCAL_INPUT');
  const unique=new Map<string,Observation>();
  for(const observation of observations) {
    const offer=observation.product.prices[0],at=offer?.lastUpdated.valueOf();
    if(!offer||offer.storeId!==storeId||!Number.isFinite(at)||at>now||at<now-86400000
      ||listingReference(storeId,offer.url)!==observation.reference||!Number.isFinite(offer.price)||offer.price<=0
      ||unique.has(observation.reference))throw new Error('SHARED_LOCAL_SOURCE');
    unique.set(observation.reference,observation);
  }
  const rows=db.prepare('SELECT pp.*,p.row_json product_json,p.category FROM product_prices pp JOIN products p ON p.id=pp.product_id WHERE pp.store_id=?').all(storeId) as Array<{id:string;url:string;product_json:string;category:HardwareCategory}>;
  const outcomes:Record<string,number>={},categories:Record<string,number>={};
  const matched:Array<{offerId:string;reference:string;status:string}>=[];
  for(const row of rows) {
    const reference=listingReference(storeId,row.url),observation=reference?unique.get(reference):undefined;
    const target=JSON.parse(row.product_json);
    const status=!observation?'not-in-response':observation.product.category!==row.category?'category-mismatch'
      :hasExplicitIdentityConflict({name:target.name,category:row.category,offerText:observation.product.name})?'identity-conflict'
      :proveOfferAttributes(target.name,row.category,observation.product.name)?'exact-attributes':'needs-variant-proof';
    outcomes[status]=(outcomes[status]??0)+1;matched.push({offerId:row.id,reference:reference??'',status});
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS pilot_listing_observations(reference TEXT PRIMARY KEY,store_id TEXT NOT NULL,observed_at TEXT NOT NULL,source_hash TEXT NOT NULL,row_json TEXT NOT NULL);`);
    const put=db.prepare('INSERT INTO pilot_listing_observations VALUES(?,?,?,?,?) ON CONFLICT(reference) DO UPDATE SET observed_at=excluded.observed_at,source_hash=excluded.source_hash,row_json=excluded.row_json WHERE excluded.observed_at>pilot_listing_observations.observed_at');
    let writes=0;
    for(const observation of unique.values()) {
      const product=observation.product,json=JSON.stringify(product);
      writes+=Number(put.run(observation.reference,storeId,product.prices[0].lastUpdated.toISOString(),createHash('sha256').update(json).digest('hex'),json).changes);
      categories[product.category]=(categories[product.category]??0)+1;
    }
    db.exec('COMMIT');
    return {localOnly:true,storeId,sourceListings:unique.size,catalogOffers:rows.length,stagedWrites:writes,categories,outcomes,matched,
      rawOffersChanged:0,remoteWrites:0,note:'Not-in-response no prueba agotamiento. La tabla privada no vuelve comparables las asociaciones sin prueba.'};
  }catch(error){db.exec('ROLLBACK');throw error;}
}

export async function readAndStageCompraGamer(db:DatabaseSync) {
  const before=sourceHttpMetrics();
  const catalog=await getCompraGamerCatalog(AbortSignal.timeout(25000));
  const subcategoryMap=await getCompraGamerSubcategoryMap(AbortSignal.timeout(25000));
  const brandMap=await getCompraGamerBrandMap(AbortSignal.timeout(25000));
  const observations:Observation[]=[];
  for(const item of catalog) {
    const product=mapCompraGamerProduct({item,subcategoryMap,brandMap});
    if(product)observations.push({reference:listingReference('compragamer',product.prices[0].url)!,product});
  }
  const staged=stageSharedObservations(db,observations);
  const after=sourceHttpMetrics().compragamer;
  return {...staged,sourceRecords:catalog.length,unmappedOrRestricted:catalog.length-observations.length,
    sourceHttp:{requests:(after?.requests??0)-(before.compragamer?.requests??0),bytes:(after?.bytes??0)-(before.compragamer?.bytes??0)}};
}

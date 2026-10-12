// Admisión local de observaciones ya capturadas: no invoca lectores ni cambia fuentes.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import { shareExactProductVariant } from '@/lib/persistence/product-detail-offers';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import { listingReference, sourceIdentityMatchesListing } from '@/lib/scrapers/listing-reference';
import type { DbProductRow } from '@/lib/persistence/product-read-types';

type Row = { id: string; product_id: string; store_id: string; price: number; url: string; row_json: string };
type RawOffer = NonNullable<DbProductRow['product_prices']>[number] & { id: string; product_id: string };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function tableHash(db: DatabaseSync, table: 'products' | 'product_prices' | 'pilot_offer_observations') {
  const h=createHash('sha256');
  const order=table==='pilot_offer_observations'?'offer_id,observed_at':'id';
  for(const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all())h.update(JSON.stringify(row)+'\n');
  return h.digest('hex');
}
function publicHashes(db: DatabaseSync) { return { products:tableHash(db,'products'), product_prices:tableHash(db,'product_prices') }; }
function validRow(row: Row, raw: RawOffer) {
  return raw.id===row.id && raw.product_id===row.product_id && raw.store_id===row.store_id
    && Number.isFinite(Number(raw.price)) && Number(raw.price)===row.price && raw.url===row.url;
}
function product(db: DatabaseSync, id: string): DbProductRow | null {
  const row=db.prepare('SELECT id,category,row_json FROM products WHERE id=?').get(id);
  if(!row)return null;
  const raw=JSON.parse(String(row.row_json)) as DbProductRow;
  if(raw.id!==row.id||raw.category!==row.category)throw new Error('MAC_ADMISSION_PRODUCT_COLUMNS_INVALID');
  return raw;
}
export type MacAdmissionChange = { offerId:string; productId:string; storeId:string; listingRef:string;
  observedAt:string; previousObservedAt:string|null; beforeHash:string; afterHash:string; before:RawOffer; after:RawOffer; afterRowJson:string };
export type MacAdmissionDecision = { offerId:string; sampleProductId:string; fullProductId:string|null;
  reason:string; sampleObservedAt:string|null; fullObservedAt:string|null; lastAttemptError:string|null };

/** El plan lee ambos SQLite con snapshots transaccionales. Un intento o timestamp
 * de catálogo no cuenta: exige el evento de observación cuyo contenido coincide
 * exactamente con la oferta actual y cuya fecha supera la fecha real del full.
 */
export function planMacObservationAdmission(fullSource:string,sampleSource:string,{now=Date.now()}={}) {
  const full=new DatabaseSync(resolve(fullSource),{readOnly:true}),sample=new DatabaseSync(resolve(sampleSource),{readOnly:true});
  const changes:MacAdmissionChange[]=[],decisions:MacAdmissionDecision[]=[];
  try {
    if(!Number.isSafeInteger(now)||now<0)throw new Error('MAC_ADMISSION_CLOCK_INVALID');
    full.exec('BEGIN');sample.exec('BEGIN');
    const fullHashes=publicHashes(full),sampleHashes={...publicHashes(sample),observations:tableHash(sample,'pilot_offer_observations')};
    const rows=sample.prepare('SELECT * FROM product_prices ORDER BY id').all() as unknown as Row[];
    const queueExists=Boolean(sample.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='pilot_refresh_demand'").get());
    for(const row of rows) {
      const raw=JSON.parse(row.row_json) as RawOffer,before=full.prepare('SELECT * FROM product_prices WHERE id=?').get(row.id) as unknown as Row|undefined;
      const old=before?JSON.parse(before.row_json) as RawOffer:null;
      const decision:MacAdmissionDecision={offerId:row.id,sampleProductId:row.product_id,fullProductId:before?.product_id??null,
        reason:'accepted',sampleObservedAt:raw.last_updated??null,fullObservedAt:old?.last_updated??null,
        lastAttemptError:queueExists?String(sample.prepare('SELECT last_error FROM pilot_refresh_demand WHERE offer_id=?').get(row.id)?.last_error??'')||null:null};
      const reject=(reason:string)=>{decision.reason=reason;decisions.push(decision);};
      if(!validRow(row,raw)||before&&old&&!validRow(before,old)){reject('offer-columns-invalid');continue;}
      if(row.store_id==='fullh4rd'){reject('store-deferred');continue;}
      if(!before||!old){reject('offer-id-outside-full');continue;}
      if(row.store_id!==before.store_id){reject('store-conflict');continue;}
      const reference=listingReference(row.store_id,row.url);
      if(!reference||reference!==listingReference(before.store_id,before.url)){reject('listing-conflict');continue;}
      // No transportar asociaciones por identidad heredada ni por similitud.
      if(row.product_id!==before.product_id){reject('association-changed-quarantine');continue;}
      const date=raw.last_updated?Date.parse(raw.last_updated):NaN,previous=old.last_updated?Date.parse(old.last_updated):NaN;
      if(!Number.isFinite(date)||date<=0||date>now+60000){reject('observation-date-invalid');continue;}
      if(old.last_updated&&!Number.isFinite(previous)){reject('full-observation-date-invalid');continue;}
      if(Number.isFinite(previous)&&date<=previous){reject('no-new-observation-date');continue;}
      const observed=sample.prepare('SELECT row_json FROM pilot_offer_observations WHERE offer_id=? AND observed_at=?').get(row.id,raw.last_updated);
      if(!observed||observed.row_json!==row.row_json){reject('observation-event-unproven');continue;}
      const originalProduct=product(full,before.product_id),sampleProduct=product(sample,row.product_id);
      if(!originalProduct||!sampleProduct){reject('product-missing');continue;}
      const target=mapDbGuideProduct({...originalProduct,product_prices:[]}),candidateProduct=mapDbGuideProduct({...sampleProduct,product_prices:[]});
      if(!shareExactProductVariant(target,candidateProduct)||!shareExactProductVariant(candidateProduct,target)){reject('product-variant-unproven');continue;}
      const candidate=mapDbGuideProduct({...originalProduct,product_prices:[raw]}).prices[0];
      if(!candidate||!candidate.sourceIdentity||!sourceIdentityMatchesListing(row.store_id,row.url,candidate.sourceIdentity)
        ||needsIdentityReview(candidate,target)){reject('source-identity-unproven');continue;}
      const targetSku=Object.entries(target.specs).find(([key])=>key.trim().toLowerCase()==='sku')?.[1];
      if(targetSku&&candidate.sourceIdentity.storeSku&&targetSku.trim().toUpperCase()!==candidate.sourceIdentity.storeSku.trim().toUpperCase()){reject('source-sku-conflict');continue;}
      changes.push({offerId:row.id,productId:before.product_id,storeId:before.store_id,listingRef:reference,
        observedAt:raw.last_updated!,previousObservedAt:old.last_updated??null,beforeHash:hash(before),afterHash:hash(row),before:old,after:raw,afterRowJson:row.row_json});
      decisions.push(decision);
    }
    const reasons:Record<string,number>={};for(const decision of decisions)reasons[decision.reason]=(reasons[decision.reason]??0)+1;
    return {version:1,fullSource:resolve(fullSource),sampleSource:resolve(sampleSource),capturedAt:new Date(now).toISOString(),
      denominator:rows.length,accepted:changes.length,rejected:rows.length-changes.length,reasons,
      sourceHashes:{full:fullHashes,sample:sampleHashes},changes,decisions,localOnly:true,requiresEvidenceCertification:true,productionActivated:false};
  } finally {sample.close();full.close();}
}

/** Copia consistente del full; no publica ni recalcula QC/bases. El coordinador
 * debe normalizar y certificar esta copia antes de usarla en un loader.
 */
export function admitMacObservations(fullSource:string,sampleSource:string,target:string,{now=Date.now()}={}) {
  target=resolve(target);
  if(target===resolve(fullSource)||target===resolve(sampleSource)||existsSync(target))throw new Error('MAC_ADMISSION_NEW_COPY_REQUIRED');
  const plan=planMacObservationAdmission(fullSource,sampleSource,{now});
  const source=new DatabaseSync(resolve(fullSource),{readOnly:true});
  try {source.prepare('VACUUM INTO ?').run(target);}finally{source.close();}
  const db=new DatabaseSync(target);
  try {
    db.prepare("DELETE FROM pilot_meta WHERE key='production_catalog'").run();
    if(JSON.stringify(publicHashes(db))!==JSON.stringify(plan.sourceHashes.full))throw new Error('MAC_ADMISSION_SOURCE_CHANGED');
    db.exec('BEGIN IMMEDIATE');
    try {
      const write=db.prepare('UPDATE product_prices SET price=?,url=?,row_json=? WHERE id=? AND product_id=? AND store_id=? AND row_json=?');
      for(const change of plan.changes) {
        const before=db.prepare('SELECT * FROM product_prices WHERE id=?').get(change.offerId);
        if(hash(before)!==change.beforeHash)throw new Error('MAC_ADMISSION_ROW_CHANGED');
        const next=change.afterRowJson;
        if(write.run(Number(change.after.price),change.after.url,next,change.offerId,change.productId,change.storeId,String(before!.row_json)).changes!==1)
          throw new Error('MAC_ADMISSION_WRITE_CONFLICT');
        db.prepare('INSERT OR IGNORE INTO pilot_offer_observations VALUES(?,?,?)').run(change.offerId,change.observedAt,next);
        if(db.prepare('SELECT row_json FROM pilot_offer_observations WHERE offer_id=? AND observed_at=?').get(change.offerId,change.observedAt)?.row_json!==next)
          throw new Error('MAC_ADMISSION_HISTORY_CONFLICT');
      }
      if(tableHash(db,'products')!==plan.sourceHashes.full.products)throw new Error('MAC_ADMISSION_PRODUCTS_CHANGED');
      db.exec('COMMIT');return {...plan,target,targetHashes:publicHashes(db)};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
}

// Normalización de controlplane en una copia nueva. No observa comercios ni activa producción.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { mapDbGuideProduct } from '@/lib/persistence/product-read-mapper';
import { computeComparableStorePriceStats, isComparableStoreOffer, pickBestStorePrices } from '@/lib/price-utils';
import { needsIdentityReview } from '@/lib/quality/offer-identity';
import type { DbProductRow } from '@/lib/persistence/product-read-types';
import type { ProductPrice } from '@/lib/types';

type RawOffer = NonNullable<DbProductRow['product_prices']>[number] & { id: string; product_id: string };
type Projection = (db: DatabaseSync, options: { now: number; generation: string }) => unknown;
const digestOffers = (db: DatabaseSync) => {
  const hash = createHash('sha256');
  for (const row of db.prepare('SELECT * FROM product_prices ORDER BY id').all()) hash.update(JSON.stringify(row)+'\n');
  return hash.digest('hex');
};
function key(offer: { storeId: string; url: string; price: number; lastUpdated: Date }) {
  return JSON.stringify([offer.storeId,offer.url,offer.price,offer.lastUpdated.toISOString()]);
}

/** Sólo acepta un destino inexistente; las ofertas originales permanecen bit a bit.
 * `now` debe coincidir con el reloj de las funciones compartidas de QC. El recibo
 * limita la evidencia hasta la siguiente transición; no autoriza servir eternamente
 * un resumen histórico cuya selección por tienda depende de la frescura.
 */
export function certifyProductEvidence(source: string, target: string,
  options: { now: number; generation: string; rebuildProjection: Projection }) {
  source=resolve(source);target=resolve(target);
  if(source===target||existsSync(target)) throw new Error('CATALOG_QC_NEW_COPY_REQUIRED');
  if(!Number.isSafeInteger(options.now)||Math.abs(options.now-Date.now())>1000||!options.generation
    ||typeof options.rebuildProjection!=='function') throw new Error('CATALOG_QC_CLOCK_OR_PROJECTION_INVALID');
  const original=new DatabaseSync(source,{readOnly:true});
  let beforeHash: string;
  try { beforeHash=digestOffers(original); original.prepare('VACUUM INTO ?').run(target); } finally { original.close(); }
  const db=new DatabaseSync(target);
  // Incluso una copia que falle después no hereda la activación del origen.
  db.prepare("DELETE FROM pilot_meta WHERE key='production_catalog'").run();
  const report={source,target,observedAt:new Date(options.now).toISOString(),products:0,offers:0,
    retainedOffers:0,pendingOffers:0,currentBasis:0,historicalBasis:0,productsWithoutComparable:0,
    changedProductStatistics:0,missingSummaryRepaired:0,missingSummaryWithOffers:0,offersSha256:beforeHash,validUntil:'9999-12-31T23:59:59.999Z',
    localOnly:true,productionActivated:false};
  db.exec('BEGIN IMMEDIATE');
  try {
    const rawByProduct=new Map<string,RawOffer[]>();
    for(const row of db.prepare('SELECT * FROM product_prices ORDER BY price,store_id,url,id').all()) {
      const raw=JSON.parse(String(row.row_json));
      if(raw.id!==row.id||raw.product_id!==row.product_id||raw.store_id!==row.store_id
        ||Number(raw.price)!==row.price||raw.url!==row.url)throw new Error('CATALOG_QC_OFFER_COLUMNS_INVALID');
      const rows=rawByProduct.get(String(row.product_id))??[];rows.push(JSON.parse(String(row.row_json)));rawByProduct.set(String(row.product_id),rows);report.offers++;
    }
    db.exec('DELETE FROM price_basis');
    const basis=db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)');
    const summaryIds=new Set(db.prepare('SELECT product_id FROM summaries').all().map(row=>String(row.product_id)));
    const summary=db.prepare(`INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,'{}')
      ON CONFLICT(product_id) DO UPDATE SET lowest=excluded.lowest,highest=excluded.highest,average=excluded.average,
      available=excluded.available,urls=excluded.urls,portable_listing=excluded.portable_listing,store_ids_json=excluded.store_ids_json,
      comparable_stats_json=NULL,comparable_valid_until=NULL,comparable_latest_observed_at=excluded.comparable_latest_observed_at`);
    const update=db.prepare('UPDATE products SET row_json=? WHERE id=?');
    for(const stored of db.prepare('SELECT id,category,row_json FROM products ORDER BY id').all()) {
      const raw=JSON.parse(String(stored.row_json)) as DbProductRow;
      if(raw.id!==stored.id||raw.category!==stored.category)throw new Error('CATALOG_QC_PRODUCT_COLUMNS_INVALID');
      const rows=rawByProduct.get(String(stored.id))??[],product=mapDbGuideProduct({...raw,product_prices:rows});report.products++;
      report.retainedOffers+=product.prices.length;
      const originals=new Map<string,RawOffer[]>();
      for(const row of rows) {
        const stamp=row.last_updated&&Number.isFinite(Date.parse(row.last_updated))?new Date(row.last_updated):new Date(0);
        const k=key({storeId:row.store_id,url:(row.url??'').trim(),price:Number(row.price),lastUpdated:stamp});
        const list=originals.get(k)??[];list.push(row);originals.set(k,list);
      }
      const rawByOffer=new Map<ProductPrice,RawOffer>();
      for(const offer of product.prices) {
        const original=originals.get(key(offer))?.shift();if(!original) throw new Error('CATALOG_QC_OFFER_BINDING_FAILED');
        rawByOffer.set(offer,original);
        report.pendingOffers+=Number(needsIdentityReview(offer,product));
      }
      const candidates=product.prices.filter(offer=>!needsIdentityReview(offer,product));
      const historical=pickBestStorePrices(candidates,options.now);
      // La base vigente se filtra por fecha en SQL. Sólo limita esta copia una
      // transición que cambia el representante histórico de alguna tienda.
      // Una oferta única o pendiente no vence resúmenes ajenos al expirar.
      const storeCounts=new Map<string,number>();
      for(const offer of candidates)storeCounts.set(offer.storeId.toLowerCase(),(storeCounts.get(offer.storeId.toLowerCase())??0)+1);
      const events=[...new Set(candidates.filter(offer=>(storeCounts.get(offer.storeId.toLowerCase())??0)>1)
        .flatMap(offer=>[offer.lastUpdated.getTime()-60000,offer.lastUpdated.getTime()+86400000+1]))]
        .filter(time=>time>options.now).sort((a,b)=>a-b);
      for(const time of events) {
        const after=pickBestStorePrices(candidates,time);
        if(after.length!==historical.length||after.some((offer,i)=>offer!==historical[i])) {
          report.validUntil=new Date(Math.min(Date.parse(report.validUntil),time)).toISOString();break;
        }
      }
      const current=product.prices.filter(offer=>isComparableStoreOffer(offer,product));
      for(const [kind,offers] of [['historical',historical],['current',current]] as const) for(const offer of offers) {
        const original=rawByOffer.get(offer)!;
        basis.run(stored.id,kind,original.id,original.store_id,offer.price,offer.stock,offer.url,offer.lastUpdated.toISOString());
        if(kind==='historical')report.historicalBasis++;else report.currentBasis++;
      }
      const stats=computeComparableStorePriceStats(product.prices,product);
      report.productsWithoutComparable+=Number(stats.comparablePrices.length===0);
      const latest=current.reduce<string|null>((prior,o)=>!prior||o.lastUpdated.toISOString()>prior?o.lastUpdated.toISOString():prior,null);
      // URLs mantienen referencias de búsqueda históricas revisadas; stock desconocido
      // sigue siendo histórico y no entra en currentBasis.
      if(!summaryIds.has(String(stored.id))){report.missingSummaryRepaired++;report.missingSummaryWithOffers+=Number(rows.length>0);}
      if(summary.run(stored.id,stats.lowest,stats.highest,stats.average,historical.filter(o=>o.stock!=='out-of-stock').length,
        historical.map(o=>o.url).join(' '),0,JSON.stringify([...new Set(rows.map(o=>o.store_id))].sort()),latest).changes!==1)
        throw new Error('CATALOG_QC_SUMMARY_MISSING');
      const next={...raw,lowest_price:stats.comparablePrices.length ? product.lowestPrice : 0,
        highest_price:stats.comparablePrices.length ? product.highestPrice : 0,average_price:stats.comparablePrices.length ? product.averagePrice : 0};
      if(raw.lowest_price!==next.lowest_price||raw.highest_price!==next.highest_price||raw.average_price!==next.average_price){
        update.run(JSON.stringify(next),stored.id);report.changedProductStatistics++;
      }
    }
    options.rebuildProjection(db,{now:options.now,generation:options.generation});
    if(digestOffers(db)!==beforeHash)throw new Error('CATALOG_QC_OFFERS_CHANGED');
    if(Date.now()>=Date.parse(report.validUntil))throw new Error('CATALOG_QC_CLOCK_TRANSITION_DURING_COPY');
    db.exec('COMMIT');return report;
  } catch(error) { db.exec('ROLLBACK');throw error; } finally { db.close(); }
}

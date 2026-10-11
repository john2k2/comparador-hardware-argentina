// Adaptador concreto de reparación privada; no observa precios ni llama la red.
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as cheerio from 'cheerio';
import { exactOfferAttributes, proveOfferAttributes } from '@/lib/quality/offer-attribute-proof';
import { hasExplicitIdentityConflict } from '@/lib/quality/offer-identity';
import { listingReference } from '@/lib/scrapers/listing-reference';
import { computeComparablePriceStats } from '@/lib/price-utils';
type Context={now:number;generation:string;affectedProductIds:string[];excludedOfferIds:string[]};
type ProjectionResult={cache:{version:number;generation:string;validFrom:string;validUntil:string};changedProjectionRows:number};

export function associationSqliteDependencies({artifacts,projection}:{artifacts:Map<string,string>;projection:(db:DatabaseSync,options:{now:number;generation:string;affectedProductIds:string[]})=>ProjectionResult}) {
  let rebuilt:ProjectionResult|undefined;
  return {exactOfferAttributes,proveOfferAttributes,hasExplicitIdentityConflict,listingReference,
    verifyEvidence(evidence:{url:string;contentSha256:string},{offerId,sourceTitle,storeId}:{offerId:string;sourceTitle:string;storeId:string}) {
      const path=artifacts.get(offerId);
      if(!path||!statSync(path).isFile()||statSync(path).size>8000000)return false;
      const bytes=readFileSync(path);
      if(createHash('sha256').update(bytes).digest('hex')!==evidence.contentSha256)return false;
      const $=cheerio.load(bytes.toString('utf8'));
      const titles=$('h1').map((_,element)=>$(element).text().replace(/\s+/g,' ').trim()).get().filter(Boolean);
      if(titles.length!==1||titles[0]!==sourceTitle)return false;
      const canonical=$('link[rel="canonical"]').attr('href');
      if(canonical) {
        if(listingReference(storeId,canonical)!==listingReference(storeId,evidence.url))return false;
      }
      return true;
    },
    rebuildSummaries(db:DatabaseSync,context:Context) {
      let count=0;
      for(const id of context.affectedProductIds) {
        const rows=db.prepare("SELECT * FROM price_basis WHERE product_id=? AND kind='historical' AND price>0 ORDER BY price,observed_at DESC,id").all(id) as Array<{id:string;store_id:string;price:number;stock:string;url:string}>;
        const perStore=new Map<string,typeof rows[number]>();
        for(const row of rows) {
          if(context.excludedOfferIds.includes(row.id))throw new Error('ASSOCIATION_EXCLUDED_BASIS');
          const existing=perStore.get(row.store_id);
          if(!existing||existing.stock==='out-of-stock'&&row.stock!=='out-of-stock')perStore.set(row.store_id,row);
        }
        const best=[...perStore.values()],available=best.filter(row=>row.stock!=='out-of-stock');
        const stats=computeComparablePriceStats(available.length?available:best);
        const current=db.prepare("SELECT MAX(observed_at) latest FROM price_basis WHERE product_id=? AND kind='current'").get(id)?.latest??null;
        const stores=db.prepare('SELECT DISTINCT store_id FROM product_prices WHERE product_id=? ORDER BY store_id').all(id).map(row=>row.store_id);
        db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,stats.lowest,stats.highest,stats.average,available.length,best.map(row=>row.url).join(' '),0,JSON.stringify(stores),null,null,current,'{}');
        count++;
      }
      return {rebuilt:count,excludedOfferIds:context.excludedOfferIds};
    },
    rebuildProjection(db:DatabaseSync,context:Context) {
      rebuilt=projection(db,{now:context.now,generation:context.generation,affectedProductIds:context.affectedProductIds});
      return {changedProjectionRows:rebuilt.changedProjectionRows};
    },
    createCacheSnapshot(){if(!rebuilt)throw new Error('ASSOCIATION_PROJECTION_REQUIRED');return rebuilt.cache;},
  };
}

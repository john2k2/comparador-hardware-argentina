// Reservar TODO el lote antes de leer una fuente compartida conserva su hora real.
import { DatabaseSync } from 'node:sqlite';
import { claimRefreshBatch, acknowledgeRefresh } from './refresh-demand.mjs';
import { createLocalOfferReader, reviewLocalObservation, persistLocalObservation, canRefreshLocalTarget } from './refresh-local';
import { sourceHttpMetrics, SourceHttpError } from '@/lib/scrapers/source-http';
import type { HardwareCategory } from '@/lib/types';
type Dependencies=Parameters<typeof persistLocalObservation>[3];
export async function runSharedRefresh(db:DatabaseSync,dependencies:Dependencies,{limit=25,productIds,offerIds,clock=Date.now,reader=createLocalOfferReader()}:{limit?:number;productIds?:string[];offerIds?:string[];clock?:()=>number;reader?:ReturnType<typeof createLocalOfferReader>}={}) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw new Error('SHARED_LOCAL_LIMIT');
  const beforeHttp=sourceHttpMetrics();
  const leases=claimRefreshBatch(db,{now:clock(),limit,storeIds:['compragamer'],productIds,offerIds});
  const results=[];
  let sharedFailure:SourceHttpError|undefined;
  for(const lease of leases) {
    try {
      const row=db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId) as {row_json:string;category:HardwareCategory};
      const product={...JSON.parse(row.row_json),category:row.category};
      if(!canRefreshLocalTarget(lease.storeId,lease.url,product.category,product.name))throw new Error('REFRESH_LOCAL_IDENTITY');
      if(sharedFailure)throw sharedFailure;
      const source=await reader(lease.storeId,lease.url,product.category,AbortSignal.timeout(25000),
        {observedAfter:Math.max(...leases.map(item=>item.leasedAt))});
      if(!source)throw new Error('REFRESH_LOCAL_NO_OBSERVATION');
      const price=reviewLocalObservation(product,lease,source,clock());
      const receipt=persistLocalObservation(db,lease,price,dependencies,clock());
      results.push({offerId:lease.offerId,productId:lease.productId,status:'observed',price:price.price,stock:price.stock,...receipt});
    }catch(error) {
      if(error instanceof SourceHttpError)sharedFailure=error;
      const code=error instanceof Error?error.message:'SHARED_LOCAL_FAILED';
      const outcome=error instanceof SourceHttpError?(error.reason==='rate-limited'?'http-429':error.reason==='blocked'?'http-403':'http-error'):code==='REFRESH_LOCAL_IDENTITY'?'identity-mismatch':code==='REFRESH_LOCAL_NO_OBSERVATION'?'no-observation':'persistence-error';
      acknowledgeRefresh(db,{...lease,now:clock(),outcome,retryAfterMs:6*3600000});
      results.push({offerId:lease.offerId,productId:lease.productId,status:'failed',code:/^[A-Z_]+$/.test(code)?code:'SHARED_LOCAL_FAILED'});
    }
  }
  const after=sourceHttpMetrics().compragamer;
  return {localOnly:true,attempted:leases.length,observed:results.filter(row=>row.status==='observed').length,results,
    sourceHttp:{requests:(after?.requests??0)-(beforeHttp.compragamer?.requests??0),bytes:(after?.bytes??0)-(beforeHttp.compragamer?.bytes??0)}};
}

// Barrido privado: reservar todas las ofertas antes de una captura compartida.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { initializeRefreshDemand, claimRefreshBatch, acknowledgeRefresh } from './refresh-demand.mjs';
import { createLocalOfferReader, canRefreshLocalTarget, reviewLocalObservation, persistLocalObservation } from './refresh-local';
import { sourceHttpMetrics, SourceHttpError } from '@/lib/scrapers/source-http';
import type { HardwareCategory } from '@/lib/types';
type Dependencies=Parameters<typeof persistLocalObservation>[3];
type Reader=ReturnType<typeof createLocalOfferReader>;
const schema=`CREATE TABLE IF NOT EXISTS pilot_sweep_guard(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT,until_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pilot_sweep_runs(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,finished_at INTEGER,status TEXT NOT NULL,report_json TEXT);`;
const message=(error:unknown)=>error instanceof Error && /^[A-Z_]+(?:[:][0-9/]+)?$/.test(error.message)?error.message:'SWEEP_LOCAL_FAILED';
/** Destinos existentes explícitos. Guard durable impide dos barridos sobre la
 * misma copia; daily-budget mantiene el límite de escrituras en persistencia.
 * Cada lookup usa el mismo observedAfter posterior a TODOS los leases. El reader
 * CompraGamer conocido realiza como máximo tres requests por lookup, sin redirects.
 */
export async function runLocalSweep(db:DatabaseSync,dependencies:Dependencies,
  {offerIds,limit=500,maxHttp=10,leaseMs=5*60000,clock=Date.now,reader=createLocalOfferReader(),httpMetrics=sourceHttpMetrics}:
  {offerIds:string[];limit?:number;maxHttp?:number;leaseMs?:number;clock?:()=>number;reader?:Reader;httpMetrics?:typeof sourceHttpMetrics}) {
  if(!Array.isArray(offerIds)||offerIds.length>500||offerIds.some(id=>typeof id!=='string'||!id||id.length>200)
    ||new Set(offerIds).size!==offerIds.length||!Number.isSafeInteger(limit)||limit<1||limit>500
    ||!Number.isSafeInteger(maxHttp)||maxHttp<3||maxHttp>10||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>5*60000)
    throw new Error('SWEEP_LOCAL_LIMIT');
  if(db.isTransaction)throw new Error('SWEEP_LOCAL_TRANSACTION');
  initializeRefreshDemand(db);db.exec(schema);
  const start=clock(),deadline=start+leaseMs,token=randomUUID(),beforeHttp=httpMetrics().compragamer;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(deadline))throw new Error('SWEEP_CLOCK_INVALID');
  const spent=()=>{const m=httpMetrics().compragamer;return{requests:(m?.requests??0)-(beforeHttp?.requests??0),bytes:(m?.bytes??0)-(beforeHttp?.bytes??0)};};
  db.exec('BEGIN IMMEDIATE');
  try{
    const guard=db.prepare('SELECT * FROM pilot_sweep_guard WHERE id=1').get();
    if(guard&&Number(guard.until_at)>start){db.exec('ROLLBACK');return{localOnly:true,status:'already-running',reserved:0,attempted:0,observed:0,comparable:0,results:[],sourceHttp:{requests:0,bytes:0}};}
    db.prepare('INSERT OR REPLACE INTO pilot_sweep_guard VALUES(1,?,?)').run(token,deadline);
    db.prepare('INSERT INTO pilot_sweep_runs VALUES(?,?,NULL,?,NULL)').run(token,start,'running');db.exec('COMMIT');
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  const leases:Array<ReturnType<typeof claimRefreshBatch>[number]>=[],results:Array<Record<string,unknown>>=[];
  let stop:string|null=null,sharedFailure:unknown,fatal=false,attempted=0;
  const progress=()=>db.prepare('UPDATE pilot_sweep_runs SET report_json=? WHERE id=?').run(JSON.stringify({reserved:leases.length,observed:results.filter(r=>r.status==='observed').length,sourceHttp:spent()}),token);
  const defer=(lease:typeof leases[number],code:string)=>{
    // Sólo liberar nuestra reserva viva. Nunca tocar otro lease ni backoff activo.
    db.prepare(`UPDATE pilot_refresh_demand SET status='pending',lease_token=NULL,leased_at=NULL,lease_until=NULL
      WHERE offer_id=? AND status='leased' AND lease_token=? AND lease_until>?`).run(lease.offerId,lease.leaseToken,clock());
    results.push({offerId:lease.offerId,productId:lease.productId,status:'deferred',code});
  };
  try{
    for(let offset=0;offset<offerIds.length&&leases.length<limit;offset+=100){
      const ids=offerIds.slice(offset,offset+100);
      while(leases.length<limit&&clock()<deadline){
        const batch=claimRefreshBatch(db,{now:clock(),limit:Math.min(25,limit-leases.length),leaseMs:Math.min(leaseMs,Math.max(1000,deadline-clock())),storeIds:['compragamer'],offerIds:ids});
        if(!batch.length)break;leases.push(...batch);
      }
    }
    progress();
    const observedAfter=Math.max(start,...leases.map(l=>l.leasedAt));
    for(const lease of leases){
      const time=clock();
      if(stop||time>=deadline||time>=lease.leaseUntil){defer(lease,stop??'SWEEP_LEASE_DEADLINE');stop??='SWEEP_LEASE_DEADLINE';continue;}
      if(!sharedFailure&&spent().requests+3>maxHttp){stop='SWEEP_HTTP_BUDGET';defer(lease,stop);continue;}
      attempted++;
      try{
        const stored=db.prepare('SELECT row_json,category FROM products WHERE id=?').get(lease.productId);
        if(!stored)throw new Error('REFRESH_LOCAL_IDENTITY');
        const product={...JSON.parse(String(stored.row_json)),category:stored.category as HardwareCategory};
        if(!canRefreshLocalTarget(lease.storeId,lease.url,product.category,product.name,product.specs))throw new Error('REFRESH_LOCAL_IDENTITY');
        if(sharedFailure)throw sharedFailure;
        const source=await reader(lease.storeId,lease.url,product.category,AbortSignal.timeout(Math.min(25000,deadline-time)),{observedAfter});
        if(spent().requests>maxHttp)throw new Error('SWEEP_HTTP_CONTRACT_VIOLATION');
        if(clock()>=deadline)throw new Error('SWEEP_LEASE_DEADLINE');
        if(!source)throw new Error('REFRESH_LOCAL_NO_OBSERVATION');
        const price=reviewLocalObservation(product,lease,source,clock()),receipt=persistLocalObservation(db,lease,price,{...dependencies,clock},clock());
        results.push({offerId:lease.offerId,productId:lease.productId,status:'observed',price:price.price,stock:price.stock,...receipt});
      }catch(error){
        if(error instanceof SourceHttpError||(httpMetrics().compragamer?.failures??0)>(beforeHttp?.failures??0)&&spent().requests>0
          &&error instanceof Error&&['TypeError','TimeoutError','AbortError'].includes(error.name))sharedFailure=error;
        const code=message(error)==='REFRESH_LOCAL_LEASE_CONFLICT'&&clock()>=Math.min(deadline,lease.leaseUntil)
          ?'SWEEP_LEASE_DEADLINE':message(error);
        if(code==='SWEEP_LEASE_DEADLINE'||code==='SWEEP_HTTP_CONTRACT_VIOLATION'||code.startsWith('DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED')){
          stop=code;defer(lease,code);continue;
        }
        const outcome=error instanceof SourceHttpError?(error.reason==='rate-limited'?'http-429':error.reason==='blocked'?'http-403':'http-error')
          :code==='REFRESH_LOCAL_IDENTITY'?'identity-mismatch':code==='REFRESH_LOCAL_NO_OBSERVATION'?'no-observation':'persistence-error';
        if(clock()<lease.leaseUntil)acknowledgeRefresh(db,{...lease,now:clock(),outcome,retryAfterMs:6*3600000});
        results.push({offerId:lease.offerId,productId:lease.productId,status:'failed',code});
      }
      progress();
    }
    return{localOnly:true,status:stop?'bounded-stop':'completed',stop,runId:token,reserved:leases.length,attempted,
      observed:results.filter(r=>r.status==='observed').length,comparable:results.filter(r=>r.status==='observed'&&r.comparable===true).length,
      deferred:results.filter(r=>r.status==='deferred').length,failed:results.filter(r=>r.status==='failed').length,
      baseRowsWritten:results.reduce((n,r)=>n+Number(r.baseRowsWritten??0),0),
      estimatedRowsWritten:results.reduce((n,r)=>n+Number(r.estimatedRowsWritten??0),0),
      budgetKind:'local-estimate',remoteVerified:false,
      results,sourceHttp:spent(),elapsedMs:clock()-start,maxOffers:limit,maxHttp,leaseMs};
  }catch(error){fatal=true;stop=message(error);throw error;}finally{
    for(const lease of leases)if(!results.some(r=>r.offerId===lease.offerId))defer(lease,'SWEEP_ABORTED');
    db.prepare('UPDATE pilot_sweep_runs SET finished_at=?,status=?,report_json=? WHERE id=?').run(clock(),fatal?'failed':stop?'bounded-stop':'finished',JSON.stringify({reserved:leases.length,results,sourceHttp:spent()}),token);
    db.prepare('UPDATE pilot_sweep_guard SET token=NULL,until_at=0 WHERE id=1 AND token=?').run(token);
  }
}

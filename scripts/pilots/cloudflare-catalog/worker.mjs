import { searchCatalog, validateParams } from './engine.mjs';
import { d1Adapter } from './sqlite-adapter.mjs';
import { pilotHtml } from './pilot-ui.mjs';
import { cacheInterval, snapshotInterval, cacheRequest, readCached, writeCached } from './response-cache.mjs';
function reply(data,status=200,headers={}) {return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
export function createWorker({search=searchCatalog,now=()=>Date.now(),cache=()=>globalThis.caches?.default}={}) {
const flights=new Map();
return {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method!=='GET') return reply({error:'METHOD_NOT_ALLOWED'},405,{'Allow':'GET'});
    if(url.pathname==='/') return new Response(pilotHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    if(url.pathname==='/health') {
      try {
        const ready=await d1Adapter(env.CATALOG_DB).first("SELECT value FROM pilot_meta WHERE key='snapshot'");
        return reply({pilot:true,localOnly:true,status:ready?'ready':'snapshot-not-ready'},ready?200:503);
      } catch {return reply({pilot:true,localOnly:true,status:'database-unavailable'},503);}
    }
    if(url.pathname!=='/api/search') return reply({error:'NOT_FOUND'},404);
    const number=(key,fallback)=>url.searchParams.has(key)?Number(url.searchParams.get(key)):fallback;
    let params;
    try { params=validateParams({p_query:url.searchParams.get('q')??'',p_category:url.searchParams.get('category'),p_stores:url.searchParams.getAll('store'),p_min_price:number('minPrice',null),p_max_price:number('maxPrice',null),p_sort:url.searchParams.get('sortBy')??'relevance',p_page:number('page',1),p_page_size:number('pageSize',12)}); }
    catch {return reply({error:'INVALID_SEARCH_PARAMETERS'},400);}
    const started=performance.now();
    try {
      const db=d1Adapter(env.CATALOG_DB,{readReplication:env.CATALOG_READ_REPLICATION==='1'});
      // El marcador se escribe al final de la importación completa; un bootstrap
      // escalonado no puede responder con un catálogo parcialmente cargado.
      const ready=await db.first("SELECT value FROM pilot_meta WHERE key='snapshot'");
      if(!ready) return reply({error:'CATALOG_SNAPSHOT_NOT_READY'},503);
      const evidence=url.searchParams.get('withOfferEvidence')==='1',clock=now(),interval=cacheInterval(ready.value,clock);
      const deadline=snapshotInterval(ready.value,clock)?.validUntil;
      const storage=interval?cache():null,key=interval?await cacheRequest(url,params,evidence,interval.generation):null;
      const headers=status=>({'Server-Timing':`pilot;dur=${(performance.now()-started).toFixed(2)},d1;dur=${db.metrics.sqlDurationMs.toFixed(2)}`,'X-Pilot-D1-Rows-Read':String(db.metrics.rowsRead),'X-Pilot-D1-Queries':String(db.metrics.queries),'X-Pilot-D1-Replica-Queries':String(db.metrics.replicaQueries),'X-Pilot-Cache':status});
      const cached=await readCached(storage,key,interval,now());
      if(cached&&now()<Number(cached.headers.get('X-Pilot-Cache-Expires'))) return new Response(cached.body,{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers('HIT')}});
      const flightKey=storage&&key?key.url:null;
      let task=flightKey?flights.get(flightKey):null;
      const shared=Boolean(task);
      if(!task) {
        task=(async()=>{
          const result=await search(db,params,{now:clock,snapshot:ready.value});
          if(evidence) {
            const ids=JSON.stringify(result.products.map(p=>p.id));
            const current=await db.all("SELECT id,product_id,observed_at FROM price_basis WHERE kind='current' AND product_id IN(SELECT value FROM json_each(?)) AND observed_at BETWEEN ? AND ?",[ids,new Date(clock-86400000).toISOString(),new Date(clock+60000).toISOString()]);
            result.pilotOfferEvidence={source:'snapshot-publico',windowHours:24,currentComparableIds:current.map(o=>o.id),note:'Identidad/stock admitidos por el resumen PostgreSQL del snapshot y fecha vigente. No representa una nueva lectura de la tienda ni valida nuevamente el corte remoto.'};
          }
          // Un cambio de generación durante las lecturas puede mezclar dos
          // cortes. Descartar esa respuesta; jamás guardarla en la caché.
          const after=await db.latestFirst("SELECT value FROM pilot_meta WHERE key='snapshot'");
          if(!after||after.value!==ready.value) {const error=new Error('CATALOG_SNAPSHOT_CHANGED');error.code=error.message;throw error;}
          const body=JSON.stringify(result);
          const stillValid=interval&&now()<interval.expires;
          if(stillValid) await writeCached(storage,key,new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8'}}),interval,now());
          return body;
        })();
        if(flightKey&&flights.size<128) {
          flights.set(flightKey,task);
          // La limpieza incluye errores y no crea una promesa rechazada libre.
          task.then(()=>flights.delete(flightKey),()=>flights.delete(flightKey));
        }
      }
      const body=await task;
      if(deadline!==undefined&&now()>=deadline) return reply({error:'CATALOG_CLOCK_INTERVAL_EXPIRED'},503);
      return new Response(body,{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers(shared?'COALESCED':interval&&storage?'MISS':'BYPASS')}});
    } catch(error) {
      return reply({error:['CATALOG_CANDIDATE_BUDGET_EXCEEDED','CATALOG_SNAPSHOT_CHANGED'].includes(error.code)?error.code:'CATALOG_READ_UNAVAILABLE'},503);
    }
  },
};
}
export default createWorker();

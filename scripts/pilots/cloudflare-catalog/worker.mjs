import { searchCatalog, validateParams } from './engine.mjs';
import { d1Adapter } from './sqlite-adapter.mjs';
import { pilotHtml } from './pilot-ui.mjs';
function reply(data,status=200,headers={}) {return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
export default {
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
    const db=d1Adapter(env.CATALOG_DB),started=performance.now();
    try {
      // El marcador se escribe al final de la importación completa; un bootstrap
      // escalonado no puede responder con un catálogo parcialmente cargado.
      const ready=await db.first("SELECT value FROM pilot_meta WHERE key='snapshot'");
      if(!ready) return reply({error:'CATALOG_SNAPSHOT_NOT_READY'},503);
      const result=await searchCatalog(db,params);
      if(url.searchParams.get('withOfferEvidence')==='1') {
        const now=Date.now(),ids=JSON.stringify(result.products.map(p=>p.id));
        const current=await db.all("SELECT id,product_id,observed_at FROM price_basis WHERE kind='current' AND product_id IN(SELECT value FROM json_each(?)) AND observed_at BETWEEN ? AND ?",[ids,new Date(now-86400000).toISOString(),new Date(now+60000).toISOString()]);
        result.pilotOfferEvidence={source:'snapshot-publico',windowHours:24,currentComparableIds:current.map(o=>o.id),note:'Identidad/stock admitidos por el resumen PostgreSQL del snapshot y fecha vigente. No representa una nueva lectura de la tienda ni valida nuevamente el corte remoto.'};
      }
      return reply(result,200,{'Server-Timing':`pilot;dur=${(performance.now()-started).toFixed(2)},d1;dur=${db.metrics.sqlDurationMs.toFixed(2)}`,'X-Pilot-D1-Rows-Read':String(db.metrics.rowsRead),'X-Pilot-D1-Queries':String(db.metrics.queries)});
    } catch(error) {
      return reply({error:error.code==='CATALOG_CANDIDATE_BUDGET_EXCEEDED'?error.code:'CATALOG_READ_UNAVAILABLE'},503);
    }
  },
};

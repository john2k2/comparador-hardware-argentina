import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {createWorker} from './worker.mjs';
function database(rows=[],error=null) {
  return {prepare(sql){assert.equal(sql,"SELECT value FROM pilot_meta WHERE key='snapshot'");return {bind(...values){assert.deepEqual(values,[]);return {async all(){if(error)throw error;return {success:true,results:rows,meta:{rows_read:rows.length}};}};}};}};
}
test('health sólo confirma disponibilidad cuando existe el marcador del snapshot',async()=>{
  const ready=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database([{value:'verified-snapshot'}])});
  assert.equal(ready.status,200);assert.equal((await ready.json()).status,'ready');
  const empty=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database()});
  assert.equal(empty.status,503);assert.equal((await empty.json()).status,'snapshot-not-ready');
  const broken=await worker.fetch(new Request('http://localhost/health'),{CATALOG_DB:database([],new Error('table missing'))});
  assert.equal(broken.status,503);assert.equal((await broken.json()).status,'database-unavailable');
});
test('métodos, rutas y parámetros inválidos se rechazan antes de leer D1',async()=>{
  const env={CATALOG_DB:{prepare(){assert.fail('D1 must not be accessed');}}};
  assert.equal((await worker.fetch(new Request('http://localhost/api/search',{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request('http://localhost/unknown'),env)).status,404);
  assert.equal((await worker.fetch(new Request('http://localhost/api/search?pageSize=49'),env)).status,400);
});
const initial=Date.parse('2026-10-11T12:00:00Z');
function fixture({end=initial+120000}={}) {
  const state={clock:initial,generation:'g1',end,reads:0,searches:0,cacheWrites:0,dbError:false,legacy:false,searchError:false,gate:null,onSearch:null};
  const entries=new Map(),cache={async match(key){return entries.get(key.url)?.clone();},async put(key,response){state.cacheWrites++;entries.set(key.url,response.clone());}};
  const db={prepare(sql){return {bind(){return {async all(){state.reads++;if(state.dbError)throw Error('DB failed');const results=sql.includes('pilot_meta')?(state.generation?[{value:state.legacy?'legacy-snapshot':JSON.stringify({cache:{version:1,generation:state.generation,validFrom:new Date(initial-1000).toISOString(),validUntil:new Date(state.end).toISOString()}})}]:[]):[{id:'offer',product_id:'product',observed_at:new Date(initial).toISOString()}];return {success:true,results,meta:{rows_read:results.length}};}};}};}};
  const pilot=createWorker({now:()=>state.clock,cache:()=>cache,search:async(_db,params)=>{state.searches++;if(state.gate)await state.gate;if(state.onSearch)state.onSearch();if(state.searchError)throw Error('search failed');return {total:1,totalPages:1,page:params.p_page,pageSize:params.p_page_size,products:[{id:'product',lowest_price:123,p_query:params.p_query}]};}});
  const fetch=(query='q=RTX5070',headers={})=>pilot.fetch(new Request('http://localhost/api/search?'+query,{headers}),{CATALOG_DB:db});
  return {state,fetch,entries};
}
test('HIT ejecuta sólo marcador D1; invalidación por generación, sin cacheHTTP al navegador',async()=>{
  const {state,fetch}=fixture();const miss=await fetch();assert.equal(miss.headers.get('X-Pilot-Cache'),'MISS');assert.equal(state.reads,2);
  const first=await miss.json();const hit=await fetch();assert.equal(hit.headers.get('X-Pilot-Cache'),'HIT');assert.equal(state.reads,3);assert.equal(state.searches,1);assert.equal(hit.headers.get('X-Pilot-D1-Queries'),'1');assert.equal(hit.headers.get('Cache-Control'),'no-store');assert.deepEqual(await hit.json(),first);
  state.generation='g2';assert.equal((await fetch()).headers.get('X-Pilot-Cache'),'MISS');assert.equal(state.searches,2);
});
test('expiry duro y marker legado deshabilitan cache sin renovar observaciones',async()=>{
  const {state,fetch}=fixture({end:initial+2000});await fetch();state.clock+=2000;
  assert.equal((await fetch()).headers.get('X-Pilot-Cache'),'BYPASS');assert.equal(state.searches,2);assert.equal(state.cacheWrites,1);
  state.legacy=true;await fetch();assert.equal(state.cacheWrites,1);
});
test('DB caída o snapshot ausente fallan cerrado aunque haya HIT disponible',async()=>{
  const {state,fetch}=fixture();await fetch();state.dbError=true;assert.equal((await fetch()).status,503);state.dbError=false;state.generation=null;const response=await fetch();assert.equal(response.status,503);assert.equal((await response.json()).error,'CATALOG_SNAPSHOT_NOT_READY');assert.equal(state.searches,1);
});
test('rango, páginas y evidencia tienen keys independientes; tienda repetida reusa respuesta',async()=>{
  const {state,fetch}=fixture();await fetch('q=RTX&store=venex&store=mexx&store=venex');assert.equal((await fetch('store=mexx&q=RTX&store=venex')).headers.get('X-Pilot-Cache'),'HIT');
  for(const query of ['q=RTX&minPrice=0','q=RTX&maxPrice=500000','q=RTX&page=2','q=RTX&withOfferEvidence=1'])assert.equal((await fetch(query)).headers.get('X-Pilot-Cache'),'MISS');
  const response=await fetch('q=RTX&withOfferEvidence=1',{Range:'bytes=0-10','If-None-Match':'anything',Cookie:'private=1'});assert.equal(response.status,200);assert.equal(response.headers.get('X-Pilot-Cache'),'HIT');assert.deepEqual((await response.json()).pilotOfferEvidence.currentComparableIds,['offer']);assert.equal(state.searches,5);
});
test('requests concurrentes comparten un cálculo y cada uno valida marcador',async()=>{
  const {state,fetch}=fixture();let release;state.gate=new Promise(resolve=>{release=resolve;});const requests=Array.from({length:6},()=>fetch());
  while(!state.searches)await new Promise(resolve=>setImmediate(resolve));release();const responses=await Promise.all(requests);assert.equal(state.searches,1);assert.equal(state.reads,7);assert.equal(state.cacheWrites,1);assert.equal(responses.filter(r=>r.headers.get('X-Pilot-Cache')==='COALESCED').length,5);for(const response of responses)assert.equal((await response.json()).total,1);
});
test('generación cambia durante MISS: descarta datos; error no cacheado ni singleflight retenido',async()=>{
  const {state,fetch}=fixture();state.onSearch=()=>{state.generation='g2';};const changed=await fetch();assert.equal(changed.status,503);assert.equal((await changed.json()).error,'CATALOG_SNAPSHOT_CHANGED');assert.equal(state.cacheWrites,0);
  state.onSearch=null;state.searchError=true;assert.equal((await fetch()).status,503);assert.equal(state.cacheWrites,0);state.searchError=false;assert.equal((await fetch()).status,200);assert.equal(state.searches,3);
});
test('vencimiento durante consulta nunca cachea ni responde con vigencia del inicio',async()=>{
  const {state,fetch}=fixture({end:initial+2000});state.onSearch=()=>{state.clock+=2000;};const response=await fetch();assert.equal(response.status,503);assert.equal((await response.json()).error,'CATALOG_CLOCK_INTERVAL_EXPIRED');assert.equal(state.cacheWrites,0);
});
test('último milisegundo de proyección conserva guard aunque TTL menor a un segundo haga BYPASS',async()=>{
  const {state,fetch}=fixture({end:initial+1});state.onSearch=()=>{state.clock+=1;};const response=await fetch();assert.equal(response.status,503);assert.equal((await response.json()).error,'CATALOG_CLOCK_INTERVAL_EXPIRED');assert.equal(state.cacheWrites,0);
});
test('singleflight que falla se limpia y todas las solicitudes reciben error completo',async()=>{
  const {state,fetch}=fixture();let release;state.gate=new Promise(resolve=>{release=resolve;});state.searchError=true;
  const requests=Array.from({length:4},()=>fetch());while(!state.searches)await new Promise(resolve=>setImmediate(resolve));release();
  for(const response of await Promise.all(requests))assert.equal(response.status,503);assert.equal(state.searches,1);assert.equal(state.cacheWrites,0);
  state.searchError=false;state.gate=null;assert.equal((await fetch()).status,200);assert.equal(state.searches,2);
});

test('sesión no permite cachear datos si primaria cambia mientras replica conserva bookmark',async()=>{
  let marker='g1';const calls=[];
  const target=(name,read)=>({prepare(){return {bind(){return {async all(){calls.push(name);return {success:true,results:[{value:read()}],meta:{rows_read:1}};}};}};}});
  const primary=target('primary',()=>marker);
  primary.withSession=constraint=>{assert.equal(constraint,'first-primary');return target('session',()=> 'g1');};
  const pilot=createWorker({cache:()=>null,search:async()=>{marker='g2';return {products:[]};}});
  const response=await pilot.fetch(new Request('http://localhost/api/search?q=ram'),{CATALOG_DB:primary,CATALOG_READ_REPLICATION:'1'});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'CATALOG_SNAPSHOT_CHANGED');
  assert.deepEqual(calls,['session','primary']);
});

test('replicación solicitada sin Sessions API falla cerrado',async()=>{
  const response=await worker.fetch(new Request('http://localhost/api/search?q=ram'),{CATALOG_DB:database(),CATALOG_READ_REPLICATION:'1'});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'CATALOG_READ_UNAVAILABLE');
});

import test,{type TestContext}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
import{initializeRefreshDemand,enqueueKnownProducts}from'./refresh-demand.mjs';import{runLocalSweep}from'./sweep-local';import{SourceHttpError}from'@/lib/scrapers/source-http';import type{Product}from'@/lib/types';
const{rebuildProjection}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const now=Date.parse('2026-10-12T05:00:00Z'),old=new Date(now-2*86400000).toISOString(),name='Mother ASUS PRIME B650M-A II AM5 DDR5',sku='90MB1EH0-M0EAY0',url='https://compragamer.com/producto/PRODUCTO_12345';
function fixture(t:TestContext,count=30){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot','{}');
 db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p','motherboards','p',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify({id:'p',name,category:'motherboards',specs:{SKU:sku}}));db.prepare('INSERT INTO product_substrings VALUES(?,?)').run('p',name.toLowerCase());db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('p',100,100,100,1,url,0,'["compragamer"]',null,null,old,'{}');
 initializeRefreshDemand(db);const ids=[];for(let i=0;i<count;i++){const id='o'+String(i).padStart(3,'0');ids.push(id);db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id,'p','compragamer',100,url,JSON.stringify({id,product_id:'p',store_id:'compragamer',url,price:100,stock:'in-stock',last_updated:old}));enqueueKnownProducts(db,{productIds:['p'],offerIds:[id],storeIds:['compragamer'],now});}
 rebuildProjection(db,{now,generation:'before'});return{db,ids};
}
const source=(at:number)=>({id:'cg-12345',name,category:'motherboards',specs:{SKU:sku},prices:[{storeId:'compragamer',url,price:200,stock:'in-stock',lastUpdated:new Date(at)}]}as unknown as Product);
const dependencies={projection:rebuildProjection,estimateIndexes:()=>0};
const metrics=(requests:number)=>({compragamer:{requests,bytes:requests*100,durationMs:0,conditionalHits:0,backoffSkips:0,failures:0,failureReasons:{}}});
test('reserva 500 en lotes25 antes de única lectura compartida3HTTP y respeta fecha posterior',async t=>{
 const f=fixture(t,500);let time=now,calls=0,requests=0,captured=0;
 const result=await runLocalSweep(f.db,dependencies,{offerIds:f.ids,clock:()=>time,httpMetrics:()=>metrics(requests),reader:async(_s,_u,_c,_signal,context)=>{calls++;if(!captured){assert.equal(f.db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='leased'").get()?.n,500);assert.equal(context?.observedAfter,now);requests+=3;captured=++time;}time++;return source(captured);}});
 assert.equal(result.reserved,500);assert.equal(result.observed,500);assert.equal(result.sourceHttp.requests,3);assert.equal(calls,500);assert.equal(f.db.prepare("SELECT COUNT(DISTINCT json_extract(row_json,'$.last_updated')) n FROM product_prices").get()?.n,1);assert.equal(f.db.prepare('SELECT until_at FROM pilot_sweep_guard').get()?.until_at,0);
});
test('captura antigua y proof falso no renuevan; backoff y leases de otros no se reclaman',async t=>{
 const f=fixture(t,4),before=f.db.prepare('SELECT * FROM product_prices').all();f.db.prepare("UPDATE pilot_refresh_demand SET status='backoff',due_at=? WHERE offer_id=?").run(now+3600000,f.ids[0]);f.db.prepare("UPDATE pilot_refresh_demand SET status='leased',lease_token='foreign',lease_until=? WHERE offer_id=?").run(now+60000,f.ids[1]);
 let time=now;const result=await runLocalSweep(f.db,dependencies,{offerIds:f.ids,clock:()=>time,httpMetrics:()=>metrics(0),reader:async()=>{const s=source(time++);if(time===now+1)s.prices[0].lastUpdated=new Date(now-1);else s.specs.SKU='other';return s;}});
 assert.equal(result.reserved,2);assert.equal(result.observed,0);assert.deepEqual(f.db.prepare('SELECT * FROM product_prices').all(),before);assert.equal(f.db.prepare('SELECT lease_token FROM pilot_refresh_demand WHERE offer_id=?').get(f.ids[1])?.lease_token,'foreign');
});
test('guard durable impide segundo sweep y bloqueoHTTP corta siguientes lecturas',async t=>{
 const f=fixture(t,30);let calls=0;const result=await runLocalSweep(f.db,dependencies,{offerIds:f.ids,clock:()=>now,httpMetrics:()=>metrics(0),reader:async()=>{calls++;const blocked=await runLocalSweep(f.db,dependencies,{offerIds:f.ids,clock:()=>now,httpMetrics:()=>metrics(0),reader:async()=>{assert.fail('guard permite nueva lectura');}});assert.equal(blocked.status,'already-running');throw new SourceHttpError('blocked',403);}});
 assert.equal(calls,1);assert.equal(result.observed,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='backoff'").get()?.n,30);assert.equal(f.db.prepare('SELECT reason FROM pilot_cycle_store_pause').get()?.reason,'http-403');
});
test('HTTP budget y deadline paran sin cambiar ofertas pendientes y liberan sólo reservas propias',async t=>{
 for(const kind of['http','deadline']){
  const f=fixture(t,10);let time=now,requests=0;const result=await runLocalSweep(f.db,dependencies,{offerIds:f.ids,clock:()=>time,httpMetrics:()=>metrics(requests),reader:async()=>{requests+=3;time+=kind==='deadline'?300001:1;return source(time);}});
  assert.equal(result.status,'bounded-stop');assert.equal(result.reserved,10);assert.equal(result.attempted,kind==='deadline'?1:3);assert.equal(result.deferred,kind==='deadline'?10:7);assert.equal(result.sourceHttp.requests,kind==='deadline'?3:9);assert.equal(result.observed,kind==='deadline'?0:3);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM product_prices WHERE price=100").get()?.n,kind==='deadline'?10:7);
 }
});
test('rechaza exceder500,10HTTP o5min antes de invocar fuentes',async t=>{
 const f=fixture(t,1);for(const option of[{limit:501},{maxHttp:11},{leaseMs:300001}])await assert.rejects(()=>runLocalSweep(f.db,dependencies,{offerIds:f.ids,...option,reader:async()=>{assert.fail('lectura fuera de límite');}}),/LIMIT/);
});
test('vencimiento durante proyección revierte observación, presupuesto e historia y detiene barrido',async t=>{
 const f=fixture(t,2);let time=now;
 const tables=['product_prices','price_basis','search_projection','summaries','pilot_meta'];
 const before=tables.map(table=>f.db.prepare('SELECT * FROM '+table).all());
 const result=await runLocalSweep(f.db,{...dependencies,projection:(db,options)=>{const rebuilt=rebuildProjection(db,options);time=now+300001;return rebuilt;}},
  {offerIds:f.ids,clock:()=>time,httpMetrics:()=>metrics(0),reader:async()=>source(now)});
 assert.equal(result.status,'bounded-stop');assert.equal(result.stop,'SWEEP_LEASE_DEADLINE');assert.equal(result.attempted,1);assert.equal(result.observed,0);assert.equal(result.deferred,2);
 assert.deepEqual(tables.map(table=>f.db.prepare('SELECT * FROM '+table).all()),before);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name IN('pilot_offer_observations','pilot_daily_write_budget')").get()?.n,0);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='observed'").get()?.n,0);
});

test('producer real usa tres fuentes mock después de todas reservas y conserva timestamp de catálogo',async t=>{
 const f=fixture(t,30);t.mock.timers.enable({apis:['Date','setTimeout'],now});let fetches=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
  fetches++;assert.equal(f.db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='leased'").get()?.n,30);
  const address=String(input);const data=address.endsWith('/productos')?[{id_producto:12345,nombre:name,precioEspecial:200,precioLista:220,stock:2,vendible:1,codigo_principal:[sku],id_subcategoria:1,id_marca:1}]
   :address.endsWith('/categorias_sub')?[{id:1,nombre:'Motherboards'}]:address.endsWith('/marcas')?[{id:1,nombre:'ASUS'}]:assert.fail('HTTP fuera de tres fuentes mock');
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 });
 let done=false;const pending=runLocalSweep(f.db,dependencies,{offerIds:f.ids}).finally(()=>{done=true;});
 for(let i=0;!done&&i<50;i++){await new Promise<void>(resolve=>setImmediate(resolve));t.mock.timers.tick(2001);}
 const result=await pending;assert.equal(fetches,3);assert.equal(result.sourceHttp.requests,3);assert.equal(result.observed,30);
 assert.equal(f.db.prepare("SELECT COUNT(DISTINCT json_extract(row_json,'$.last_updated')) n FROM product_prices").get()?.n,1);
});

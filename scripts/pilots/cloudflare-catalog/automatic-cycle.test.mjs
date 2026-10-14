import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,mkdtempSync,rmSync,existsSync,unlinkSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { initializeRefreshDemand,enqueueKnownProducts,claimRefreshBatch,acknowledgeRefresh } from './refresh-demand.mjs';
import { rebuildProjection } from './projection.mjs';
import { runAutomaticCycle,acquireCycleLease,validateCycleConfig } from './automatic-cycle.mjs';
import { schedulerPlist } from './mac-scheduler.mjs';
import { DAILY_BUDGET_SCHEMA } from './daily-budget.mjs';

function fixture(){
 const directory=mkdtempSync(resolve(tmpdir(),'catalog-automatic-'));
 const now=Date.parse('2026-10-11T15:00:00Z'),sqlite=resolve(directory,'sample.sqlite');
 const config={version:1,startedAt:now,expiresAt:now+24*3600000,intervalSeconds:900,maxDailyOffers:200,maxDailyHttp:400,maxDailyRemoteWrites:20000,
  sqlite,checkpoint:resolve(directory,'checkpoint.sqlite'),tokenFile:resolve(directory,'pilot-access.private'),consumerBundle:resolve(directory,'consumer.bundle.mjs'),reportFile:resolve(directory,'latest.json')};
 const db=new DatabaseSync(sqlite);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
 const old=new Date(now-2*86400000).toISOString();
 for(const [i,store] of ['katech','dinobyte','maxtecno'].entries()){
  const id='p'+i,url='https://'+store+'.com.ar/producto/cpu/';
  const raw={id:'o'+i,product_id:id,store_id:store,url,price:100000,stock:'in-stock',last_updated:old};
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'procesadores',id,'amd ryzen 5 5500','amd ryzen 5 5500',1,0,old,old,JSON.stringify({id,name:'AMD Ryzen 5 5500',category:'procesadores'}));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,'amd ryzen 5 5500');
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(raw.id,id,store,raw.price,url,JSON.stringify(raw));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,100000,100000,100000,1,url,0,JSON.stringify([store]),null,null,old,'{}');
  for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,raw.id,store,100000,'in-stock',url,old);
 }
 rebuildProjection(db,{now,generation:'fixture'});initializeRefreshDemand(db);let remote=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;db.close();
 let time=now,calls=0,syncs=0,sourceRequests=0;
 const consumer={localStoreIds:['katech','dinobyte','maxtecno'],localCategories:['procesadores'],canRefreshLocalTarget:()=>true,
  async runLocalRefresh(db,options){
    calls++;const leases=claimRefreshBatch(db,{now:time,limit:options.limit,storeIds:options.storeIds,productIds:options.productIds});const results=[];
    for(const lease of leases){
      time+=5;sourceRequests+=4;const observed=new Date(time).toISOString();
      const raw=JSON.parse(db.prepare('SELECT row_json FROM product_prices WHERE id=?').get(lease.offerId).row_json);
      const next={...raw,price:120000,last_updated:observed};db.prepare('UPDATE product_prices SET price=?,row_json=? WHERE id=?').run(120000,JSON.stringify(next),lease.offerId);
      db.prepare("UPDATE price_basis SET price=?,observed_at=? WHERE id=? AND kind='current'").run(120000,observed,lease.offerId);
      db.prepare('UPDATE summaries SET comparable_stats_json=NULL,comparable_latest_observed_at=? WHERE product_id=?').run(observed,lease.productId);
      rebuildProjection(db,{now:time,generation:'fixture-'+lease.offerId,affectedProductIds:[lease.productId]});
      acknowledgeRefresh(db,{...lease,now:time,outcome:'observed',receipt:{offerId:lease.offerId,url:lease.url,observedAt:observed,source:'public-page',persisted:true,identityVerified:true,priceVerified:true,stockVerified:true,comparableVerified:true}});
      results.push({offerId:lease.offerId,storeId:lease.storeId,status:'observed'});
    }
    return {attempted:leases.length,results,sourceHttp:{fixture:{requests:leases.length*4}}};
  }};
 const deps={consumer,token:'not-a-secret',clock:()=>time,state:async()=>({snapshot:remote,rowsRead:1}),sync:async payload=>{syncs++;assert.equal(payload.expectedSnapshot,remote);remote=payload.finalSnapshot;return {atomic:true,generation:JSON.parse(remote).cache.generation,rowsRead:7,rowsWritten:63};}};
 return {directory,config,deps,consumer,stats:()=>({calls,syncs}),marker:()=>remote,setRemote:value=>{remote=value;},setTime:value=>{time=value;},advance:()=>{time+=900000;},cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test('tick rota, observa tres destinos y sincroniza; siguiente tick fresco no lee fuentes ni publica',async()=>{
 const f=fixture();try{
  const first=await runAutomaticCycle(f.config,f.deps);assert.equal(first.status,'completed');assert.equal(first.results.length,3);
  assert.equal(first.coverage.totals.observedThisTrial,3);assert.equal(first.remote.rowsWritten,63);assert.equal(first.budget.http_requests,12);
  f.advance();const second=await runAutomaticCycle(f.config,f.deps);assert.equal(second.status,'idle');assert.deepEqual(f.stats(),{calls:3,syncs:1});
  assert.equal(second.coverage.rotation.pass_number,1);assert.equal(second.budget.reserved_writes,0);
 }finally{f.cleanup();}
});
test('presupuesto HTTP reserva doce solicitudes antes de cualquier fuente/redirección',async()=>{
 const f=fixture();try{f.config.maxDailyHttp=6;const result=await runAutomaticCycle(f.config,f.deps);assert.equal(result.status,'daily-budget');assert.equal(f.stats().calls,0);assert.equal(result.budget.http_requests,0);}finally{f.cleanup();}
});
test('FullH4rd pendiente conserva denominador y oferta sin despachar demanda ya encolada',async()=>{
 const f=fixture();try{
  const db=new DatabaseSync(f.config.sqlite);
  const before=db.prepare('SELECT * FROM product_prices WHERE id=?').get('o1');
  const raw={...JSON.parse(before.row_json),store_id:'fullh4rd',url:'https://fullh4rd.com.ar/prod/12345/cpu'};
  db.prepare('UPDATE product_prices SET store_id=?,url=?,row_json=? WHERE id=?').run(raw.store_id,raw.url,JSON.stringify(raw),'o1');
  enqueueKnownProducts(db,{productIds:['p1'],storeIds:['fullh4rd'],now:f.config.startedAt});
  const unchanged=db.prepare('SELECT * FROM product_prices WHERE id=?').get('o1');db.close();
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,localStoreIds:[...f.consumer.localStoreIds,'fullh4rd']}});
  assert.equal(result.status,'completed');assert.equal(result.results.length,2);
  assert.ok(result.results.every(r=>r.storeId!=='fullh4rd'));
  assert.equal(result.coverage.totals.total,3);assert.equal(result.coverage.totals.unsupported,1);
  const after=new DatabaseSync(f.config.sqlite,{readOnly:true});
  try{assert.deepEqual(after.prepare('SELECT * FROM product_prices WHERE id=?').get('o1'),unchanged);
   assert.equal(after.prepare('SELECT attempts FROM pilot_refresh_demand WHERE offer_id=?').get('o1').attempts,0);
  }finally{after.close();}
 }finally{f.cleanup();}
});
test('proceso solapado o vencido no consulta estado remoto ni fuentes',async()=>{
 const f=fixture();try{
  const db=new DatabaseSync(f.config.sqlite);acquireCycleLease(db,f.config,f.config.startedAt);db.close();
  const deps={...f.deps,state:()=>assert.fail('no remoto')};assert.equal((await runAutomaticCycle(f.config,deps)).status,'busy');
  assert.equal((await runAutomaticCycle(f.config,{...deps,clock:()=>f.config.expiresAt})).status,'expired');
 }finally{f.cleanup();}
});
test('respuesta perdida se recupera por generación sin volver a leer ni duplicar escritura',async()=>{
 const f=fixture();try{
  const result=await runAutomaticCycle(f.config,{...f.deps,sync:async payload=>{f.setRemote(payload.finalSnapshot);throw new Error('connection-lost');}});
  assert.equal(result.status,'failed');assert.ok(existsSync(resolve(f.directory,'outbox.json')));assert.equal(result.budget.reserved_writes,4000);
  f.advance();const recovered=await runAutomaticCycle(f.config,f.deps);assert.equal(recovered.status,'recovered');assert.deepEqual(f.stats(),{calls:3,syncs:0});
  assert.equal(recovered.remote.recovered,true);assert.equal(recovered.remote.rowsWritten,0);
  assert.equal(recovered.budget.reserved_writes,4000,'consumo desconocido mantiene reserva');
 }finally{f.cleanup();}
});
test('crash entre writer y creación de outbox reconstruye delta desde checkpoint antes de nueva fuente',async()=>{
 const f=fixture();try{
  const result=await runAutomaticCycle(f.config,{...f.deps,sync:async()=>{throw new Error('network-down');}});assert.equal(result.status,'failed');
  unlinkSync(resolve(f.directory,'outbox.json'));f.advance();
  const recovered=await runAutomaticCycle(f.config,f.deps);assert.equal(recovered.status,'recovered');assert.deepEqual(f.stats(),{calls:3,syncs:1});assert.equal(recovered.remote.rowsWritten,63);
 }finally{f.cleanup();}
});
test('generación ajena bloquea sin leer fuentes y conserva datos',async()=>{
 const f=fixture();try{
  f.setRemote('foreign-generation');const result=await runAutomaticCycle(f.config,f.deps);assert.equal(result.error,'CYCLE_REMOTE_DIVERGED');assert.equal(f.stats().calls,0);
  assert.equal((await runAutomaticCycle(f.config,f.deps)).status,'blocked');
 }finally{f.cleanup();}
});
test('familias no soportadas permanecen en denominador, sin cola ni fuente',async()=>{
 const f=fixture();try{
  const db=new DatabaseSync(f.config.sqlite);db.exec("UPDATE products SET category='almacenamiento'");db.close();
  const result=await runAutomaticCycle(f.config,f.deps);assert.equal(result.status,'idle');assert.equal(result.coverage.totals.total,3);assert.equal(result.coverage.totals.unsupported,3);assert.equal(f.stats().calls,0);
 }finally{f.cleanup();}
});
test('config no puede ampliar ensayo más de24h ni dejar secreto fuera del directorio privado',()=>{
 const f=fixture();try{assert.throws(()=>validateCycleConfig({...f.config,expiresAt:f.config.startedAt+25*3600000}));assert.throws(()=>validateCycleConfig({...f.config,tokenFile:'/tmp/another.private'}));}finally{f.cleanup();}
});
test('LaunchAgent contiene argumentos sin shell, horario, logs y ningún secreto',()=>{
 const f=fixture();try{const plist=schedulerPlist('/tmp/config & pilot.json',f.config,'/usr/local/node');assert.match(plist,/config &amp; pilot.json/);assert.match(plist,/<integer>900<\/integer>/);assert.ok(!plist.includes('Bearer'));assert.ok(!plist.includes('/bin/sh'));}finally{f.cleanup();}
});

test('temporal de checkpoint residual no bloquea recuperación ya confirmada',async()=>{
 const f=fixture();try{
  await runAutomaticCycle(f.config,{...f.deps,sync:async payload=>{f.setRemote(payload.finalSnapshot);throw new Error('connection-lost');}});
  writeFileSync(f.config.checkpoint+'.tmp','residual propio');f.advance();
  const recovered=await runAutomaticCycle(f.config,f.deps);assert.equal(recovered.status,'recovered');assert.deepEqual(f.stats(),{calls:3,syncs:0});
  assert.equal(readFileSync(f.config.checkpoint+'.tmp','utf8'),'residual propio');
 }finally{f.cleanup();}
});
test('excepción sin recibo del lector conserva reservas de HTTP e intentos',async()=>{
 const f=fixture();try{
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,runLocalRefresh:async()=>{throw new Error('crash');}}});
  assert.equal(result.status,'failed');assert.equal(result.budget.http_requests,12);assert.equal(result.budget.attempted,3);assert.equal(result.budget.reserved_writes,4000);
 }finally{f.cleanup();}
});

test('alternancia de familia por tienda persiste y revisa CPU antes de la GPU pendiente',async()=>{
 const f=fixture();try{
  const db=new DatabaseSync(f.config.sqlite);const old=new Date(f.config.startedAt-2*86400000).toISOString();
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p3','tarjetas-graficas','gpu','rtx 5070','rtx 5070',1,0,old,old,JSON.stringify({name:'RTX 5070'}));
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o3','p3','katech',100000,'https://katech.com.ar/producto/gpu/',JSON.stringify({id:'o3',product_id:'p3',store_id:'katech',url:'https://katech.com.ar/producto/gpu/',price:100000,stock:'unknown',last_updated:old}));
  rebuildProjection(db,{now:f.config.startedAt,generation:'with-gpu'});f.setRemote(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);db.close();
  const deps={...f.deps,consumer:{...f.consumer,localCategories:['procesadores','tarjetas-graficas']}};
  const first=await runAutomaticCycle(f.config,deps);assert.ok(first.results.some(r=>r.offerId==='o0'));assert.ok(!first.results.some(r=>r.offerId==='o3'));
  f.advance();const second=await runAutomaticCycle(f.config,deps);assert.ok(second.results.some(r=>r.offerId==='o3'));assert.equal(second.coverage.totals.observedThisTrial,4);
 }finally{f.cleanup();}
});

function expireProjection(f,{pending=false}={}){
 const db=new DatabaseSync(f.config.sqlite),observed=new Date(f.config.startedAt-4*3600000+1).toISOString();
 for(const row of db.prepare('SELECT id,row_json FROM product_prices').all()){
  const raw={...JSON.parse(row.row_json),last_updated:observed};
  db.prepare('UPDATE product_prices SET row_json=? WHERE id=?').run(JSON.stringify(raw),row.id);
 }
 db.prepare("UPDATE price_basis SET observed_at=? WHERE kind='current'").run(observed);
 rebuildProjection(db,{now:f.config.startedAt,generation:'before-clock-transition'});
 if(pending)enqueueKnownProducts(db,{productIds:['p0','p1','p2'],now:f.config.startedAt,freshMs:3*3600000});
 f.setRemote(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);db.close();f.advance();
}
function durableState(f){
 const db=new DatabaseSync(f.config.sqlite,{readOnly:true});try{return {
  marker:db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,
  prices:db.prepare('SELECT * FROM product_prices ORDER BY id').all(),products:db.prepare('SELECT * FROM products ORDER BY id').all(),
  basis:db.prepare('SELECT * FROM price_basis ORDER BY product_id,kind,id').all(),projection:db.prepare('SELECT * FROM search_projection ORDER BY product_id').all(),
  ledger:db.prepare("SELECT name FROM sqlite_master WHERE name='pilot_daily_write_budget'").get()
   ?db.prepare('SELECT * FROM pilot_daily_write_budget').all():[],
 };}finally{db.close();}
}
test('sin demanda reconstruye transición del reloj y sincroniza sin renovar ninguna oferta',async()=>{
 const f=fixture();try{
  expireProjection(f);const before=durableState(f);let payload;
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false},sync:async value=>{payload=value;return f.deps.sync(value);}});
  assert.equal(result.status,'maintained');assert.equal(result.results.length,0);assert.deepEqual(f.stats(),{calls:0,syncs:1});
  assert.ok(result.maintenance.changedProjectionRows>0);assert.equal(result.budget.attempted,0);assert.equal(result.budget.http_requests,0);assert.equal(result.budget.reserved_writes,0);
  assert.deepEqual(payload.product_prices,[]);assert.deepEqual(payload.price_basis,[]);assert.deepEqual(payload.summaries,[]);
  const after=durableState(f);assert.deepEqual(after.prices,before.prices);assert.deepEqual(after.products,before.products);assert.deepEqual(after.basis,before.basis);
  assert.notEqual(after.marker,before.marker);assert.equal(after.marker,f.marker());assert.equal(after.ledger.length,1);
  const cache=JSON.parse(after.marker).cache;assert.ok(Date.parse(cache.validUntil)>Date.parse(result.startedAt));
 }finally{f.cleanup();}
});
test('marcador vigente sin demanda es zero-op sin checkpoint ni ledger',async()=>{
 const f=fixture();try{
  const before=durableState(f),result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false}});
  assert.equal(result.status,'idle');assert.deepEqual(durableState(f),before);assert.deepEqual(f.stats(),{calls:0,syncs:0});
  assert.equal(result.budget.reserved_writes,0);assert.equal(result.remote.rowsWritten,0);assert.ok(!existsSync(f.config.checkpoint));
 }finally{f.cleanup();}
});
test('mantenimiento exclusivo pospone lectores; sus fallos siguientes mantienen caché y datos',async()=>{
 const f=fixture();try{
  expireProjection(f,{pending:true});const before=durableState(f);
  const consumer={...f.consumer,async runLocalRefresh(db,options){
   const leases=claimRefreshBatch(db,{now:f.config.startedAt+900000,limit:1,storeIds:options.storeIds,productIds:options.productIds});
   for(const lease of leases)acknowledgeRefresh(db,{...lease,now:f.config.startedAt+900000,outcome:'no-observation',retryAfterMs:6*3600000});
   return {attempted:leases.length,results:leases.map(lease=>({offerId:lease.offerId,status:'failed'})),sourceHttp:{fixture:{requests:leases.length}}};
  }};
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer});assert.equal(result.status,'maintained');assert.equal(result.results.length,0);
  assert.equal(result.sourcesDeferred,3);assert.equal(result.remote.syncs,1);assert.equal(result.budget.attempted,0);assert.equal(result.budget.http_requests,0);
  const after=durableState(f);assert.deepEqual(after.prices,before.prices);assert.deepEqual(after.basis,before.basis);assert.notEqual(after.marker,before.marker);
  f.advance();const following=await runAutomaticCycle(f.config,{...f.deps,consumer});assert.equal(following.status,'completed');assert.equal(following.results.length,3);
  assert.equal(following.budget.attempted,3);assert.equal(following.budget.http_requests,3);assert.equal(following.remote.syncs,0);
  assert.deepEqual(durableState(f),after);
 }finally{f.cleanup();}
});
test('HTTP agotado no impide mantenimiento de reloj dentro del presupuesto de escrituras',async()=>{
 const f=fixture();try{
  expireProjection(f,{pending:true});f.config.maxDailyHttp=6;
  const result=await runAutomaticCycle(f.config,f.deps);assert.equal(result.status,'maintained');assert.equal(result.sourcesDeferred,3);
  assert.deepEqual(f.stats(),{calls:0,syncs:1});assert.equal(result.budget.http_requests,0);assert.equal(result.budget.attempted,0);
 }finally{f.cleanup();}
});
test('reserva remota insuficiente no reconstruye ni consulta una tienda',async()=>{
 const f=fixture();try{
  expireProjection(f);const before=durableState(f);f.config.maxDailyRemoteWrites=3999;
  const result=await runAutomaticCycle(f.config,f.deps);assert.equal(result.status,'daily-budget');assert.deepEqual(durableState(f),before);
  assert.deepEqual(f.stats(),{calls:0,syncs:0});assert.equal(result.budget.reserved_writes,0);
 }finally{f.cleanup();}
});
test('estimate mayor que reserva revierte marcador/proyección y libera reserva sin HTTP',async()=>{
 const f=fixture();try{
  expireProjection(f);const before=durableState(f);
  const result=await runAutomaticCycle(f.config,{...f.deps,estimateIndexes:()=>4001});
  assert.equal(result.error,'CYCLE_MAINTENANCE_RESERVATION');assert.deepEqual(durableState(f),before);assert.deepEqual(f.stats(),{calls:0,syncs:0});
  assert.equal(result.budget.reserved_writes,0);assert.equal(result.budget.attempted,0);assert.equal(result.budget.http_requests,0);
 }finally{f.cleanup();}
});
test('presupuesto local rechazado revierte la transición y no duplica ledger',async()=>{
 const f=fixture();try{
  expireProjection(f);const db=new DatabaseSync(f.config.sqlite);db.exec(DAILY_BUDGET_SCHEMA);
  db.prepare('INSERT INTO pilot_daily_write_budget VALUES(?,?,?)').run('2026-10-11',80000,80000);db.close();
  const before=durableState(f),result=await runAutomaticCycle(f.config,f.deps);
  assert.equal(result.status,'failed');assert.deepEqual(durableState(f),before);assert.deepEqual(f.stats(),{calls:0,syncs:0});
  assert.equal(result.budget.reserved_writes,0);assert.equal(result.budget.http_requests,0);
 }finally{f.cleanup();}
});
test('recibo de mantenimiento perdido conserva outbox/reserva y recuperación no recalcula ledger',async()=>{
 const f=fixture();try{
  expireProjection(f);const deps={...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false}};
  const first=await runAutomaticCycle(f.config,{...deps,sync:async payload=>{f.setRemote(payload.finalSnapshot);throw new Error('CYCLE_SYNC_RECEIPT_INVALID');}});
  assert.equal(first.status,'failed');assert.equal(first.budget.reserved_writes,4000);assert.equal(first.budget.http_requests,0);assert.ok(existsSync(resolve(f.directory,'outbox.json')));
  const ledger=durableState(f).ledger;f.advance();const next=await runAutomaticCycle(f.config,deps);
  assert.equal(next.status,'recovered');assert.equal(next.remote.rowsWritten,0);assert.deepEqual(durableState(f).ledger,ledger);
  assert.deepEqual(f.stats(),{calls:0,syncs:0});assert.equal(next.budget.reserved_writes,4000,'recibo desconocido no acredita liberación');
 }finally{f.cleanup();}
});
test('más de200 proyecciones en transición rechaza delta dentro de la transacción y preserva datos',async()=>{
 const f=fixture();try{
  const db=new DatabaseSync(f.config.sqlite),observed=new Date(f.config.startedAt-4*3600000+1).toISOString();
  for(let index=3;index<204;index++){
   const id='p'+index,offer='o'+index,url='https://maxtecno.com.ar/producto/cpu-'+index+'/';
   db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'procesadores',id,'amd ryzen 5 5500','amd ryzen 5 5500',1,0,observed,observed,JSON.stringify({id,name:'AMD Ryzen 5 5500',category:'procesadores'}));
   db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,'amd ryzen 5 5500');
   db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer,id,'maxtecno',100000,url,JSON.stringify({id:offer,product_id:id,store_id:'maxtecno',url,price:100000,stock:'in-stock',last_updated:observed}));
   db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,100000,100000,100000,1,url,0,'["maxtecno"]',null,null,observed,'{}');
   for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,offer,'maxtecno',100000,'in-stock',url,observed);
  }
  rebuildProjection(db,{now:f.config.startedAt,generation:'many-before-transition'});
  f.setRemote(db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value);db.close();f.advance();
  const before=durableState(f),result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false}});
  assert.equal(result.error,'CYCLE_MAINTENANCE_DELTA');assert.deepEqual(durableState(f),before);assert.deepEqual(f.stats(),{calls:0,syncs:0});
  assert.equal(result.budget.reserved_writes,0);assert.ok(!existsSync(resolve(f.directory,'outbox.json')));
 }finally{f.cleanup();}
});
test('mantenimiento no confirmado se reenvía desde outbox sin consumir tiendas ni ledger otra vez',async()=>{
 const f=fixture();try{
  expireProjection(f);const deps={...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false}};
  const first=await runAutomaticCycle(f.config,{...deps,sync:async()=>{throw new Error('network-down');}});
  assert.equal(first.status,'failed');const ledger=durableState(f).ledger;f.advance();
  const next=await runAutomaticCycle(f.config,deps);assert.equal(next.status,'recovered');assert.deepEqual(f.stats(),{calls:0,syncs:1});
  assert.deepEqual(durableState(f).ledger,ledger);assert.equal(next.budget.reserved_writes,4000);
 }finally{f.cleanup();}
});
test('crash tras commit de mantenimiento antes de outbox reconstruye delta sin recargar ledger',async()=>{
 const f=fixture();try{
  expireProjection(f);const deps={...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false}};
  await runAutomaticCycle(f.config,{...deps,sync:async()=>{throw new Error('crash');}});
  const ledger=durableState(f).ledger;unlinkSync(resolve(f.directory,'outbox.json'));f.advance();
  const next=await runAutomaticCycle(f.config,deps);assert.equal(next.status,'recovered');assert.equal(next.remote.recovered,true);
  assert.deepEqual(f.stats(),{calls:0,syncs:1});assert.deepEqual(durableState(f).ledger,ledger);assert.equal(next.budget.http_requests,0);
 }finally{f.cleanup();}
});
test('estado remoto que alcanza vencimiento exacto impide reservar y modificar proyección',async()=>{
 const f=fixture();try{
  expireProjection(f);const before=durableState(f);
  const result=await runAutomaticCycle(f.config,{...f.deps,state:async()=>{f.setTime(f.config.expiresAt);return f.deps.state();}});
  assert.equal(result.error,'CYCLE_PILOT_STOPPED');assert.equal(result.status,'failed');assert.deepEqual(durableState(f),before);
  assert.deepEqual(f.stats(),{calls:0,syncs:0});assert.equal(result.budget.reserved_writes,0);assert.equal(result.budget.http_requests,0);
  assert.ok(!existsSync(resolve(f.directory,'outbox.json')));assert.ok(!existsSync(f.config.checkpoint));
 }finally{f.cleanup();}
});
test('cálculo que atraviesa vencimiento revierte marcador y ledger antes de confirmar',async()=>{
 const f=fixture();try{
  expireProjection(f);const before=durableState(f);
  const result=await runAutomaticCycle(f.config,{...f.deps,projection:(db,options)=>{
   const rebuilt=rebuildProjection(db,options);f.setTime(f.config.expiresAt);return rebuilt;
  }});
  assert.equal(result.error,'CYCLE_PILOT_STOPPED');assert.equal(result.status,'failed');assert.deepEqual(durableState(f),before);
  assert.deepEqual(f.stats(),{calls:0,syncs:0});assert.equal(result.budget.reserved_writes,0);assert.equal(result.budget.http_requests,0);
  assert.ok(!existsSync(resolve(f.directory,'outbox.json')));
 }finally{f.cleanup();}
});

function largeClockFixture(count=1003){
 const f=fixture(),db=new DatabaseSync(f.config.sqlite);
 const product={...db.prepare('SELECT * FROM products WHERE id=?').get('p0')};
 const summary={...db.prepare('SELECT * FROM summaries WHERE product_id=?').get('p0')};
 const old=new Date(f.config.startedAt-4*3600000+1).toISOString();
 db.exec('BEGIN');
 for(let i=3;i<count;i++){
  const id='p'+i,offer='o'+i,url='https://katech.com.ar/producto/cpu-'+i+'/';
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(...Object.values({...product,id,catalog_identity:id,row_json:JSON.stringify({id,name:'AMD Ryzen 5 5500',category:'procesadores'})}));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,'amd ryzen 5 5500');
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer,id,'katech',100000,url,JSON.stringify({id:offer,product_id:id,store_id:'katech',url,price:100000,stock:'in-stock',last_updated:old}));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values({...summary,product_id:id,urls:url}));
  for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,offer,'katech',100000,'in-stock',url,old);
 }
 db.exec('COMMIT');db.close();expireProjection(f);f.config.clockSync=true;
 return f;
}
async function localClockEndpoint(f){
 const {createRemoteWorker}=await import('./remote-worker.mjs');
 const {pilotState,sendCycleClockDelta}=await import('./cycle-remote.mjs');
 const db=new DatabaseSync(f.config.sqlite);db.prepare('VACUUM INTO ?').run(resolve(f.directory,'remote.sqlite'));db.close();
 const remote=new DatabaseSync(resolve(f.directory,'remote.sqlite'));
 const binding={prepare(sql){return{bind(...values){return{sql,values,async all(){return{success:true,results:remote.prepare(sql).all(...values),meta:{rows_read:1,rows_written:0}};}};}};},async batch(statements){
  remote.exec('BEGIN');try{const results=statements.map(s=>{const result=remote.prepare(s.sql).run(...s.values);return{success:true,meta:{changes:Number(result.changes),rows_written:s.sql.startsWith('CREATE')?0:Number(result.changes),rows_read:0}};});remote.exec('COMMIT');return results;}catch(error){remote.exec('ROLLBACK');throw error;}
 }};
 let time=f.config.startedAt+900000,sends=0,payload;
 const worker=createRemoteWorker({now:()=>time});
 const env={PILOT_ENABLED:'1',PILOT_EXPIRES_AT:new Date(f.config.expiresAt).toISOString(),PILOT_ACCESS_TOKEN:'not-a-secret',PILOT_CLOCK_SYNC_ENABLED:'1',PILOT_CLOCK_SYNC_MAX_ROWS_WRITTEN:'20000',CATALOG_DB:binding};
 const fetcher=(url,options)=>worker.fetch(new Request(url,options),env);
 const deps={...f.deps,clock:()=>time,consumer:{...f.consumer,canRefreshLocalTarget:()=>false},state:()=>pilotState('not-a-secret',{fetcher}),clockSync:async(value,token,options)=>{sends++;payload=value;return sendCycleClockDelta(value,token,{...options,fetcher});}};
 return {setTime(value){time=value;f.setTime(value);},remote,deps,env,worker,binding,advance(){time+=900000;f.advance();},stats:()=>({sends,payload}),close:()=>remote.close()};
}
test('clock-sync opt-in mantiene1003 productos por endpoint local, sin tocar ofertas; replay idle0',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);const before=durableState(f);
  const result=await runAutomaticCycle(f.config,endpoint.deps);
  assert.equal(result.status,'maintained');assert.equal(result.maintenance.transport,'clock-sync-v1');
  assert.equal(result.maintenance.changedProjectionRows,1003);assert.equal(result.maintenance.reservedRemoteWrites,4020);
  assert.equal(endpoint.stats().payload.rows.length,1003);assert.equal(result.budget.reserved_writes,0);
  const after=durableState(f);for(const key of ['products','prices','basis'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(endpoint.remote.prepare('SELECT * FROM product_prices ORDER BY id').all(),before.prices);
  assert.deepEqual(endpoint.remote.prepare('SELECT * FROM search_projection ORDER BY product_id').all(),after.projection);
  assert.equal(endpoint.remote.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,after.marker);
  assert.equal(f.stats().calls,0);endpoint.advance();
  const replay=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(replay.status,'idle');assert.equal(replay.remote.rowsWritten,0);assert.equal(endpoint.stats().sends,1);assert.deepEqual(durableState(f),after);
 }finally{endpoint?.close();f.cleanup();}
});
test('clock-sync opt-in reserva insuficiente revierte datos, marcador y ledger sin endpoint',async()=>{
 const f=largeClockFixture();try{
  f.config.maxDailyRemoteWrites=4000;const before=durableState(f);
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false},clockSync:()=>assert.fail('sin endpoint')});
  assert.equal(result.status,'daily-budget');assert.equal(result.error,'CYCLE_MAINTENANCE_BUDGET');assert.deepEqual(durableState(f),before);assert.equal(result.budget.reserved_writes,0);assert.equal(f.stats().calls,0);
 }finally{f.cleanup();}
});
test('clock-sync recupera ACK perdido de1003 filas sin reaplicar ni consumir fuentes/ledger',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  const first=await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async(...args)=>{await endpoint.deps.clockSync(...args);throw new Error('lost');}});
  assert.equal(first.status,'failed');assert.equal(first.budget.reserved_writes,4020);const before=durableState(f);endpoint.advance();
  const recovered=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(recovered.status,'recovered');assert.equal(recovered.remote.rowsWritten,0);assert.equal(recovered.budget.reserved_writes,4020);assert.equal(endpoint.stats().sends,1);assert.deepEqual(durableState(f),before);assert.equal(f.stats().calls,0);
 }finally{endpoint?.close();f.cleanup();}
});
test('clock-sync recupera commit anterior a outbox y reenvía sólo mantenimiento1003',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  const first=await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  assert.equal(first.status,'failed');assert.equal(first.budget.reserved_writes,4020);const before=durableState(f);
  unlinkSync(resolve(f.directory,'outbox.json'));endpoint.advance();
  const recovered=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(recovered.status,'recovered');assert.equal(endpoint.stats().sends,1);assert.deepEqual(durableState(f),before);assert.equal(recovered.budget.reserved_writes,4020);assert.equal(f.stats().calls,0);
 }finally{endpoint?.close();f.cleanup();}
});
test('certificados preparados o reloj-observaciones impiden tick antes de fuentes y red',async()=>{
 for(const key of ['prepared_views','clock_observations']){
  const f=fixture();try{
   const db=new DatabaseSync(f.config.sqlite);const meta=JSON.parse(f.marker());meta[key]={version:1};
   db.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(JSON.stringify(meta));db.close();const before=durableState(f);
   const result=await runAutomaticCycle({...f.config,clockSync:true},{...f.deps,state:()=>assert.fail('sin red')});
   assert.equal(result.error,'CYCLE_CERTIFIED_SNAPSHOT_UNSUPPORTED');assert.deepEqual(durableState(f),before);assert.equal(f.stats().calls,0);assert.equal(result.budget.reserved_writes,0);
  }finally{f.cleanup();}
 }
});

test('clock-sync no aumenta reserva al exceder saldo del día y revierte cargo local',async()=>{
 const f=largeClockFixture();try{
  const db=new DatabaseSync(f.config.sqlite);acquireCycleLease(db,f.config,f.config.startedAt);
  db.exec("UPDATE pilot_cycle_state SET lease_token=NULL,lease_until=NULL;INSERT INTO pilot_cycle_budget(day,rows_written) VALUES('2026-10-11',17000)");db.close();const before=durableState(f);
  const result=await runAutomaticCycle(f.config,{...f.deps,consumer:{...f.consumer,canRefreshLocalTarget:()=>false},clockSync:()=>assert.fail('sin endpoint')});
  assert.equal(result.status,'daily-budget');assert.equal(result.error,'CYCLE_MAINTENANCE_BUDGET');assert.equal(result.budget.reserved_writes,0);assert.equal(result.budget.rows_written,17000);assert.deepEqual(durableState(f),before);
 }finally{f.cleanup();}
});

test('ACK clock1003 vencido recupera sin POST y conserva reserva original de otro día UTC',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async(...args)=>{await endpoint.deps.clockSync(...args);throw new Error('lost');}});
  const before=durableState(f),pending=JSON.parse(readFileSync(resolve(f.directory,'outbox.json'),'utf8'));
  endpoint.setTime(Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil));
  const result=await runAutomaticCycle(f.config,endpoint.deps);
  assert.equal(result.status,'recovered');assert.equal(result.remote.rowsWritten,0);assert.equal(endpoint.stats().sends,1);assert.equal(f.stats().calls,0);assert.deepEqual(durableState(f),before);assert.ok(!existsSync(resolve(f.directory,'outbox.json')));
  const db=new DatabaseSync(f.config.sqlite,{readOnly:true});try{assert.equal(db.prepare("SELECT reserved_writes FROM pilot_cycle_budget WHERE day='2026-10-11'").get().reserved_writes,4020);}finally{db.close();}
 }finally{endpoint?.close();f.cleanup();}
});
test('clock1003 no aplicado vencido regenera contra checkpoint, sin enviar payload viejo',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  const before=durableState(f),pending=JSON.parse(readFileSync(resolve(f.directory,'outbox.json'),'utf8'));
  const at=Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil);endpoint.setTime(at);
  const result=await runAutomaticCycle(f.config,endpoint.deps);
  assert.equal(result.status,'recovered');assert.equal(result.maintenance.regenerated,true);assert.equal(endpoint.stats().sends,1);
  const payload=endpoint.stats().payload;assert.equal(payload.expectedSnapshot,pending.payload.expectedSnapshot);assert.notEqual(payload.finalSnapshot,pending.payload.finalSnapshot);assert.equal(payload.now,at);assert.equal(payload.rows.length,1003);
  const after=durableState(f);for(const key of ['products','prices','basis'])assert.deepEqual(after[key],before[key]);assert.equal(after.ledger.length,2);assert.equal(f.stats().calls,0);
  assert.deepEqual(endpoint.remote.prepare('SELECT * FROM search_projection ORDER BY product_id').all(),after.projection);
  const db=new DatabaseSync(f.config.sqlite,{readOnly:true});try{
   assert.equal(db.prepare("SELECT reserved_writes FROM pilot_cycle_budget WHERE day='2026-10-11'").get().reserved_writes,4020);
   assert.equal(db.prepare("SELECT reserved_writes FROM pilot_cycle_budget WHERE day='2026-10-12'").get().reserved_writes,result.maintenance.reservedRemoteWrites);
   assert.equal(result.maintenance.reservedRemoteWrites,7022);
   assert.ok(!db.prepare('SELECT value FROM pilot_meta WHERE key=?').get('cycle_clock_outbox'));
  }finally{db.close();}
 }finally{endpoint?.close();f.cleanup();}
});
test('regeneraciónclock sin saldo preserva outbox y no queda bloqueada por caducidad natural',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  const old=readFileSync(resolve(f.directory,'outbox.json'),'utf8'),pending=JSON.parse(old),before=durableState(f);
  endpoint.setTime(Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil));f.config.maxDailyRemoteWrites=4000;
  const result=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(result.status,'daily-budget');assert.equal(result.error,'CYCLE_MAINTENANCE_BUDGET');assert.equal(readFileSync(resolve(f.directory,'outbox.json'),'utf8'),old);assert.deepEqual(durableState(f),before);assert.equal(endpoint.stats().sends,0);assert.equal(f.stats().calls,0);
  f.config.maxDailyRemoteWrites=20000;const retry=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(retry.status,'recovered');assert.equal(endpoint.stats().sends,1);
 }finally{endpoint?.close();f.cleanup();}
});
test('journalclock recupera crash después de regenerar antes del outbox sin nueva reserva ni ledger',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  const old=readFileSync(resolve(f.directory,'outbox.json'),'utf8'),pending=JSON.parse(old);
  endpoint.setTime(Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil));
  const regenerated=await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('crash');}});assert.equal(regenerated.status,'failed');
  const before=durableState(f);writeFileSync(resolve(f.directory,'outbox.json'),old);endpoint.advance();
  const recovered=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(recovered.status,'recovered');assert.deepEqual(durableState(f),before);assert.equal(recovered.budget.reserved_writes,regenerated.maintenance.reservedRemoteWrites);assert.equal(endpoint.stats().sends,1);assert.equal(f.stats().calls,0);
 }finally{endpoint?.close();f.cleanup();}
});
test('ACKclock vencido con payload alterado no omite validación contra checkpoint',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async(...args)=>{await endpoint.deps.clockSync(...args);throw new Error('lost');}});
  const file=resolve(f.directory,'outbox.json'),pending=JSON.parse(readFileSync(file,'utf8'));
  endpoint.setTime(Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil));pending.payload.rows[0].before.lowest=90000;writeFileSync(file,JSON.stringify(pending));
  const before=durableState(f),result=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(result.error,'CYCLE_DELTA_INVALID');assert.deepEqual(durableState(f),before);assert.equal(endpoint.stats().sends,1);assert.ok(existsSync(file));
 }finally{endpoint?.close();f.cleanup();}
});
test('ACKclock después de checkpoint pero antes de retirar journal/outbox recupera sin POST',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  const old=JSON.parse(readFileSync(resolve(f.directory,'outbox.json'),'utf8'));endpoint.setTime(Date.parse(JSON.parse(old.payload.finalSnapshot).cache.validUntil));
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async(...args)=>{await endpoint.deps.clockSync(...args);throw new Error('lost');}});
  const db=new DatabaseSync(f.config.sqlite);unlinkSync(f.config.checkpoint);db.prepare('VACUUM INTO ?').run(f.config.checkpoint);db.close();
  const before=durableState(f),recovered=await runAutomaticCycle(f.config,endpoint.deps);assert.equal(recovered.status,'recovered');assert.equal(endpoint.stats().sends,1);assert.deepEqual(durableState(f),before);assert.equal(recovered.remote.rowsWritten,0);
 }finally{endpoint?.close();f.cleanup();}
});

test('regeneraciónclock sin presupuesto local revierte journal/reserva y conserva outbox',async()=>{
 const f=largeClockFixture();let endpoint;try{
  endpoint=await localClockEndpoint(f);
  await runAutomaticCycle(f.config,{...endpoint.deps,clockSync:async()=>{throw new Error('offline');}});
  const file=resolve(f.directory,'outbox.json'),old=readFileSync(file,'utf8'),pending=JSON.parse(old);
  endpoint.setTime(Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil));
  const db=new DatabaseSync(f.config.sqlite);db.prepare('INSERT INTO pilot_daily_write_budget VALUES(?,?,?)').run('2026-10-12',80000,80000);db.close();
  const before=durableState(f),result=await runAutomaticCycle(f.config,endpoint.deps);
  assert.equal(result.status,'daily-budget');assert.equal(result.error,'CYCLE_MAINTENANCE_BUDGET');assert.equal(result.budget.reserved_writes,0);assert.deepEqual(durableState(f),before);assert.equal(readFileSync(file,'utf8'),old);assert.equal(endpoint.stats().sends,0);
 }finally{endpoint?.close();f.cleanup();}
});

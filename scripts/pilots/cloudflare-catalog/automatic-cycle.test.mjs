import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,mkdtempSync,rmSync,existsSync,unlinkSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { initializeRefreshDemand,claimRefreshBatch,acknowledgeRefresh } from './refresh-demand.mjs';
import { rebuildProjection } from './projection.mjs';
import { runAutomaticCycle,acquireCycleLease,validateCycleConfig } from './automatic-cycle.mjs';
import { schedulerPlist } from './mac-scheduler.mjs';

function fixture(){
 const directory=mkdtempSync(resolve(tmpdir(),'catalog-automatic-'));
 const now=Date.parse('2026-10-11T15:00:00Z'),sqlite=resolve(directory,'sample.sqlite');
 const config={version:1,startedAt:now,expiresAt:now+24*3600000,intervalSeconds:900,maxDailyOffers:200,maxDailyHttp:400,maxDailyRemoteWrites:20000,
  sqlite,checkpoint:resolve(directory,'checkpoint.sqlite'),tokenFile:resolve(directory,'pilot-access.private'),consumerBundle:resolve(directory,'consumer.bundle.mjs'),reportFile:resolve(directory,'latest.json')};
 const db=new DatabaseSync(sqlite);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
 const old=new Date(now-2*86400000).toISOString();
 for(const [i,store] of ['katech','fullh4rd','maxtecno'].entries()){
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
 const consumer={localStoreIds:['katech','fullh4rd','maxtecno'],localCategories:['procesadores'],canRefreshLocalTarget:()=>true,
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
 return {directory,config,deps,consumer,stats:()=>({calls,syncs}),marker:()=>remote,setRemote:value=>{remote=value;},advance:()=>{time+=900000;},cleanup:()=>rmSync(directory,{recursive:true,force:true})};
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

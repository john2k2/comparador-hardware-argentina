import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pilotState,sendCycleDelta,buildCycleDelta,PILOT_ORIGIN } from './cycle-remote.mjs';
function payload(){const marker=generation=>JSON.stringify({projectionVersion:1,cache:{version:1,generation,validFrom:'2026-10-11T15:00:00Z',validUntil:'2026-10-12T15:00:00Z'}});return{expectedSnapshot:marker('old'),finalSnapshot:marker('new'),basisProductIds:[],product_prices:[],summaries:[],search_projection:[],price_basis:[]};}
test('estado usa exclusivamente piloto privado y rechaza recibo inválido',async()=>{
 const good=await pilotState('private',{fetcher:async(url,options)=>{assert.equal(url,PILOT_ORIGIN+'/api/pilot/state');assert.equal(options.headers.Authorization,'Bearer private');assert.ok(!url.includes('private'));return Response.json({snapshot:'known',rowsRead:1});}});assert.equal(good.rowsRead,1);
 await assert.rejects(pilotState('private',{fetcher:async()=>Response.json({snapshot:'known',rowsRead:'1'})}),/CYCLE_STATE_INVALID/);
 await assert.rejects(pilotState('private',{fetcher:async()=>new Response(null,{status:503})}),/CYCLE_PILOT_STOPPED/);
});
test('sync requiere confirmación atómica de generación y métricas reales no negativas',async()=>{
 const p=payload();const good=await sendCycleDelta(p,'private',{fetcher:async(url,options)=>{assert.equal(url,PILOT_ORIGIN+'/api/pilot/sync');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),p);return Response.json({atomic:true,generation:'new',rowsRead:3,rowsWritten:7});}});assert.equal(good.rowsWritten,7);
 for(const receipt of [{atomic:false,generation:'new',rowsRead:0,rowsWritten:0},{atomic:true,generation:'old',rowsRead:0,rowsWritten:0},{atomic:true,generation:'new',rowsRead:-1,rowsWritten:0}])await assert.rejects(sendCycleDelta(p,'private',{fetcher:async()=>Response.json(receipt)}),/CYCLE_SYNC_RECEIPT_INVALID/);
 await assert.rejects(sendCycleDelta({...p,finalSnapshot:p.expectedSnapshot},'private',{fetcher:()=>assert.fail('no red')}));
});
test('delta idéntico no escribe y membresía nueva exige otro flujo de importación',()=>{
 const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');try{for(const db of[a,b]){db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',payload().expectedSnapshot);}assert.equal(buildCycleDelta(a,b),null);
 b.prepare("UPDATE pilot_meta SET value=? WHERE key='snapshot'").run(payload().finalSnapshot);b.exec("INSERT INTO products VALUES('p','procesadores','cpu','ryzen','ryzen',1,0,NULL,NULL,'{}');INSERT INTO product_prices VALUES('o','p','katech',100,'https://katech.com.ar/producto/cpu/','{}');");assert.throws(()=>buildCycleDelta(a,b),/CYCLE_MEMBERSHIP_CHANGED/);
 }finally{a.close();b.close();}
});

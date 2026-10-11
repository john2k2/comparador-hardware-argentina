import test, { type TestContext } from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
import{initializeRefreshDemand,enqueueKnownProducts}from'./refresh-demand.mjs';import{runSharedRefresh}from'./refresh-shared-local';import{SourceHttpError}from'@/lib/scrapers/source-http';import type{Product}from'@/lib/types';
const{rebuildProjection}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const now=Date.parse('2026-10-11T17:00:00Z'),old=new Date(now-2*86400000).toISOString(),name='Procesador AMD Ryzen 5 5500',url='https://compragamer.com/producto/Procesador_AMD_Ryzen_5_5500_13359';
function fixture(t:TestContext){const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
 db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p','procesadores','cpu',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify({id:'p',name,category:'procesadores'}));db.prepare('INSERT INTO product_substrings VALUES(?,?)').run('p',name.toLowerCase());db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('p',100,100,100,1,url,0,'["compragamer"]',null,null,old,'{}');
 for(const id of['o1','o2','o3'])db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(id,'p','compragamer',100,url,JSON.stringify({id,product_id:'p',store_id:'compragamer',price:100,url,stock:'in-stock',last_updated:old}));
 rebuildProjection(db,{now,generation:'before'});initializeRefreshDemand(db);enqueueKnownProducts(db,{productIds:['p'],now,storeIds:['compragamer']});return db;}
const source=(at:number)=>({name,category:'procesadores',specs:{},prices:[{storeId:'compragamer',url,price:200,stock:'in-stock',lastUpdated:new Date(at)}]}as unknown as Product);
test('selección de ofertas no reclama otras filas pendientes del mismo producto',async t=>{
 const db=fixture(t);let time=now;
 const result=await runSharedRefresh(db,{projection:rebuildProjection,estimateIndexes:()=>0},{offerIds:['o2'],clock:()=>time,reader:async()=>source(++time)});
 assert.equal(result.attempted,1);assert.equal(result.results[0].offerId,'o2');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='pending' AND attempts=0").get()?.n,2);
});
test('todo el lote reclama antes de una única lectura compartida y conserva su fecha',async t=>{const db=fixture(t);let calls=0,time=now,readAt=0;const result=await runSharedRefresh(db,{projection:rebuildProjection,estimateIndexes:()=>0},{clock:()=>time,reader:async(_store,_url,_category,_signal,context)=>{assert.equal(context?.observedAfter,now);if(!readAt){assert.equal(db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='leased'").get()?.n,3);readAt=++time;calls++;}time++;return source(readAt);}});assert.equal(result.observed,3);assert.equal(calls,1);assert.equal(db.prepare('SELECT COUNT(DISTINCT json_extract(row_json,\'$.last_updated\')) n FROM product_prices').get()?.n,1);});
test('caché anterior al lease no cambia precios ni fechas',async t=>{const db=fixture(t),before=db.prepare('SELECT * FROM product_prices').all();const result=await runSharedRefresh(db,{projection:rebuildProjection,estimateIndexes:()=>0},{clock:()=>now,reader:async()=>source(now-1)});assert.equal(result.observed,0);assert.deepEqual(db.prepare('SELECT * FROM product_prices').all(),before);});
test('un bloqueo de fuente corta nuevas lecturas del lote y conserva backoff',async t=>{const db=fixture(t);let calls=0;const result=await runSharedRefresh(db,{projection:rebuildProjection,estimateIndexes:()=>0},{clock:()=>now,reader:async()=>{calls++;throw new SourceHttpError('blocked',403);}});assert.equal(calls,1);assert.equal(result.observed,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM pilot_refresh_demand WHERE status='backoff' AND due_at>=?").get(now+6*3600000)?.n,3);});
test('lector compartido pasa SKU RAM vigente y guarda títulos originales por oferta',async t=>{
 const db=fixture(t),title='Memoria Corsair DDR4 8GB 3200Mhz Vengeance LPX Black CL16',sku='CMK8GX4M1E3200C16';
 const ramUrl='https://compragamer.com/producto/RAM_15522';
 db.prepare('UPDATE products SET category=?,row_json=?').run('memoria-ram',JSON.stringify({id:'p',name:title,category:'memoria-ram',specs:{SKU:sku}}));
 for(const row of db.prepare('SELECT id,row_json FROM product_prices').all()){
  const raw=JSON.parse(String(row.row_json));db.prepare('UPDATE product_prices SET url=?,row_json=? WHERE id=?').run(ramUrl,JSON.stringify({...raw,url:ramUrl}),row.id);
 }
 enqueueKnownProducts(db,{productIds:['p'],storeIds:['compragamer'],now});
 const productBefore=db.prepare('SELECT * FROM products').get();let time=now;
 const result=await runSharedRefresh(db,{projection:rebuildProjection,estimateIndexes:()=>0},{clock:()=>time,reader:async()=>{
  time++;return {name:title,category:'memoria-ram',specs:{SKU:sku},prices:[{storeId:'compragamer',url:ramUrl,price:200,stock:'in-stock',lastUpdated:new Date(now+1)}]} as Product;
 }});
 assert.equal(result.observed,3);assert.deepEqual(db.prepare('SELECT * FROM products').get(),productBefore);
 for(const row of db.prepare('SELECT row_json FROM product_prices').all()){
  const raw=JSON.parse(String(row.row_json));assert.equal(raw.identity_review.proof.method,'manufacturer-ram');assert.equal(raw.source_identity.title,title);
 }
});

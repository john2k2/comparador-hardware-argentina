import test, { type TestContext } from 'node:test';import assert from 'node:assert/strict';
import{DatabaseSync}from'node:sqlite';import{readFileSync,mkdtempSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{resolve}from'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{associationSqliteDependencies}from'./association-sqlite';
import{applyAssociationPlan,associationRowHash}from'./association-local.mjs';
import{initializeRefreshDemand,enqueueKnownProducts}from'./refresh-demand.mjs';
import{runLocalRefresh}from'./refresh-local';import type{Product}from'@/lib/types';
const{rebuildProjection}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const{searchCatalog}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/engine.mjs')).href);
const{sqliteAdapter}=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs')).href);
const now=Date.parse('2026-10-11T17:00:00Z'),old=new Date(now-2*86400000).toISOString();
const name='Procesador AMD Ryzen 5 7600',url='https://katech.com.ar/producto/procesador-amd-ryzen-5-7600-am5/';
function fixture(t:TestContext){
 const db=new DatabaseSync(':memory:'),dir=mkdtempSync(tmpdir()+'/association-real-'),file=dir+'/source.html';t.after(()=>{db.close();rmSync(dir,{recursive:true});});
 db.exec(readFileSync('scripts/pilots/cloudflare-catalog/schema.sql','utf8'));db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
 for(const[id,title]of[['old','Procesador AMD Ryzen 7 7700'],['target',name]]){
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'procesadores',title.toLowerCase(),title.toLowerCase(),title.toLowerCase(),1,0,old,old,JSON.stringify({id,name:title,category:'procesadores'}));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,title.toLowerCase());db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,0,0,0,0,'',0,'[]',null,null,null,'{}');
 }
 const raw={id:'o',product_id:'old',store_id:'katech',url,price:100000,stock:'in-stock',last_updated:old};
 db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o','old','katech',100000,url,JSON.stringify(raw));
 for(const kind of['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('old',kind,'o','katech',100000,'in-stock',url,old);
 rebuildProjection(db,{now,generation:'before'});initializeRefreshDemand(db);
 const html=`<link rel="canonical" href="${url}"><h1>${name}</h1>`;writeFileSync(file,html);
 const plan={offerId:'o',expectedProductId:'old',expectedRowHash:associationRowHash(db.prepare('SELECT * FROM product_prices WHERE id=?').get('o')),targetProductId:'target',sourceTitle:name,evidence:{kind:'public-detail',url,capturedAt:new Date(now-1000).toISOString(),contentSha256:createHash('sha256').update(html).digest('hex')}};
 const deps=associationSqliteDependencies({artifacts:new Map([['o',file]]),projection:rebuildProjection});return{db,file,raw,plan,deps};
}
test('adaptador real mueve, invalida precio y permite nueva observación bajo filtro de tienda',async t=>{
 const f=fixture(t);applyAssociationPlan(f.db,f.plan,f.deps,{now});
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM price_basis WHERE id=?').get('o')?.n,0);
 assert.equal(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string).last_updated,old);
 assert.deepEqual(JSON.parse(f.db.prepare('SELECT store_ids_json FROM summaries WHERE product_id=?').get('target')!.store_ids_json as string),['katech']);
 enqueueKnownProducts(f.db,{productIds:['target'],offerIds:['o'],storeIds:['katech'],now});
 let time=now+5;
 const reader=async()=>{time+=5;return{name,category:'procesadores',specs:{},prices:[{storeId:'katech',url,price:402280,stock:'in-stock',lastUpdated:new Date(time)}]}as unknown as Product;};
 assert.equal((await runLocalRefresh(f.db,{projection:rebuildProjection,estimateIndexes:()=>0,clock:()=>time,reader})).observed,1);
 const result=await searchCatalog(sqliteAdapter(f.db),{p_query:'ryzen 7600',p_stores:['katech'],p_min_price:0},{now:time});
 assert.equal(result.total,1);assert.equal(result.products[0].lowest_price,402280);
 assert.equal((await searchCatalog(sqliteAdapter(f.db),{p_query:'ryzen 7700',p_stores:['katech'],p_min_price:0},{now:time})).total,0);
});
test('artefacto modificado rechaza antes de modificar la asociación',t=>{
 const f=fixture(t);writeFileSync(f.file,'<h1>Otra fuente</h1>');
 assert.throws(()=>applyAssociationPlan(f.db,f.plan,f.deps,{now}),/UNVERIFIED_EVIDENCE/);
 assert.equal(f.db.prepare('SELECT product_id FROM product_prices').get()?.product_id,'old');
});
test('canonical ajeno se rechaza aunque el hash del nuevo artefacto sea correcto',t=>{
 const f=fixture(t),html=`<link rel="canonical" href="https://evil.test/7600"><h1>${name}</h1>`;
 writeFileSync(f.file,html);
 f.plan.evidence.contentSha256=createHash('sha256').update(html).digest('hex');
 assert.throws(()=>applyAssociationPlan(f.db,f.plan,f.deps,{now}),/UNVERIFIED_EVIDENCE/);
 assert.equal(f.db.prepare('SELECT product_id FROM product_prices').get()?.product_id,'old');
});
function catalogFixture(t:TestContext) {
 const f=fixture(t),sourceUrl='https://compragamer.com/producto/Procesador_AMD_Ryzen_5_7600_12345';
 const raw={...f.raw,store_id:'compragamer',url:sourceUrl};
 f.db.prepare('UPDATE product_prices SET store_id=?,url=?,row_json=? WHERE id=?').run('compragamer',sourceUrl,JSON.stringify(raw),'o');
 f.plan.expectedRowHash=associationRowHash(f.db.prepare('SELECT * FROM product_prices WHERE id=?').get('o'));
 const source={id:'cg-12345',name,category:'procesadores',prices:[{storeId:'compragamer',url:sourceUrl,lastUpdated:new Date(now-1000).toISOString()}]};
 const json=JSON.stringify(source);writeFileSync(f.file,json);
 const plan={...f.plan,evidence:{...f.plan.evidence,kind:'public-catalog',url:sourceUrl,contentSha256:createHash('sha256').update(json).digest('hex')}};
 return {...f,source,plan};
}
test('captura pública compartida corrige identidad sin renovar precio ni fecha',t=>{
 const f=catalogFixture(t);applyAssociationPlan(f.db,f.plan,f.deps,{now});
 const after=JSON.parse(String(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json));
 assert.equal(after.product_id,'target');assert.equal(after.price,f.raw.price);assert.equal(after.last_updated,old);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM price_basis').get()?.n,0);
});
for(const field of ['id','date','title','store','url','category'])test(`captura compartida rechaza ${field} alterado incluso con hash correcto`,t=>{
 const f=catalogFixture(t);
 if(field==='id')f.source.id='cg-99999';
 if(field==='date')f.source.prices[0].lastUpdated=old;
 if(field==='title')f.source.name='Procesador AMD Ryzen 7 7700';
 if(field==='store')f.source.prices[0].storeId='katech';
 if(field==='url')f.source.prices[0].url='https://evil.test/producto/12345';
 if(field==='category')f.source.category='tarjetas-graficas';
 const json=JSON.stringify(f.source);writeFileSync(f.file,json);f.plan.evidence.contentSha256=createHash('sha256').update(json).digest('hex');
 assert.throws(()=>applyAssociationPlan(f.db,f.plan,f.deps,{now}),/UNVERIFIED_EVIDENCE/);
 assert.equal(f.db.prepare('SELECT product_id FROM product_prices').get()?.product_id,'old');
});

import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';
import{applyRamAdmission,validateRamAdmission,RAM_ADMISSION}from'./ram-admission.mjs';
import{catalogSearchText,catalogIdentityText}from'./catalog-matchers.mjs';
const now=Date.parse('2026-10-11T23:00:00Z'),date=new Date(now).toISOString();
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO stores VALUES(?,?)').run('compragamer','{}');
 const counts={products:0,product_prices:0,catalog_price_summaries:0,stores:1};
 const expectedSnapshot=JSON.stringify({counts,projectionVersion:1,cache:{version:1,generation:'before',validFrom:date,validUntil:new Date(now+3600000).toISOString()}});
 db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',expectedSnapshot);
 const p={expectedSnapshot,finalSnapshot:JSON.stringify({counts:{products:4,product_prices:4,catalog_price_summaries:4,stores:1},projectionVersion:1,cache:{version:1,generation:'after',validFrom:date,validUntil:new Date(now+3600000).toISOString()}}),products:[],product_prices:[],summaries:[],search_projection:[],price_basis:[]};
 for(const [id,[productId,mpn,reference]] of Object.entries(RAM_ADMISSION)){
  const url='https://compragamer.com/producto/RAM_'+reference.split(':').at(-1),name='Memoria Corsair DDR4 16GB Vengeance '+mpn,price=100,searchName=catalogSearchText(name),identity=catalogIdentityText(name);
  p.products.push({id:productId,category:'memoria-ram',catalog_identity:identity,catalog_name:searchName,catalog_document:searchName+' '+mpn.toLowerCase(),catalog_component:1,grouped_identity:Number(productId.startsWith('agrupado-')),last_scraped_at:date,updated_at:date,row_json:JSON.stringify({id:productId,name,category:'memoria-ram',specs:{SKU:mpn}})});
  const raw={id,product_id:productId,store_id:'compragamer',price,url,stock:'in-stock',last_updated:date,source_identity:{storeSku:mpn,listingRef:reference},identity_review:{proof:{version:2,method:'manufacturer-ram',attributes:{title:name}}}};
  p.product_prices.push({id,product_id:productId,store_id:'compragamer',price,url,row_json:JSON.stringify(raw)});
  p.summaries.push({product_id:productId,lowest:price,highest:price,average:price,available:1,urls:url,portable_listing:0,store_ids_json:'["compragamer"]',comparable_stats_json:null,comparable_valid_until:null,comparable_latest_observed_at:date,row_json:'{}'});
  p.search_projection.push({product_id:productId,category:'memoria-ram',catalog_identity:identity,canonical:productId==='cg-15558'?0:1,lowest:price,highest:price,average:price,available:1,comparable_available:1,urls:url,observed_at:date,next_transition:new Date(now+14400000+1).toISOString()});
  for(const kind of ['current','historical'])p.price_basis.push({product_id:productId,kind,id,store_id:'compragamer',price,stock:'in-stock',url,observed_at:date});
 }
 const binding={prepare(sql){return{bind(...values){return{sql,values};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>({success:true,meta:{rows_written:Number(db.prepare(s.sql).run(...s.values).changes),rows_read:0}}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 // Sólo fixture estructural; el wrapper real exige la revalidación TS completa.
 return{db,p,binding,options:{now,verifyOffer:()=>true}};
}
test('cuatro miembros autorizados, FTS, bases y marcador entran en un batch; repetir no duplica',async()=>{
 const f=fixture();try{const r=await applyRamAdmission(f.binding,f.p,f.options);assert.equal(r.atomic,true);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM products').get().n,4);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_substrings').get().n,4);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM price_basis').get().n,8);await assert.rejects(applyRamAdmission(f.binding,f.p,f.options),/CHECK/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_prices').get().n,4);}finally{f.db.close();}
});
test('verificador ausente o rechazo de variante falla antes de D1',async()=>{
 const f=fixture();try{assert.throws(()=>validateRamAdmission(f.p,{now}),/VERIFIER/);await assert.rejects(applyRamAdmission({batch(){assert.fail('no D1');}},f.p,{now,verifyOffer:()=>false}),/VARIANT_PROOF/);}finally{f.db.close();}
});
test('IDs, SKU, base, fecha y columnas fuera del alcance se rechazan antes del batch',async()=>{
 for(const mutate of [p=>{p.product_prices[0].id='other';},p=>{p.products[0].sql='DROP';},p=>{p.price_basis[0].price=2;},p=>{const raw=JSON.parse(p.product_prices[0].row_json);raw.source_identity.storeSku='other';p.product_prices[0].row_json=JSON.stringify(raw);},p=>{const raw=JSON.parse(p.product_prices[0].row_json);raw.last_updated=new Date(now-4*3600000).toISOString();p.product_prices[0].row_json=JSON.stringify(raw);}]){
  const f=fixture();try{mutate(f.p);await assert.rejects(applyRamAdmission({batch(){assert.fail('no D1');}},f.p,f.options));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM products').get().n,0);}finally{f.db.close();}
 }
});
test('cohorte remota divergente revierte incluso inserciones y el marcador',async()=>{
 const f=fixture();try{f.db.prepare('INSERT INTO stores VALUES(?,?)').run('extra','{}');f.db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('extra','memoria-ram','extra','extra','extra',1,0,null,null,'{}');await assert.rejects(applyRamAdmission(f.binding,f.p,f.options),/CHECK/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM products').get().n,1);assert.equal(f.db.prepare('SELECT value FROM pilot_meta').get().value,f.p.expectedSnapshot);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_prices').get().n,0);}finally{f.db.close();}
});
test('sólo una tienda extra ya invalida el conteo certificado y revierte admisión',async()=>{
 const f=fixture();try{f.db.prepare('INSERT INTO stores VALUES(?,?)').run('extra','{}');await assert.rejects(applyRamAdmission(f.binding,f.p,f.options),/CHECK/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_prices').get().n,0);assert.equal(f.db.prepare('SELECT value FROM pilot_meta').get().value,f.p.expectedSnapshot);}finally{f.db.close();}
});
test('una proyección extra de CPU o vigencia ampliada rechaza antes de escribir',async()=>{
 const f=fixture();try{const extra={...f.p.search_projection[0],product_id:'cpu',category:'procesadores',lowest:1};f.p.search_projection.push(extra);assert.throws(()=>validateRamAdmission(f.p,f.options),/SCOPE/);f.p.search_projection.pop();const marker=JSON.parse(f.p.finalSnapshot);marker.cache.validUntil=new Date(now+7200000).toISOString();f.p.finalSnapshot=JSON.stringify(marker);assert.throws(()=>validateRamAdmission(f.p,f.options),/CLOCK/);}finally{f.db.close();}
});
test('mínimos, conteos y fechas derivados deben describir la única oferta real',async()=>{
 for(const mutate of [p=>{p.summaries[0].lowest=1;},p=>{p.search_projection[0].lowest=1;},p=>{p.search_projection[0].comparable_available=0;},p=>{p.search_projection[0].observed_at=new Date(now-1).toISOString();},p=>{p.summaries[0].comparable_latest_observed_at=new Date(now-1).toISOString();}]){
  const f=fixture();try{mutate(f.p);await assert.rejects(applyRamAdmission({batch(){assert.fail('no D1');}},f.p,f.options),/DERIVED/);}finally{f.db.close();}
 }
});
test('identidad de búsqueda y ficha preferida son derivadas de la evidencia validada',async()=>{
 for(const mutate of [p=>{p.products[0].catalog_document+=' 32gb';},p=>{p.products[0].catalog_name+=' sodimm';},p=>{p.search_projection[1].canonical=1;}]){
  const f=fixture();try{mutate(f.p);assert.throws(()=>validateRamAdmission(f.p,f.options),/SEARCH_IDENTITY|CANONICAL/);}finally{f.db.close();}
 }
});
test('el reloj global nunca certifica más allá de la primera transición RAM añadida',()=>{
 const f=fixture();try{for(const key of ['expectedSnapshot','finalSnapshot']){const m=JSON.parse(f.p[key]);m.cache.validUntil=new Date(now+8*3600000).toISOString();f.p[key]=JSON.stringify(m);}assert.throws(()=>validateRamAdmission(f.p,f.options),/CLOCK_TRANSITION/);}finally{f.db.close();}
});

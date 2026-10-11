import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { searchCatalog,validateParams,MAX_TEXT_BATCHES,MAX_TEXT_CANDIDATES } from './engine.mjs';
import { sqliteAdapter } from './sqlite-adapter.mjs';
import { searchText } from './catalog-matchers.mjs';
const now=Date.parse('2026-10-11T03:00:00Z');
function fixture() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  function add({id,name='RTX 4060 8GB',identity=id,category='placas-de-video',observed=now-3600000,price=100000,store='mexx',stock='in-stock',comparable=true}) {
    const nameText=searchText(name),stamp=new Date(observed).toISOString(),row={id,name,category,updated_at:stamp,last_scraped_at:stamp,catalog_name:nameText,catalog_document:nameText,catalog_identity:identity,catalog_component:true};
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,category,identity,nameText,nameText,1,Number(id.startsWith('agrupado-')),stamp,stamp,JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').run(id,nameText);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,price,price,price,stock==='out-of-stock'?0:1,`https://${store}.example/${id}`,0,JSON.stringify([store]),null,null,stamp,'{}');
    const offer={id:`offer-${id}`,product_id:id,store_id:store,price,stock,url:`https://${store}.example/${id}`,last_updated:stamp};
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,id,store,price,offer.url,JSON.stringify(offer));
    db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'historical',offer.id,store,price,stock,offer.url,null);
    if(comparable) db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'current',offer.id,store,price,stock,offer.url,stamp);
  }
  return {db,add,search:(p)=>searchCatalog(sqliteAdapter(db),p,{now})};
}
test('caducidad exacta y fecha futura conservan historial sin elegibilidad',async()=>{
  const f=fixture();f.add({id:'current',observed:now-86400000});f.add({id:'old',observed:now-86400001});f.add({id:'future',observed:now+60001});f.add({id:'unknown',comparable:false,stock:'unknown'});
  const eligible=await f.search({p_min_price:0,p_sort:'price-asc'});assert.deepEqual(eligible.products.map(p=>p.id),['current']);
  const historical=await f.search({p_sort:'price-asc'});assert.equal(historical.total,4);f.db.close();
});
test('ficha canónica vencida no es sustituida al aplicar rango global',async()=>{
  const f=fixture();f.add({id:'agrupado-same',identity:'same',observed:now-86400001});f.add({id:'single-same',identity:'same'});
  assert.equal((await f.search({p_min_price:0})).total,0);
  assert.equal((await f.search({p_query:'rtx'})).products[0].id,'agrupado-same');f.db.close();
});
test('modelo, variante, tienda y paginación usan oferta visible del mismo corte',async()=>{
  const f=fixture();f.add({id:'exact',price:200000});f.add({id:'ti',name:'RTX 4060 Ti 8GB',price:100000});f.add({id:'venex',price:300000,store:'venex'});
  const exact=await f.search({p_query:'rtx 4060 ti',p_sort:'price-asc',p_stores:['mexx'],p_page:999,p_page_size:1});
  assert.equal(exact.total,1);assert.equal(exact.page,1);assert.equal(exact.products[0].id,'ti');assert.equal(exact.products[0].product_prices[0].price,100000);f.db.close();
});
test('FTS trigram conserva substrings y unidades RAM',async()=>{
  const f=fixture();f.add({id:'ram',name:'Memoria DDR5 16GB 6000MHz',category:'memoria-ram'});
  assert.equal((await f.search({p_query:'ddr5 16gb 6000mhz',p_category:'memoria-ram'})).total,1);f.db.close();
});
test('cache vencida recalcula la oferta y JSON retornado no renueva observación',async()=>{
  const f=fixture();f.add({id:'a',price:100000});const cached={lowest:999,highest:999,average:999,available:1,urls:'stale-cache',observed_at:new Date(now).toISOString()};
  f.db.prepare('UPDATE summaries SET comparable_stats_json=?,comparable_valid_until=?').run(JSON.stringify(cached),new Date(now-1).toISOString());
  const result=await f.search({p_min_price:0});assert.equal(result.products[0].lowest_price,100000);assert.equal(result.products[0].product_prices[0].last_updated,new Date(now-3600000).toISOString());f.db.close();
});
test('parámetros inválidos no activan búsquedas sin límite',()=>{
  for(const p of [{p_page:0},{p_page_size:49},{p_query:'x'.repeat(241)},{p_stores:Array(81).fill('s')},{p_min_price:NaN},{p_sort:'DROP TABLE'}]) assert.throws(()=>validateParams(p));
});
test('240 caracteres y 80 términos admitidos no superan los 100 bindings de D1',async()=>{
  const f=fixture();f.add({id:'a'});
  const base=sqliteAdapter(f.db),lengths=[];
  const checked={all:async(sql,values)=>{lengths.push(values.length);assert.ok(values.length<=100);return base.all(sql,values);},first:async(sql,values)=>{lengths.push(values.length);assert.ok(values.length<=100);return base.first(sql,values);}};
  for(const query of ['aa '.repeat(80),'zz '.repeat(79)+'zz']) {
    const result=await searchCatalog(checked,{p_query:query,p_sort:'relevance',p_min_price:0},{now});assert.equal(result.total,0);
  }
  assert.ok(Math.max(...lengths)<25);f.db.close();
});
test('una lectura final conserva vacío, total y página solicitada fuera del rango',async()=>{
  const f=fixture();f.add({id:'a'});f.add({id:'b'});f.add({id:'c'});
  for(const [params,expected] of [
    [{p_category:'inexistente',p_page:999},{total:0,totalPages:0,page:1,ids:[]}],
    [{p_sort:'name',p_page:999,p_page_size:2},{total:3,totalPages:2,page:2,ids:['c']}],
    [{p_page:Number.MAX_VALUE,p_page_size:2},{total:3,totalPages:2,page:2,ids:['c']}],
  ]) {
    const adapter=sqliteAdapter(f.db),result=await searchCatalog(adapter,params,{now,forceOriginal:true});
    assert.deepEqual({total:result.total,totalPages:result.totalPages,page:result.page,ids:result.products.map(p=>p.id)},expected);
    assert.equal(adapter.metrics.queries,1);
  }
  f.db.close();
});
test('ofertas hidratadas conservan orden, JSON y filtro por tienda tras descartar outlier',async()=>{
  const f=fixture();f.add({id:'a',price:100000});
  const stamp=new Date(now-3600000).toISOString();
  for(const [store,price] of [['venex',800000],['katech',120000]]) {
    const offer={id:'offer-'+store,product_id:'a',store_id:store,price,stock:'in-stock',url:'https://'+store+'.example/a',last_updated:stamp};
    f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,'a',store,price,offer.url,JSON.stringify(offer));
    f.db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('a','current',offer.id,store,price,offer.stock,offer.url,stamp);
  }
  f.db.prepare('UPDATE summaries SET store_ids_json=?').run('["mexx","venex","katech"]');
  const result=await f.search({p_min_price:0});
  assert.equal(result.products[0].highest_price,120000);
  assert.deepEqual(result.products[0].product_prices.map(o=>o.price),[100000,120000,800000]);
  const filtered=await f.search({p_min_price:0,p_stores:['katech']});
  assert.equal(filtered.products[0].lowest_price,120000);
  assert.deepEqual(filtered.products[0].product_prices.map(o=>o.id),['offer-katech']);
  assert.equal(filtered.products[0].product_prices[0].last_updated,stamp);f.db.close();
});
test('límite de 42 lotes falla sin entregar totales o fichas truncadas',async()=>{
  let calls=0;
  const rows=Array.from({length:MAX_TEXT_CANDIDATES},(_,i)=>({id:String(i),name:'RTX 4060 8GB',catalog_name:'rtx 4060 8gb',catalog_document:'rtx 4060 8gb',urls:''}));
  const db={all:async(sql)=>{calls++;assert.match(sql,/SELECT id,catalog_name/);return rows;},first:()=>assert.fail('No debe contar ni hidratar después de truncar candidatos')};
  await assert.rejects(searchCatalog(db,{p_query:'rtx 4060'},{now,forceOriginal:true}),{code:'CATALOG_CANDIDATE_BUDGET_EXCEEDED'});
  assert.equal(calls,MAX_TEXT_BATCHES);
});
test('ficha sin filas de oferta conserva product_prices null e hidratación limitada a la página',async()=>{
  const f=fixture();for(const id of ['a','b','c']) f.add({id});
  f.db.prepare('DELETE FROM product_prices WHERE product_id=?').run('b');
  const adapter=sqliteAdapter(f.db),result=await searchCatalog(adapter,{p_sort:'name',p_page:2,p_page_size:1},{now,forceOriginal:true});
  assert.equal(result.total,3);assert.equal(result.products.length,1);
  assert.equal(result.products[0].id,'b');assert.equal(result.products[0].product_prices,null);
  assert.deepEqual(adapter.metrics,{queries:1,rowsReturned:1});f.db.close();
});
test('matcher inspecciona el lote siguiente antes de contar la variante exacta',async()=>{
  const f=fixture();f.add({id:'late',name:'RTX 4060 Ti 8GB'});
  const adapter=sqliteAdapter(f.db);let batches=0;
  const row={id:'late',name:'RTX 4060 Ti 8GB',catalog_name:'rtx 4060 ti 8gb',catalog_document:'rtx 4060 ti 8gb',urls:''};
  const candidates=Array.from({length:MAX_TEXT_CANDIDATES},(_,i)=>({...row,id:'noise-'+i,name:'RTX 4060 8GB',catalog_name:'rtx 4060 8gb',catalog_document:'rtx 4060 8gb'}));
  const db={...adapter,all:async(sql,values)=>sql.includes('SELECT id,catalog_name')?(batches++===0?candidates:[row]):adapter.all(sql,values)};
  const result=await searchCatalog(db,{p_query:'rtx 4060 ti'},{now,forceOriginal:true});
  assert.equal(batches,2);assert.equal(result.total,1);assert.equal(result.products[0].id,'late');
  assert.equal(adapter.metrics.queries,1);f.db.close();
});

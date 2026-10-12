import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {candidatesSql,searchCatalog,validateParams} from './engine.mjs';
import {prepareQuery,searchText} from './catalog-matchers.mjs';
import {sqliteAdapter} from './sqlite-adapter.mjs';
import {rebuildProjection} from './projection.mjs';
const now=Date.parse('2026-10-12T04:28:42.149Z');
const indexed=`current_identity_keys AS MATERIALIZED(
 SELECT DISTINCT p2.category,p2.catalog_identity FROM summaries recent JOIN products p2 ON p2.id=recent.product_id
 WHERE p2.catalog_component=1 AND recent.comparable_latest_observed_at>=(SELECT earliest FROM clock)
 UNION SELECT p2.category,p2.catalog_identity FROM summaries recent JOIN products p2 ON p2.id=recent.product_id
 WHERE p2.catalog_component=1 AND recent.comparable_stats_json IS NOT NULL AND recent.comparable_valid_until>(SELECT now FROM clock)),`;
const legacy=`current_identity_keys AS MATERIALIZED(SELECT DISTINCT p2.category,p2.catalog_identity FROM products p2 JOIN summaries recent ON recent.product_id=p2.id
    WHERE p2.catalog_component=1 AND NOT EXISTS(SELECT 1 FROM query_terms q WHERE instr(' '||p2.catalog_name||' ',' '||q.term||' ')=0) AND (recent.comparable_latest_observed_at>=(SELECT earliest FROM clock) OR (recent.comparable_stats_json IS NOT NULL AND recent.comparable_valid_until>(SELECT now FROM clock)))),`;
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const add=({id,identity=id,category='tarjetas-graficas',observed=now-3600000,comparable=true,component=1,price=100000})=>{
  const name='RTX 4060 8GB',text=searchText(name),stamp=new Date(observed).toISOString(),url='https://mexx.example/'+id;
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,category,identity,text,text,component,Number(id.startsWith('agrupado-')),stamp,stamp,JSON.stringify({id,name,category}));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,price,price,price,1,url,0,'["mexx"]',null,null,stamp,'{}');
  const offer={id:'o-'+id,product_id:id,store_id:'mexx',price,stock:'in-stock',url,last_updated:stamp};
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,id,'mexx',price,url,JSON.stringify(offer));
  db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'historical',offer.id,'mexx',price,'in-stock',url,stamp);
  if(comparable)db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'current',offer.id,'mexx',price,'in-stock',url,stamp);
 };
 add({id:'agrupado-peer',identity:'peer',observed:now-86400001});add({id:'child-peer',identity:'peer'});
 add({id:'boundary',observed:now-86400000});add({id:'future',observed:now+60001});add({id:'non-component',component:0});
 add({id:'other-category',category:'procesadores',identity:'peer'});add({id:'cached',comparable:false,observed:now-86400001,price:333});
 db.prepare('UPDATE summaries SET comparable_stats_json=?,comparable_valid_until=? WHERE product_id=?').run(JSON.stringify({lowest:333,highest:333,average:333,available:1,urls:'https://mexx.example/cached',observed_at:new Date(now-1000).toISOString()}),new Date(now+1).toISOString(),'cached');
 const actual=sqliteAdapter(db),old={all:(sql,values)=>actual.all(sql.replace(indexed,legacy),values),first:(sql,values)=>actual.first(sql.replace(indexed,legacy),values)};
 return{db,actual,old};
}
test('scope global vacío habilita unión indexable; texto, categoría, tiendas e histórico conservan sus ramas',()=>{
 const f=fixture(),p=validateParams({p_min_price:0}),statement=candidatesSql(p,prepareQuery(''),null,now);
 assert.ok(statement.sql.includes(indexed));const plan=f.db.prepare('EXPLAIN QUERY PLAN '+statement.sql+' SELECT COUNT(*) FROM matched').all(...statement.values).map(row=>row.detail).join('\n');
 // SQLite puede recorrer la tabla minúscula del fixture para la primera
 // rama; la medición full readonly verifica el uso del índice de frescura.
 assert.match(plan,/UNION/);assert.match(plan,/summaries_valid_idx/);
 for(const input of [{p_query:'rtx',p_min_price:0},{p_category:'tarjetas-graficas',p_min_price:0},{p_stores:['mexx'],p_min_price:0},{}]){
  const params=validateParams(input),statement=candidatesSql(params,prepareQuery(params.p_query,params.p_category),null,now);assert.equal(statement.sql.includes(indexed),false);
 }
 f.db.close();
});
test('unión indexada mantiene JSON legacy, peers y clocks de 24h/futuro/stats con ambas políticas',async()=>{
 const f=fixture();for(const clock of [now-1,now,now+1])for(const preferCurrentRepresentative of [false,true])for(const input of [{p_min_price:0},{p_min_price:0,p_max_price:100000},{p_max_price:50000},{p_min_price:0,p_sort:'price-asc',p_page_size:2,p_page:2}]){
  const options={now:clock,forceOriginal:true,preferCurrentRepresentative};assert.deepEqual(await searchCatalog(f.actual,input,options),await searchCatalog(f.old,input,options));
 }
 const current=await searchCatalog(f.actual,{p_min_price:0},{now,forceOriginal:true,preferCurrentRepresentative:true});
 assert.ok(current.products.some(p=>p.id==='child-peer'));assert.ok(current.products.some(p=>p.id==='boundary'));assert.ok(current.products.some(p=>p.id==='cached'));assert.ok(!current.products.some(p=>p.id==='future'||p.id==='non-component'));
 const after=await searchCatalog(f.actual,{p_min_price:0},{now:now+1,forceOriginal:true,preferCurrentRepresentative:true});
 assert.ok(after.products.some(p=>p.id==='future'));assert.ok(!after.products.some(p=>p.id==='boundary'||p.id==='cached'));f.db.close();
});
test('proyección expirada cae a la misma unión y conserva resultado del último clock vigente',async()=>{
 const f=fixture();f.db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot','{}');rebuildProjection(f.db,{now,generation:'scope-test'});
 for(const clock of [now,now+1])for(const preferCurrentRepresentative of [false,true]){
  const options={now:clock,preferCurrentRepresentative};const actual=await searchCatalog(f.actual,{p_min_price:0},options),fallback=await searchCatalog(f.old,{p_min_price:0},{...options,forceOriginal:true});assert.deepEqual(actual,fallback);
 }
 f.db.close();
});

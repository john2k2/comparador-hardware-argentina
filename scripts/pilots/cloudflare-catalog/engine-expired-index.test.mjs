import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {searchCatalog,candidatesSql,validateParams} from './engine.mjs';
import {prepareQuery,searchText} from './catalog-matchers.mjs';
import {rebuildProjection} from './projection.mjs';

const clock=Date.parse('2026-10-12T12:00:00.000Z');
const seedHint='FROM products p INDEXED BY products_identity_idx ';
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const add=({id,identity=id,category='procesadores',name='AMD Ryzen 5 7600',price=100000,store='mexx',observed=clock-14400001})=>{
    const text=searchText(name),stamp=new Date(observed).toISOString(),url=`https://${store}.example/${id}`;
    const row={id,name,category,updated_at:stamp,last_scraped_at:stamp,catalog_identity:identity,catalog_name:text,catalog_document:text,catalog_component:true};
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,category,identity,text,text,1,Number(id.startsWith('agrupado-')),stamp,stamp,JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings VALUES(?,?)').run(id,text);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,price,price,price,1,url,0,JSON.stringify([store]),null,null,stamp,'{}');
    const offer={id:`offer-${id}`,product_id:id,store_id:store,price,stock:'in-stock',url,last_updated:stamp};
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,id,store,price,url,JSON.stringify(offer));
    db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'historical',offer.id,store,price,'in-stock',url,null);
    db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,'current',offer.id,store,price,'in-stock',url,stamp);
  };
  for(let i=0;i<160;i++) {
    add({id:`agrupado-${i}`,identity:`cohort-${i}`,price:300000+i,store:'venex',observed:i%2?clock-86400001:clock-14400001});
    add({id:`child-${i}`,identity:`cohort-${i}`,price:150000+i});
  }
  add({id:'agrupado-range',identity:'range',price:900000});
  add({id:'child-range',identity:'range',price:200000});
  add({id:'boundary',category:'clock-ttl',observed:clock-86400000});
  add({id:'future',category:'clock-future',observed:clock+60000});
  add({id:'ram',category:'memoria-ram',name:'Memoria DDR5 32GB 6000MHz 2x16GB UDIMM'});
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot','{}');
  rebuildProjection(db,{now:clock-7200000,generation:'expired-index-fixture'});
  const snapshot=db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
  assert.ok(Date.parse(JSON.parse(snapshot).cache.validUntil)<=clock);
  const adapter=(withoutHint=false)=>({
    all:async(sql,values=[])=>db.prepare(withoutHint?sql.replace(seedHint,'FROM products p '):sql).all(...values),
    first:async(sql,values=[])=>db.prepare(sql).get(...values),
  });
  return {db,snapshot,adapter};
}

test('el hint sólo se aplica al respaldo actual sin texto; histórico y FTS conservan SQL',()=>{
  for(const params of [{p_min_price:0},{p_max_price:900000},{p_min_price:0,p_stores:['mexx']},{p_min_price:0,p_query:'   '}]) {
    const p=validateParams(params),sql=candidatesSql(p,prepareQuery(p.p_query,p.p_category),null,clock).sql;
    assert.ok(sql.includes(seedHint));
  }
  for(const params of [{},{p_stores:['mexx']},{p_query:'Ryzen',p_min_price:0},{p_query:'ddr5 32gb',p_min_price:0}]) {
    const p=validateParams(params),sql=candidatesSql(p,prepareQuery(p.p_query,p.p_category),null,clock).sql;
    assert.ok(!sql.includes(seedHint));
  }
});

test('muchas cohortes con frame vencido conservan rango, tiendas, páginas y todos los órdenes',async()=>{
  const f=fixture();
  try {
    for(const policy of [false,true])for(const sort of ['relevance','price-asc','price-desc','name','newest']) {
      for(const params of [
        {p_category:'procesadores',p_min_price:0},
        {p_category:'procesadores',p_min_price:140000,p_max_price:250000,p_page:2,p_page_size:12},
        {p_category:'procesadores',p_min_price:0,p_stores:['mexx'],p_page:999,p_page_size:12},
        {p_min_price:0,p_stores:['venex'],p_page_size:12},
        {p_min_price:0,p_page:2,p_page_size:12},
      ]) {
        const options={now:clock,snapshot:f.snapshot,preferCurrentRepresentative:policy};
        const actual=await searchCatalog(f.adapter(),{...params,p_sort:sort},options);
        const expected=await searchCatalog(f.adapter(true),{...params,p_sort:sort},options);
        assert.deepEqual(actual,expected);
      }
    }
    const range=await searchCatalog(f.adapter(),{p_category:'procesadores',p_min_price:190000,p_max_price:250000},{now:clock,snapshot:f.snapshot,preferCurrentRepresentative:true});
    assert.deepEqual(range.products.map(product=>product.id),['child-range']);
  }finally{f.db.close();}
});

test('TTL inclusivo y tolerancia futura exacta no cambian al seleccionar el índice',async()=>{
  const f=fixture();
  try {
    for(const [category,time,total] of [['clock-ttl',clock,1],['clock-ttl',clock+1,0],['clock-future',clock-1,0],['clock-future',clock,1]]) {
      const params={p_category:category,p_min_price:0},options={now:time,snapshot:f.snapshot,preferCurrentRepresentative:true};
      const actual=await searchCatalog(f.adapter(),params,options);
      assert.equal(actual.total,total);
      assert.deepEqual(actual,await searchCatalog(f.adapter(true),params,options));
    }
  }finally{f.db.close();}
});

test('el plan del respaldo busca categoría e identidad completas y no vuelve al índice de categoría',async()=>{
  const f=fixture(),queries=[];
  try {
    const adapter={...f.adapter(),all:async(sql,values)=>{queries.push({sql,values});return f.adapter().all(sql,values);}};
    await searchCatalog(adapter,{p_category:'procesadores',p_min_price:0},{now:clock,snapshot:f.snapshot,preferCurrentRepresentative:true});
    assert.equal(queries.length,1);
    const plan=f.db.prepare('EXPLAIN QUERY PLAN '+queries[0].sql).all(...queries[0].values).map(row=>row.detail);
    assert.ok(plan.some(detail=>/SEARCH p USING INDEX products_identity_idx \(category=\? AND catalog_identity=\?\)/.test(detail)),plan.join('\n'));
    assert.ok(!plan.some(detail=>/SEARCH p USING INDEX products_category_idx/.test(detail)),plan.join('\n'));
  }finally{f.db.close();}
});

test('la proyección válida, las consultas normalizadas y el histórico mantienen resultados',async()=>{
  const f=fixture();
  try {
    for(const params of [{p_category:'procesadores',p_min_price:0},{p_query:'Ryzen',p_min_price:0},{p_query:'ddr5 32gb 6000mhz',p_category:'memoria-ram',p_min_price:0},{p_category:'procesadores'},{p_query:'Ryzen',p_stores:['mexx']}]) {
      for(const time of [clock-7200000,clock]) {
        const options={now:time,snapshot:f.snapshot,preferCurrentRepresentative:true};
        assert.deepEqual(await searchCatalog(f.adapter(),params,options),await searchCatalog(f.adapter(true),params,options));
      }
    }
  }finally{f.db.close();}
});

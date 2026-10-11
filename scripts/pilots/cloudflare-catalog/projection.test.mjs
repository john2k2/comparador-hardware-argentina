import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {rebuildProjection} from './projection.mjs';
import {searchCatalog} from './engine.mjs';
import {sqliteAdapter} from './sqlite-adapter.mjs';
const now=Date.parse('2026-10-11T05:00:00Z');
function fixture() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
  const add=(id,{identity=id,observed=now-3600000,name='rtx 5070',price=100000}={})=>{
    const stamp=new Date(observed).toISOString();
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'tarjetas-graficas',identity,name,name,1,Number(id.startsWith('agrupado-')),stamp,stamp,JSON.stringify({id,name,category:'tarjetas-graficas',updated_at:stamp}));
    db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').run(id,name);
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,price,price,price,1,'https://shop.example/'+id,0,'["shop"]',null,null,stamp,'{}');
    const offer={id:'offer-'+id,product_id:id,store_id:'shop',price,stock:'in-stock',url:'https://shop.example/'+id,last_updated:stamp};
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,id,'shop',price,offer.url,JSON.stringify(offer));
    for(const kind of ['current','historical'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,offer.id,'shop',price,'in-stock',offer.url,stamp);
  };
  const search=(params,options={})=>searchCatalog(sqliteAdapter(db),params,{now,...options});
  return {db,add,search};
}
test('proyección conserva JSON de búsqueda y preferencia canónica antes de frescura',async()=>{
  const f=fixture();f.add('agrupado-same',{identity:'same',observed:now-86400001});f.add('single-same',{identity:'same'});f.add('independent',{price:200000});
  const cases=[{p_min_price:0,p_sort:'price-asc'},{p_query:'rtx',p_sort:'name'},{p_query:'rtx 5070',p_min_price:0,p_page:999},{}];
  const expected=await Promise.all(cases.map(p=>f.search(p,{forceOriginal:true})));
  rebuildProjection(f.db,{now,generation:'a'});
  for(let i=0;i<cases.length;i++)assert.deepEqual(await f.search(cases[i]),expected[i]);
  assert.equal((await f.search(cases[0])).total,1);f.db.close();
});
test('vence en el milisegundo exacto y vuelve al lector real si el runner se detiene',async()=>{
  const f=fixture();f.add('last',{observed:now-86400000});
  const report=rebuildProjection(f.db,{now,generation:'a'});
  assert.equal(Date.parse(report.cache.validUntil),now+1);
  assert.equal((await f.search({p_min_price:0})).total,1);
  const at=await f.search({p_min_price:0},{now:now+1});
  assert.deepEqual(at,await f.search({p_min_price:0},{now:now+1,forceOriginal:true}));assert.equal(at.total,0);
  const refreshed=rebuildProjection(f.db,{now:now+1,generation:'a',affectedProductIds:[]});
  assert.equal(refreshed.changedProjectionRows,1);assert.equal((await f.search({p_min_price:0},{now:now+1})).total,0);f.db.close();
});
test('delta recalcula sólo afectados, incluye sus pares y nunca renueva la fecha de oferta',async()=>{
  const f=fixture();f.add('agrupado-a',{identity:'a'});f.add('single-a',{identity:'a'});f.add('unaffected');
  rebuildProjection(f.db,{now,generation:'a'});
  const stored=f.db.prepare('SELECT row_json FROM product_prices WHERE product_id=?').get('agrupado-a').row_json;
  const old=f.db.prepare('SELECT * FROM search_projection WHERE product_id=?').get('unaffected');
  f.db.prepare('UPDATE price_basis SET price=150000 WHERE product_id=?').run('agrupado-a');
  const delta=rebuildProjection(f.db,{now,generation:'b',affectedProductIds:['agrupado-a']});
  assert.equal(delta.affectedProducts,2);assert.equal(delta.changedProjectionRows,1);
  assert.deepEqual(f.db.prepare('SELECT * FROM search_projection WHERE product_id=?').get('unaffected'),old);
  assert.equal(f.db.prepare('SELECT row_json FROM product_prices WHERE product_id=?').get('agrupado-a').row_json,stored);
  assert.deepEqual(await f.search({p_min_price:0}),await f.search({p_min_price:0},{forceOriginal:true}));f.db.close();
});
test('transacción revierte proyección y generación ante fallo del sincronizador',()=>{
  const f=fixture();f.add('a');rebuildProjection(f.db,{now,generation:'a'});
  const before=f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
  f.db.exec('BEGIN');f.db.prepare('UPDATE price_basis SET price=200000').run();rebuildProjection(f.db,{now,generation:'b',affectedProductIds:['a']});f.db.exec('ROLLBACK');
  assert.equal(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,before);
  assert.equal(f.db.prepare('SELECT lowest FROM search_projection').get().lowest,100000);f.db.close();
});
test('tick dentro del intervalo vigente no escribe ni invalida la caché',()=>{
  const f=fixture();f.add('a');rebuildProjection(f.db,{now,generation:'a'});
  const old=f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;
  const report=rebuildProjection(f.db,{now:now+1000,generation:'a',affectedProductIds:[]});
  assert.equal(report.baseRowsWritten,0);assert.deepEqual(report.statements,[]);
  assert.equal(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value,old);f.db.close();
});
test('fecha futura entra exactamente con tolerancia y el reloj hacia atrás reconstruye el corte',async()=>{
  const f=fixture();f.add('future',{observed:now+60001});rebuildProjection(f.db,{now,generation:'a'});
  assert.equal((await f.search({p_min_price:0})).total,0);
  rebuildProjection(f.db,{now:now+1,generation:'a',affectedProductIds:[]});
  assert.equal((await f.search({p_min_price:0},{now:now+1})).total,1);
  const back=rebuildProjection(f.db,{now,generation:'a',affectedProductIds:[]});assert.equal(back.changedProjectionRows,1);
  assert.equal((await f.search({p_min_price:0})).total,0);f.db.close();
});

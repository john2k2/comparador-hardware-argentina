import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {queryClockCertificate,queryClockSql} from './query-clock.mjs';
import {searchCatalog} from './engine.mjs';
import {sqliteAdapter} from './sqlite-adapter.mjs';
const now=Date.parse('2026-10-12T03:00:00Z');
function fixture() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./projection.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO stores VALUES(?,?)').run('mexx','{}');
  const add=({id,name='RAM DDR4 16GB',identity=id,observed=now-3600000,transition=now-1,cachedUntil=null})=>{
    const text=name.toLowerCase(),stamp=new Date(observed).toISOString(),row={id,name,category:'memoria-ram'};
    db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'memoria-ram',identity,text,text,1,0,stamp,stamp,JSON.stringify(row));
    db.prepare('INSERT INTO product_substrings(id,document) VALUES(?,?)').run(id,text);
    const url='https://mexx.example/'+id,offer={id:'o-'+id,product_id:id,store_id:'mexx',price:100000,stock:'in-stock',url,last_updated:stamp};
    db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run(offer.id,id,'mexx',100000,url,JSON.stringify(offer));
    db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,100000,100000,100000,1,url,0,'["mexx"]',cachedUntil?'{}':null,cachedUntil?new Date(cachedUntil).toISOString():null,stamp,'{}');
    for(const kind of ['current','historical'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run(id,kind,offer.id,'mexx',100000,'in-stock',url,stamp);
    db.prepare('INSERT INTO search_projection VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'memoria-ram',identity,1,100000,100000,100000,1,1,url,stamp,new Date(transition).toISOString());
  };
  const marker=()=>JSON.stringify({projectionVersion:1,counts:{products:db.prepare('SELECT COUNT(*) n FROM products').get().n,
    product_prices:db.prepare('SELECT COUNT(*) n FROM product_prices').get().n,catalog_price_summaries:db.prepare('SELECT COUNT(*) n FROM summaries').get().n,stores:1},
    cache:{version:1,generation:'g1',validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now-1).toISOString()}});
  return {db,add,marker,clock:(params={},time=now)=>queryClockCertificate(sqliteAdapter(db),params,{now:time,snapshot:marker()})};
}
test('transición ajena no vence la consulta; proyección vencida pronostica el próximo evento sin escrituras',async()=>{
  const f=fixture();f.add({id:'ram',transition:now+120000});f.add({id:'other',name:'CPU Ryzen 7600',transition:now-1});
  const writes=f.db.prepare('SELECT total_changes() n').get().n;
  const certificate=await f.clock({p_query:'ddr4'});assert.equal(certificate.validUntil,now+120000);assert.equal(certificate.expires,now+60000);
  const other=await f.clock({p_query:'ryzen'});assert.equal(other.validUntil,now+3*3600000+1);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,writes);f.db.close();
});
test('24h inclusivas y fecha futura de 60s caducan/entran en el milisegundo exacto',async()=>{
  for(const observed of [now-86400000,now+60001]) {
    const f=fixture();f.add({id:'edge',observed});assert.equal((await f.clock({p_query:'ddr4'})).validUntil,now+1);
    const params={p_query:'ddr4',p_min_price:0};
    const before=await searchCatalog(sqliteAdapter(f.db),params,{now,snapshot:f.marker(),forceOriginal:true});
    const after=await searchCatalog(sqliteAdapter(f.db),params,{now:now+1,snapshot:f.marker(),forceOriginal:true});
    assert.deepEqual([before.total,after.total],observed<now?[1,0]:[0,1]);f.db.close();
  }
});
test('ranking de cuatro horas conserva el límite inclusivo sin servir orden vencido',async()=>{
  const f=fixture();f.add({id:'a',observed:now-14400000});f.add({id:'b',observed:now-10800000});
  assert.equal((await f.clock({p_query:'ddr4'})).validUntil,now+1);
  const read=time=>searchCatalog(sqliteAdapter(f.db),{p_query:'ddr4'},{now:time,snapshot:f.marker(),forceOriginal:true});
  assert.deepEqual((await read(now)).products.map(p=>p.id),['a','b']);assert.deepEqual((await read(now+1)).products.map(p=>p.id),['b','a']);f.db.close();
});
test('cache de stats exclusiva y pares de identidad fuera del prefiltro acotan el certificado',async()=>{
  const f=fixture();f.add({id:'ram',identity:'same',transition:now+120000});
  f.add({id:'peer',identity:'same',name:'CPU Ryzen',cachedUntil:now+1500});
  assert.equal((await f.clock({p_query:'ddr4'})).validUntil,now+120000);
  assert.equal((await f.clock({p_query:'ddr4',p_min_price:999999})).validUntil,now+1500);
  const statement=queryClockSql({p_query:'ddr4',p_min_price:999999},now);
  assert.match(statement.sql,/projection_clock_idx/);assert.match(statement.sql,/CROSS JOIN price_basis b INDEXED BY basis_lookup_idx/);
  assert.equal(statement.values.includes(999999),false);f.db.close();
});
test('reloj anterior a validFrom, metadata parcial y stores no ejecutan SQL de certificado',async()=>{
  const f=fixture();f.add({id:'a'});const noRead={first(){assert.fail('No leer clock fuera de alcance');}};
  assert.equal(await queryClockCertificate(noRead,{p_stores:['mexx']},{now,snapshot:f.marker()}),null);
  assert.equal(await queryClockCertificate(noRead,{}, {now:now-1001,snapshot:f.marker()}),null);
  const partial=JSON.parse(f.marker());delete partial.counts;
  assert.equal(await queryClockCertificate(noRead,{}, {now,snapshot:JSON.stringify(partial)}),null);
  f.db.close();
});
test('guard ausente, inválido o deadline no futuro nunca produce certificado',async()=>{
  const f=fixture();f.add({id:'a'});
  for(const next_transition of [undefined,'invalid',new Date(now).toISOString()]) {
    assert.equal(await queryClockCertificate({first:async()=>({next_transition})},{},{now,snapshot:f.marker()}),null);
  }
  assert.equal((await f.clock({p_query:'no-match'})).expires,now+60000);f.db.close();
});

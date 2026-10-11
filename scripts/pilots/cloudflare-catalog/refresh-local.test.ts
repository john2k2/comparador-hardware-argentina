import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeRefreshDemand, enqueueKnownProducts, claimRefreshBatch } from './refresh-demand.mjs';
import { runLocalRefresh, validateLocalTarget, reviewLocalObservation, persistLocalObservation } from './refresh-local';
import type { Product } from '@/lib/types';
const { rebuildProjection }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const { searchCatalog }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/engine.mjs')).href);
const { sqliteAdapter }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs')).href);
const now=Date.parse('2026-10-11T15:00:00Z');
const name='Placa de video MSI GeForce RTX 5070 Ventus 2X 12GB';
function fixture() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/schema.sql'),'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
  const old=new Date(now-2*86400000).toISOString(),url='https://maxtecno.com.ar/producto/msi-rtx-5070-ventus-2x-12gb/';
  const raw={id:'o',product_id:'p',store_id:'maxtecno',url,price:100000,stock:'in-stock',last_updated:old};
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p','tarjetas-graficas','identity',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify({id:'p',name,category:'tarjetas-graficas'}));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run('p',name.toLowerCase());
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o','p','maxtecno',100000,url,JSON.stringify(raw));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('p',100000,100000,100000,1,url,0,'["maxtecno"]',null,null,old,'{}');
  for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p',kind,'o','maxtecno',100000,'in-stock',url,old);
  rebuildProjection(db,{now,generation:'before'});initializeRefreshDemand(db);enqueueKnownProducts(db,{productIds:['p'],now,storeIds:['maxtecno']});
  let time=now;
  const clock=()=>time;
  const source=(changes:Record<string,unknown>={})=>({id:'source',name,category:'tarjetas-graficas',specs:{SKU:'MSI-VENTUS'},prices:[{storeId:'maxtecno',url,price:120000,stock:'in-stock',lastUpdated:new Date(time+1),installment:null,...changes}]} as unknown as Product);
  const dependencies={projection:rebuildProjection,estimateIndexes:()=>0,clock,reader:async()=>{const result=source();time+=5;return result;}};
  return {db,url,raw,source,dependencies,advance:()=>{time+=5;}};
}
test('reader local valida tiendas/HTTPS/URLs conocidas y rechaza query o host ajeno',()=>{
  assert.equal(validateLocalTarget('maxtecno','https://maxtecno.com.ar/producto/cpu/'),true);
  assert.equal(validateLocalTarget('maxtecno','https://evil.example/producto/cpu/'),false);
  assert.equal(validateLocalTarget('maxtecno','https://maxtecno.com.ar/producto/cpu/?token=x'),false);
  assert.equal(validateLocalTarget('unknown','https://maxtecno.com.ar/producto/cpu/'),false);
});
test('search ID -> demanda -> fuente -> precio/basis/proyección/ACK preserva histórico',async()=>{
  const f=fixture();const beforeMarker=f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
  assert.equal((await searchCatalog(sqliteAdapter(f.db),{p_query:'rtx 5070',p_min_price:0},{now})).total,0);
  const result=await runLocalRefresh(f.db,f.dependencies);assert.equal(result.observed,1);assert.equal(result.results[0].status,'observed');
  assert.equal(f.db.prepare('SELECT price FROM product_prices').get()!.price,120000);
  assert.equal(f.db.prepare("SELECT price FROM price_basis WHERE kind='current'").get()!.price,120000);
  assert.equal(f.db.prepare("SELECT price FROM price_basis WHERE kind='historical'").get()!.price,100000);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pilot_offer_observations').get()!.n,2);
  assert.equal(f.db.prepare('SELECT status FROM pilot_refresh_demand').get()!.status,'observed');
  assert.notEqual(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,beforeMarker);
  assert.equal((await searchCatalog(sqliteAdapter(f.db),{p_query:'rtx 5070',p_min_price:0},{now:now+5})).total,1);
  f.db.close();
});
test('source sin observación conserva fecha y generación; demanda entra en backoff',async()=>{
  const f=fixture();const marker=f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
  const result=await runLocalRefresh(f.db,{...f.dependencies,reader:async()=>null});assert.equal(result.observed,0);
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);
  assert.equal(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,marker);
  assert.equal(f.db.prepare('SELECT status FROM pilot_refresh_demand').get()!.status,'backoff');f.db.close();
});
test('variante incorrecta de la fuente no modifica precio ni renueva frescura',async()=>{
  const f=fixture();const result=await runLocalRefresh(f.db,{...f.dependencies,reader:async()=>{const source=f.source();source.name='MSI GeForce RTX 5070 Ti Ventus 2X 16GB';f.advance();return source;}});
  assert.equal(result.observed,0);assert.equal(result.results[0].outcome,'identity-mismatch');
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);f.db.close();
});
test('stock desconocido observado conserva referencia y retira current sin convertirlo en comparable',async()=>{
  const f=fixture();const result=await runLocalRefresh(f.db,{...f.dependencies,reader:async()=>{const source=f.source({stock:'unknown'});f.advance();return source;}});
  assert.equal(result.observed,1);assert.equal(result.results[0].comparable,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM price_basis WHERE kind='current'").get()!.n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM price_basis WHERE kind='historical'").get()!.n,1);f.db.close();
});
test('presupuesto agotado revierte raw/basis/proyección/historia y deja fracaso de persistencia',async()=>{
  const f=fixture();f.db.exec("CREATE TABLE pilot_daily_write_budget(day TEXT PRIMARY KEY,used INTEGER,ceiling INTEGER);INSERT INTO pilot_daily_write_budget VALUES('2026-10-11',80000,80000);");
  const marker=f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value;
  const result=await runLocalRefresh(f.db,f.dependencies);assert.equal(result.observed,0);assert.equal(result.results[0].outcome,'persistence-error');
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);
  assert.equal(f.db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get()!.value,marker);
  assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name='pilot_offer_observations'").get(),undefined);f.db.close();
});
test('límite máximo3 y fecha de fuente vieja impiden refresco ficticio',async()=>{
  const f=fixture();await assert.rejects(runLocalRefresh(f.db,{...f.dependencies,limit:4}),/LIMIT/);
  const result=await runLocalRefresh(f.db,{...f.dependencies,reader:async()=>{const source=f.source({lastUpdated:new Date(now-1)});f.advance();return source;}});
  assert.equal(result.observed,0);assert.equal(result.results[0].outcome,'no-observation');f.db.close();
});
test('lease reemplazado o vencido no escribe raw, proyección, historia ni presupuesto',()=>{
  for(const replaced of [true,false]) {
    const f=fixture();const lease=claimRefreshBatch(f.db,{now,limit:1})[0];
    const price=reviewLocalObservation({name,category:'tarjetas-graficas'},lease,f.source(),now+2);
    if(replaced)f.db.prepare("UPDATE pilot_refresh_demand SET lease_token='another-token'").run();
    else f.db.prepare('UPDATE pilot_refresh_demand SET lease_until=?').run(now+2);
    const tables=['product_prices','price_basis','summaries','search_projection','pilot_meta'];
    const before=tables.map(table=>f.db.prepare('SELECT * FROM '+table).all());
    assert.throws(()=>persistLocalObservation(f.db,lease,price,f.dependencies,now+2),/LEASE_CONFLICT/);
    assert.deepEqual(tables.map(table=>f.db.prepare('SELECT * FROM '+table).all()),before);
    assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name IN('pilot_offer_observations','pilot_daily_write_budget')").get(),undefined);
    assert.equal(f.db.isTransaction,false);f.db.close();
  }
});
test('observación actualizada se conserva en fallback/tienda/rango y tras vencer intervalo proyectado',async()=>{
  const f=fixture();await runLocalRefresh(f.db,f.dependencies);
  const latest=f.db.prepare('SELECT comparable_latest_observed_at FROM summaries').get()!.comparable_latest_observed_at;
  assert.equal(latest,new Date(now+1).toISOString());
  const input={p_query:'rtx 5070',p_min_price:0};
  for(const clock of [now+5,now+4*3600000+6]) {
    const projected=await searchCatalog(sqliteAdapter(f.db),input,{now:clock});
    const original=await searchCatalog(sqliteAdapter(f.db),input,{now:clock,forceOriginal:true});
    const store=await searchCatalog(sqliteAdapter(f.db),{...input,p_stores:['maxtecno']},{now:clock});
    assert.equal(projected.total,1);assert.deepEqual(projected,original);assert.equal(store.total,1);
    assert.deepEqual(store.products,projected.products);
  }
  assert.equal((await searchCatalog(sqliteAdapter(f.db),input,{now:now+86400002})).total,0);f.db.close();
});

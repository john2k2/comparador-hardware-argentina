import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeRefreshDemand, enqueueKnownProducts, claimRefreshBatch } from './refresh-demand.mjs';
import { runLocalRefresh, validateLocalTarget, reviewLocalObservation, persistLocalObservation, createLocalOfferReader, refreshLocalCli, canRefreshLocalTarget } from './refresh-local';
import { parseWooProductDetail } from '@/lib/scrapers/woocommerce-shared';
import { parseKnownProductDetail } from '@/lib/scrapers/known-product-detail';
import { SourceHttpError } from '@/lib/scrapers/source-http';
import type { Product } from '@/lib/types';
const { rebuildProjection }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/projection.mjs')).href);
const { searchCatalog }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/engine.mjs')).href);
const { sqliteAdapter }=await import(pathToFileURL(resolve('scripts/pilots/cloudflare-catalog/sqlite-adapter.mjs')).href);
const now=Date.parse('2026-10-11T15:00:00Z');
const name='Placa de video MSI GeForce RTX 5070 Ventus 2X 12GB';
function fixture(storeId='maxtecno') {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(resolve('scripts/pilots/cloudflare-catalog/schema.sql'),'utf8'));
  db.prepare('INSERT INTO pilot_meta VALUES(?,?)').run('snapshot',JSON.stringify({counts:{},hashes:{}}));
  const old=new Date(now-2*86400000).toISOString(),url=storeId==='fullh4rd'?'https://www.fullh4rd.com.ar/prod/12345/msi-rtx-5070-ventus-2x-12gb':`https://${storeId}.com.ar/producto/msi-rtx-5070-ventus-2x-12gb/`;
  const raw={id:'o',product_id:'p',store_id:storeId,url,price:100000,stock:'in-stock',last_updated:old};
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?)').run('p','tarjetas-graficas','identity',name.toLowerCase(),name.toLowerCase(),1,0,old,old,JSON.stringify({id:'p',name,category:'tarjetas-graficas'}));
  db.prepare('INSERT INTO product_substrings VALUES(?,?)').run('p',name.toLowerCase());
  db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('o','p',storeId,100000,url,JSON.stringify(raw));
  db.prepare('INSERT INTO summaries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('p',100000,100000,100000,1,url,0,JSON.stringify([storeId]),null,null,old,'{}');
  for(const kind of ['historical','current'])db.prepare('INSERT INTO price_basis VALUES(?,?,?,?,?,?,?,?)').run('p',kind,'o',storeId,100000,'in-stock',url,old);
  rebuildProjection(db,{now,generation:'before'});initializeRefreshDemand(db);enqueueKnownProducts(db,{productIds:['p'],now,storeIds:[storeId]});
  let time=now;
  const clock=()=>time;
  const source=(changes:Record<string,unknown>={})=>({id:'source',name,category:'tarjetas-graficas',specs:{SKU:'MSI-VENTUS'},prices:[{storeId,url,price:120000,stock:'in-stock',lastUpdated:new Date(time+1),installment:null,...changes}]} as unknown as Product);
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
  assert.equal(result.observed,1);assert.ok('comparable' in result.results[0]);assert.equal(result.results[0].comparable,false);
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

test('allowlist local admite lectores Woo y DOM registrados; rechaza categorías y sesiones',()=>{
  assert.equal(validateLocalTarget('katech','https://katech.com.ar/producto/ram/'),true);
  assert.equal(validateLocalTarget('fullh4rd','https://www.fullh4rd.com.ar/prod/12345/rtx-5070'),true);
  for(const url of ['https://www.fullh4rd.com.ar/cat/search/rtx','https://www.fullh4rd.com.ar/prod/12345/rtx?price=1','https://www.fullh4rd.com.ar/prod/12345/rtx#stock','https://evil.example/prod/12345/rtx'])
    assert.equal(validateLocalTarget('fullh4rd',url),false);
  assert.equal(validateLocalTarget('liontech','https://liontech.com.ar/producto/ram/'),true);
  assert.equal(validateLocalTarget('37bytes','https://37bytes.com.ar/producto/ram/'),false);
});
test('selección acotada no reserva otras tiendas y rechaza selección ajena antes de lector',async()=>{
  const f=fixture('katech');let calls=0;
  const reader=async()=>{calls++;return null;};
  assert.equal((await runLocalRefresh(f.db,{...f.dependencies,reader,storeIds:['fullh4rd']})).attempted,0);
  await assert.rejects(runLocalRefresh(f.db,{...f.dependencies,reader,storeIds:['37bytes']}),/STORES/);
  assert.equal(calls,0);assert.equal(f.db.prepare('SELECT status FROM pilot_refresh_demand').get()!.status,'pending');f.db.close();
});
test('capacidad exige atributos completos y no amplía familias por tener lector',()=>{
  assert.equal(canRefreshLocalTarget('katech','https://katech.com.ar/producto/cpu/','procesadores','AMD Ryzen 7 8700G AM5'),true);
  assert.equal(canRefreshLocalTarget('katech','https://katech.com.ar/producto/ssd/','almacenamiento','SSD Kingston 1TB NV3'),false);
  assert.equal(canRefreshLocalTarget('katech','https://katech.com.ar/producto/ram/','memoria-ram','Memoria DDR5 32GB'),false);
});
test('lectores Woo y DOM ampliados mantienen destino exacto y no invocan descubrimiento',async()=>{
  const calls:string[]=[];
  const reader=createLocalOfferReader({wooReader:async(id)=>{calls.push('woo:'+id);return null;},detailReader:async(_url,store)=>{calls.push('dom:'+store.id);return null;}});
  await reader('liontech','https://liontech.com.ar/producto/cpu/','procesadores');
  await reader('mexx','https://www.mexx.com.ar/productos-rubro/procesadores/123-cpu.html','procesadores');
  await reader('xtpc','https://www.xt-pc.com.ar/prod/12345/cpu','procesadores');
  assert.deepEqual(calls,['woo:liontech','dom:mexx','dom:xtpc']);
});
test('familia sin prueba se rechaza antes de HTTP y ciclo automático conserva pausa de seis horas',async()=>{
  const f=fixture('katech');let calls=0;
  f.db.prepare("UPDATE products SET category='almacenamiento'").run();
  const result=await runLocalRefresh(f.db,{...f.dependencies,failureRetryAfterMs:6*3600000,reader:async()=>{calls++;return null;}});
  assert.equal(result.observed,0);assert.equal(calls,0);
  assert.equal(f.db.prepare('SELECT due_at FROM pilot_refresh_demand').get()!.due_at,now+6*3600000);
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);f.db.close();
});
test('Katech observa HTML visible y backorder; FullH4rd observa detalle con precio ARS y producto principal',async()=>{
  for(const storeId of ['katech','fullh4rd']) {
    const f=fixture(storeId);const calls:string[]=[];
    const reader=createLocalOfferReader({
      wooReader:async(id,url,category)=>{
        calls.push(id);assert.equal(url,f.url);
        const result=parseWooProductDetail(`<body class="single-product"><div id="product-123" class="product instock"><h1 class="product_title">${name}</h1><div class="w-vwrapper"><h5>Precio especial EFECTIVO/TRANSFERENCIA</h5><p class="product_field price"><bdi>$120.000</bdi></p></div><p class="stock available-on-backorder">Disponible para reserva</p><button class="single_add_to_cart_button">Comprar</button></div></body>`,url,{id,name:'Katech',baseUrl:'https://katech.com.ar'},category,'gpu');
        assert.ok(result);result.prices[0].lastUpdated=new Date(now+1);f.advance();return result;
      },
      detailReader:async(url,store,category)=>{
        calls.push(store.id);assert.equal(url,f.url);
        const json=JSON.stringify({'@type':'Product',name,url,sku:'MSI-VENTUS',offers:{'@type':'Offer',price:130000,priceCurrency:'ARS',availability:'https://schema.org/InStock'}});
        const result=parseKnownProductDetail(`<link rel="canonical" href="${url}"><h1>${name}</h1><span class="price">$130.000</span><script type="application/ld+json">${json}</script>`,url,store,category);
        assert.ok(result);result.prices[0].lastUpdated=new Date(now+1);f.advance();return result;
      },
    });
    const result=await runLocalRefresh(f.db,{...f.dependencies,reader,storeIds:[storeId]});
    assert.equal(result.observed,1);assert.deepEqual(calls,[storeId]);
    const comparable=storeId==='fullh4rd';assert.ok('comparable' in result.results[0]);assert.equal(result.results[0].comparable,comparable);
    assert.equal(result.results[0].stock,comparable?'in-stock':'unknown');
    const saved=JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string);
    assert.equal(saved.price_condition,comparable?'unspecified':'special');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM price_basis WHERE kind='current'").get()!.n,comparable?1:0);
    const search=await searchCatalog(sqliteAdapter(f.db),{p_query:'rtx 5070',p_min_price:0,p_stores:[storeId]},{now:now+5});
    assert.equal(search.total,comparable?1:0);f.db.close();
  }
});
test('403 en Katech o FullH4rd conserva fecha/precio/proyección y aplica backoff',async()=>{
  for(const storeId of ['katech','fullh4rd']) {
    const f=fixture(storeId);const before=f.db.prepare('SELECT * FROM search_projection').all();
    const result=await runLocalRefresh(f.db,{...f.dependencies,storeIds:[storeId],reader:async()=>{throw new SourceHttpError('blocked');}});
    assert.equal(result.observed,0);assert.equal(result.results[0].outcome,'http-403');
    assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);
    assert.deepEqual(f.db.prepare('SELECT * FROM search_projection').all(),before);
    const queue=f.db.prepare('SELECT status,due_at FROM pilot_refresh_demand').get()!;
    assert.equal(queue.status,'backoff');assert.ok(Number(queue.due_at)>now);f.db.close();
  }
});
test('lector local no invoca dependencias para destino ajeno',async()=>{
  let calls=0;const reader=createLocalOfferReader({wooReader:async()=>{calls++;return null;},detailReader:async()=>{calls++;return null;}});
  await assert.rejects(reader('fullh4rd','https://evil.example/prod/123/gpu','tarjetas-graficas'),/IDENTITY/);
  assert.equal(calls,0);
});

test('variante incorrecta en Katech/FullH4rd no renueva precios ni marca comparable',async()=>{
  for(const storeId of ['katech','fullh4rd']) {
    const f=fixture(storeId);
    const result=await runLocalRefresh(f.db,{...f.dependencies,storeIds:[storeId],reader:async()=>{const source=f.source();source.name='MSI GeForce RTX 5070 Ti Ventus 2X 16GB';f.advance();return source;}});
    assert.equal(result.observed,0);assert.equal(result.results[0].outcome,'identity-mismatch');
    assert.deepEqual(JSON.parse(f.db.prepare('SELECT row_json FROM product_prices').get()!.row_json as string),f.raw);f.db.close();
  }
});

test('consumidor con producto seleccionado no lee ni reserva otra oferta pendiente de la misma tienda',async()=>{
  const f=fixture('katech'),outsideUrl=f.url.replace('12gb/', '12gb-outside/');
  f.db.prepare("INSERT INTO products SELECT ?,category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,? FROM products WHERE id='p'")
    .run('outside-p',JSON.stringify({id:'outside-p',name,category:'tarjetas-graficas'}));
  const raw={...f.raw,id:'outside-o',product_id:'outside-p',url:outsideUrl};
  f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('outside-o','outside-p','katech',raw.price,outsideUrl,JSON.stringify(raw));
  enqueueKnownProducts(f.db,{productIds:['outside-p'],storeIds:['katech'],now});
  f.db.prepare("UPDATE pilot_refresh_demand SET priority=200 WHERE offer_id='outside-o'").run();
  const before=f.db.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside-o'").get();
  const calls:string[]=[];
  const result=await runLocalRefresh(f.db,{...f.dependencies,limit:1,productIds:['p'],storeIds:['katech'],reader:async(_id,url)=>{
    calls.push(url);const source=f.source();f.advance();return source;
  }});
  assert.equal(result.attempted,1);assert.equal(result.observed,1);assert.deepEqual(calls,[f.url]);
  assert.deepEqual(f.db.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside-o'").get(),before);
  assert.deepEqual(JSON.parse(f.db.prepare("SELECT row_json FROM product_prices WHERE id='outside-o'").get()!.row_json as string),raw);
  f.db.close();
});

test('CLI --product-id conserva una demanda ajena vencida y no hace HTTP si el seleccionado está fresco',async()=>{
  const f=fixture('katech'),actualNow=Date.now(),directory=mkdtempSync(join(tmpdir(),'catalog-scope-')),file=join(directory,'sample.sqlite');
  const outsideUrl=f.url.replace('12gb/', '12gb-outside/');
  f.db.prepare("INSERT INTO products SELECT ?,category,catalog_identity,catalog_name,catalog_document,catalog_component,grouped_identity,last_scraped_at,updated_at,? FROM products WHERE id='p'")
    .run('outside-p',JSON.stringify({id:'outside-p',name,category:'tarjetas-graficas'}));
  const outside={...f.raw,id:'outside-o',product_id:'outside-p',url:outsideUrl,last_updated:new Date(actualNow-2*86400000).toISOString()};
  f.db.prepare('INSERT INTO product_prices VALUES(?,?,?,?,?,?)').run('outside-o','outside-p','katech',outside.price,outsideUrl,JSON.stringify(outside));
  const fresh={...f.raw,last_updated:new Date(actualNow-3600000).toISOString()};
  f.db.prepare("UPDATE product_prices SET row_json=? WHERE id='o'").run(JSON.stringify(fresh));
  f.db.exec('DELETE FROM pilot_refresh_demand');
  enqueueKnownProducts(f.db,{productIds:['outside-p'],storeIds:['katech'],now:actualNow});
  const before=f.db.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside-o'").get();
  f.db.prepare('VACUUM INTO ?').run(file);
  const originalFetch=globalThis.fetch;let httpCalls=0;
  globalThis.fetch=async()=>{httpCalls++;throw new Error('TEST_HTTP_FORBIDDEN');};
  try {
    const args=[file,'--product-id','p','--store-id','katech','--fresh-hours','3'];
    const preview=await refreshLocalCli(['--dry-run',...args]);
    assert.ok('knownSupported' in preview);assert.deepEqual(preview.knownSupported.map(row=>row.store_id),['katech']);
    const result=await refreshLocalCli(['--execute',...args]);assert.ok('attempted' in result);assert.equal(result.attempted,0);assert.equal(httpCalls,0);
    const check=new DatabaseSync(file,{readOnly:true});
    try{assert.deepEqual(check.prepare("SELECT * FROM pilot_refresh_demand WHERE offer_id='outside-o'").get(),before);}
    finally{check.close();}
  } finally {globalThis.fetch=originalFetch;f.db.close();rmSync(directory,{recursive:true});}
});

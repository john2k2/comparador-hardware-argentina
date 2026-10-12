import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheInterval,cacheRequest,queryCacheProbe,queryCertificate,readCached,writeCached} from './response-cache.mjs';
const clock=Date.parse('2026-10-11T12:00:00Z');
const marker=(overrides={})=>JSON.stringify({cache:{version:1,generation:'g1',validFrom:new Date(clock-1000).toISOString(),validUntil:new Date(clock+120000).toISOString(),...overrides}});
function memoryCache(){const entries=new Map();return {entries,async match(k){return entries.get(k.url)?.clone();},async put(k,r){entries.set(k.url,r.clone());}};}
test('TTL acotado al mínimo entre 60 segundos y cada transición certificada',()=>{
  assert.equal(cacheInterval(marker(),clock).expires,clock+60000);
  assert.equal(cacheInterval(marker({validUntil:new Date(clock+1200).toISOString()}),clock).expires,clock+1200);
  for(const value of ['bad','{}',marker({version:2}),marker({generation:''}),marker({validFrom:new Date(clock+1).toISOString()}),marker({validUntil:new Date(clock+999).toISOString()})]) assert.equal(cacheInterval(value,clock),null);
});
test('key canónica conserva texto y todos los filtros; separa evidencia y generación',async()=>{
  const url=new URL('http://localhost/api/search'),params={p_query:'RTX 5070',p_category:null,p_stores:['venex','mexx','venex'],p_min_price:0,p_max_price:null,p_sort:'price-asc',p_page:2,p_page_size:12};
  const key=await cacheRequest(url,params,false,'g1');
  assert.equal(key.url,(await cacheRequest(url,{...params,p_stores:['mexx','venex']},false,'g1')).url);
  for(const change of [{p_query:'rtx 5070'},{p_category:'tarjetas-graficas'},{p_stores:[]},{p_min_price:null},{p_max_price:500000},{p_sort:'relevance'},{p_page:1},{p_page_size:48}]) assert.notEqual(key.url,(await cacheRequest(url,{...params,...change},false,'g1')).url);
  assert.notEqual(key.url,(await cacheRequest(url,params,true,'g1')).url);
  assert.notEqual(key.url,(await cacheRequest(url,params,false,'g2')).url);
  assert.equal(key.headers.has('Range'),false);assert.equal(key.headers.has('Cookie'),false);
});
test('rechaza respuesta vencida aun si backend la conserva y guarda TTL redondeado hacia abajo',async()=>{
  const cache=memoryCache(),key=new Request('http://localhost/key'),interval=cacheInterval(marker({validUntil:new Date(clock+1500).toISOString()}),clock);
  assert.equal(await writeCached(cache,key,new Response('{}'),interval,clock),true);
  assert.equal(cache.entries.get(key.url).headers.get('Cache-Control'),'public, max-age=1');
  assert.ok(await readCached(cache,key,interval,clock+1499));
  assert.equal(await readCached(cache,key,interval,clock+1500),null);
  assert.equal(await readCached(cache,key,{...interval,generation:'g2'},clock),null);
  assert.equal(await writeCached(cache,key,new Response('{}',{status:503}),interval,clock),false);
  assert.equal(await writeCached(cache,key,new Response('{}'),interval,clock+1000),false);
});
test('fallo de Cache API sólo degrada a MISS; nunca sirve parcial o condicional',async()=>{
  const key=new Request('http://localhost/key'),interval=cacheInterval(marker(),clock),broken={async match(){throw Error('cache off');},async put(){throw Error('cache off');}};
  assert.equal(await readCached(broken,key,interval,clock),null);
  assert.equal(await writeCached(broken,key,new Response('{}'),interval,clock),false);
  for(const status of [206,304])assert.equal(await readCached({async match(){return new Response(null,{status});}},key,interval,clock),null);
});
const queryMarker=()=>JSON.stringify({projectionVersion:1,counts:{products:1,product_prices:1,catalog_price_summaries:1,stores:1},
  cache:JSON.parse(marker({validUntil:new Date(clock-1).toISOString()})).cache});
test('metadata de consulta admite frame global vencido pero no parcial o clock anterior a validFrom',()=>{
  const raw=queryMarker();assert.equal(queryCacheProbe(raw,clock).clockVersion,1);
  assert.equal(queryCacheProbe(raw,clock-1001),null);
  for(const change of [{projectionVersion:2},{counts:{}},{counts:{products:0,product_prices:1,catalog_price_summaries:0,stores:1}},
    {counts:{products:1,product_prices:1,catalog_price_summaries:2,stores:1}},{cache:{...JSON.parse(raw).cache,validFrom:123}}]) {
    assert.equal(queryCacheProbe(JSON.stringify({...JSON.parse(raw),...change}),clock),null);
  }
});
test('certificado por entrada verifica TTL exacto, versión, deadline, generación y regresión',async()=>{
  const cache=memoryCache(),key=new Request('http://localhost/query'),probe=queryCacheProbe(queryMarker(),clock);
  const interval=queryCertificate(probe,clock+120000,clock);
  assert.equal(await writeCached(cache,key,new Response('{}'),interval,clock),true);
  const stored=cache.entries.get(key.url);assert.equal(stored.headers.get('X-Pilot-Query-Clock'),'1');
  assert.ok(await readCached(cache,key,{...probe,expires:clock+119999},clock+59999));
  assert.equal(await readCached(cache,key,{...probe,expires:clock+120000},clock+60000),null);
  assert.equal(await readCached(cache,key,probe,clock-1),null);
  for(const [header,value] of [['X-Pilot-Query-Clock','2'],['X-Pilot-Cache-Created',String(clock+1)],
    ['X-Pilot-Cache-Deadline',String(clock+59999)],['X-Pilot-Cache-Generation','g2']]) {
    const headers=new Headers(stored.headers);headers.set(header,value);
    assert.equal(await readCached({match:async()=>new Response('{}',{headers})},key,probe,clock),null);
  }
  assert.equal(queryCertificate(probe,clock,clock),null);assert.equal(queryCertificate(probe,NaN,clock),null);
});

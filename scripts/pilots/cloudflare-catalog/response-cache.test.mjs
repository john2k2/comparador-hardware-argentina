import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheInterval,cacheRequest,readCached,writeCached} from './response-cache.mjs';
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

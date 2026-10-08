import test from 'node:test';
import assert from 'node:assert/strict';
import {capture,requestUrl,sampleOffsets} from './catalog-restructure-capture.mjs';

test('sampling spans population instead of reading first 5000',()=>{
  assert.deepEqual(sampleOffsets(61000),[0,15000,30000,45000,60000]);
  assert.deepEqual(sampleOffsets(500),[0]);
  assert.throws(()=>sampleOffsets(-1));
});
test('requests cannot address personal tables or another project',()=>{
  assert.throws(()=>requestUrl('user_profiles',0));
  assert.throws(()=>requestUrl('../auth/users',0));
  assert.throws(()=>requestUrl('products',-1));
  const url=requestUrl('products',0);
  assert.equal(url.origin,'https://zyiyziubpcpgoqlkcrie.supabase.co');
  assert.equal(url.searchParams.get('limit'),'1000');
});
const names=['products','product_prices','catalog_price_summaries','price_history'];
const meta={tables:names.map(name=>({name,columns:[{name:name==='catalog_price_summaries'?'product_id':'id'}],allocation:{rowsEstimate:500}}))};
test('read-only capture never writes remotely and documents incomplete snapshot',async()=>{
  const calls=[];
  const result=await capture(meta,'synthetic-key-long-enough',async(url,options)=>{
    calls.push({url,options});
    const key=url.pathname.endsWith('catalog_price_summaries')?'product_id':'id';
    return Response.json([{[key]:'synthetic'}]);
  });
  assert.equal(calls.length,4);
  for(const {options} of calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);}
  assert.equal(result.representativeness.transactionalSnapshot,false);
  assert.equal(result.representativeness.foreignKeyClosed,false);
  assert.equal(result.representativeness.fullDatabaseMeasurement,false);
});
test('failed reads and incomplete rows cannot become evidence',async()=>{
  await assert.rejects(capture(meta,'synthetic-key-long-enough',async()=>new Response('denied',{status:403})),/CAPTURE_HTTP_STATUS/);
  await assert.rejects(capture(meta,'synthetic-key-long-enough',async()=>Response.json([{extra:'field'}])),/CAPTURE_COMPLETE_ROW/);
});
test('oversized response cancels collection instead of saving partial evidence',async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32*1024*1024+1));},cancel(){cancelled=true;}});
  await assert.rejects(capture(meta,'synthetic-key-long-enough',async()=>new Response(body,{headers:{'content-type':'application/json'}})),/CAPTURE_BYTE_BUDGET/);
  assert.equal(cancelled,true);
});

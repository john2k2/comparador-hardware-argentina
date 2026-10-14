import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleSnapshot } from './sample-snapshot.mjs';
import { verifySnapshot } from './snapshot-verify.mjs';
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'catalog-sample-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source');mkdirSync(source);
  const products=Array.from({length:25},(_,i)=>({id:i===24?'zzz-peer':String(i).padStart(3,'0'),category:'almacenamiento',catalog_component:true,catalog_name:'ssd drive',catalog_document:'ssd drive',catalog_identity:i===24?'identity-0':`identity-${i}`,name:'SSD drive'}));
  const rows={stores:[{id:'mexx',name:'Mexx'}],products,product_prices:products.map(p=>({id:'o-'+p.id,product_id:p.id,store_id:'mexx',price:100,url:'https://www.mexx.com.ar/'+p.id,last_updated:'2026-10-11T05:00:00Z'})),catalog_price_summaries:products.map(p=>({product_id:p.id,lowest:100,highest:100,average:100,available:0,store_ids:['mexx'],best_offers:[],comparable_offers:[]}))};
  const tables=Object.entries(rows).map(([table,items])=>{const content=items.map(x=>JSON.stringify(x)+'\n').join('');writeFileSync(join(source,table+'.jsonl'),content);return{table,count:items.length,sha256:createHash('sha256').update(content).digest('hex'),terminatedOnEmptyPage:true};});
  writeFileSync(join(source,'manifest.json'),JSON.stringify({tables,referenceNow:'2026-10-11T05:00:00Z',endedAt:'2026-10-11T05:00:00Z'}));
  return {source,target:join(dir,'sample')};
}
test('la muestra cierra pares de identidad y mantiene relaciones y fechas originales',async t=>{
  const f=fixture(t);const manifest=await sampleSnapshot(f);assert.equal(manifest.sample,true);assert.equal(manifest.sourceCaptureAtomic,false);
  await verifySnapshot(f.target);
  const selected=readFileSync(join(f.target,'products.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(selected.length,21);assert.ok(selected.some(p=>p.id==='zzz-peer'));assert.ok(!selected.some(p=>p.id==='023'));
  const prices=readFileSync(join(f.target,'product_prices.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(prices.length,21);assert.ok(prices.every(p=>selected.some(x=>x.id===p.product_id)&&p.last_updated==='2026-10-11T05:00:00Z'));
});
test('límite o captura corrupta fallan antes de crear la muestra',async t=>{
  const f=fixture(t);await assert.rejects(sampleSnapshot({...f,maxProducts:20}),/BUDGET_EXCEEDED/);assert.equal(existsSync(f.target),false);
  await assert.rejects(sampleSnapshot({...f,maxProducts:NaN}),/BUDGET_INVALID/);
  writeFileSync(join(f.source,'products.jsonl'),'{}\n');await assert.rejects(sampleSnapshot(f),/INTEGRITY_MISMATCH/);assert.equal(existsSync(f.target),false);
});

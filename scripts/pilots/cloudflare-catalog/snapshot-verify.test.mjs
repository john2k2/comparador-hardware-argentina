import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync,writeFileSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySnapshot } from './snapshot-verify.mjs';
import { importSnapshot } from './import-local.mjs';
test('rechaza una edición con el mismo conteo y una captura sin página final',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'catalog-check-'));
 try{
  const contents='{"id":"one","price":100}\n';
  const tables=['stores','products','product_prices','catalog_price_summaries'].map(table=>({table,count:1,sha256:createHash('sha256').update(contents).digest('hex'),terminatedOnEmptyPage:true}));
  for(const entry of tables)writeFileSync(join(dir,entry.table+'.jsonl'),contents);
  const manifest={endedAt:'2026-10-11T05:00:00Z',referenceNow:'2026-10-11T05:00:00Z',tables};
  const save=()=>writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));save();
  await verifySnapshot(dir);
  writeFileSync(join(dir,'product_prices.jsonl'),contents.replace('100','101'));
  await assert.rejects(verifySnapshot(dir),/SNAPSHOT_INTEGRITY_MISMATCH:product_prices/);
  const destination=join(dir,'must-not-exist.sqlite');
  await assert.rejects(importSnapshot({source:dir,sqlite:destination}),/SNAPSHOT_INTEGRITY_MISMATCH:product_prices/);
  assert.equal(existsSync(destination),false);
  writeFileSync(join(dir,'product_prices.jsonl'),contents);manifest.tables[3].terminatedOnEmptyPage=false;save();
  await assert.rejects(verifySnapshot(dir),/SNAPSHOT_INCOMPLETE/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

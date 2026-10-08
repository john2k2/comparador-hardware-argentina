import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeInput, validateInput, validateIndex, privateFile, privateRoot, runLab, csvCell } from './catalog-restructure-space.mjs';

function fixture() {
  return {capturedAt:'2026-10-08T18:00:00Z',sourceVersion:'17.6',representativeness:{method:'Synthetic test fixture only, not catalog evidence.'},
    tables:[{name:'products',columns:[{name:'id',type:'text',notNull:true},{name:'updated_at',type:'timestamp with time zone',notNull:true},
      {name:'specs',type:'jsonb',notNull:true}],
      indexes:[{name:'products_pkey',definition:'CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)',bytes:16384,scans:10,isPrimary:true,isUnique:true,valid:true},
        {name:'products_updated_at_idx',definition:'CREATE INDEX products_updated_at_idx ON public.products USING btree (updated_at DESC)',bytes:16384,scans:0,isPrimary:false,isUnique:false,valid:true}],
      allocation:{rowsEstimate:1000,heapBytes:1048576,tableBytes:2097152,indexBytes:32768,totalBytes:2129920}}],
    samples:{products:Array.from({length:80},(_,i)=>({id:`fixture-${i}`,updated_at:'2026-10-01T00:00:00Z',
      specs:{text:Array.from({length:100},(_,j)=>createHash('sha256').update(`${i}/${j}`).digest('hex')).join('')}}))}};
}

test('explicit real metadata preserves exact index SQL, types and nullability',()=>{
  const input=validateInput(fixture());
  assert.equal(input.schema.columns[1].physical_type,'timestamp with time zone');
  assert.equal(input.schema.indexes[0].definition,fixture().tables[0].indexes[0].definition);
  assert.equal(input.tables[0],'products');
  const numeric=fixture();numeric.tables[0].columns[2].type='numeric(12,2)';
  assert.equal(normalizeInput(numeric).schema.columns[2].physical_type,'numeric(12,2)');
});

test('rejects remote DB URIs, secrets and personal fields before opening PG',()=>{
  for(const change of [x=>{x.token='secret';},x=>{x.samples.products[0].id='postgres://host/db';},x=>{x.samples.products[0].email='person@example.com';}]) {
    const input=fixture();change(input);assert.throws(()=>validateInput(input),/SPACE_SECRET_OR_PERSONAL_DATA/);
  }
});

test('rejects incomplete rows, excess sample budget and unknown tables/types',()=>{
  let input=fixture();delete input.samples.products[0].specs;assert.throws(()=>validateInput(input),/SPACE_COMPLETE_ROW/);
  input=fixture();input.samples.products=Array(5001).fill(input.samples.products[0]);assert.throws(()=>validateInput(input),/SPACE_SAMPLE_BUDGET/);
  input=fixture();input.tables[0].name='user_profiles';assert.throws(()=>validateInput(input),/SPACE_TABLE_ALLOWLIST/);
  input=fixture();input.tables[0].columns[0].type='text); DROP TABLE products';assert.throws(()=>validateInput(input),/SPACE_COLUMN_TYPE/);
  input=normalizeInput(fixture());delete input.tables;
  input.schema.columns[0].physical_type='text); CREATE TABLE injected(id text); --';
  assert.throws(()=>validateInput(input),/SPACE_TABLE_METADATA/);
});

test('refuses multi-statements, functions, other targets and unready indexes',()=>{
  const index=normalizeInput(fixture()).schema.indexes[0];
  for(const definition of [index.definition+'; SELECT 1',index.definition.replace('(id)','(pg_read_file(id))'),
    index.definition.replace('(id)','(evil(id))'),index.definition.replace('public.products','public.price_history')])
    assert.throws(()=>validateIndex({...index,definition},'products'),/SPACE_INDEX/);
  assert.throws(()=>validateIndex({...index,indisready:false},'products'),/SPACE_UNREADY_INDEX/);
});

test('private path rejects remote and outside scope before accessing files',async()=>{
  await assert.rejects(privateFile('https://example.com/input.json'),/SPACE_REMOTE_PATH/);
  await assert.rejects(privateFile('/tmp/other.json'),/SPACE_PATH_SCOPE/);
});

test('array SQL null is distinct from text null',()=>{
  assert.notEqual(csvCell([null],'_text'),csvCell(['null'],'_text'));
});

test('PG17 isolation measures TOAST/update/compaction and restores exact original rows',async()=>{
  await fs.mkdir(privateRoot,{recursive:true,mode:0o700});
  const suffix=randomUUID(),source=path.join(privateRoot,`test-input-${suffix}.json`),output=path.join(privateRoot,`test-result-${suffix}.json`);
  try {
    const input=fixture();
    input.tables[0].columns.push({name:'labels',type:'text[]',notNull:false});
    for(const row of input.samples.products) row.labels=[null,'null','NULL','','a,b','a"b','a\\b'];
    await fs.writeFile(source,JSON.stringify(input),{flag:'wx',mode:0o600});
    const receipt=await runLab(source,output);
    assert.equal(receipt.noTcp,true);assert.equal(receipt.exactRowsRestored,true);
    assert.equal(receipt.clusterStopped,true);assert.equal(receipt.temporaryRemoved,true);
    const first=receipt.phases[0].tables[0],last=receipt.phases.at(-1).tables[0];
    assert.equal(first.rows,80);assert.ok(first.toastBytes>0);assert.equal(first.indexes.length,2);
    assert.equal(first.totalBytes,first.tableBytes+first.indexBytes);
    assert.equal(first.physicalTuples.dead_tuple_count,0);assert.equal(last.physicalTuples.dead_tuple_count,0);
    assert.ok(receipt.phases.some(p=>p.name.startsWith('same-values-update-')&&p.tables[0].physicalTuples.dead_tuple_count>0));
    assert.equal(receipt.estimates[0].isEstimate,true);assert.equal(receipt.estimates[0].isRemoteBloatMeasurement,false);
    assert.equal((await fs.stat(output)).mode&0o077,0);
    await assert.rejects(runLab(source,output));
  } finally {await fs.rm(source,{force:true});await fs.rm(output,{force:true});}
});

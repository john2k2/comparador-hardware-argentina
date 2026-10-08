import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {buildTelemetryMaintenanceArchive,processTelemetryMaintenance,validateTelemetryMaintenanceOptions} from './telemetry-maintenance.mjs';
import {createTelemetryMaintenanceStorageFetch,telemetryMaintenanceObjectKeys,downloadTelemetryMaintenanceArchive} from './telemetry-maintenance-network.mjs';
import {storeTelemetryBacklogArchive,reconcileTelemetryBacklogMetadata} from './telemetry-backlog-storage.mjs';

const config=validateTelemetryMaintenanceOptions({mode:'archive-retire',projectId:'fixture-project',cutoff:'2026-10-07T20:00:00.000000Z',now:'2026-10-07T20:10:00Z',approvalId:'fixture'});
const snapshot=[{cache_key:'fixture:1',scope:'operational-store-event',payload_text:'{"large":9007199254740993}',
  expires_at:'2026-10-01T00:00:00.000001Z',created_at:'2026-09-28T00:00:00.000001Z',updated_at:'2026-09-29T00:00:00.000001Z'}];
const build=()=>buildTelemetryMaintenanceArchive(snapshot,config);
const bucket={id:'catalog-history-archive',public:false,file_size_limit:1048576,allowed_mime_types:['application/gzip','application/json']};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('three parallel immutable writes settle before three exact readbacks and retirement',async()=>{
  const archive=build(),objects=new Map(),writes=[],reads=[],uploadGate=defer(),downloadGate=defer();
  let bucketReads=0,retire=0;
  const storage={getBucket:async()=>{bucketReads++;return {data:bucket};},from:()=>({
    upload:async(key,bytes,settings)=>{writes.push(key);assert.equal(settings.upsert,false);await uploadGate.promise;objects.set(key,Buffer.from(bytes));return {error:null};},
    download:async key=>{reads.push(key);await downloadGate.promise;return {data:new Blob([objects.get(key)])};}})};
  const result=processTelemetryMaintenance({selectSnapshot:async()=>snapshot,storeArchive:async()=>storeTelemetryBacklogArchive(storage,archive),
    retireSnapshot:async()=>{retire++;return {selected:1,removed:1,changed_or_missing:0,removed_keys:['fixture:1']};},reconcileMetadata:async()=>[]},config);
  await new Promise(r=>setImmediate(r));assert.equal(writes.length,3);assert.equal(reads.length,0);assert.equal(retire,0);
  uploadGate.resolve();await new Promise(r=>setImmediate(r));assert.equal(reads.length,3);assert.equal(retire,0);
  downloadGate.resolve();const final=await result;assert.equal(final.removed,1);assert.equal(retire,1);assert.equal(bucketReads,2);
});

function fakeStorage({lost=false,missing=false,corrupt=false,publicAfterUpload=false}={}) {
  const objects=new Map();let bucketReads=0;
  return {objects,getBucket:async()=>({data:{...bucket,public:publicAfterUpload&&++bucketReads>1}}),from:()=>({
    upload:async(key,bytes)=>{if(!missing||!key.endsWith('selection.json.gz'))objects.set(key,Buffer.from(bytes));if(lost)throw new Error('lost');return {error:null};},
    download:async key=>{const bytes=objects.get(key);return bytes?{data:new Blob([corrupt&&key.endsWith('manifest.json')?Buffer.alloc(bytes.length):bytes])}:{error:{status:404}};}})};
}
test('lost upload ACK reconciles exact objects without retry; partial or corrupt custody blocks retire',async()=>{
  const archive=build();
  assert.ok((await storeTelemetryBacklogArchive(fakeStorage({lost:true}),archive)).selectionBytes.equals(archive.selectionBytes));
  for(const mode of [{missing:true},{corrupt:true},{publicAfterUpload:true}]) {
    let retire=0;const storage=fakeStorage(mode);
    const result=await processTelemetryMaintenance({selectSnapshot:async()=>snapshot,storeArchive:async()=>storeTelemetryBacklogArchive(storage,archive),
      retireSnapshot:async()=>{retire++;},reconcileMetadata:async()=>[]},config);
    assert.equal(retire,0);assert.equal(result.removed,0);assert.equal(result.success,false);
  }
});
test('SDK real uses eight guarded calls, no upsert or extra path, and independent recovery stays compatible',async()=>{
  const archive=build(),objects=new Map(),calls=[],origin='https://fixture.example';
  const client=createClient(origin,'synthetic',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createTelemetryMaintenanceStorageFetch(origin,telemetryMaintenanceObjectKeys(archive),{
    allowUpload:true,transport:async(url,init)=>{
      const target=new URL(url),method=init.method||'GET';calls.push({path:target.pathname,method});
      if(target.pathname.includes('/bucket/'))return new Response(JSON.stringify(bucket),{headers:{'content-type':'application/json'}});
      if(method==='POST'){assert.equal(new Headers(init.headers).get('x-upsert'),'false');objects.set(target.pathname,Buffer.from(init.body));return new Response('{"Key":"fixture"}',{headers:{'content-type':'application/json'}});}
      return new Response(objects.get(target.pathname));
    }})}});
  const result=await storeTelemetryBacklogArchive(client.storage,archive);
  assert.ok(result.gzipBytes.equals(archive.backup.gzipBytes));assert.equal(calls.length,8);assert.equal(calls.filter(x=>x.method==='POST').length,3);
  assert.ok(calls.every(x=>['GET','POST'].includes(x.method)));
  const recovered=await downloadTelemetryMaintenanceArchive(client.storage,archive.manifestSha256,config.projectId);
  assert.equal(recovered.rows[0].payload,snapshot[0].payload_text);
});
test('all metadata pages start bounded and settle before reconciliation; malformed page fails closed',async()=>{
  const keys=Array.from({length:250},(_,i)=>`fixture:${i}`),gate=defer(),pages=[];
  const task=reconcileTelemetryBacklogMetadata(keys,async page=>{pages.push(page);await gate.promise;return [];});
  assert.equal(pages.length,5);assert.ok(pages.every(p=>p.length===50));gate.resolve();assert.deepEqual(await task,[]);
  await assert.rejects(reconcileTelemetryBacklogMetadata(keys,async()=>[{cache_key:'outside'}]),/METADATA_READ/);
  await assert.rejects(reconcileTelemetryBacklogMetadata([...keys,keys[0]],async()=>[]),/KEYS/);
});

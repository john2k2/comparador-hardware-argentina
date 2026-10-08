import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createOperationDirectory,writeDurable,readPrivate,privateRoot,sampleUrl,saveLocalArchive,projectId,sha,origin,createDrainCallbacks} from './telemetry-backlog-io.mjs';
import {parseArguments,checkScheduledMaintenance,verifyAuthorization,requireFreshTimestamp} from '../telemetry-backlog-drain.mjs';

test('CLI refuses implicit execute, wrong flags and missing immutable plan',()=>{
  for(const args of [[],['delete'],['execute','--out','x'],['prepare','--out','x','--preflight','y','--max-rows','1','--approval-id','a','--delete','true']])assert.throws(()=>parseArguments(args));
});
test('sample GET URL fixes table/columns/scopes and cannot address user data',()=>{
  const url=sampleUrl('operational-store-event','2026-10-08T20:00:00Z',0);
  assert.equal(url.origin,`https://${projectId}.supabase.co`);
  assert.equal(url.pathname,'/rest/v1/api_cache_entries');assert.equal(url.searchParams.get('limit'),'250');
  assert.throws(()=>sampleUrl('user_profiles','2026-10-08T20:00:00Z',0));
  assert.throws(()=>sampleUrl('operational-store-event','future',0));
});
test('scheduler gate blocks active runs, unknown reads and daily boundary',async()=>{
  const calls=[];const empty=(tool,args)=>{calls.push(args);return '[]';};
  assert.equal(await checkScheduledMaintenance({},new Date('2026-10-08T20:00:00Z'),empty),true);
  assert.equal(calls.length,3);
  await assert.rejects(checkScheduledMaintenance({},new Date('2026-10-08T04:50:00Z'),empty),/DAILY_WINDOW/);
  await assert.rejects(checkScheduledMaintenance({},new Date('2026-10-08T20:00:00Z'),()=>'{invalid'),/SCHEDULER_READ/);
  await assert.rejects(checkScheduledMaintenance({},new Date('2026-10-08T20:00:00Z'),()=>'[{"status":"queued"}]'),/SCHEDULER_ACTIVE/);
});
test('actual fsync custody is private/exclusive and rejects symlink and traversal',async()=>{
  const dir=path.join(privateRoot,`test-${randomUUID()}`);
  try{
    await createOperationDirectory(dir);
    await writeDurable(dir,'receipt.json','{"rows":250}\n');
    assert.equal((await readPrivate(path.join(dir,'receipt.json'))).toString(),'{"rows":250}\n');
    assert.equal((await fs.stat(path.join(dir,'receipt.json'))).mode&0o077,0);
    await assert.rejects(writeDurable(dir,'receipt.json','overwrite'),{code:'EEXIST'});
    await assert.rejects(writeDurable(dir,'../outside.json','bad'));
    await fs.symlink(path.join(dir,'receipt.json'),path.join(dir,'link.json'));
    await assert.rejects(readPrivate(path.join(dir,'link.json')),/FILE_SYMLINK/);
    await assert.rejects(saveLocalArchive(dir,{manifestSha256:'../other'}));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('authorization binds exact immutable plan and expiry, never self-authorizes preparation',()=>{
  const bytes=Buffer.from('immutable plan'),now=Date.parse('2026-10-08T20:00:00Z');
  const receipt={operation:'archive-retire-expired-operational-telemetry',planSha256:sha(bytes),projectId,approvalId:'human',remoteMutationApproved:true,authorizedAt:'2026-10-08T20:00:00Z'};
  assert.equal(verifyAuthorization(receipt,bytes,{approvalId:'human'},now),true);
  for(const invalid of [{...receipt,remoteMutationApproved:false},{...receipt,planSha256:sha('other')},{...receipt,authorizedAt:'invalid'},
    {...receipt,authorizedAt:'2026-10-08T19:00:00Z'},{...receipt,authorizedAt:'2026-10-08T20:00:01Z'},{...receipt,approvalId:'different'}]) {
    assert.throws(()=>verifyAuthorization(invalid,bytes,{approvalId:'human'},now),/APPROVAL_REQUIRED/);
  }
});
test('expired window aborts read and mutating adapters before transport',async()=>{
  let calls=0;
  const callbacks=createDrainCallbacks({SUPABASE_URL:origin,SUPABASE_SECRET_KEY:'synthetic'},privateRoot,{
    getSignal:()=>AbortSignal.abort(),transport:async()=>{calls++;return new Response('[]');}});
  await assert.rejects(callbacks.selectSnapshot('2026-10-08T20:00:00Z',250));
  assert.equal(calls,0);
});

test('timestamp gate rejects missing, invalid, null, future and 31min old preflights',()=>{
  const now=Date.parse('2026-10-08T20:00:00Z');
  for(const value of [undefined,'invalid',null,'2026-10-08T20:00:01Z','2026-10-08T19:29:00Z'])assert.throws(()=>requireFreshTimestamp(value,now),/PLAN_STALE/);
  assert.equal(requireFreshTimestamp('2026-10-08T19:30:00Z',now),now-1800000);
});
test('sequential successful reads exhausting the window block the next mutating POST',async()=>{
  let elapsed=0,calls=0;
  const callbacks=createDrainCallbacks({SUPABASE_URL:origin,SUPABASE_SECRET_KEY:'synthetic'},privateRoot,{
    getSignal:()=>elapsed<120000?new AbortController().signal:AbortSignal.abort(),
    transport:async(_url,init)=>{assert.ok(init.signal);calls++;elapsed+=45000;return new Response('[]');}});
  for(let i=0;i<3;i++)assert.deepEqual(await callbacks.selectSnapshot('2026-10-08T20:00:00Z',250),[]);
  const row={cache_key:'synthetic',scope:'operational-store-event',payload_text:'{}',expires_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'};
  await assert.rejects(callbacks.retireSnapshot('2026-10-08T20:00:00Z',[row]));
  assert.equal(calls,3);
});

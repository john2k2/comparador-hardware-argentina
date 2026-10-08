// Custodia local durable y adaptadores acotados. Ninguna ruta admite DELETE directo.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {parseTelemetryCsv} from './telemetry-backup.mjs';
import {buildTelemetryMaintenanceArchive,telemetryUtc,TELEMETRY_SCOPES,TELEMETRY_METADATA_FIELDS} from './telemetry-maintenance.mjs';
import {createTelemetryMaintenanceDataFetch,createTelemetryMaintenanceStorageFetch,telemetryMaintenanceObjectKeys,
  readTelemetryJson,TELEMETRY_SELECT_RPC,TELEMETRY_RETIRE_RPC} from './telemetry-maintenance-network.mjs';
import {storeTelemetryBacklogArchive,reconcileTelemetryBacklogMetadata} from './telemetry-backlog-storage.mjs';

export const projectId='zyiyziubpcpgoqlkcrie';
export const origin=`https://${projectId}.supabase.co`;
export const privateRoot=path.resolve(import.meta.dirname,'../../tmp/drenaje-telemetria-2026-10-08');
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(`TELEMETRY_DRAIN_${code}`);};

export async function checkDirectory(dir) {
  const target=path.resolve(dir);
  if(!target.startsWith(privateRoot+path.sep)&&target!==privateRoot)fail('DIRECTORY_SCOPE');
  if(await fs.realpath(privateRoot)!==privateRoot||await fs.realpath(target)!==target)fail('DIRECTORY_SYMLINK');
  const stat=await fs.stat(target);
  if(!stat.isDirectory()||(stat.mode&0o077)!==0||stat.uid!==process.getuid())fail('PRIVATE_DIRECTORY');
  return target;
}

export async function createOperationDirectory(dir) {
  const target=path.resolve(dir);
  if(path.dirname(target)!==privateRoot||!/^[a-z0-9-]{1,80}$/.test(path.basename(target)))fail('OPERATION_PATH');
  await fs.mkdir(privateRoot,{recursive:true,mode:0o700});
  await checkDirectory(privateRoot);
  await fs.mkdir(target,{mode:0o700}); // Existente significa operación usada; nunca auto-resume.
  return checkDirectory(target);
}

export async function writeDurable(dir,name,bytes) {
  await checkDirectory(dir);
  if(!/^[a-z0-9.-]{1,100}$/.test(name)||name==='.'||name==='..')fail('FILE_NAME');
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  const handle=await fs.open(path.join(dir,name),'wx',0o600);
  try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
  const parent=await fs.open(dir,'r');
  try {await parent.sync();} finally {await parent.close();}
}

export async function readPrivate(file,maxBytes=1024*1024) {
  const resolved=path.resolve(file);
  await checkDirectory(path.dirname(resolved));
  if(await fs.realpath(resolved)!==resolved)fail('FILE_SYMLINK');
  const stat=await fs.stat(resolved);
  if(!stat.isFile()||(stat.mode&0o077)!==0||stat.uid!==process.getuid()||stat.size>maxBytes)fail('PRIVATE_FILE');
  return fs.readFile(resolved);
}

export async function saveLocalArchive(dir,archive) {
  assert.match(archive.manifestSha256,/^[a-f0-9]{64}$/,'TELEMETRY_DRAIN_MANIFEST_HASH');
  const folder=path.join(dir,archive.manifestSha256);
  await checkDirectory(dir);
  await fs.mkdir(folder,{mode:0o700});
  await writeDurable(folder,'telemetry.json.gz',archive.backup.gzipBytes);
  await writeDurable(folder,'manifest.json',JSON.stringify(archive.backup.manifest)+'\n');
  await writeDurable(folder,'selection.json.gz',archive.selectionGzipBytes);
  await writeDurable(folder,'snapshot.json',JSON.stringify(archive.snapshot)+'\n');
  return {folder,manifestSha256:archive.manifestSha256,storedBytes:archive.storedBytes};
}

// CSV preserva payload numérico como texto y fechas de seis decimales.
export function sampleUrl(scope,cutoff,offset) {
  if(!TELEMETRY_SCOPES.includes(scope)||!Number.isSafeInteger(offset)||offset<0)fail('SAMPLE_SCOPE');
  const utc=telemetryUtc(cutoff),url=new URL('/rest/v1/api_cache_entries',origin);
  url.search=new URLSearchParams({select:'cache_key,scope,payload,expires_at,created_at,updated_at',scope:`eq.${scope}`,
    expires_at:`lt.${utc}`,updated_at:`lte.${utc}`,order:'cache_key.asc',limit:'250',offset:String(offset)}).toString();
  return url;
}

export async function prepareSample(dir,env,cutoff,counts,transport=fetch) {
  if((env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'')!==origin)fail('PROJECT');
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)fail('SERVER_KEY');
  const results=[];
  for(const scope of TELEMETRY_SCOPES) {
    const count=counts[scope];
    if(!Number.isSafeInteger(count)||count<0)fail('POPULATION');
    if(count===0)continue;
    const offsets=[...new Set(Array.from({length:4},(_,i)=>Math.floor(Math.max(0,count-250)*i/3)))];
    for(const offset of offsets) {
      const url=sampleUrl(scope,cutoff,offset);
      const response=await transport(url,{method:'GET',redirect:'error',headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'text/csv'},signal:AbortSignal.timeout(15000)});
      if(!response.ok||!/^text\/csv/.test(response.headers.get('content-type')||''))fail('SAMPLE_HTTP');
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      try {for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>4*1024*1024)fail('SAMPLE_BYTES');chunks.push(Buffer.from(chunk.value));}}
      finally {await reader.cancel().catch(()=>{});}
      const csv=Buffer.concat(chunks),rows=parseTelemetryCsv(csv.toString('utf8'));
      if(rows.some(row=>row.scope!==scope)||rows.length>250)fail('SAMPLE_ROWS');
      const snapshot=rows.map(({payload,...row})=>({...row,payload_text:payload}));
      const archive=buildTelemetryMaintenanceArchive(snapshot,{projectId,cutoff,batchSize:250});
      const local=await saveLocalArchive(dir,archive);
      await writeDurable(local.folder,'source.csv',csv);
      results.push({scope,offset,rows:rows.length,storedBytes:archive.storedBytes,manifestSha256:archive.manifestSha256,
        sourceCsvBytes:csv.length,sourceCsvSha256:sha(csv),readAt:new Date().toISOString()});
    }
  }
  return {readOnly:true,originalRowsRemoved:0,samples:results,estimates:Object.entries(counts).map(([scope,rows])=>{
    const sample=results.filter(r=>r.scope===scope),n=sample.reduce((s,r)=>s+r.rows,0);
    return {scope,populationRows:rows,sampleRows:n,estimatedStoredBytes:rows===0?0:Math.ceil(sample.reduce((s,r)=>s+r.storedBytes,0)/n*rows),isEstimate:true};}),
    limits:['Systematic sample is not a guarantee of full archive size.','No Storage upload or original deletion in preparation.','Selection contains six exact source fields; numeric payload stays text.']};
}

export function createDrainCallbacks(env,dir,{transport=fetch,getSignal,writeCheckpoint,preflightWindow,onArchive}={}) {
  if((env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'')!==origin)fail('PROJECT');
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)fail('SERVER_KEY');
  const send=(target,init={})=>{
    const signal=getSignal?.();
    if(signal){signal.throwIfAborted();init={...init,signal:AbortSignal.any([signal,init.signal].filter(Boolean))};}
    return transport(target,init);
  };
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const guarded=createTelemetryMaintenanceDataFetch(origin,{allowRetire:true,transport:send});
  async function metadata(params) {
    const url=new URL('/rest/v1/api_cache_entries',origin);
    url.search=new URLSearchParams({select:TELEMETRY_METADATA_FIELDS.join(','),...params}).toString();
    return readTelemetryJson(await guarded(url,{headers}),1024*1024);
  }
  const rpc=async(name,body)=>readTelemetryJson(await guarded(`${origin}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)}));
  return {writeCheckpoint,preflightWindow,
    selectSnapshot:(cutoff,limit)=>rpc(TELEMETRY_SELECT_RPC,{p_cutoff:cutoff,p_limit:limit}),
    retireSnapshot:(cutoff,snapshot)=>rpc(TELEMETRY_RETIRE_RPC,{p_cutoff:cutoff,p_snapshot:snapshot}),
    reconcileMetadata:keys=>reconcileTelemetryBacklogMetadata(keys,page=>{
      const literals=page.map(k=>'"'+k.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"');
      return metadata({cache_key:`in.(${literals.join(',')})`,order:'cache_key.asc',limit:String(page.length)});
    }),
    storeArchive:async archive=>{
      const local=await saveLocalArchive(dir,archive); // fsync completo antes de cualquier subida/retiro.
      const client=createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
        global:{fetch:createTelemetryMaintenanceStorageFetch(origin,telemetryMaintenanceObjectKeys(archive),{allowUpload:true,transport:send})}});
      const result=await storeTelemetryBacklogArchive(client.storage,archive);
      if(onArchive)await onArchive(local);
      return result;
    }};
}

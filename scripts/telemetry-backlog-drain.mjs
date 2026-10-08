// Entrada puntual, nunca scheduler. prepare sólo captura; execute requiere plan inmutable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {processTelemetryBacklog,validatePlan} from './lib/telemetry-backlog-drain.mjs';
import {deriveTelemetryContinuation} from './lib/telemetry-backlog-continuation.mjs';
import {auditTelemetryBacklogJournal} from './lib/telemetry-backlog-journal.mjs';
import {projectId,origin,privateRoot,sha,createOperationDirectory,writeDurable,readPrivate,prepareSample,createDrainCallbacks} from './lib/telemetry-backlog-io.mjs';

const root=path.resolve(import.meta.dirname,'..');
const codeFiles=['scripts/telemetry-backlog-drain.mjs','scripts/lib/telemetry-backlog-drain.mjs','scripts/lib/telemetry-backlog-io.mjs',
  'scripts/lib/telemetry-maintenance.mjs','scripts/lib/telemetry-maintenance-network.mjs','scripts/lib/telemetry-backup.mjs',
  'scripts/lib/telemetry-backup-storage.mjs','scripts/lib/telemetry-selection-codec.mjs',
  'scripts/lib/telemetry-backlog-storage.mjs','scripts/lib/telemetry-backlog-continuation.mjs','scripts/lib/telemetry-backlog-journal.mjs'];
const fail=code=>{throw new Error(`TELEMETRY_DRAIN_${code}`);};

export function parseArguments(args) {
  const [command,...rest]=args;
  if(!['prepare','execute'].includes(command))fail('COMMAND');
  const accepted=command==='prepare'?['--out','--preflight','--max-rows','--approval-id','--previous-plan','--previous-summary']:['--out','--plan','--approval-id','--authorization'];
  const options={};
  for(let i=0;i<rest.length;i+=2){
    const name=rest[i],value=rest[i+1];
    if(!accepted.includes(name)||name in options||!value||value.startsWith('--'))fail('ARGUMENT');
    options[name]=value;
  }
  if(!options['--out']||!options['--approval-id']||(command==='prepare'?!options['--preflight']||!/^\d+$/.test(options['--max-rows']||''):!options['--plan']||!options['--authorization']))fail('ARGUMENT_REQUIRED');
  if(Boolean(options['--previous-plan'])!==Boolean(options['--previous-summary']))fail('PREVIOUS_PAIR');
  return {command,options};
}

async function hashes() {
  return Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
}

async function previousSeen(envelope) {
  if(!envelope.continuation)return new Set();
  const bytes=await readPrivate(envelope.continuation.previousSeenKeysFile,24*1024*1024);
  if(sha(bytes)!==envelope.continuation.previousSeenKeysSha256)fail('PREVIOUS_KEYS_HASH');
  const keys=JSON.parse(gunzipSync(bytes,{maxOutputLength:24*1024*1024}));
  if(!Array.isArray(keys)||keys.length>343000||new Set(keys).size!==keys.length||keys.some(key=>! /^[a-f0-9]{64}$/.test(key)))fail('PREVIOUS_KEYS');
  return new Set(keys);
}

async function auditPrevious(planFile,summaryFile) {
  const planBytes=await readPrivate(planFile),summaryBytes=await readPrivate(summaryFile),envelope=JSON.parse(planBytes),summary=JSON.parse(summaryBytes);
  const dir=path.dirname(path.resolve(summaryFile)),seen=await previousSeen(envelope);
  const names=(await fs.readdir(dir)).filter(name=>/^checkpoint-\d{6}\.json$/.test(name)).sort();
  async function* records(){for(const name of names)yield JSON.parse(await readPrivate(path.join(dir,name),5*1024*1024));}
  const audit=await auditTelemetryBacklogJournal(records(),summary,envelope.plan,async hash=>{
    const folder=path.join(dir,hash),snapshot=JSON.parse(await readPrivate(path.join(folder,'snapshot.json'),5*1024*1024));
    for(const row of snapshot){const key=sha(row.cache_key);if(seen.has(key))fail('PREVIOUS_REPEAT');seen.add(key);}
    return {snapshot,manifest:JSON.parse(await readPrivate(path.join(folder,'manifest.json'))),
      gzipBytes:await readPrivate(path.join(folder,'telemetry.json.gz')),selectionGzipBytes:await readPrivate(path.join(folder,'selection.json.gz'))};
  });
  return {envelope,summary,audit,seen,planSha256:sha(planBytes),summarySha256:sha(summaryBytes)};
}

export function verifyContinuation(envelope,prior) {
  const plan=validatePlan(envelope.plan);
  const expected=deriveTelemetryContinuation(prior.envelope,prior.summary,envelope.preflight,{...prior,now:plan.now});
  if(plan.cutoff!==expected.cutoff)fail('CONTINUATION_CUTOFF');
  for(const field of ['maxSelectedRows','maxStoredBytes','maxWindows','deadlineMs'])if(plan[field]!==expected[field])fail('CONTINUATION_BUDGET');
  for(const [field,value] of Object.entries(expected))if(JSON.stringify(envelope.continuation?.[field])!==JSON.stringify(value))fail('CONTINUATION_LINEAGE');
  return true;
}

export function requireFreshTimestamp(value,now=Date.now()) {
  const parsed=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(parsed)||parsed>now||now-parsed>30*60*1000)fail('PLAN_STALE');
  return parsed;
}

export function verifyAuthorization(receipt,planBytes,plan,now=Date.now()) {
  if(!receipt||receipt.operation!=='archive-retire-expired-operational-telemetry'
    ||receipt.planSha256!==sha(planBytes)||receipt.approvalId!==plan.approvalId
    ||receipt.projectId!==projectId||receipt.remoteMutationApproved!==true
    ||!Number.isFinite(Date.parse(receipt.authorizedAt))||Date.parse(receipt.authorizedAt)>now
    ||now-Date.parse(receipt.authorizedAt)>30*60*1000)fail('APPROVAL_REQUIRED');
  return true;
}

export async function checkScheduledMaintenance(plan,now=new Date(),run=execFileSync) {
  // La ventana puntual no cruza el próximo diario nominal. Esto no es una lease distribuida.
  const next=new Date(now);next.setUTCHours(5,5,0,0);if(next<=now)next.setUTCDate(next.getUTCDate()+1);
  if(next-now<30*60*1000)fail('DAILY_WINDOW');
  const env={PATH:process.env.PATH,HOME:process.env.HOME};
  for(const name of ['GH_TOKEN','GITHUB_TOKEN'])if(process.env[name])env[name]=process.env[name];
  for(const status of ['queued','in_progress','waiting']){
    let rows;
    try{rows=JSON.parse(run('gh',['run','list','--repo','john2k2/comparador-hardware-argentina','--workflow','catalog-refresh.yml',
      '--status',status,'--limit','100','--json','databaseId,status'],{env,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));}
    catch{fail('SCHEDULER_READ');}
    if(!Array.isArray(rows)||rows.length)fail('SCHEDULER_ACTIVE');
  }
  return true;
}

async function main() {
  const {command,options}=parseArguments(process.argv.slice(2));
  if((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'')!==origin)fail('PROJECT');
  if(command==='prepare') {
    const preflight=JSON.parse((await readPrivate(options['--preflight'])).toString('utf8'));
    if(preflight.projectId!==projectId||!preflight.cutoff||!preflight.counts||!Number.isSafeInteger(preflight.archiveBytes)||preflight.archiveBytes<0)fail('PREFLIGHT_FIELDS');
    requireFreshTimestamp(preflight.observedAt);
    if(preflight.functions?.retire_backed_telemetry!=='fee940ae48e052ded0f761aa01069369'
      ||preflight.functions?.select_backed_telemetry_candidates!=='654a93a883fbbbcae422d5211bb22828')fail('PREFLIGHT_FUNCTIONS');
    const version=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    const maxRows=Number(options['--max-rows']),now=new Date().toISOString();
    const previous=options['--previous-plan']?await auditPrevious(options['--previous-plan'],options['--previous-summary']):null;
    const continuation=previous?deriveTelemetryContinuation(previous.envelope,previous.summary,preflight,{...previous,now}):null;
    if(continuation&&maxRows!==continuation.maxSelectedRows)fail('CONTINUATION_BUDGET');
    const plan=validatePlan({projectId,cutoff:preflight.cutoff,now,approvalId:options['--approval-id'],codeVersion:version,
      maxSelectedRows:maxRows,maxStoredBytes:continuation?.maxStoredBytes??32*1024*1024,
      deadlineMs:continuation?.deadlineMs??6*60*60*1000,maxWindows:continuation?.maxWindows??Math.min(343,Math.ceil(maxRows/1000)+1)});
    if(preflight.archiveBytes+plan.maxStoredBytes+6*1024*1024>50*1024*1024)fail('ARCHIVE_HEADROOM');
    const dir=await createOperationDirectory(options['--out']);
    let continuationReceipt=null;
    if(previous){
      const bytes=gzipSync(Buffer.from(JSON.stringify([...previous.seen].sort())));
      await writeDurable(dir,'previous-seen-keys.json.gz',bytes);
      continuationReceipt={...continuation,previousPlan:path.resolve(options['--previous-plan']),previousSummary:path.resolve(options['--previous-summary']),
        previousJournalInventorySha256:previous.audit.archiveInventorySha256,previousSeenKeysFile:path.join(dir,'previous-seen-keys.json.gz'),previousSeenKeysSha256:sha(bytes)};
    }
    const sample=await prepareSample(dir,process.env,plan.cutoff,preflight.counts);
    await writeDurable(dir,'sample.json',JSON.stringify(sample,null,2)+'\n');
    const envelope={version:1,preparedAt:new Date().toISOString(),plan,codeHashes:await hashes(),preflight,continuation:continuationReceipt,
      estimates:sample.estimates,remoteMutationApproved:false,sampleOnly:true,
      limits:['Code hashes, budget and immutable plan must be checked before execute.','Preflight gate is not transactional exclusion; CAS preserves concurrently changed rows.']};
    await writeDurable(dir,'plan.json',JSON.stringify(envelope,null,2)+'\n');
    console.log(JSON.stringify({success:true,prepared:true,originalRowsRemoved:0,sampledRows:sample.samples.reduce((s,r)=>s+r.rows,0),
      maxSelectedRows:plan.maxSelectedRows,estimatedArchiveBytes:sample.estimates.reduce((s,r)=>s+r.estimatedStoredBytes,0),plan:path.join(dir,'plan.json')}));
    return;
  }
  const envelope=JSON.parse((await readPrivate(options['--plan'])).toString('utf8'));
  const plan=validatePlan(envelope.plan);
  if(envelope.version!==1||plan.approvalId!==options['--approval-id']||JSON.stringify(await hashes())!==JSON.stringify(envelope.codeHashes))fail('PLAN_CODE_OR_APPROVAL');
  // Recibo separado: el plan de preparación permanece inmutable. La autoridad es humana.
  const authorization=JSON.parse((await readPrivate(options['--authorization'])).toString('utf8'));
  verifyAuthorization(authorization,await readPrivate(options['--plan']),plan);
  requireFreshTimestamp(envelope.preparedAt);
  requireFreshTimestamp(envelope.preflight?.observedAt);
  const inheritedKeys=await previousSeen(envelope);
  if(envelope.continuation){
    const prior=await auditPrevious(envelope.continuation.previousPlan,envelope.continuation.previousSummary);
    if(prior.planSha256!==envelope.continuation.previousPlanSha256||prior.summarySha256!==envelope.continuation.previousSummarySha256
      ||prior.audit.archiveInventorySha256!==envelope.continuation.previousJournalInventorySha256
      ||prior.seen.size!==inheritedKeys.size||[...prior.seen].some(key=>!inheritedKeys.has(key)))fail('PREVIOUS_CHANGED');
    verifyContinuation(envelope,prior);
  }
  await checkScheduledMaintenance(plan);
  const start=Date.now(),stopBefore=Math.min(start+plan.deadlineMs,envelope.continuation?Date.parse(envelope.continuation.operationDeadlineAt):Infinity);
  if(!Number.isFinite(stopBefore)||stopBefore-start<=30000)fail('DEADLINE');
  const dir=await createOperationDirectory(options['--out']);
  const token=randomUUID(),lock=path.join(privateRoot,'execution-lock.json');
  await writeDurable(privateRoot,'execution-lock.json',JSON.stringify({token,planSha256:sha(await readPrivate(options['--plan'])),out:dir})+'\n');
  // No reusar un plan después de crash/ACK incierto, ni escoger otra carpeta para repetirlo.
  const planHash=sha(JSON.stringify(plan));
  await writeDurable(privateRoot,`used-plan-${planHash}.json`,JSON.stringify({token,dir})+'\n');
  let result;
  let windowStop=start;
  try {
    const callbacks=createDrainCallbacks(process.env,dir,{
      getSignal:()=>{
        const remaining=Math.min(stopBefore,windowStop)-Date.now();
        return remaining>0?AbortSignal.timeout(remaining):AbortSignal.abort(new Error('TELEMETRY_DRAIN_DEADLINE'));
      },
      writeCheckpoint:async record=>{
        await writeDurable(dir,`checkpoint-${String(record.sequence).padStart(6,'0')}.json`,JSON.stringify(record)+'\n');
        if(record.stage==='window-result')console.log(JSON.stringify({progress:true,window:record.window,...record.totals}));
      },
      preflightWindow:async()=>{
        if(Date.now()>=stopBefore)fail('DEADLINE');
        try{await checkScheduledMaintenance(plan);}catch(error){
          if(/^TELEMETRY_DRAIN_[A-Z_]+$/.test(error?.message))throw new Error(error.message.replace('TELEMETRY_DRAIN_','TELEMETRY_BACKLOG_'));
          throw new Error('TELEMETRY_BACKLOG_SCHEDULER_READ');
        }
        windowStop=Date.now()+120000;
        return true;
      }});
    const select=callbacks.selectSnapshot;
    callbacks.selectSnapshot=async(...args)=>{
      const rows=await select(...args);
      if(rows.some(row=>inheritedKeys.has(sha(row.cache_key))))fail('PREVIOUS_REPEAT');
      return rows;
    };
    result=await processTelemetryBacklog(callbacks,plan);
    await writeDurable(dir,'summary.json',JSON.stringify({...result,completedAt:new Date().toISOString()},null,2)+'\n');
    console.log(JSON.stringify({...result,windows:result.windows.length,out:dir}));
  } finally {
    // Sólo un cierre conciliado permite quitar nuestro lock. Fallo/unknown lo conserva.
    if(result&&result.unknown===0&&!result.checkpointFailed&&result.retireAttemptedRows===result.removed&&result.changedOrMissing===0){
      const current=JSON.parse((await readPrivate(lock)).toString('utf8'));
      if(current.token!==token)fail('LOCK_OWNER');
      await fs.unlink(lock);
      const handle=await fs.open(privateRoot,'r');try{await handle.sync();}finally{await handle.close();}
    }
  }
  if(!result.success)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(JSON.stringify({success:false,reason:/^TELEMETRY_[A-Z_]+$/.test(error?.message)?error.message:'TELEMETRY_DRAIN_FAILED',outcomeRequiresJournal:true}));process.exitCode=1;});
}

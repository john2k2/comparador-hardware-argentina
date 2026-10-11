// Un tick del piloto en la Mac. El scheduler sólo invoca este proceso acotado.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,renameSync,existsSync,statSync,realpathSync,unlinkSync } from 'node:fs';
import { resolve,basename,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeRotation,seedNextRotationBatch,coverageSnapshot } from './rotation-local.mjs';
import { cycleDeltaFromFiles,pilotState,sendCycleDelta } from './cycle-remote.mjs';
import { rebuildProjection } from './projection.mjs';
import { estimateIndexMaintenance } from './incremental-sync.mjs';

const HOUR=3600000;
const schema=`CREATE TABLE IF NOT EXISTS pilot_cycle_state(
 id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 lease_token TEXT,lease_until INTEGER,next_store INTEGER NOT NULL DEFAULT 0,last_error TEXT);
 CREATE TABLE IF NOT EXISTS pilot_cycle_budget(
 day TEXT PRIMARY KEY,attempted INTEGER NOT NULL DEFAULT 0,http_requests INTEGER NOT NULL DEFAULT 0,
 rows_read INTEGER NOT NULL DEFAULT 0,rows_written INTEGER NOT NULL DEFAULT 0,
 reserved_writes INTEGER NOT NULL DEFAULT 0,syncs INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS pilot_cycle_store_pause(store_id TEXT PRIMARY KEY,until_at INTEGER NOT NULL,reason TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pilot_cycle_store_cursor(store_id TEXT PRIMARY KEY,category_index INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS pilot_cycle_runs(
 id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,finished_at INTEGER,status TEXT NOT NULL,report_json TEXT);`;
function transaction(db,operation){db.exec('BEGIN IMMEDIATE');try{const r=operation();db.exec('COMMIT');return r;}catch(error){db.exec('ROLLBACK');throw error;}}
function marker(db){return db.prepare("SELECT value FROM pilot_meta WHERE key='snapshot'").get().value;}
function atomicJson(path,value){const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});renameSync(temporary,path);}
function copySqlite(db,path){const temporary=path+'.tmp-'+randomUUID();try{db.prepare('VACUUM INTO ?').run(temporary);renameSync(temporary,path);}finally{if(existsSync(temporary))unlinkSync(temporary);}}
export function validateCycleConfig(config){
  if(!config||config.version!==1||!Number.isSafeInteger(config.startedAt)||!Number.isSafeInteger(config.expiresAt)
   ||config.expiresAt<=config.startedAt||config.expiresAt-config.startedAt>24*HOUR)throw new Error('CYCLE_CONFIG_EXPIRY');
  for(const [key,max] of [['maxDailyOffers',200],['maxDailyHttp',400],['maxDailyRemoteWrites',20000]])
    if(!Number.isSafeInteger(config[key])||config[key]<1||config[key]>max)throw new Error('CYCLE_CONFIG_BUDGET');
  if(!Number.isSafeInteger(config.intervalSeconds)||config.intervalSeconds<60||config.intervalSeconds>3600)throw new Error('CYCLE_CONFIG_INTERVAL');
  for(const key of ['sqlite','checkpoint','tokenFile','consumerBundle','reportFile'])
    if(typeof config[key]!=='string'||!config[key].startsWith('/'))throw new Error('CYCLE_CONFIG_PATH');
  if(basename(config.sqlite)!=='sample.sqlite'||new Set([config.sqlite,config.checkpoint,config.tokenFile,config.reportFile]).size!==4)throw new Error('CYCLE_CONFIG_PATH');
  if(dirname(config.tokenFile)!==dirname(config.sqlite)||basename(config.tokenFile)!=='pilot-access.private')throw new Error('CYCLE_CONFIG_PATH');
  return config;
}
/** Lock SQLite durable: un proceso solapado no consume ni consulta fuentes. */
export function acquireCycleLease(db,config,now,owner=randomUUID()){
  db.exec(schema);
  return transaction(db,()=>{
    db.prepare('INSERT OR IGNORE INTO pilot_cycle_state(id,started_at,expires_at) VALUES(1,?,?)').run(config.startedAt,config.expiresAt);
    const row=db.prepare('SELECT * FROM pilot_cycle_state WHERE id=1').get();
    if(row.started_at!==config.startedAt||row.expires_at!==config.expiresAt)throw new Error('CYCLE_CONFIG_CHANGED');
    if(now<row.started_at)throw new Error('CYCLE_CLOCK_REGRESSION');
    if(now>=row.expires_at)return {status:'expired'};
    if(row.lease_until>now)return {status:'busy'};
    if(row.last_error==='CYCLE_REMOTE_DIVERGED'||row.last_error==='CYCLE_DELTA_INVALID')return {status:'blocked',error:row.last_error};
    db.prepare('UPDATE pilot_cycle_state SET lease_token=?,lease_until=? WHERE id=1').run(owner,now+10*60000);
    return {status:'acquired',owner,startedAt:row.started_at,nextStore:row.next_store};
  });
}
function budget(db,day){db.prepare('INSERT OR IGNORE INTO pilot_cycle_budget(day) VALUES(?)').run(day);return db.prepare('SELECT * FROM pilot_cycle_budget WHERE day=?').get(day);}
function reserve(db,day,config){
  return transaction(db,()=>{
    const row=budget(db,day);
    // Reserva conservadora para un delta de hasta tres productos/200 proyecciones.
    // Ante respuesta perdida se conserva entera hasta el fin del día.
    const reserveWrites=4000;
    if(row.attempted+3>config.maxDailyOffers||row.http_requests+12>config.maxDailyHttp
      ||row.rows_written+row.reserved_writes+reserveWrites>config.maxDailyRemoteWrites)return null;
    db.prepare('UPDATE pilot_cycle_budget SET attempted=attempted+3,http_requests=http_requests+12,reserved_writes=reserved_writes+? WHERE day=?').run(reserveWrites,day);
    return reserveWrites;
  });
}
function writeCheckpoint(db,config){copySqlite(db,config.checkpoint);}
export async function runAutomaticCycle(config,dependencies={}){
  validateCycleConfig(config);
  const clock=dependencies.clock??Date.now,now=clock(),day=new Date(now).toISOString().slice(0,10);
  const db=new DatabaseSync(config.sqlite);db.exec('PRAGMA busy_timeout=5000');
  let lease;try{lease=acquireCycleLease(db,config,now);}catch(error){db.close();throw error;}
  if(lease.status!=='acquired'){db.close();return {at:new Date(now).toISOString(),status:lease.status,error:lease.error??null};}
  const id=randomUUID(),outbox=resolve(dirname(config.sqlite),'outbox.json');
  const report={id,startedAt:new Date(now).toISOString(),status:'running',results:[],sourceHttp:{},remote:{rowsRead:0,rowsWritten:0,syncs:0,recovered:false}};
  db.prepare('INSERT INTO pilot_cycle_runs(id,started_at,status) VALUES(?,?,?)').run(id,now,'running');
  let reservation=0,knownReceipt=false,attempted=0,sourceComplete=false;
  try{
    if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
    const local=dependencies.consumer??await import(pathToFileURL(config.consumerBundle).href);
    const capabilities={storeIds:local.localStoreIds,categories:local.localCategories,
      validateTarget:(storeId,url,category,name)=>local.canRefreshLocalTarget(storeId,url,category,name)};
    const token=dependencies.token??readFileSync(config.tokenFile,'utf8').trim();
    const state=await (dependencies.state??pilotState)(token);
    report.remote.rowsRead+=state.rowsRead;
    if(!existsSync(outbox)&&state.snapshot!==marker(db)&&existsSync(config.checkpoint)){
      // El writer puede confirmar SQLite antes de que exista el archivo outbox.
      // Reconstruir desde el checkpoint durable, sin otra lectura a una tienda.
      const old=new DatabaseSync(config.checkpoint,{readOnly:true});let expected;
      try{expected=marker(old);}finally{old.close();}
      if(state.snapshot===expected){
        let payload;try{payload=cycleDeltaFromFiles(config.checkpoint,config.sqlite);}catch{throw new Error('CYCLE_DELTA_INVALID');}
        atomicJson(outbox,{createdAt:new Date(clock()).toISOString(),day,reservation:4000,reconstructed:true,payload});
      }
    }
    if(existsSync(outbox)){
      const pending=JSON.parse(readFileSync(outbox,'utf8'));
      if(state.snapshot!==pending.payload.finalSnapshot){
        if(state.snapshot!==pending.payload.expectedSnapshot)throw new Error('CYCLE_REMOTE_DIVERGED');
        transaction(db,()=>{
          const row=budget(db,day);
          if(row.reserved_writes<4000){
            if(row.rows_written+row.reserved_writes+4000>config.maxDailyRemoteWrites)throw new Error('CYCLE_RECOVERY_BUDGET');
            db.prepare('UPDATE pilot_cycle_budget SET reserved_writes=reserved_writes+4000 WHERE day=?').run(day);
          }
        });
        if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
        const receipt=await (dependencies.sync??sendCycleDelta)(pending.payload,token);
        report.remote.rowsRead+=receipt.rowsRead;report.remote.rowsWritten+=receipt.rowsWritten;report.remote.syncs++;
      }
      writeCheckpoint(db,config);renameSync(outbox,outbox+'.recovered-'+id);report.remote.recovered=true;
      // Recuperar primero; una generación perdida jamás suma otras observaciones.
      report.status='recovered';
    }else{
      if(state.snapshot!==marker(db))throw new Error('CYCLE_REMOTE_DIVERGED');
      initializeRotation(db);
      for(let batch=0;batch<30;batch++){
        const seeded=seedNextRotationBatch(db,{now:clock(),capabilities,clock,deadlineAt:Math.min(config.expiresAt,now+3*60000)});
        report.rotation=seeded;
        if(seeded.complete||seeded.waiting||seeded.status==='waiting')break;
      }
      const stores=capabilities.storeIds;
      const due=db.prepare(`SELECT q.store_id,COUNT(*) n FROM pilot_refresh_demand q JOIN products p ON p.id=q.product_id
       WHERE q.expires_at>? AND q.due_at<=? AND(q.status IN('pending','backoff') OR(q.status='leased' AND q.lease_until<=?))
       AND NOT EXISTS(SELECT 1 FROM pilot_cycle_store_pause s WHERE s.store_id=q.store_id AND s.until_at>?) GROUP BY q.store_id`).all(clock(),clock(),clock(),clock());
      const available=new Set(due.map(row=>row.store_id));
      const selected=[];
      for(let offset=0;offset<stores.length&&selected.length<3;offset++){
        const store=stores[(lease.nextStore+offset)%stores.length];if(available.has(store))selected.push(store);
      }
      if(!selected.length)report.status='idle';
      else{
        reservation=reserve(db,day,config);
        if(!reservation)report.status='daily-budget';
        else{
          // Copia durable antes del primer writer, conservada ante fallas de red.
          if(!existsSync(config.checkpoint))writeCheckpoint(db,config);
          for(const store of selected){
            if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
            // Alternar familias por tienda evita que las GPU monopolizen la muestra.
            const categories=capabilities.categories;
            const categoryIndex=db.prepare('SELECT category_index FROM pilot_cycle_store_cursor WHERE store_id=?').get(store)?.category_index??0;
            let target;
            for(let offset=0;offset<categories.length&&!target;offset++){
              const index=(categoryIndex+offset)%categories.length;
              const row=db.prepare(`SELECT q.product_id FROM pilot_refresh_demand q JOIN products p ON p.id=q.product_id
                WHERE q.store_id=? AND p.category=? AND q.expires_at>? AND q.due_at<=?
                AND(q.status IN('pending','backoff') OR(q.status='leased' AND q.lease_until<=?))
                ORDER BY q.priority DESC,q.due_at,q.requested_at,q.offer_id LIMIT 1`).get(store,categories[index],clock(),clock(),clock());
              if(row)target={productId:row.product_id,nextIndex:(index+1)%categories.length};
            }
            if(!target)continue;
            const result=await local.runLocalRefresh(db,{limit:1,storeIds:[store],productIds:[target.productId],failureRetryAfterMs:6*HOUR,
              projection:rebuildProjection,estimateIndexes:estimateIndexMaintenance,...(dependencies.reader?{reader:dependencies.reader}:{}),clock});
            db.prepare('INSERT INTO pilot_cycle_store_cursor VALUES(?,?) ON CONFLICT(store_id) DO UPDATE SET category_index=excluded.category_index').run(store,target.nextIndex);
            attempted+=result.attempted;report.results.push(...result.results);for(const [storeId,metric] of Object.entries(result.sourceHttp)){const previous=report.sourceHttp[storeId]??{requests:0,bytes:0};report.sourceHttp[storeId]={requests:previous.requests+(metric.requests??0),bytes:previous.bytes+(metric.bytes??0)};}
            for(const failed of result.results.filter(row=>['http-403','http-429'].includes(row.outcome)))
              db.prepare('INSERT INTO pilot_cycle_store_pause VALUES(?,?,?) ON CONFLICT(store_id) DO UPDATE SET until_at=excluded.until_at,reason=excluded.reason').run(failed.storeId,clock()+6*HOUR,failed.outcome);
          }
          sourceComplete=true;
          db.prepare('UPDATE pilot_cycle_state SET next_store=? WHERE id=1').run((stores.indexOf(selected.at(-1))+1)%stores.length);
          let payload;try{payload=cycleDeltaFromFiles(config.checkpoint,config.sqlite);}catch{throw new Error('CYCLE_DELTA_INVALID');}
          if(payload){
            if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
            atomicJson(outbox,{createdAt:new Date(clock()).toISOString(),day,reservation,payload});
            const receipt=await (dependencies.sync??sendCycleDelta)(payload,token);
            report.remote.rowsRead+=receipt.rowsRead;report.remote.rowsWritten+=receipt.rowsWritten;report.remote.syncs++;
            knownReceipt=true;writeCheckpoint(db,config);renameSync(outbox,outbox+'.sent-'+id);
          }else knownReceipt=true;
          report.status='completed';
        }
      }
    }
    report.coverage=coverageSnapshot(db,{now:clock(),capabilities,sinceStartedAt:config.startedAt});
  }catch(error){
    report.status='failed';report.error=error instanceof Error&&/^CYCLE_[A-Z_]+$/.test(error.message)?error.message:'CYCLE_EXECUTION_FAILED';
    db.prepare('UPDATE pilot_cycle_state SET last_error=? WHERE id=1').run(report.error);
  }finally{
    const requests=Object.values(report.sourceHttp).reduce((total,metric)=>total+(metric.requests??0),0);
    transaction(db,()=>{
      budget(db,day);
      db.prepare('UPDATE pilot_cycle_budget SET attempted=attempted-?+?,http_requests=http_requests-?+?,rows_read=rows_read+?,rows_written=rows_written+?,reserved_writes=reserved_writes-?,syncs=syncs+? WHERE day=?')
        .run(reservation&&sourceComplete?3:0,reservation&&!sourceComplete?0:attempted,reservation&&sourceComplete?12:0,sourceComplete?requests:0,report.remote.rowsRead,report.remote.rowsWritten,knownReceipt?reservation:0,report.remote.syncs,day);
      db.prepare('UPDATE pilot_cycle_state SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').run(lease.owner);
      db.prepare('UPDATE pilot_cycle_runs SET finished_at=?,status=?,report_json=? WHERE id=?').run(clock(),report.status,JSON.stringify(report),id);
    });
    report.finishedAt=new Date(clock()).toISOString();report.budget=budget(db,day);
    atomicJson(config.reportFile,report);db.close();
  }
  return report;
}
export async function automaticCycleCli(args){
  if(args.length!==2||args[0]!=='--tick')throw new Error('CYCLE_USAGE');
  const config=validateCycleConfig(JSON.parse(readFileSync(realpathSync(args[1]),'utf8')));
  if(Date.now()>=config.expiresAt){
    atomicJson(config.reportFile,{at:new Date().toISOString(),status:'expired',noSourceOrRemoteAccess:true});
    if(existsSync(config.tokenFile))unlinkSync(config.tokenFile);
    const {schedulerCli}=await import('./mac-scheduler.mjs');schedulerCli(['stop']);
    return {status:'expired'};
  }
  for(const file of [config.sqlite,config.tokenFile,config.consumerBundle]){
    if(realpathSync(file)!==resolve(file)||!statSync(file).isFile())throw new Error('CYCLE_PRIVATE_PATH');
  }
  if((statSync(config.tokenFile).mode&0o077)!==0)throw new Error('CYCLE_TOKEN_PERMISSIONS');
  const result=await runAutomaticCycle(config);
  console.log(JSON.stringify({at:result.finishedAt??result.at,status:result.status,error:result.error??null,
    attempted:result.results?.length??0,observed:result.results?.filter(row=>row.status==='observed').length??0,remote:result.remote??null}));
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))
  automaticCycleCli(process.argv.slice(2)).catch(()=>{console.error('CYCLE_FAILED');process.exitCode=1;});

// Un tick del piloto en la Mac. El scheduler sólo invoca este proceso acotado.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync,writeFileSync,renameSync,existsSync,statSync,realpathSync,unlinkSync } from 'node:fs';
import { resolve,basename,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeRotation,seedNextRotationBatch,coverageSnapshot } from './rotation-local.mjs';
import { buildCycleDelta,cycleDeltaFromFiles,pilotState,sendCycleDelta,clockDeltaFromFiles,sendCycleClockDelta } from './cycle-remote.mjs';
import { buildClockSyncDelta,validateClockSync } from './clock-sync.mjs';
import { rebuildProjection } from './projection.mjs';
import { estimateIndexMaintenance } from './incremental-sync.mjs';
import { chargeDailyBudget } from './daily-budget.mjs';

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
  if(config.clockSync!==undefined&&typeof config.clockSync!=='boolean')throw new Error('CYCLE_CONFIG_CLOCK_SYNC');
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
function reserve(db,day,config,{sources=true,writes=4000}={}){
  const operation=()=>{
    const row=budget(db,day);
    // Reserva conservadora para un delta de hasta tres productos/200 proyecciones.
    // Ante respuesta perdida se conserva entera hasta el fin del día.
    const reserveWrites=writes;
    if(sources&&(row.attempted+3>config.maxDailyOffers||row.http_requests+12>config.maxDailyHttp)
      ||row.rows_written+row.reserved_writes+reserveWrites>config.maxDailyRemoteWrites)return null;
    db.prepare('UPDATE pilot_cycle_budget SET attempted=attempted+?,http_requests=http_requests+?,reserved_writes=reserved_writes+? WHERE day=?').run(sources?3:0,sources?12:0,reserveWrites,day);
    return reserveWrites;
  };
  return db.isTransaction?operation():transaction(db,operation);
}
function writeCheckpoint(db,config){copySqlite(db,config.checkpoint);}
const clockJournalKey='cycle_clock_outbox';
function validatePendingClock(db,config,pending,{acknowledged=false}={}){
  // El corte original valida estructura y presupuesto; su edad no invalida un ACK.
  validateClockSync(pending.payload,{now:pending.payload.now,maxRowsWritten:20000});
  if(marker(db)!==pending.payload.finalSnapshot)throw new Error('CYCLE_DELTA_INVALID');
  const before=new DatabaseSync(config.checkpoint,{readOnly:true});
  try{
    const original=marker(before);
    if(original===pending.payload.expectedSnapshot){
      const rebuilt=buildClockSyncDelta(before,db,{now:pending.payload.now,maxRowsWritten:20000});
      if(!isDeepStrictEqual(rebuilt,pending.payload))throw new Error('CYCLE_DELTA_INVALID');
    }else if(acknowledged&&original===pending.payload.finalSnapshot){
      // Un crash después del checkpoint puede conservar el outbox: comprobar
      // datos y proyección, además de cada target final del documento anterior.
      if(buildClockSyncDelta(before,db,{now:pending.payload.now,maxRowsWritten:20000})!==null)throw new Error('CYCLE_DELTA_INVALID');
      const count=db.prepare('SELECT COUNT(*) n FROM search_projection').get().n;
      const horizon=db.prepare('SELECT MIN(next_transition) time FROM search_projection').get().time??'9999-12-31T23:59:59.999Z';
      if(count!==pending.payload.expectedProjectionCount||horizon!==JSON.parse(pending.payload.finalSnapshot).cache.validUntil)throw new Error('CYCLE_DELTA_INVALID');
      for(const row of pending.payload.rows){
        const actual=db.prepare('SELECT * FROM search_projection WHERE product_id=?').get(row.before.product_id);
        if(!isDeepStrictEqual({...actual},{...row.before,...row.after}))throw new Error('CYCLE_DELTA_INVALID');
      }
    }else throw new Error('CYCLE_DELTA_INVALID');
  }finally{before.close();}
}
export async function runAutomaticCycle(config,dependencies={}){
  validateCycleConfig(config);
  const clock=dependencies.clock??Date.now,now=clock(),day=new Date(now).toISOString().slice(0,10);
  const db=new DatabaseSync(config.sqlite);db.exec('PRAGMA busy_timeout=5000');
  let lease;try{lease=acquireCycleLease(db,config,now);}catch(error){db.close();throw error;}
  if(lease.status!=='acquired'){db.close();return {at:new Date(now).toISOString(),status:lease.status,error:lease.error??null};}
  const id=randomUUID(),outbox=resolve(dirname(config.sqlite),'outbox.json');
  const report={id,startedAt:new Date(now).toISOString(),status:'running',results:[],sourceHttp:{},remote:{rowsRead:0,rowsWritten:0,syncs:0,recovered:false}};
  db.prepare('INSERT INTO pilot_cycle_runs(id,started_at,status) VALUES(?,?,?)').run(id,now,'running');
  let reservation=0,sourceReserved=false,knownReceipt=false,attempted=0,sourceComplete=false;
  try{
    if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
    const localSnapshot=JSON.parse(marker(db));
    if(Object.hasOwn(localSnapshot,'prepared_views')||Object.hasOwn(localSnapshot,'clock_observations'))throw new Error('CYCLE_CERTIFIED_SNAPSHOT_UNSUPPORTED');
    const local=dependencies.consumer??await import(pathToFileURL(config.consumerBundle).href);
    // FullH4rd pendiente por decisión del usuario; su cola no autoriza otra lectura.
    const capabilities={storeIds:local.localStoreIds.filter(id=>id!=='fullh4rd'),categories:local.localCategories,
      validateTarget:(storeId,url,category,name,specs)=>local.canRefreshLocalTarget(storeId,url,category,name,specs)};
    const token=dependencies.token??readFileSync(config.tokenFile,'utf8').trim();
    const state=await (dependencies.state??pilotState)(token);
    report.remote.rowsRead+=state.rowsRead;
    const journal=db.prepare('SELECT value FROM pilot_meta WHERE key=?').get(clockJournalKey);
    if(journal){
      const durable=JSON.parse(journal.value);
      try{validatePendingClock(db,config,durable,{acknowledged:state.snapshot===durable.payload.finalSnapshot});}catch{throw new Error('CYCLE_DELTA_INVALID');}
      atomicJson(outbox,durable);
    }
    if(!existsSync(outbox)&&state.snapshot!==marker(db)&&existsSync(config.checkpoint)){
      // El writer puede confirmar SQLite antes de que exista el archivo outbox.
      // Reconstruir desde el checkpoint durable, sin otra lectura a una tienda.
      const old=new DatabaseSync(config.checkpoint,{readOnly:true});let expected;
      try{expected=marker(old);}finally{old.close();}
      if(state.snapshot===expected){
        let payload,kind;
        try{
          if(config.clockSync){
            try{payload=clockDeltaFromFiles(config.checkpoint,config.sqlite,{now:Date.parse(JSON.parse(marker(db)).cache.validFrom),maxRowsWritten:20000});kind='clock';}
            catch(error){if(!/^CLOCK_SYNC_IMMUTABLE_/.test(error.message))throw error;payload=cycleDeltaFromFiles(config.checkpoint,config.sqlite);}
          }else payload=cycleDeltaFromFiles(config.checkpoint,config.sqlite);
        }catch{throw new Error('CYCLE_DELTA_INVALID');}
        atomicJson(outbox,{createdAt:new Date(clock()).toISOString(),day,reservation:kind==='clock'?4*payload.rows.length+8:4000,reconstructed:true,kind,payload});
      }
    }
    if(existsSync(outbox)){
      let pending=JSON.parse(readFileSync(outbox,'utf8'));
      let recoveryReserve=pending.kind==='clock'?4*pending.payload.rows.length+8:4000;
      if(pending.kind==='clock'){
        if(!config.clockSync)throw new Error('CYCLE_CONFIG_CLOCK_SYNC');
        try{validatePendingClock(db,config,pending,{acknowledged:state.snapshot===pending.payload.finalSnapshot});}catch{throw new Error('CYCLE_DELTA_INVALID');}
      }
      if(state.snapshot!==pending.payload.finalSnapshot){
        if(state.snapshot!==pending.payload.expectedSnapshot)throw new Error('CYCLE_REMOTE_DIVERGED');
        if(pending.kind==='clock'&&clock()>=Date.parse(JSON.parse(pending.payload.finalSnapshot).cache.validUntil)){
          const recoveryAt=clock();
          if(recoveryAt>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
          pending=transaction(db,()=>{
            const rebuilt=(dependencies.projection??rebuildProjection)(db,{now:recoveryAt,generation:'cycle-clock-recovery-'+id,affectedProductIds:[]});
            const estimate=rebuilt.baseRowsWritten+(dependencies.estimateIndexes??estimateIndexMaintenance)(db,rebuilt.statements);
            const before=new DatabaseSync(config.checkpoint,{readOnly:true});let payload;
            try{payload=buildClockSyncDelta(before,db,{now:recoveryAt,maxRowsWritten:config.maxDailyRemoteWrites});}
            catch(error){if(error.message==='CLOCK_SYNC_BUDGET')throw new Error('CYCLE_MAINTENANCE_BUDGET');throw new Error('CYCLE_DELTA_INVALID');}
            finally{before.close();}
            const writes=Math.max(4*payload.rows.length+8,estimate);
            // La reserva anterior sigue retenida: una respuesta perdida no
            // acredita consumo cero, aunque hoy la generación siga siendo vieja.
            if(!reserve(db,day,config,{sources:false,writes}))throw new Error('CYCLE_MAINTENANCE_BUDGET');
            let charged;
            try{charged=chargeDailyBudget(db,{now:recoveryAt,estimatedRowsWritten:estimate});}
            catch(error){if(error.message.startsWith('DAILY_ESTIMATED_WRITE_BUDGET_EXCEEDED:'))throw new Error('CYCLE_MAINTENANCE_BUDGET');throw error;}
            const durable={createdAt:new Date(recoveryAt).toISOString(),day,reservation:writes,kind:'clock',regenerated:true,payload};
            db.prepare('INSERT INTO pilot_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(clockJournalKey,JSON.stringify(durable));
            if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
            report.maintenance={regenerated:true,changedProjectionRows:rebuilt.changedProjectionRows,estimatedRowsWritten:estimate,reservedRemoteWrites:writes,budget:charged,cache:rebuilt.cache};
            return durable;
          });
          // Journal y marcador confirmados juntos: si falla el archivo, el
          // siguiente tick reconstruye el nuevo outbox sin volver a cobrarlo.
          atomicJson(outbox,pending);
          recoveryReserve=4*pending.payload.rows.length+8;
        }
        transaction(db,()=>{
          const row=budget(db,day);
          if(row.reserved_writes<recoveryReserve){
            const missing=recoveryReserve-row.reserved_writes;
            if(row.rows_written+row.reserved_writes+missing>config.maxDailyRemoteWrites)throw new Error('CYCLE_RECOVERY_BUDGET');
            db.prepare('UPDATE pilot_cycle_budget SET reserved_writes=reserved_writes+? WHERE day=?').run(missing,day);
          }
        });
        if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
        const receipt=await (pending.kind==='clock'?(dependencies.clockSync??sendCycleClockDelta):(dependencies.sync??sendCycleDelta))(pending.payload,token,{now:clock(),maxRowsWritten:recoveryReserve});
        report.remote.rowsRead+=receipt.rowsRead;report.remote.rowsWritten+=receipt.rowsWritten;report.remote.syncs++;
      }
      writeCheckpoint(db,config);renameSync(outbox,outbox+'.recovered-'+id);
      db.prepare('DELETE FROM pilot_meta WHERE key=?').run(clockJournalKey);report.remote.recovered=true;
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
      const cache=JSON.parse(marker(db)).cache,maintenanceAt=clock();
      const maintenanceDue=!cache||!Number.isFinite(Date.parse(cache.validUntil))||maintenanceAt>=Date.parse(cache.validUntil);
      if(!selected.length&&!maintenanceDue)report.status='idle';
      else{
        if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
        // Un delta de reloj ocupa su propio tick: no combinarlo con tres writers
        // de ofertas que puedan superar la reserva o el transporte de200 filas.
        sourceReserved=selected.length>0&&!maintenanceDue;
        if(maintenanceDue)report.sourcesDeferred=selected.length;
        const scalableMaintenance=maintenanceDue&&config.clockSync;
        reservation=scalableMaintenance?0:reserve(db,day,config,{sources:sourceReserved});
        if(!reservation&&!scalableMaintenance)report.status='daily-budget';
        else{
          // Copia durable antes del primer writer, conservada ante fallas de red.
          if(!existsSync(config.checkpoint))writeCheckpoint(db,config);
          let clockPayload;
          if(maintenanceDue){
            try{
              report.maintenance=transaction(db,()=>{
                if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
                const rebuilt=(dependencies.projection??rebuildProjection)(db,{now:maintenanceAt,generation:'cycle-clock-'+id,affectedProductIds:[]});
                const estimatedRowsWritten=rebuilt.baseRowsWritten+(dependencies.estimateIndexes??estimateIndexMaintenance)(db,rebuilt.statements);
                if(!scalableMaintenance&&estimatedRowsWritten>reservation)throw new Error('CYCLE_MAINTENANCE_RESERVATION');
                // Validar límites del transporte antes de confirmar el writer local.
                const before=new DatabaseSync(config.checkpoint,{readOnly:true});
                try{
                  if(scalableMaintenance){
                    clockPayload=buildClockSyncDelta(before,db,{now:maintenanceAt,maxRowsWritten:config.maxDailyRemoteWrites});
                    const remoteEstimate=4*clockPayload.rows.length+8;
                    reservation=reserve(db,day,config,{sources:false,writes:Math.max(remoteEstimate,estimatedRowsWritten)});
                    if(!reservation)throw new Error('CYCLE_MAINTENANCE_BUDGET');
                  }else buildCycleDelta(before,db);
                }catch(error){if(error.message==='CYCLE_MAINTENANCE_BUDGET'||error.message==='CLOCK_SYNC_BUDGET')throw new Error('CYCLE_MAINTENANCE_BUDGET');throw new Error('CYCLE_MAINTENANCE_DELTA');}finally{before.close();}
                const charged=chargeDailyBudget(db,{now:maintenanceAt,estimatedRowsWritten});
                if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
                return {changedProjectionRows:rebuilt.changedProjectionRows,estimatedRowsWritten,budget:charged,cache:rebuilt.cache,transport:scalableMaintenance?'clock-sync-v1':'legacy',reservedRemoteWrites:reservation};
              });
            }catch(error){
              // La reserva del transporte escalable pertenece a la transacción revertida.
              if(scalableMaintenance)reservation=0;
              // Fallo local confirmado: no se hizo HTTP ni quedó un writer parcial.
              sourceComplete=true;knownReceipt=true;
              throw error;
            }
          }
          for(const store of sourceReserved?selected:[]){
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
            // La cola confirma el ACK y la pausa por tienda en una sola transacción.
          }
          sourceComplete=true;
          if(sourceReserved)db.prepare('UPDATE pilot_cycle_state SET next_store=? WHERE id=1').run((stores.indexOf(selected.at(-1))+1)%stores.length);
          let payload;try{payload=clockPayload??cycleDeltaFromFiles(config.checkpoint,config.sqlite);}catch{throw new Error('CYCLE_DELTA_INVALID');}
          if(payload){
            if(clock()>=config.expiresAt)throw new Error('CYCLE_PILOT_STOPPED');
            atomicJson(outbox,{createdAt:new Date(clock()).toISOString(),day,reservation,kind:clockPayload?'clock':undefined,payload});
            const receipt=await (clockPayload?(dependencies.clockSync??sendCycleClockDelta):(dependencies.sync??sendCycleDelta))(payload,token,{now:clock(),maxRowsWritten:reservation});
            report.remote.rowsRead+=receipt.rowsRead;report.remote.rowsWritten+=receipt.rowsWritten;report.remote.syncs++;
            knownReceipt=true;writeCheckpoint(db,config);renameSync(outbox,outbox+'.sent-'+id);
          }else knownReceipt=true;
          report.status=sourceReserved?'completed':'maintained';
        }
      }
    }
    report.coverage=coverageSnapshot(db,{now:clock(),capabilities,sinceStartedAt:config.startedAt});
  }catch(error){
    report.status=error instanceof Error&&error.message==='CYCLE_MAINTENANCE_BUDGET'?'daily-budget':'failed';report.error=error instanceof Error&&/^CYCLE_[A-Z_]+$/.test(error.message)?error.message:'CYCLE_EXECUTION_FAILED';
    db.prepare('UPDATE pilot_cycle_state SET last_error=? WHERE id=1').run(report.error);
  }finally{
    const requests=Object.values(report.sourceHttp).reduce((total,metric)=>total+(metric.requests??0),0);
    transaction(db,()=>{
      budget(db,day);
      db.prepare('UPDATE pilot_cycle_budget SET attempted=attempted-?+?,http_requests=http_requests-?+?,rows_read=rows_read+?,rows_written=rows_written+?,reserved_writes=reserved_writes-?,syncs=syncs+? WHERE day=?')
        .run(sourceReserved&&reservation&&sourceComplete?3:0,reservation&&!sourceComplete?0:attempted,sourceReserved&&reservation&&sourceComplete?12:0,sourceComplete?requests:0,report.remote.rowsRead,report.remote.rowsWritten,knownReceipt?reservation:0,report.remote.syncs,day);
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

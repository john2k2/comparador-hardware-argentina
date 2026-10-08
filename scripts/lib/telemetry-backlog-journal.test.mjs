import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTelemetryMaintenanceArchive} from './telemetry-maintenance.mjs';
import {auditTelemetryBacklogJournal} from './telemetry-backlog-journal.mjs';

const plan={projectId:'zyiyziubpcpgoqlkcrie',cutoff:'2026-10-08T20:16:00.000000Z',codeVersion:'a'.repeat(40)};
function fixture(){
  const snapshot=[{cache_key:'fixture:1',scope:'operational-store-event',payload_text:'{"n":9007199254740993}',
    expires_at:'2026-10-01T00:00:00.000001Z',created_at:'2026-09-28T00:00:00.000002Z',updated_at:'2026-09-29T00:00:00.000003Z'}];
  const built=buildTelemetryMaintenanceArchive(snapshot,{...plan,batchSize:250});
  const archive={manifestSha256:built.manifestSha256,storedBytes:built.storedBytes,selected:1};
  const ack={selected:1,removed:1,changed_or_missing:0,removed_keys:['fixture:1']};
  const records=[{stage:'started'},{stage:'selected',selected:1},{stage:'before-archive',archive},
    {stage:'archive-returned',archive},{stage:'pending-mutation',archive,snapshot:built.snapshot},
    {stage:'ack-observed',archive,acknowledgement:ack},{stage:'reconcile-observed',archive,acknowledgement:ack,metadata:[]},
    {stage:'window-result',result:{selected:1}},
    {stage:'awaiting-independent-final-check'}].map((record,i)=>({...record,version:1,sequence:i+1,window:1,plan}));
  const summary={...plan,selected:1,archived:1,removed:1,retireAttemptedRows:1,storedBytes:built.storedBytes,
    unknown:0,absentAfterUnknown:0,changedOrMissing:0,checkpointFailed:false,windows:[{selected:1,window:1}]};
  const local={snapshot:built.snapshot,manifest:built.backup.manifest,gzipBytes:built.backup.gzipBytes,selectionGzipBytes:built.selectionGzipBytes};
  return {records,summary,local};
}
test('audita seis campos exactos, archivos recuperables y cada ACK conciliado',async()=>{
  const f=fixture(),result=await auditTelemetryBacklogJournal(f.records,f.summary,plan,async()=>f.local);
  assert.equal(result.rows,1);assert.equal(result.batches,1);assert.equal(result.allAttemptsReconciled,true);
});
test('journal truncado, ACK modificado, metadatos restantes o custodia dañada no autorizan continuar',async()=>{
  for(const modify of [f=>f.records.pop(),f=>f.records.splice(5,1),f=>f.records[5].acknowledgement.removed_keys=['other'],
    f=>f.records[6].metadata=[{cache_key:'fixture:1'}],f=>f.local.gzipBytes=Buffer.from('damaged'),
    f=>f.summary.storedBytes++,f=>f.records[4].snapshot[0].payload_text='{}',
    f=>f.records[1].version=999,f=>f.records[1].stage='unsupported-pending-operation']){
    const f=fixture();modify(f);await assert.rejects(auditTelemetryBacklogJournal(f.records,f.summary,plan,async()=>f.local));
  }
});

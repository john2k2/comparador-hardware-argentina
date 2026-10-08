// Auditoría de lectura: demuestra cierre conciliado antes de otra etapa.
import assert from 'node:assert/strict';
import {buildTelemetryMaintenanceArchive} from './telemetry-maintenance.mjs';
import {sha} from './telemetry-backlog-io.mjs';

export async function auditTelemetryBacklogJournal(records,summary,plan,readArchive) {
  let sequence=0,current=null,lastStage=null,selected=0,reservedBytes=0,removed=0,batches=0;
  const seen=new Set(),archives=[],windows=[];
  const stages=['started','window-reserved','before-select','selected','before-archive','archive-returned',
    'pending-mutation','ack-observed','reconcile-observed','window-result','awaiting-independent-final-check','stopped'];
  for await(const record of records) {
    assert.equal(record.version,1,'JOURNAL_VERSION');
    assert.ok(stages.includes(record.stage),'JOURNAL_STAGE');
    assert.ok(!['stopped','awaiting-independent-final-check'].includes(lastStage),'JOURNAL_AFTER_TERMINAL');
    assert.equal(record.sequence,++sequence,'JOURNAL_SEQUENCE');
    assert.deepEqual(record.plan,plan,'JOURNAL_PLAN');
    if(sequence===1)assert.equal(record.stage,'started','JOURNAL_STARTED');
    lastStage=record.stage;
    if(record.stage==='selected'){
      assert.ok(Number.isSafeInteger(record.selected)&&record.selected>=0&&record.selected<=250,'JOURNAL_SELECTED');
      selected+=record.selected;
    }
    if(record.stage==='window-result')windows.push({...record.result,window:record.window});
    if(record.stage==='before-archive') {
      assert.equal(current,null,'JOURNAL_PENDING');
      current={archive:record.archive,state:'reserved'};reservedBytes+=record.archive.storedBytes;
    } else if(record.stage==='archive-returned') {
      assert.equal(current?.state,'reserved','JOURNAL_ARCHIVE_ORDER');
      assert.deepEqual(record.archive,current.archive);current.state='stored';
    } else if(record.stage==='pending-mutation') {
      assert.equal(current?.state,'stored','JOURNAL_MUTATION_ORDER');
      assert.deepEqual(record.archive,current.archive);
      const expected=buildTelemetryMaintenanceArchive(record.snapshot,{projectId:plan.projectId,cutoff:plan.cutoff,batchSize:250});
      assert.equal(expected.manifestSha256,current.archive.manifestSha256,'JOURNAL_MANIFEST');
      assert.equal(expected.storedBytes,current.archive.storedBytes,'JOURNAL_BYTES');
      assert.equal(expected.snapshot.length,current.archive.selected,'JOURNAL_ROWS');
      const local=await readArchive(expected.manifestSha256);
      assert.deepEqual(local.snapshot,expected.snapshot,'JOURNAL_SNAPSHOT');
      assert.deepEqual(local.manifest,expected.backup.manifest,'JOURNAL_LOCAL_MANIFEST');
      assert.ok(local.gzipBytes.equals(expected.backup.gzipBytes),'JOURNAL_LOCAL_GZIP');
      assert.ok(local.selectionGzipBytes.equals(expected.selectionGzipBytes),'JOURNAL_LOCAL_SELECTION');
      current.keys=expected.snapshot.map(row=>row.cache_key);
      for(const key of current.keys){assert.ok(!seen.has(key),'JOURNAL_REPEATED_KEY');seen.add(key);}
      current.state='pending';
    } else if(record.stage==='ack-observed') {
      assert.equal(current?.state,'pending','JOURNAL_ACK_ORDER');
      assert.deepEqual(record.archive,current.archive);
      const ack=record.acknowledgement;
      assert.deepEqual(Object.keys(ack).sort(),['changed_or_missing','removed','removed_keys','selected']);
      assert.equal(ack.changed_or_missing,0);assert.equal(ack.selected,current.keys.length);assert.equal(ack.removed,current.keys.length);
      assert.deepEqual([...ack.removed_keys].sort(),[...current.keys].sort(),'JOURNAL_ACK_KEYS');
      current.ack=ack;current.state='ack';
    } else if(record.stage==='reconcile-observed') {
      assert.equal(current?.state,'ack','JOURNAL_RECONCILE_ORDER');
      assert.deepEqual(record.archive,current.archive);assert.deepEqual(record.acknowledgement,current.ack);
      assert.deepEqual(record.metadata,[],'JOURNAL_METADATA_REMAINS');
      removed+=current.keys.length;batches++;archives.push(current.archive);current=null;
    }
  }
  assert.ok(['stopped','awaiting-independent-final-check'].includes(lastStage),'JOURNAL_TERMINAL');
  assert.equal(current,null,'JOURNAL_UNFINISHED');
  for(const field of ['selected','archived','removed','retireAttemptedRows'])assert.equal(summary[field],removed,`JOURNAL_TOTAL_${field}`);
  assert.equal(selected,removed);assert.equal(summary.storedBytes,reservedBytes);
  for(const field of ['unknown','absentAfterUnknown','changedOrMissing'])assert.equal(summary[field],0);
  assert.equal(summary.checkpointFailed,false);assert.equal(summary.projectId,plan.projectId);assert.equal(summary.cutoff,plan.cutoff);
  assert.equal(summary.codeVersion,plan.codeVersion);
  assert.deepEqual(summary.windows,windows,'JOURNAL_WINDOWS');
  return {version:1,readOnly:true,checkpointCount:sequence,batches,rows:removed,storedBytes:reservedBytes,
    completedWindows:windows.length,
    archiveInventorySha256:sha(JSON.stringify(archives)),archives,allAttemptsReconciled:true,sourcePayloadPrinted:false};
}

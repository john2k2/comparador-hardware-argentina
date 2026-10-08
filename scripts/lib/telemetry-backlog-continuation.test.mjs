import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTelemetryContinuation} from './telemetry-backlog-continuation.mjs';

const projectId='zyiyziubpcpgoqlkcrie',cutoff='2026-10-08T20:16:00.000000Z';
const hashes={planSha256:'a'.repeat(64),summarySha256:'b'.repeat(64),now:'2026-10-08T21:17:00Z'};
const base=()=>({version:1,plan:{projectId,cutoff,now:'2026-10-08T20:33:53Z',approvalId:'fixture',codeVersion:'c'.repeat(40),
  maxSelectedRows:343000,maxStoredBytes:33554432,deadlineMs:21600000,maxWindows:343},
  preflight:{counts:{'operational-store-event':329096,'operational-endpoint-event':13897}}});
const summary=()=>({version:1,projectId,codeVersion:'c'.repeat(40),cutoff,unknown:0,absentAfterUnknown:0,changedOrMissing:0,
  checkpointFailed:false,selected:100000,archived:100000,removed:100000,retireAttemptedRows:100000,storedBytes:6000000,
  windows:Array.from({length:100},()=>({selected:1000})),completedAt:'2026-10-08T21:17:00Z'});
const preflight=()=>({projectId,cutoff,counts:{'operational-store-event':242993,'operational-endpoint-event':0}});

test('conserva límites acumulados y corte con un scope vacío',()=>{
  const value=deriveTelemetryContinuation(base(),summary(),preflight(),hashes);
  assert.equal(value.maxSelectedRows,243000);assert.equal(value.maxStoredBytes,27554432);
  assert.equal(value.originalRows,342993);assert.equal(value.automaticResume,false);
  assert.equal(value.requiresFreshAuthorization,true);assert.equal(value.cutoff,cutoff);
});
test('incertidumbre, custodia incompleta, presupuesto reiniciado o corte distinto bloquean continuación',()=>{
  for(const patch of [{unknown:1},{absentAfterUnknown:1},{changedOrMissing:1},{checkpointFailed:true},
    {archived:99999},{retireAttemptedRows:99999},{storedBytes:33554433},{selected:-1}])
    assert.throws(()=>deriveTelemetryContinuation(base(),{...summary(),...patch},preflight(),hashes));
  assert.throws(()=>deriveTelemetryContinuation(base(),summary(),{...preflight(),cutoff:'2026-10-08T20:17:00Z'},hashes));
  assert.throws(()=>deriveTelemetryContinuation(base(),summary(),{...preflight(),counts:{'operational-store-event':242992,'operational-endpoint-event':0}},hashes));
  const previous=base();previous.continuation={originalRows:342993,consumed:{selected:1000,removed:1000,storedBytes:1000,windows:1}};
  assert.throws(()=>deriveTelemetryContinuation(previous,summary(),preflight(),hashes),/BUDGET_LINEAGE/);
});
test('tercera etapa hereda consumo completo en vez de reiniciar presupuestos',()=>{
  const previous=base();previous.continuation=deriveTelemetryContinuation(previous,summary(),preflight(),hashes);
  previous.plan={...previous.plan,maxSelectedRows:243000,maxStoredBytes:27554432,maxWindows:243};
  const nextSummary={...summary(),selected:50000,archived:50000,removed:50000,retireAttemptedRows:50000,storedBytes:3000000,
    windows:Array.from({length:50},()=>({selected:1000}))};
  const nextPreflight={...preflight(),counts:{'operational-store-event':192993,'operational-endpoint-event':0}};
  const next=deriveTelemetryContinuation(previous,nextSummary,nextPreflight,hashes);
  assert.equal(next.consumed.selected,150000);assert.equal(next.consumed.storedBytes,9000000);
  assert.equal(next.maxSelectedRows,193000);assert.equal(next.maxStoredBytes,24554432);
  assert.equal(next.maxWindows,193);assert.equal(next.operationDeadlineAt,'2026-10-09T02:33:53.000Z');
});
test('no renueva seis horas ni admite más ventanas que el plan anterior',()=>{
  assert.throws(()=>deriveTelemetryContinuation(base(),{...summary(),windows:Array.from({length:344})},preflight(),hashes),/UNRECONCILED/);
  assert.throws(()=>deriveTelemetryContinuation(base(),summary(),preflight(),{...hashes,now:'2026-10-09T02:34:00Z'}),/OPERATION_DEADLINE/);
  const short=base();short.plan.deadlineMs=60000;
  assert.throws(()=>deriveTelemetryContinuation(short,summary(),preflight(),hashes),/OPERATION_DEADLINE/);
});

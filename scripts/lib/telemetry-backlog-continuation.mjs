// Otra etapa requiere conciliación explícita; conserva corte y presupuestos originales.
import {validatePlan,TELEMETRY_BACKLOG_LIMITS} from './telemetry-backlog-drain.mjs';
import {TELEMETRY_SCOPES,telemetryUtc} from './telemetry-maintenance.mjs';

const fail=code=>{throw new Error(`TELEMETRY_DRAIN_CONTINUATION_${code}`);};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const count=counts=>{
  if(!counts||Object.keys(counts).length!==2||!TELEMETRY_SCOPES.every(scope=>integer(counts[scope])))fail('COUNTS');
  return TELEMETRY_SCOPES.reduce((total,scope)=>total+counts[scope],0);
};

export function deriveTelemetryContinuation(previous,summary,preflight,{planSha256,summarySha256}) {
  const plan=validatePlan(previous?.plan);
  if(previous?.version!==1||!/^[a-f0-9]{64}$/.test(planSha256)||!/^[a-f0-9]{64}$/.test(summarySha256))fail('SOURCE');
  if(summary?.version!==1||summary.projectId!==plan.projectId||summary.codeVersion!==plan.codeVersion
    ||summary.cutoff!==plan.cutoff||summary.unknown!==0||summary.absentAfterUnknown!==0||summary.changedOrMissing!==0
    ||summary.checkpointFailed!==false||!integer(summary.selected)||summary.selected!==summary.archived
    ||summary.selected!==summary.removed||summary.removed!==summary.retireAttemptedRows
    ||!integer(summary.storedBytes)||summary.selected>plan.maxSelectedRows||summary.storedBytes>plan.maxStoredBytes
    ||!Array.isArray(summary.windows)||!Number.isFinite(Date.parse(summary.completedAt)))fail('UNRECONCILED');
  // Un resumen de fin sin cola pendiente se contrasta además con una lectura independiente.
  const inherited=previous.continuation?.consumed||{selected:0,storedBytes:0,removed:0};
  if(!['selected','storedBytes','removed'].every(field=>integer(inherited[field]))
    ||inherited.selected!==inherited.removed)fail('INHERITED');
  const originalRows=previous.continuation?.originalRows??count(previous.preflight?.counts);
  if(!integer(originalRows)||originalRows!==342993
    ||plan.maxSelectedRows!==TELEMETRY_BACKLOG_LIMITS.maxSelectedRows-inherited.selected
    ||plan.maxStoredBytes!==TELEMETRY_BACKLOG_LIMITS.maxStoredBytes-inherited.storedBytes)fail('BUDGET_LINEAGE');
  const consumed={selected:inherited.selected+summary.selected,storedBytes:inherited.storedBytes+summary.storedBytes,
    removed:inherited.removed+summary.removed};
  const remaining=count(preflight?.counts);
  if(preflight?.projectId!==plan.projectId||telemetryUtc(preflight.cutoff)!==plan.cutoff
    ||remaining!==originalRows-consumed.removed||consumed.selected>=TELEMETRY_BACKLOG_LIMITS.maxSelectedRows
    ||consumed.storedBytes>=TELEMETRY_BACKLOG_LIMITS.maxStoredBytes||remaining<1)fail('INDEPENDENT_COUNT');
  return Object.freeze({previousPlanSha256:planSha256,previousSummarySha256:summarySha256,originalRows,consumed,
    remainingRows:remaining,cutoff:plan.cutoff,maxSelectedRows:TELEMETRY_BACKLOG_LIMITS.maxSelectedRows-consumed.selected,
    maxStoredBytes:TELEMETRY_BACKLOG_LIMITS.maxStoredBytes-consumed.storedBytes,
    automaticResume:false,requiresFreshAuthorization:true});
}

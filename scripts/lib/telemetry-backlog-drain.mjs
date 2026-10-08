// Operación puntual: presupuestos acumulados y barreras durables sobre el núcleo diario.
import { createHash } from 'node:crypto';
import { processTelemetryMaintenance, telemetryUtc, TELEMETRY_MAINTENANCE_LIMITS } from './telemetry-maintenance.mjs';

const PLAN_FIELDS = ['projectId', 'cutoff', 'now', 'approvalId', 'codeVersion', 'maxSelectedRows', 'maxStoredBytes', 'deadlineMs', 'maxWindows'];
export const TELEMETRY_BACKLOG_LIMITS = Object.freeze({ maxSelectedRows: 343000, maxStoredBytes: 32 * 1024 ** 2,
  deadlineMs: 6 * 60 * 60 * 1000, maxWindows: 343 });
const fail = code => { throw new Error(`TELEMETRY_BACKLOG_${code}`); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const keyHash = key => createHash('sha256').update(key).digest('hex');

export function validateTelemetryBacklogPlan(plan) {
  requireValue(plan && typeof plan === 'object' && !Array.isArray(plan)
    && Object.keys(plan).length === PLAN_FIELDS.length && PLAN_FIELDS.every(field => Object.hasOwn(plan, field)), 'PLAN_FIELDS');
  requireValue(plan.projectId === 'zyiyziubpcpgoqlkcrie', 'PROJECT');
  requireValue(typeof plan.codeVersion === 'string' && /^[a-f0-9]{40}$/.test(plan.codeVersion), 'CODE_VERSION');
  requireValue(typeof plan.approvalId === 'string' && plan.approvalId.trim().length > 0 && plan.approvalId.length <= 200, 'APPROVAL');
  const cutoff = telemetryUtc(plan.cutoff), now = telemetryUtc(plan.now);
  requireValue(cutoff <= telemetryUtc(new Date(Date.parse(now) - 300000).toISOString()), 'CUTOFF');
  for (const [field, maximum] of Object.entries(TELEMETRY_BACKLOG_LIMITS)) {
    requireValue(Number.isSafeInteger(plan[field]) && plan[field] >= 1 && plan[field] <= maximum, 'LIMIT');
  }
  requireValue(plan.deadlineMs > 30000, 'DEADLINE');
  return Object.freeze({ ...plan, cutoff, now });
}
export const validatePlan = validateTelemetryBacklogPlan;

export async function processTelemetryBacklog(callbacks, inputPlan, clock = () => performance.now()) {
  const plan = validateTelemetryBacklogPlan(inputPlan);
  requireValue(callbacks && ['preflightWindow', 'writeCheckpoint', 'selectSnapshot', 'storeArchive', 'retireSnapshot', 'reconcileMetadata']
    .every(name => typeof callbacks[name] === 'function'), 'CALLBACKS');
  const start = clock(), seen = new Set();
  const result = { version: 1, projectId: plan.projectId, codeVersion: plan.codeVersion, cutoff: plan.cutoff,
    success: false, stopped: false, reason: null, selected: 0, archived: 0, removed: 0, changedOrMissing: 0,
    unknown: 0, absentAfterUnknown: 0, retireAttemptedRows: 0, storedBytes: 0, windows: [], checkpointFailed: false,
    awaitingIndependentFinalCheck: false, globallyComplete: false, physicalSavingProven: false };
  let sequence = 0, haltReason = null, windowNumber = 0;
  const remainingTime = () => plan.deadlineMs - (clock() - start);
  const checkTime = (minimum = 0) => requireValue(remainingTime() > minimum, 'DEADLINE');
  const totals = () => ({ selected: result.selected, archived: result.archived, removed: result.removed,
    changedOrMissing: result.changedOrMissing, unknown: result.unknown, retireAttemptedRows: result.retireAttemptedRows, storedBytes: result.storedBytes,
    windows: result.windows.length });
  async function checkpoint(stage, details = {}) {
    try {
      await callbacks.writeCheckpoint(structuredClone({ version: 1, sequence: ++sequence, stage, window: windowNumber,
        plan, totals: totals(), ...details }));
    } catch {
      result.checkpointFailed = true;
      haltReason = 'TELEMETRY_BACKLOG_CHECKPOINT_FAILED';
      fail('CHECKPOINT_FAILED');
    }
  }
  async function stop(reason) {
    result.stopped = true;
    result.reason = reason;
    try { await checkpoint('stopped', { reason }); } catch { result.reason = haltReason; }
    return result;
  }
  try {
    await checkpoint('started');
    for (windowNumber = 1; windowNumber <= plan.maxWindows; windowNumber++) {
      checkTime(30000);
      const rowsLeft = plan.maxSelectedRows - result.selected;
      const bytesLeft = plan.maxStoredBytes - result.storedBytes;
      requireValue(rowsLeft > 0, 'SELECTED_BUDGET');
      requireValue(bytesLeft > 0, 'STORAGE_BUDGET');
      const batchSize = Math.min(TELEMETRY_MAINTENANCE_LIMITS.batchSize, rowsLeft);
      const maxBatches = Math.min(TELEMETRY_MAINTENANCE_LIMITS.maxBatches, Math.floor(rowsLeft / batchSize));
      const config = { mode: 'archive-retire', projectId: plan.projectId, cutoff: plan.cutoff, now: plan.now,
        approvalId: plan.approvalId, batchSize, maxBatches,
        deadlineMs: Math.min(TELEMETRY_MAINTENANCE_LIMITS.deadlineMs, Math.floor(remainingTime())),
        maxStoredBytes: Math.min(TELEMETRY_MAINTENANCE_LIMITS.maxStoredBytes, bytesLeft) };
      const reservation = { maxSelectedRows: batchSize * maxBatches, maxStoredBytes: config.maxStoredBytes,
        deadlineMs: config.deadlineMs };
      await checkpoint('window-reserved', { reservation });
      requireValue(await callbacks.preflightWindow(plan, Object.freeze({ ...totals(), window: windowNumber, reservation })) === true, 'PREFLIGHT');
      checkTime(30000);
      let eofObserved = false, archiveInfo = null, acknowledgement = null;
      const windowStart = clock();
      const checkWindowTime = (minimum = 0) => {
        checkTime(minimum);
        requireValue(config.deadlineMs - (clock() - windowStart) > minimum, 'WINDOW_DEADLINE');
      };
      const wrapped = {
        selectSnapshot: async (cutoff, limit) => {
          if (haltReason) throw new Error(haltReason);
          checkWindowTime(30000);
          requireValue(result.selected + limit <= plan.maxSelectedRows, 'SELECTED_BUDGET');
          await checkpoint('before-select', { limit });
          checkWindowTime(30000);
          const rows = await callbacks.selectSnapshot(cutoff, limit);
          requireValue(Array.isArray(rows) && rows.length <= limit, 'SELECTION_COUNT');
          result.selected += rows.length; // Se contabiliza la selección, nunca sólo las filas retiradas.
          const hashes = rows.map(row => {
            requireValue(typeof row?.cache_key === 'string' && row.cache_key.length > 0, 'SELECTION_KEY');
            return keyHash(row.cache_key);
          });
          requireValue(new Set(hashes).size === hashes.length && hashes.every(hash => !seen.has(hash)), 'REPEATED_SELECTION');
          hashes.forEach(hash => seen.add(hash));
          await checkpoint('selected', { selected: rows.length, seenKeyHashes: hashes });
          eofObserved = rows.length < limit;
          return rows;
        },
        storeArchive: async archive => {
          checkWindowTime(30000);
          requireValue(Number.isSafeInteger(archive.storedBytes) && archive.storedBytes > 0
            && result.storedBytes + archive.storedBytes <= plan.maxStoredBytes, 'STORAGE_BUDGET');
          result.storedBytes += archive.storedBytes; // Reserva íntegra aunque una subida parcial falle.
          archiveInfo = { manifestSha256: archive.manifestSha256, selectionSha256: archive.expected.selectionSha256,
            cutoff: archive.expected.cutoff, selected: archive.snapshot.length, storedBytes: archive.storedBytes };
          await checkpoint('before-archive', { archive: archiveInfo });
          checkWindowTime(30000);
          const downloaded = await callbacks.storeArchive(archive);
          await checkpoint('archive-returned', { archive: archiveInfo });
          return downloaded; // El núcleo original verifica el readback antes de entrar al siguiente callback.
        },
        retireSnapshot: async (cutoff, snapshot) => {
          checkWindowTime(30000);
          requireValue(archiveInfo !== null && !haltReason, 'RETIRE_GATE');
          // Journal privado: conserva el snapshot exacto antes del único intento de la RPC.
          await checkpoint('pending-mutation', { archive: archiveInfo, snapshot });
          checkWindowTime(30000);
          result.retireAttemptedRows += snapshot.length;
          acknowledgement = await callbacks.retireSnapshot(cutoff, snapshot);
          await checkpoint('ack-observed', { archive: archiveInfo, acknowledgement });
          if (acknowledgement?.changed_or_missing > 0) haltReason = 'TELEMETRY_BACKLOG_CHANGED_OR_MISSING';
          return acknowledgement;
        },
        reconcileMetadata: async keys => {
          checkWindowTime();
          const rows = await callbacks.reconcileMetadata(keys);
          await checkpoint('reconcile-observed', { archive: archiveInfo, acknowledgement, metadata: rows });
          return rows; // Un registro de observación no sustituye las validaciones del núcleo.
        },
      };
      // El núcleo diario sanea errores desconocidos; conservar nuestros motivos de parada.
      for (const [name, callback] of Object.entries(wrapped)) {
        wrapped[name] = async (...args) => {
          try { return await callback(...args); }
          catch (error) {
            if (error instanceof Error && /^TELEMETRY_BACKLOG_[A-Z_]+$/.test(error.message)) haltReason ||= error.message;
            throw error;
          }
        };
      }
      const window = await processTelemetryMaintenance(wrapped, config, clock);
      for (const field of ['archived', 'removed', 'changedOrMissing', 'unknown', 'absentAfterUnknown']) result[field] += window[field];
      result.windows.push({ ...window, window: windowNumber });
      await checkpoint('window-result', { result: window });
      if (!window.success || window.stopped || window.unknown > 0 || window.changedOrMissing > 0 || haltReason) {
        return await stop(haltReason || window.reason || 'TELEMETRY_BACKLOG_WINDOW_FAILED');
      }
      if (eofObserved) {
        result.awaitingIndependentFinalCheck = true;
        await checkpoint('awaiting-independent-final-check');
        result.success = true;
        return result;
      }
    }
    return await stop('TELEMETRY_BACKLOG_WINDOW_BUDGET');
  } catch (error) {
    const reason = error instanceof Error && /^TELEMETRY_(?:BACKLOG|MAINTENANCE|BACKUP)_[A-Z_]+$/.test(error.message)
      ? error.message : 'TELEMETRY_BACKLOG_STAGE_FAILED';
    return await stop(haltReason || reason);
  }
}

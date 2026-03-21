import { getState } from './state';
import { readPersistedTelemetryState, mergeState } from './storage';
import { buildSnapshotFromState } from './calculator';

export async function getOperationalMetricsSnapshot() {
  const nowMs = Date.now();
  const memoryState = getState();
  const persistedState = await readPersistedTelemetryState(nowMs).catch(() => null);
  const effectiveState = persistedState
    ? mergeState(persistedState, memoryState)
    : memoryState;

  return buildSnapshotFromState(effectiveState, nowMs);
}

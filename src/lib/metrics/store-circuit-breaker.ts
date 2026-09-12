import { deleteSharedCache, getSharedCache, setSharedCache } from '@/lib/server/shared-cache';
import type { ScrapeHealthStatus } from './types';

const STORE_CIRCUIT_SCOPE = 'store-scrape-circuit';
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const BLOCKED_BACKOFF_MS = 30 * 60 * 1000;
const ERROR_BACKOFF_MS = 10 * 60 * 1000;
const ERROR_THRESHOLD = 3;

export type StoreCircuitState = {
  failureCount: number;
  blockedUntilMs: number | null;
  lastFailureAtMs: number;
  lastStatus: Extract<ScrapeHealthStatus, 'blocked' | 'error'>;
};

function circuitKey(storeId: string): string {
  return storeId.trim().toLowerCase();
}

function isCircuitState(value: unknown): value is StoreCircuitState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<StoreCircuitState>;
  return Number.isFinite(state.failureCount)
    && Number.isFinite(state.lastFailureAtMs)
    && (state.blockedUntilMs === null || Number.isFinite(state.blockedUntilMs))
    && (state.lastStatus === 'blocked' || state.lastStatus === 'error');
}

export async function getStoreCircuitState(storeId: string): Promise<StoreCircuitState | null> {
  const cached = await getSharedCache<unknown>(STORE_CIRCUIT_SCOPE, circuitKey(storeId));
  return isCircuitState(cached) ? cached : null;
}

export async function getStoreCircuitBlock(storeId: string, nowMs = Date.now()): Promise<StoreCircuitState | null> {
  const state = await getStoreCircuitState(storeId);
  if (!state?.blockedUntilMs || state.blockedUntilMs <= nowMs) return null;
  return state;
}

export async function recordStoreCircuitFailure(
  storeId: string,
  status: Extract<ScrapeHealthStatus, 'blocked' | 'error'>,
  nowMs = Date.now(),
): Promise<StoreCircuitState> {
  const previous = await getStoreCircuitState(storeId);
  const failureCount = Math.min(10, (previous?.failureCount ?? 0) + 1);
  const shouldBlock = status === 'blocked' || failureCount >= ERROR_THRESHOLD;
  const state: StoreCircuitState = {
    failureCount,
    blockedUntilMs: shouldBlock
      ? nowMs + (status === 'blocked' ? BLOCKED_BACKOFF_MS : ERROR_BACKOFF_MS)
      : null,
    lastFailureAtMs: nowMs,
    lastStatus: status,
  };

  await setSharedCache(STORE_CIRCUIT_SCOPE, circuitKey(storeId), state, STATE_TTL_MS);
  return state;
}

export async function clearStoreCircuit(storeId: string): Promise<void> {
  await deleteSharedCache(STORE_CIRCUIT_SCOPE, circuitKey(storeId));
}

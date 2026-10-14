import { after } from 'next/server';
import { withAbortTimeout, withPromiseTimeout } from '@/lib/async/with-abort-timeout';
import type {
  MonitoredEndpoint,
  ScrapeHealthStatus,
  StoreScrapeEvent,
  EndpointRequestEvent,
} from './types';
import {
  STORE_EVENT_LIMIT,
  ENDPOINT_EVENT_LIMIT,
  SLOW_SCRAPE_THRESHOLD_MS,
  STORE_SCOPE,
  ENDPOINT_SCOPE,
} from './constants';
import { getState, pushWithCap } from './state';
import { buildEventKey, classifyError, statusFromSuccessfulScrape } from './utils';
import { persistTelemetryEntry } from './storage';
import {
  clearStoreCircuit,
  getStoreCircuitState,
  recordStoreCircuitFailure,
} from './store-circuit-breaker';

export { SLOW_SCRAPE_THRESHOLD_MS };

const OBSERVATION_WRITE_TIMEOUT_MS = 5_000;

async function scheduleObservationWrite(write: () => Promise<unknown>): Promise<void> {
  const settle = async () => {
    try { await write(); } catch { /* El almacenamiento registra un recibo saneado; la observación en memoria se conserva. */ }
  };
  try { after(settle); } catch { await settle(); }
}

export function recordStoreScrapeEvent(event: {
  endpoint: MonitoredEndpoint;
  storeId: string;
  storeName: string;
  startedAtMs: number;
  finishedAtMs?: number;
  latencyMs: number;
  resultCount: number;
  status: ScrapeHealthStatus;
  httpStatus?: number;
  message?: string;
}): Promise<void> {
  const state = getState();
  const normalizedEvent: StoreScrapeEvent = {
    ...event,
    finishedAtMs: event.finishedAtMs ?? event.startedAtMs + event.latencyMs,
  };

  pushWithCap(state.storeEvents, normalizedEvent, STORE_EVENT_LIMIT);
  return scheduleObservationWrite(() => withAbortTimeout(signal => persistTelemetryEntry(
    STORE_SCOPE,
    buildEventKey(STORE_SCOPE, normalizedEvent, normalizedEvent.storeId),
    normalizedEvent, signal,
  ), OBSERVATION_WRITE_TIMEOUT_MS, 'operational-telemetry'));
}

export function recordEndpointRequestEvent(event: {
  endpoint: MonitoredEndpoint;
  startedAtMs: number;
  finishedAtMs?: number;
  statusCode: number;
  success: boolean;
  resultCount: number;
  note?: string;
}): Promise<void> {
  const state = getState();
  const finishedAtMs = event.finishedAtMs ?? Date.now();
  const normalizedEvent: EndpointRequestEvent = {
    ...event,
    finishedAtMs,
    latencyMs: Math.max(0, finishedAtMs - event.startedAtMs),
  };

  pushWithCap(state.endpointEvents, normalizedEvent, ENDPOINT_EVENT_LIMIT);
  return scheduleObservationWrite(() => withAbortTimeout(signal => persistTelemetryEntry(
    ENDPOINT_SCOPE,
    buildEventKey(ENDPOINT_SCOPE, normalizedEvent, String(normalizedEvent.statusCode)),
    normalizedEvent, signal,
  ), OBSERVATION_WRITE_TIMEOUT_MS, 'operational-telemetry'));
}

export async function runObservedStoreScrape<T>(params: {
  endpoint: MonitoredEndpoint;
  storeId: string;
  storeName: string;
  run: () => Promise<T[]>;
  slowThresholdMs?: number;
}): Promise<T[]> {
  const startedAtMs = Date.now();
  const slowThresholdMs = params.slowThresholdMs ?? SLOW_SCRAPE_THRESHOLD_MS;

  const circuitState = await getStoreCircuitState(params.storeId).catch(() => null);
  if (circuitState?.blockedUntilMs && circuitState.blockedUntilMs > startedAtMs) {
    await recordStoreScrapeEvent({
      endpoint: params.endpoint,
      storeId: params.storeId,
      storeName: params.storeName,
      startedAtMs,
      latencyMs: 0,
      resultCount: 0,
      status: 'blocked',
      message: `Circuito de protección activo hasta ${new Date(circuitState.blockedUntilMs).toISOString()}`,
    });
    return [];
  }

  try {
    const data = await params.run();
    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const status = statusFromSuccessfulScrape(data.length, latencyMs, slowThresholdMs);
    await recordStoreScrapeEvent({
      endpoint: params.endpoint,
      storeId: params.storeId,
      storeName: params.storeName,
      startedAtMs,
      latencyMs,
      resultCount: data.length,
      status,
    });
    if (circuitState) {
      await scheduleObservationWrite(() => withPromiseTimeout(clearStoreCircuit(params.storeId), OBSERVATION_WRITE_TIMEOUT_MS, 'store-circuit-clear'));
    }
    return data;
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const classified = classifyError(error);
    await recordStoreScrapeEvent({
      endpoint: params.endpoint,
      storeId: params.storeId,
      storeName: params.storeName,
      startedAtMs,
      latencyMs,
      resultCount: 0,
      status: classified.status,
      httpStatus: classified.httpStatus,
      message: classified.message,
    });
    if (classified.status === 'blocked' || classified.status === 'error') {
      await scheduleObservationWrite(() => withPromiseTimeout(recordStoreCircuitFailure(params.storeId, classified.status as 'blocked' | 'error'), OBSERVATION_WRITE_TIMEOUT_MS, 'store-circuit-failure'));
    }
    return [];
  }
}

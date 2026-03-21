import { stores as configuredStores } from '@/lib/scrapers/static-data';
import type {
  MonitoredEndpoint,
  ScrapeHealthStatus,
  StoreScrapeEvent,
  EndpointRequestEvent,
  OperationalLogEntry,
} from './types';
import {
  STORE_EVENT_LIMIT,
  ENDPOINT_EVENT_LIMIT,
  SLOW_SCRAPE_THRESHOLD_MS,
  STORE_SCOPE,
  ENDPOINT_SCOPE,
  SNAPSHOT_WINDOW_MS,
} from './constants';
import { getState, pushWithCap } from './state';
import { buildEventKey, classifyError, statusFromSuccessfulScrape } from './utils';
import { persistTelemetryEntry } from './storage';

export { SLOW_SCRAPE_THRESHOLD_MS };

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
}): void {
  const state = getState();
  const normalizedEvent: StoreScrapeEvent = {
    ...event,
    finishedAtMs: event.finishedAtMs ?? event.startedAtMs + event.latencyMs,
  };

  pushWithCap(state.storeEvents, normalizedEvent, STORE_EVENT_LIMIT);
  void persistTelemetryEntry(
    STORE_SCOPE,
    buildEventKey(STORE_SCOPE, normalizedEvent, normalizedEvent.storeId),
    normalizedEvent,
  ).catch(() => undefined);
}

export function recordEndpointRequestEvent(event: {
  endpoint: MonitoredEndpoint;
  startedAtMs: number;
  finishedAtMs?: number;
  statusCode: number;
  success: boolean;
  resultCount: number;
  note?: string;
}): void {
  const state = getState();
  const finishedAtMs = event.finishedAtMs ?? Date.now();
  const normalizedEvent: EndpointRequestEvent = {
    ...event,
    finishedAtMs,
    latencyMs: Math.max(0, finishedAtMs - event.startedAtMs),
  };

  pushWithCap(state.endpointEvents, normalizedEvent, ENDPOINT_EVENT_LIMIT);
  void persistTelemetryEntry(
    ENDPOINT_SCOPE,
    buildEventKey(ENDPOINT_SCOPE, normalizedEvent, String(normalizedEvent.statusCode)),
    normalizedEvent,
  ).catch(() => undefined);
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

  try {
    const data = await params.run();
    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const status = statusFromSuccessfulScrape(data.length, latencyMs, slowThresholdMs);
    recordStoreScrapeEvent({
      endpoint: params.endpoint,
      storeId: params.storeId,
      storeName: params.storeName,
      startedAtMs,
      latencyMs,
      resultCount: data.length,
      status,
    });
    return data;
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const classified = classifyError(error);
    recordStoreScrapeEvent({
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
    return [];
  }
}

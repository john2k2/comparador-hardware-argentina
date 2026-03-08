import { stores as configuredStores } from '@/lib/scrapers/static-data';
import { getServerSupabaseServiceClient } from '@/lib/server/supabase-server';

export type MonitoredEndpoint = '/api/search' | '/api/products';
export type ScrapeHealthStatus = 'ok' | 'slow' | 'blocked' | 'no-results' | 'error';
export type StoreHealthStatus = ScrapeHealthStatus | 'unknown';

const STORE_EVENT_LIMIT = 1500;
const ENDPOINT_EVENT_LIMIT = 1000;
const SNAPSHOT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SLOW_SCRAPE_THRESHOLD_MS = 8000;
const PERSISTED_EVENT_TTL_MS = 48 * 60 * 60 * 1000;
const STORE_SCOPE = 'operational-store-event';
const ENDPOINT_SCOPE = 'operational-endpoint-event';

interface StoreScrapeEvent {
  endpoint: MonitoredEndpoint;
  storeId: string;
  storeName: string;
  startedAtMs: number;
  finishedAtMs: number;
  latencyMs: number;
  resultCount: number;
  status: ScrapeHealthStatus;
  httpStatus?: number;
  message?: string;
}

interface EndpointRequestEvent {
  endpoint: MonitoredEndpoint;
  startedAtMs: number;
  finishedAtMs: number;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  resultCount: number;
  note?: string;
}

interface OperationalTelemetryState {
  storeEvents: StoreScrapeEvent[];
  endpointEvents: EndpointRequestEvent[];
}

type PersistedEntryRow = {
  payload: unknown;
};

export interface StoreFailureSnapshot {
  at: string;
  endpoint: MonitoredEndpoint;
  status: 'blocked' | 'error';
  httpStatus?: number;
  message?: string;
}

export interface StoreHealthSnapshot {
  storeId: string;
  storeName: string;
  status: StoreHealthStatus;
  lastCheckedAt: string | null;
  lastEndpoint: MonitoredEndpoint | null;
  lastLatencyMs: number | null;
  lastResultCount: number | null;
  avgLatencyMs24h: number | null;
  successRate24h: number;
  totalChecks24h: number;
  blockedCount24h: number;
  errorCount24h: number;
  slowCount24h: number;
  noResultsCount24h: number;
  recentFailures: StoreFailureSnapshot[];
}

export interface EndpointHealthSnapshot {
  endpoint: MonitoredEndpoint;
  totalRequests24h: number;
  successRate24h: number;
  avgLatencyMs24h: number;
  p95LatencyMs24h: number;
  errorCount24h: number;
  lastRequestAt: string | null;
  lastStatusCode: number | null;
  lastResultCount: number | null;
}

export interface OperationalAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  scope: 'store' | 'endpoint';
  storeId?: string;
  endpoint?: MonitoredEndpoint;
  message: string;
  metric: string;
  triggeredAt: string;
}

export interface OperationalLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  source: 'store' | 'endpoint';
  endpoint: MonitoredEndpoint;
  storeId?: string;
  storeName?: string;
  status?: string;
  statusCode?: number;
  latencyMs: number;
  resultCount: number;
  message: string;
}

export interface OperationalMetricsSnapshot {
  generatedAt: string;
  stores: StoreHealthSnapshot[];
  endpoints: EndpointHealthSnapshot[];
  alerts: OperationalAlert[];
  logs: OperationalLogEntry[];
}

declare global {
  var __OPERATIONS_TELEMETRY__: OperationalTelemetryState | undefined;
}

function getState(): OperationalTelemetryState {
  if (!globalThis.__OPERATIONS_TELEMETRY__) {
    globalThis.__OPERATIONS_TELEMETRY__ = {
      storeEvents: [],
      endpointEvents: [],
    };
  }
  return globalThis.__OPERATIONS_TELEMETRY__;
}

function pushWithCap<T>(target: T[], item: T, cap: number): void {
  target.push(item);
  if (target.length > cap) {
    target.splice(0, target.length - cap);
  }
}

function parseHttpStatus(message?: string): number | undefined {
  if (!message) return undefined;
  const matched = message.match(/\b([45][0-9]{2})\b/);
  if (!matched) return undefined;
  const status = Number(matched[1]);
  return Number.isFinite(status) ? status : undefined;
}

function safeErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return undefined;
}

function classifyError(error: unknown): {
  status: ScrapeHealthStatus;
  httpStatus?: number;
  message?: string;
} {
  const message = safeErrorMessage(error);
  const httpStatus = parseHttpStatus(message);
  if (httpStatus === 403 || httpStatus === 429) {
    return { status: 'blocked', httpStatus, message };
  }
  return { status: 'error', httpStatus, message };
}

function statusFromSuccessfulScrape(resultCount: number, latencyMs: number, slowThresholdMs: number): ScrapeHealthStatus {
  if (resultCount === 0) return 'no-results';
  if (latencyMs >= slowThresholdMs) return 'slow';
  return 'ok';
}

function round(value: number, digits = 1): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function storeSuccess(status: ScrapeHealthStatus): boolean {
  return status === 'ok' || status === 'slow' || status === 'no-results';
}

function isFailureEvent(
  event: StoreScrapeEvent,
): event is StoreScrapeEvent & { status: 'blocked' | 'error' } {
  return event.status === 'blocked' || event.status === 'error';
}

function isMonitoredEndpoint(value: unknown): value is MonitoredEndpoint {
  return value === '/api/search' || value === '/api/products';
}

function isScrapeHealthStatus(value: unknown): value is ScrapeHealthStatus {
  return value === 'ok' || value === 'slow' || value === 'blocked' || value === 'no-results' || value === 'error';
}

function normalizeStoreEvent(value: unknown): StoreScrapeEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Partial<StoreScrapeEvent>;
  if (!isMonitoredEndpoint(event.endpoint)) return null;
  if (!isScrapeHealthStatus(event.status)) return null;
  if (typeof event.storeId !== 'string' || typeof event.storeName !== 'string') return null;
  if (!Number.isFinite(event.startedAtMs) || !Number.isFinite(event.finishedAtMs) || !Number.isFinite(event.latencyMs)) {
    return null;
  }

  return {
    endpoint: event.endpoint,
    storeId: event.storeId,
    storeName: event.storeName,
    startedAtMs: Number(event.startedAtMs),
    finishedAtMs: Number(event.finishedAtMs),
    latencyMs: Number(event.latencyMs),
    resultCount: Number(event.resultCount ?? 0),
    status: event.status,
    httpStatus: typeof event.httpStatus === 'number' ? event.httpStatus : undefined,
    message: typeof event.message === 'string' ? event.message : undefined,
  };
}

function normalizeEndpointEvent(value: unknown): EndpointRequestEvent | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Partial<EndpointRequestEvent>;
  if (!isMonitoredEndpoint(event.endpoint)) return null;
  if (!Number.isFinite(event.startedAtMs) || !Number.isFinite(event.finishedAtMs) || !Number.isFinite(event.latencyMs)) {
    return null;
  }
  if (!Number.isFinite(event.statusCode)) return null;

  return {
    endpoint: event.endpoint,
    startedAtMs: Number(event.startedAtMs),
    finishedAtMs: Number(event.finishedAtMs),
    latencyMs: Number(event.latencyMs),
    statusCode: Number(event.statusCode),
    success: Boolean(event.success),
    resultCount: Number(event.resultCount ?? 0),
    note: typeof event.note === 'string' ? event.note : undefined,
  };
}

function buildEventKey(scope: string, event: { endpoint: string; startedAtMs: number; finishedAtMs: number }, suffix: string): string {
  return `${scope}:${event.finishedAtMs}:${event.startedAtMs}:${event.endpoint}:${suffix}`;
}

async function persistTelemetryEntry(scope: string, cacheKey: string, payload: StoreScrapeEvent | EndpointRequestEvent): Promise<void> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return;

  const expiresAt = new Date(Date.now() + PERSISTED_EVENT_TTL_MS).toISOString();
  await supabase
    .from('api_cache_entries')
    .upsert({
      cache_key: cacheKey,
      scope,
      payload,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'cache_key',
    });
}

async function readPersistedTelemetryState(nowMs = Date.now()): Promise<OperationalTelemetryState | null> {
  const supabase = getServerSupabaseServiceClient();
  if (!supabase) return null;

  const nowIso = new Date(nowMs).toISOString();
  const [storeRows, endpointRows] = await Promise.all([
    supabase
      .from('api_cache_entries')
      .select('payload')
      .eq('scope', STORE_SCOPE)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .limit(STORE_EVENT_LIMIT),
    supabase
      .from('api_cache_entries')
      .select('payload')
      .eq('scope', ENDPOINT_SCOPE)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .limit(ENDPOINT_EVENT_LIMIT),
  ]);

  if (storeRows.error && endpointRows.error) {
    return null;
  }

  return {
    storeEvents: ((storeRows.data ?? []) as PersistedEntryRow[])
      .map((row) => normalizeStoreEvent(row.payload))
      .filter((event): event is StoreScrapeEvent => Boolean(event))
      .sort((a, b) => a.finishedAtMs - b.finishedAtMs),
    endpointEvents: ((endpointRows.data ?? []) as PersistedEntryRow[])
      .map((row) => normalizeEndpointEvent(row.payload))
      .filter((event): event is EndpointRequestEvent => Boolean(event))
      .sort((a, b) => a.finishedAtMs - b.finishedAtMs),
  };
}

function mergeState(preferred: OperationalTelemetryState, fallback: OperationalTelemetryState): OperationalTelemetryState {
  const mergedStoreEvents = [...fallback.storeEvents];
  const storeKeys = new Set(mergedStoreEvents.map((event) => buildEventKey(STORE_SCOPE, event, event.storeId)));

  for (const event of preferred.storeEvents) {
    const key = buildEventKey(STORE_SCOPE, event, event.storeId);
    if (storeKeys.has(key)) continue;
    mergedStoreEvents.push(event);
    storeKeys.add(key);
  }

  const mergedEndpointEvents = [...fallback.endpointEvents];
  const endpointKeys = new Set(mergedEndpointEvents.map((event) => buildEventKey(ENDPOINT_SCOPE, event, String(event.statusCode))));

  for (const event of preferred.endpointEvents) {
    const key = buildEventKey(ENDPOINT_SCOPE, event, String(event.statusCode));
    if (endpointKeys.has(key)) continue;
    mergedEndpointEvents.push(event);
    endpointKeys.add(key);
  }

  mergedStoreEvents.sort((a, b) => a.finishedAtMs - b.finishedAtMs);
  mergedEndpointEvents.sort((a, b) => a.finishedAtMs - b.finishedAtMs);

  return {
    storeEvents: mergedStoreEvents.slice(-STORE_EVENT_LIMIT),
    endpointEvents: mergedEndpointEvents.slice(-ENDPOINT_EVENT_LIMIT),
  };
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

function buildStoreSnapshots(nowMs: number, allStoreEvents: StoreScrapeEvent[]): StoreHealthSnapshot[] {
  const windowStart = nowMs - SNAPSHOT_WINDOW_MS;
  const configured = new Map(configuredStores.map((store) => [store.id, store.name]));
  for (const event of allStoreEvents) {
    if (!configured.has(event.storeId)) {
      configured.set(event.storeId, event.storeName);
    }
  }

  const snapshots: StoreHealthSnapshot[] = [];
  for (const [storeId, storeName] of configured.entries()) {
    const events = allStoreEvents.filter((event) => event.storeId === storeId);
    const lastEvent = events.at(-1);
    const inWindow = events.filter((event) => event.finishedAtMs >= windowStart);
    const successes = inWindow.filter((event) => storeSuccess(event.status)).length;
    const blockedCount = inWindow.filter((event) => event.status === 'blocked').length;
    const errorCount = inWindow.filter((event) => event.status === 'error').length;
    const slowCount = inWindow.filter((event) => event.status === 'slow').length;
    const noResultsCount = inWindow.filter((event) => event.status === 'no-results').length;
    const avgLatency = inWindow.length > 0
      ? Math.round(inWindow.reduce((sum, currentEvent) => sum + currentEvent.latencyMs, 0) / inWindow.length)
      : null;
    const recentFailures = [...events]
      .reverse()
      .filter(isFailureEvent)
      .slice(0, 5)
      .map((event) => ({
        at: toIso(event.finishedAtMs),
        endpoint: event.endpoint,
        status: event.status,
        httpStatus: event.httpStatus,
        message: event.message,
      }));

    snapshots.push({
      storeId,
      storeName,
      status: lastEvent?.status ?? 'unknown',
      lastCheckedAt: lastEvent ? toIso(lastEvent.finishedAtMs) : null,
      lastEndpoint: lastEvent?.endpoint ?? null,
      lastLatencyMs: lastEvent?.latencyMs ?? null,
      lastResultCount: lastEvent?.resultCount ?? null,
      avgLatencyMs24h: avgLatency,
      successRate24h: inWindow.length > 0 ? round((successes / inWindow.length) * 100) : 0,
      totalChecks24h: inWindow.length,
      blockedCount24h: blockedCount,
      errorCount24h: errorCount,
      slowCount24h: slowCount,
      noResultsCount24h: noResultsCount,
      recentFailures,
    });
  }

  return snapshots.sort((a, b) => a.storeName.localeCompare(b.storeName, 'es'));
}

function buildEndpointSnapshots(nowMs: number, allEndpointEvents: EndpointRequestEvent[]): EndpointHealthSnapshot[] {
  const windowStart = nowMs - SNAPSHOT_WINDOW_MS;
  const endpoints: MonitoredEndpoint[] = ['/api/search', '/api/products'];

  return endpoints.map((endpoint) => {
    const events = allEndpointEvents.filter((event) => event.endpoint === endpoint);
    const inWindow = events.filter((event) => event.finishedAtMs >= windowStart);
    const successes = inWindow.filter((event) => event.success).length;
    const errors = inWindow.filter((event) => !event.success).length;
    const latencies = inWindow.map((event) => event.latencyMs);
    const last = events.at(-1);

    return {
      endpoint,
      totalRequests24h: inWindow.length,
      successRate24h: inWindow.length > 0 ? round((successes / inWindow.length) * 100) : 0,
      avgLatencyMs24h: inWindow.length > 0 ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / inWindow.length) : 0,
      p95LatencyMs24h: Math.round(percentile(latencies, 0.95)),
      errorCount24h: errors,
      lastRequestAt: last ? toIso(last.finishedAtMs) : null,
      lastStatusCode: last?.statusCode ?? null,
      lastResultCount: last?.resultCount ?? null,
    };
  });
}

function buildAlerts(
  nowMs: number,
  stores: StoreHealthSnapshot[],
  endpoints: EndpointHealthSnapshot[],
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  for (const store of stores) {
    if (store.status === 'blocked') {
      alerts.push({
        id: `store-blocked-${store.storeId}`,
        severity: 'critical',
        scope: 'store',
        storeId: store.storeId,
        message: `${store.storeName} reporta bloqueo activo (403/429).`,
        metric: 'status',
        triggeredAt: store.lastCheckedAt ?? toIso(nowMs),
      });
    }

    if (store.blockedCount24h >= 3) {
      alerts.push({
        id: `store-blocked-rate-${store.storeId}`,
        severity: 'critical',
        scope: 'store',
        storeId: store.storeId,
        message: `${store.storeName} tuvo ${store.blockedCount24h} bloqueos en 24h.`,
        metric: 'blocked_count_24h',
        triggeredAt: store.lastCheckedAt ?? toIso(nowMs),
      });
    }

    if (store.errorCount24h >= 3 || store.status === 'error') {
      alerts.push({
        id: `store-errors-${store.storeId}`,
        severity: 'warning',
        scope: 'store',
        storeId: store.storeId,
        message: `${store.storeName} acumula errores recientes de scraping.`,
        metric: 'error_count_24h',
        triggeredAt: store.lastCheckedAt ?? toIso(nowMs),
      });
    }

    if (store.noResultsCount24h >= 5 && store.totalChecks24h >= 5) {
      alerts.push({
        id: `store-empty-${store.storeId}`,
        severity: 'info',
        scope: 'store',
        storeId: store.storeId,
        message: `${store.storeName} devolvio sin resultados en ${store.noResultsCount24h} ejecuciones.`,
        metric: 'no_results_count_24h',
        triggeredAt: store.lastCheckedAt ?? toIso(nowMs),
      });
    }
  }

  for (const endpoint of endpoints) {
    if (endpoint.totalRequests24h >= 5 && endpoint.successRate24h < 80) {
      alerts.push({
        id: `endpoint-success-${endpoint.endpoint}`,
        severity: 'warning',
        scope: 'endpoint',
        endpoint: endpoint.endpoint,
        message: `${endpoint.endpoint} bajo 80% de exito en 24h.`,
        metric: 'success_rate_24h',
        triggeredAt: endpoint.lastRequestAt ?? toIso(nowMs),
      });
    }

    if (endpoint.totalRequests24h >= 5 && endpoint.p95LatencyMs24h > 12000) {
      alerts.push({
        id: `endpoint-p95-${endpoint.endpoint}`,
        severity: 'warning',
        scope: 'endpoint',
        endpoint: endpoint.endpoint,
        message: `${endpoint.endpoint} presenta p95 alto (${endpoint.p95LatencyMs24h}ms).`,
        metric: 'p95_latency_ms_24h',
        triggeredAt: endpoint.lastRequestAt ?? toIso(nowMs),
      });
    }
  }

  return alerts;
}

function levelFromStoreStatus(status: ScrapeHealthStatus): 'info' | 'warning' | 'error' {
  if (status === 'blocked' || status === 'error') return 'error';
  if (status === 'slow' || status === 'no-results') return 'warning';
  return 'info';
}

function buildLogs(storeEvents: StoreScrapeEvent[], endpointEvents: EndpointRequestEvent[]): OperationalLogEntry[] {
  const storeLogs: OperationalLogEntry[] = storeEvents.map((event) => ({
    id: `store-${event.storeId}-${event.finishedAtMs}`,
    timestamp: toIso(event.finishedAtMs),
    level: levelFromStoreStatus(event.status),
    source: 'store',
    endpoint: event.endpoint,
    storeId: event.storeId,
    storeName: event.storeName,
    status: event.status,
    statusCode: event.httpStatus,
    latencyMs: event.latencyMs,
    resultCount: event.resultCount,
    message: `${event.storeName} -> ${event.status.toUpperCase()} (${event.resultCount} resultados)`,
  }));

  const endpointLogs: OperationalLogEntry[] = endpointEvents.map((event) => ({
    id: `endpoint-${event.endpoint}-${event.finishedAtMs}`,
    timestamp: toIso(event.finishedAtMs),
    level: event.success ? 'info' : 'error',
    source: 'endpoint',
    endpoint: event.endpoint,
    statusCode: event.statusCode,
    latencyMs: event.latencyMs,
    resultCount: event.resultCount,
    message: `${event.endpoint} -> ${event.statusCode} (${event.resultCount} items)${event.note ? ` ${event.note}` : ''}`,
  }));

  return [...storeLogs, ...endpointLogs]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 160);
}

function buildSnapshotFromState(state: OperationalTelemetryState, nowMs: number): OperationalMetricsSnapshot {
  const stores = buildStoreSnapshots(nowMs, state.storeEvents);
  const endpoints = buildEndpointSnapshots(nowMs, state.endpointEvents);
  const alerts = buildAlerts(nowMs, stores, endpoints);
  const logs = buildLogs(state.storeEvents, state.endpointEvents);

  return {
    generatedAt: toIso(nowMs),
    stores,
    endpoints,
    alerts,
    logs,
  };
}

export async function getOperationalMetricsSnapshot(): Promise<OperationalMetricsSnapshot> {
  const nowMs = Date.now();
  const memoryState = getState();
  const persistedState = await readPersistedTelemetryState(nowMs).catch(() => null);
  const effectiveState = persistedState
    ? mergeState(persistedState, memoryState)
    : memoryState;

  return buildSnapshotFromState(effectiveState, nowMs);
}

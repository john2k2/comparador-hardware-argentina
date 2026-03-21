import { stores as configuredStores } from '@/lib/scrapers/static-data';
import type {
  StoreScrapeEvent,
  EndpointRequestEvent,
  StoreHealthSnapshot,
  EndpointHealthSnapshot,
  OperationalAlert,
  OperationalLogEntry,
  OperationalTelemetryState,
  OperationalMetricsSnapshot,
} from './types';
import {
  SNAPSHOT_WINDOW_MS,
} from './constants';
import type { MonitoredEndpoint } from './types';
import {
  round,
  percentile,
  toIso,
  storeSuccess,
  isFailureEvent,
  levelFromStoreStatus,
} from './utils';

export function buildStoreSnapshots(nowMs: number, allStoreEvents: StoreScrapeEvent[]): StoreHealthSnapshot[] {
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

export function buildEndpointSnapshots(nowMs: number, allEndpointEvents: EndpointRequestEvent[]): EndpointHealthSnapshot[] {
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

export function buildAlerts(
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

export function buildLogs(storeEvents: StoreScrapeEvent[], endpointEvents: EndpointRequestEvent[]): OperationalLogEntry[] {
  const storeLogs: OperationalLogEntry[] = storeEvents.map((event) => ({
    id: `store-${event.storeId}-${event.finishedAtMs}`,
    timestamp: toIso(event.finishedAtMs),
    level: levelFromStoreStatus(event.status),
    source: 'store' as const,
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
    source: 'endpoint' as const,
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

export function buildSnapshotFromState(state: OperationalTelemetryState, nowMs: number): OperationalMetricsSnapshot {
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

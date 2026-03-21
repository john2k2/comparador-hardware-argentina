import type { MonitoredEndpoint, ScrapeHealthStatus, StoreScrapeEvent, EndpointRequestEvent } from './types';

export function parseHttpStatus(message?: string): number | undefined {
  if (!message) return undefined;
  const matched = message.match(/\b([45][0-9]{2})\b/);
  if (!matched) return undefined;
  const status = Number(matched[1]);
  return Number.isFinite(status) ? status : undefined;
}

export function safeErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return undefined;
}

export function classifyError(error: unknown): {
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

export function statusFromSuccessfulScrape(resultCount: number, latencyMs: number, slowThresholdMs: number): ScrapeHealthStatus {
  if (resultCount === 0) return 'no-results';
  if (latencyMs >= slowThresholdMs) return 'slow';
  return 'ok';
}

export function round(value: number, digits = 1): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function storeSuccess(status: ScrapeHealthStatus): boolean {
  return status === 'ok' || status === 'slow' || status === 'no-results';
}

export function isFailureEvent(
  event: StoreScrapeEvent,
): event is StoreScrapeEvent & { status: 'blocked' | 'error' } {
  return event.status === 'blocked' || event.status === 'error';
}

export function isMonitoredEndpoint(value: unknown): value is MonitoredEndpoint {
  return value === '/api/search' || value === '/api/products';
}

export function isScrapeHealthStatus(value: unknown): value is ScrapeHealthStatus {
  return value === 'ok' || value === 'slow' || value === 'blocked' || value === 'no-results' || value === 'error';
}

export function normalizeStoreEvent(value: unknown): StoreScrapeEvent | null {
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

export function normalizeEndpointEvent(value: unknown): EndpointRequestEvent | null {
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

export function buildEventKey(scope: string, event: { endpoint: string; startedAtMs: number; finishedAtMs: number }, suffix: string): string {
  return `${scope}:${event.finishedAtMs}:${event.startedAtMs}:${event.endpoint}:${suffix}`;
}

export function levelFromStoreStatus(status: ScrapeHealthStatus): 'info' | 'warning' | 'error' {
  if (status === 'blocked' || status === 'error') return 'error';
  if (status === 'slow' || status === 'no-results') return 'warning';
  return 'info';
}

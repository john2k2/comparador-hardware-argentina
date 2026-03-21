export type MonitoredEndpoint = '/api/search' | '/api/products';
export type ScrapeHealthStatus = 'ok' | 'slow' | 'blocked' | 'no-results' | 'error';
export type StoreHealthStatus = ScrapeHealthStatus | 'unknown';

export interface StoreScrapeEvent {
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

export interface EndpointRequestEvent {
  endpoint: MonitoredEndpoint;
  startedAtMs: number;
  finishedAtMs: number;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  resultCount: number;
  note?: string;
}

export interface OperationalTelemetryState {
  storeEvents: StoreScrapeEvent[];
  endpointEvents: EndpointRequestEvent[];
}

export type PersistedEntryRow = {
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

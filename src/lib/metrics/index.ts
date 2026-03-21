export type {
  MonitoredEndpoint,
  ScrapeHealthStatus,
  StoreHealthStatus,
  StoreScrapeEvent,
  EndpointRequestEvent,
  OperationalTelemetryState,
  PersistedEntryRow,
  StoreFailureSnapshot,
  StoreHealthSnapshot,
  EndpointHealthSnapshot,
  OperationalAlert,
  OperationalLogEntry,
  OperationalMetricsSnapshot,
} from './types';

export {
  STORE_EVENT_LIMIT,
  ENDPOINT_EVENT_LIMIT,
  SNAPSHOT_WINDOW_MS,
  SLOW_SCRAPE_THRESHOLD_MS,
  PERSISTED_EVENT_TTL_MS,
  STORE_SCOPE,
  ENDPOINT_SCOPE,
} from './constants';

export { getState, pushWithCap } from './state';

export {
  parseHttpStatus,
  safeErrorMessage,
  classifyError,
  statusFromSuccessfulScrape,
  round,
  percentile,
  toIso,
  storeSuccess,
  isFailureEvent,
  isMonitoredEndpoint,
  isScrapeHealthStatus,
  normalizeStoreEvent,
  normalizeEndpointEvent,
  buildEventKey,
  levelFromStoreStatus,
} from './utils';

export {
  persistTelemetryEntry,
  readPersistedTelemetryState,
  mergeState,
  STORE_SCOPE as storageStoreScope,
  ENDPOINT_SCOPE as storageEndpointScope,
} from './storage';

export {
  recordStoreScrapeEvent,
  recordEndpointRequestEvent,
  runObservedStoreScrape,
  SLOW_SCRAPE_THRESHOLD_MS as slowScrapeThreshold,
} from './recorder';

export {
  buildStoreSnapshots,
  buildEndpointSnapshots,
  buildAlerts,
  buildLogs,
  buildSnapshotFromState,
} from './calculator';
